/**
 * Draft Buku Kas — /api/cash-book-drafts (modul RBAC 'journal': lihat = view, ubah/posting = edit,
 * sama dengan Jurnal Umum manual). Draft tidak berefek ke GL sampai POST /:id/post.
 * Dipakai UI (Kas & Bank → Draft Buku Kas) dan tool MCP `kas_*`.
 */
import { Router, type Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { validateBody } from '../utils/validate';
import { BusinessError, handleRouteError } from '../utils/errors';
import {
  AppendCashBookRowsSchema,
  CreateCashBookDraftSchema,
  PostCashBookDraftSchema,
  UpdateCashBookDraftSchema,
  UpdateCashBookRowsSchema,
} from '../utils/cashBookSchemas';
import { REVIEW_THRESHOLD, ROW_LIMIT } from '../utils/cashBookRules';
import { notifyAdmins } from '../services/notificationService';
import {
  RowErrorsError,
  appendDraftRows,
  createCashBookDraft,
  discardCashBookDraft,
  getCashBookDraftDetail,
  resolveRuleAccounts,
  updateDraftHeader,
  updateDraftRows,
  type DraftActor,
} from '../services/cashBookDraft';
import { postCashBookDraft } from '../services/cashBookDraftPost';
import {
  TXN_TYPE_GUIDE,
  buildDraftWhere,
  listCashBookDrafts,
  listCounterAccounts,
  listLearnedMaps,
} from '../services/cashBookDraftList';

const router = Router();
const TX_OPTS = { timeout: 60_000, maxWait: 10_000 } as const;

function fail(res: Response, error: unknown, context: string, fallback: string) {
  if (error instanceof RowErrorsError) return res.status(400).json({ error: error.message, rowErrors: error.rowErrors });
  return handleRouteError(res, error, context, fallback);
}

const actorOf = (req: AuthRequest): DraftActor => ({ userId: req.user!.userId, via: req.user!.via === 'mcp' ? 'mcp' : 'ui' });

// GET / — { data, total, page, limit, counts }. Query: page, limit, status, search, startDate, endDate.
router.get('/', async (req, res) => {
  try {
    const query = req.query as Record<string, unknown>;
    const filter = buildDraftWhere(query);
    if (!filter.ok) return res.status(400).json({ error: filter.error });
    return res.json(await listCashBookDrafts(query, filter.where));
  } catch (error) {
    return fail(res, error, 'GET /cash-book-drafts', 'Gagal mengambil draft buku kas.');
  }
});

// GET /accounts — katalog akun lawan (slim) + akun kas + aturan jenis transaksi + pola terpelajari.
router.get('/accounts', async (_req, res) => {
  try {
    const [accounts, rules, learnedMaps] = await Promise.all([
      listCounterAccounts(),
      resolveRuleAccounts(prisma),
      listLearnedMaps(300),
    ]);
    return res.json({
      accounts,
      cashAccounts: accounts.filter((a) => a.isCash),
      rules: { advanceAccountId: rules.advanceAccountId, defaultExpenseAccountId: rules.defaultExpenseAccountId, defaultIncomeAccountId: rules.defaultIncomeAccountId },
      txnTypes: TXN_TYPE_GUIDE,
      limits: { maxRows: ROW_LIMIT, reviewThreshold: REVIEW_THRESHOLD },
      learnedMaps,
    });
  } catch (error) {
    return fail(res, error, 'GET /cash-book-drafts/accounts', 'Gagal mengambil katalog akun.');
  }
});

// GET /learned-maps — pola terpelajari (keterangan ternormalisasi → akun).
router.get('/learned-maps', async (_req, res) => {
  try {
    return res.json({ data: await listLearnedMaps(500) });
  } catch (error) {
    return fail(res, error, 'GET /cash-book-drafts/learned-maps', 'Gagal mengambil pola terpelajari.');
  }
});

// GET /:id — draft lengkap: baris, total masuk/keluar, jumlah perlu ditinjau, cek saldo.
router.get('/:id', async (req, res) => {
  try {
    const detail = await getCashBookDraftDetail(prisma, req.params.id as string);
    if (!detail) return res.status(404).json({ error: 'Draft buku kas tidak ditemukan.' });
    return res.json(detail);
  } catch (error) {
    return fail(res, error, 'GET /cash-book-drafts/:id', 'Gagal mengambil draft buku kas.');
  }
});

// POST / — buat draft dari baris (UI tempel/CSV atau engine AIRA via MCP). Tidak memposting apa pun.
router.post('/', async (req: AuthRequest, res) => {
  const body = validateBody(CreateCashBookDraftSchema, req.body, res);
  if (!body) return;
  const actor = actorOf(req);
  try {
    const created = await prisma.$transaction(
      (tx) =>
        createCashBookDraft(
          tx,
          {
            ...body,
            source: actor.via === 'mcp' ? 'aira' : 'manual',
            sourceRef: body.sourceRef ?? req.user!.mcpRef ?? null,
          },
          actor,
        ),
      TX_OPTS,
    );
    if (actor.via === 'mcp') {
      const creator = await prisma.user.findUnique({ where: { id: actor.userId }, select: { fullName: true } });
      await notifyAdmins({
        type: 'cash_book_draft',
        title: 'Draft Buku Kas dari AIRA',
        message: `${created.draft.draftNumber}: ${created.rowCount} baris dari ${creator?.fullName ?? 'pengguna'} (${created.needsReviewCount} perlu ditinjau). Tinjau dan posting di Kas & Bank → Draft Buku Kas.`,
        metadata: { kind: 'cash_book_draft', draftId: created.draft.id, link: `/cash-book-drafts/${created.draft.id}` },
        excludeUserId: actor.userId,
      });
    }
    const detail = await getCashBookDraftDetail(prisma, created.draft.id);
    return res.status(201).json({
      ...detail,
      reviewPath: `/cash-book-drafts/${created.draft.id}`,
      message: 'Draft dibuat. Belum ada jurnal; tinjau dan posting di Entaris (Kas & Bank → Draft Buku Kas).',
    });
  } catch (error) {
    return fail(res, error, 'POST /cash-book-drafts', 'Gagal membuat draft buku kas.');
  }
});

// PUT /:id — ubah header (judul, tanggal, akun kas, saldo awal/akhir, catatan). Hanya selagi belum Posted.
router.put('/:id', async (req, res) => {
  const body = validateBody(UpdateCashBookDraftSchema, req.body, res);
  if (!body) return;
  try {
    const id = req.params.id as string;
    await prisma.$transaction((tx) => updateDraftHeader(tx, id, body), TX_OPTS);
    return res.json(await getCashBookDraftDetail(prisma, id));
  } catch (error) {
    return fail(res, error, 'PUT /cash-book-drafts/:id', 'Gagal menyimpan draft buku kas.');
  }
});

// PUT /:id/rows — ubah banyak baris sekaligus (akun, jenis, keterangan, nominal, tanggal, arah, skip, reviewed).
router.put('/:id/rows', async (req, res) => {
  const body = validateBody(UpdateCashBookRowsSchema, req.body, res);
  if (!body) return;
  try {
    const id = req.params.id as string;
    const result = await prisma.$transaction((tx) => updateDraftRows(tx, id, body.rows), TX_OPTS);
    return res.json({ ...result, draft: await getCashBookDraftDetail(prisma, id) });
  } catch (error) {
    return fail(res, error, 'PUT /cash-book-drafts/:id/rows', 'Gagal menyimpan baris draft.');
  }
});

// POST /:id/rows — tambah baris (total maksimal 300 per draft).
router.post('/:id/rows', async (req, res) => {
  const body = validateBody(AppendCashBookRowsSchema, req.body, res);
  if (!body) return;
  try {
    const id = req.params.id as string;
    const result = await prisma.$transaction((tx) => appendDraftRows(tx, id, body.rows), TX_OPTS);
    return res.status(201).json({ ...result, draft: await getCashBookDraftDetail(prisma, id) });
  } catch (error) {
    return fail(res, error, 'POST /cash-book-drafts/:id/rows', 'Gagal menambah baris draft.');
  }
});

// POST /:id/post — posting: satu jurnal seimbang per baris non-skip. {partial?:boolean}.
router.post('/:id/post', async (req: AuthRequest, res) => {
  const body = validateBody(PostCashBookDraftSchema, req.body ?? {}, res);
  if (!body) return;
  try {
    const result = await postCashBookDraft(prisma, req.params.id as string, req.user!.userId, { partial: body.partial });
    return res.json(result);
  } catch (error) {
    return fail(res, error, 'POST /cash-book-drafts/:id/post', 'Gagal memposting draft buku kas.');
  }
});

// POST /:id/discard — buang draft (hanya status Draft).
router.post('/:id/discard', async (req, res) => {
  try {
    await prisma.$transaction((tx) => discardCashBookDraft(tx, req.params.id as string), TX_OPTS);
    return res.json({ message: 'Draft buku kas dibuang.' });
  } catch (error) {
    if (error instanceof BusinessError) return res.status(400).json({ error: error.message });
    return fail(res, error, 'POST /cash-book-drafts/:id/discard', 'Gagal membuang draft buku kas.');
  }
});

export default router;
