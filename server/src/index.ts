import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { authMiddleware, requirePerm, requireWrite } from './middleware/auth';
import { auditTrailMiddleware } from './middleware/auditTrail';
import { logger } from './lib/logger';

// Route handlers
import authRoutes from './routes/auth';
import publicRoutes from './routes/public';
import gaPublicQrRoutes from './routes/ga/publicQr';
import gaMasterRoutes from './routes/ga/master';
import gaAssetsRoutes from './routes/ga/assets';
import gaDocumentsRoutes from './routes/ga/documents';
import gaInventoryRoutes from './routes/ga/inventory';
import gaMaintenanceRoutes from './routes/ga/maintenance';
import gaMaterialRequestRoutes from './routes/ga/materialRequest';
import gaVehicleRoutes from './routes/ga/vehicle';
import gaBuildingRoutes from './routes/ga/building';
import gaEquipmentRoutes from './routes/ga/equipment';
import gaFinanceRoutes from './routes/ga/finance';
import coaRoutes from './routes/coa';
import journalRoutes from './routes/journals';
import salesRoutes from './routes/sales';
import purchaseRoutes from './routes/purchase';
import paymentRoutes from './routes/payments';
import partyRoutes from './routes/parties';
import dashboardRoutes from './routes/dashboard';
import reportRoutes from './routes/reports';
import aiConfigRoutes from './routes/ai/config';
import aiRouterRoutes from './routes/ai/router';
import aiChatRoutes from './routes/ai/chat';
import settingsRoutes from './routes/settings';
import fiscalYearRoutes from './routes/fiscalYears';
import inventoryRoutes from './routes/inventory';
import searchRoutes from './routes/search';
import usersRoutes from './routes/users';
import auditRoutes from './routes/audit';
import notificationRoutes from './routes/notifications';
import telegramRoutes from './routes/telegram';
import recurringRoutes from './routes/recurring';
import importRoutes from './routes/import';
import reconciliationRoutes from './routes/reconciliation';
import taxRoutes from './routes/tax';
import backupRoutes from './routes/backup';
import serviceItemRoutes from './routes/serviceItems';
import vendorDepositRoutes from './routes/vendorDeposits';
import projectGuaranteeRoutes from './routes/projectGuarantees';
import customerDepositRoutes from './routes/customerDeposits';
import systemAccountRoutes from './routes/systemAccounts';
import attachmentRoutes from './routes/attachments';
import stockOpnameRoutes from './routes/stockOpname';
import quotationRoutes from './routes/quotations';
import inquiryRoutes from './routes/inquiries';
import warehouseRoutes from './routes/warehouses';
import stockTransferRoutes from './routes/stockTransfers';
import deliveryOrderRoutes from './routes/deliveryOrders';
import temporaryDeliveryNoteRoutes from './routes/temporaryDeliveryNotes';
import salesOrderRoutes from './routes/salesOrders';
import salesReturnRoutes from './routes/salesReturns';
import goodsReceiptRoutes from './routes/goodsReceipts';
import purchaseOrderRoutes from './routes/purchaseOrders';
import { startScheduler } from './jobs/scheduler';
import healthCheckRoutes from './routes/healthCheck';
import fixedAssetRoutes from './routes/fixedAssets';
import approvalRoutes from './routes/approvals';
import roleRoutes from './routes/roles';
import cogsBackfillRoutes from './routes/cogsBackfill';
import { systemAccounts } from './services/systemAccounts';
import { ensureRbacSeed } from './services/rbacSeed';
import { ensureProjectGuaranteeAccount } from './services/projectGuaranteeSeed';

const app = express();
const port = process.env.PORT || 3001;

// Trust proxy — required when running behind Docker/reverse proxy
app.set('trust proxy', 1);

// ─── Cookie Parser ────────────────────────────────────────────────────────────
app.use(cookieParser());

// ─── Security Headers ─────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // 'unsafe-eval' diperlukan oleh @react-pdf/renderer + fontkit (Emscripten WASM)
      // untuk merge PDF + lampiran. App internal LAN, risiko XSS rendah.
      scriptSrc: ["'self'", "'wasm-unsafe-eval'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ─── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ||
  'http://localhost:5173,http://localhost:3000'
)
  .split(',')
  .map((o) => o.trim());

const isProduction = process.env.NODE_ENV === 'production';

app.use(
  cors({
    origin: (origin, callback) => {
      // Same-origin / non-browser tools (no Origin header).
      // In dev allow; in prod still allow so server-to-server (curl health
      // checks, internal scripts) keeps working — but it never carries the
      // session cookie, so it can't impersonate a logged-in user.
      if (!origin) return callback(null, true);
      // Allow explicitly listed origins
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) return callback(null, true);
      // LAN bypass only outside production (keeps dev ergonomics).
      if (!isProduction) {
        try {
          const originHost = new URL(origin).hostname;
          if (
            originHost === 'localhost' ||
            originHost === '127.0.0.1' ||
            originHost.startsWith('192.168.') ||
            originHost.startsWith('10.') ||
            /^172\.(1[6-9]|2\d|3[01])\./.test(originHost)
          ) {
            return callback(null, true);
          }
        } catch { /* invalid origin URL, fall through */ }
      }
      logger.warn({ origin, allowedOrigins }, 'CORS origin blocked');
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

// ─── Body Parsing ──────────────────────────────────────────────────────────────
// 5mb agar upload logo (base64 ~4MB) bisa masuk sebelum sampai ke /api/settings
app.use(express.json({ limit: '5mb' }));

// ─── Rate Limiter ──────────────────────────────────────────────────────────────
const apiRateLimit = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ─── Rate-limit ALL /api routes (including /api/auth/*) ────────────────────────
app.use('/api', apiRateLimit);

// ─── Public Routes ─────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/ga/public', gaPublicQrRoutes); // GA: QR publik (tanpa auth)

// Build version stamped at process start — changes every container restart
// (= every deploy). Used by VersionWatcher di client untuk deteksi update
// dan prompt user reload, supaya tidak perlu Ctrl-Shift-R manual lagi.
const BUILD_VERSION = `${Date.now()}`;
logger.info({ buildVersion: BUILD_VERSION }, 'Build version stamped for this process');

app.get('/api/version', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ version: BUILD_VERSION });
});

// ─── Protected Routes ──────────────────────────────────────────────────────────
app.use('/api', authMiddleware);
app.use('/api', auditTrailMiddleware);

// ─── RBAC dinamis: gate per modul di mount ──────────────────────────────────
// requirePerm(module): GET→view, tulis→edit (router transaksional).
// requireWrite(module): GET terbuka (data referensi), tulis→edit.
// Mount tanpa gate (dashboard/search/attachments/notifications/users/settings/
// import-via-requireWrite/approvals) di-gate di dalam file (mixed-sensitivity).
// Endpoint sensitif (cancel/decide/dll) pakai requireCap di dalam route file.

// Data referensi (GET terbuka untuk mengisi form di seluruh app):
app.use('/api/coa', requireWrite('coa'), coaRoutes);
app.use('/api/parties', requireWrite('parties'), partyRoutes);
app.use('/api/warehouses', requireWrite('warehouse'), warehouseRoutes);
app.use('/api/fiscal-years', requireWrite('settings'), fiscalYearRoutes);
app.use('/api/tax', requireWrite('settings'), taxRoutes);
app.use('/api/system-accounts', requireWrite('settings'), systemAccountRoutes);
app.use('/api/service-items', requireWrite('sales_invoice'), serviceItemRoutes);
app.use('/api/import', requireWrite('settings'), importRoutes);

// Transaksional (view+edit per modul):
app.use('/api/journals', requirePerm('journal'), journalRoutes);
app.use('/api/sales/invoices', requirePerm('sales_invoice'), salesRoutes);
app.use('/api/purchase/invoices', requirePerm('purchase_invoice'), purchaseRoutes);
app.use('/api/payments', requirePerm('payment'), paymentRoutes);
app.use('/api/reports', requirePerm('reports'), reportRoutes);
app.use('/api/reconciliation', requirePerm('reconciliation'), reconciliationRoutes);
app.use('/api/recurring', requirePerm('recurring'), recurringRoutes);
app.use('/api/vendor-deposits', requirePerm('vendor_deposit'), vendorDepositRoutes);
app.use('/api/project-guarantees', requirePerm('project_guarantee'), projectGuaranteeRoutes);
  // ── General Affairs (GA) modules ──────────────────────────────────────
app.use('/api/ga/master', requirePerm('ga_master'), gaMasterRoutes);
app.use('/api/ga/assets', requirePerm('ga_assets'), gaAssetsRoutes);
app.use('/api/ga/documents', requirePerm('ga_documents'), gaDocumentsRoutes);
app.use('/api/ga/inventory', requirePerm('ga_inventory'), gaInventoryRoutes);
app.use('/api/ga/maintenance', requirePerm('ga_maintenance'), gaMaintenanceRoutes);
app.use('/api/ga/material-requests', requirePerm('ga_material_request'), gaMaterialRequestRoutes);
app.use('/api/ga/vehicle', requirePerm('ga_vehicle'), gaVehicleRoutes);
app.use('/api/ga/building', requirePerm('ga_building'), gaBuildingRoutes);
app.use('/api/ga/equipment', requirePerm('ga_equipment'), gaEquipmentRoutes);
app.use('/api/ga/finance', requirePerm('ga_finance'), gaFinanceRoutes); // GA: jembatan tagihan EAM -> pembukuan ERP (akses Akuntan)
app.use('/api/customer-deposits', requirePerm('customer_deposit'), customerDepositRoutes);
app.use('/api/stock-opname', requirePerm('stock_opname'), stockOpnameRoutes);
app.use('/api/fixed-assets', requirePerm('fixed_assets'), fixedAssetRoutes);
app.use('/api/quotations', requirePerm('quotation'), quotationRoutes);
app.use('/api/inquiries', requirePerm('quotation'), inquiryRoutes);
app.use('/api/stock-transfers', requirePerm('stock_transfer'), stockTransferRoutes);
app.use('/api/delivery-orders', requirePerm('delivery_order'), deliveryOrderRoutes);
app.use('/api/temporary-delivery-notes', requirePerm('delivery_order'), temporaryDeliveryNoteRoutes);
app.use('/api/sales-orders', requirePerm('sales_order'), salesOrderRoutes);
app.use('/api/sales-returns', requirePerm('sales_return'), salesReturnRoutes);
app.use('/api/goods-receipts', requirePerm('goods_receipt'), goodsReceiptRoutes);
app.use('/api/purchase-orders', requirePerm('purchase_order'), purchaseOrderRoutes);
app.use('/api/cogs-backfill', requirePerm('journal'), cogsBackfillRoutes);
app.use('/api/approvals', requirePerm('approvals'), approvalRoutes);

// Sistem (modul 'audit'/'settings' → hanya Admin/super by default):
app.use('/api/audit-logs', requirePerm('audit'), auditRoutes);
app.use('/api/health-check', requirePerm('audit'), healthCheckRoutes);
app.use('/api/backup', requirePerm('audit'), backupRoutes);
app.use('/api/telegram', requirePerm('settings'), telegramRoutes);

// Gate di dalam file (mixed-sensitivity / endpoint terbuka khusus):
app.use('/api/dashboard', requirePerm('reports'), dashboardRoutes); // ringkasan finansial → izin 'reports'
app.use('/api/search', searchRoutes);                // pencarian global
app.use('/api/attachments', attachmentRoutes);       // lampiran — ikut dokумен induk
app.use('/api/notifications', notificationRoutes);   // per-user; POST /check di-gate di file
app.use('/api/settings', settingsRoutes);            // GET /company terbuka; tulis di-gate di file
app.use('/api/users', usersRoutes);                  // /me/password terbuka; admin di-gate di file
app.use('/api/roles', roleRoutes);                   // kelola RBAC — guard requireCap('rbac.manage') di file
app.use('/api/inventory', inventoryRoutes);          // gate per sub-router di inventory/index.ts

// ─── AIRA — AI Tool Layer & Tool Router (Agentic System) ──────────────────────
// config: kelola tool/setting/whitelist → gate requireWrite('settings') + cap
//         rbac.manage di endpoint sensitif (di file). router: per-tool RBAC di file.
app.use('/api/ai/config', requirePerm('settings'), aiConfigRoutes);
app.use('/api/ai/router', aiRouterRoutes);
app.use('/api/ai/chat', aiChatRoutes);

// ─── Serve Frontend (Production) ──────────────────────────────────────────────
// In production, serve the built React client from ../client/dist.
//
// Cache strategy:
//   - /assets/*  → Vite content-hashes filenames; aman cache 1 tahun (immutable).
//   - index.html → no-store; browser selalu fetch terbaru saat user
//                  refresh/buka-tutup tab. Karena index.html merujuk asset
//                  ber-hash, perubahan apa pun otomatis ter-pull saat HTML
//                  baru diambil — tidak butuh Ctrl-Shift-R lagi.
// ─── Serve Uploaded Files (foto WO, item GA, dokumen, dll) ────────────────────
// Frontend memanggil path statis /uploads/<...> langsung (bukan lewat API),
// jadi harus di-serve sebelum SPA fallback catch-all agar tidak balik index.html.
const uploadsDir = path.resolve(process.env.UPLOADS_DIR || './uploads');
app.use('/uploads', express.static(uploadsDir));

const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      return;
    }
    // Vite chunks under /assets/* are content-hashed
    if (filePath.includes(`${path.sep}assets${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));
app.get('*path', (_req, res, next) => {
  // Only serve index.html for non-API routes (SPA fallback)
  if (_req.path.startsWith('/api')) return next();
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next(); // If file doesn't exist, fall through
  });
});

// ─── Global Error Handler ──────────────────────────────────────────────────────
// Always log the full error internally but expose only a generic message to
// the client. Per-route handlers (handleRouteError / BusinessError) own user-
// facing messages; this is the fallback for uncaught throws and should never
// leak Prisma internals, stack details, or DB schema info.
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = typeof err?.status === 'number' && err.status >= 400 && err.status < 600
    ? err.status
    : 500;
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  const userMessage = status >= 500
    ? 'Terjadi kesalahan pada server. Silakan coba lagi.'
    : (typeof err?.message === 'string' && err.message.length < 200 ? err.message : 'Permintaan tidak dapat diproses.');
  res.status(status).json({ error: userMessage });
});

// ─── Process Handlers ──────────────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => logger.error({ reason }, 'Unhandled rejection'));
process.on('SIGTERM', () => { logger.info('SIGTERM received, shutting down'); process.exit(0); });

app.listen(port, () => {
  logger.info(`Server running at http://localhost:${port}`);
  systemAccounts.validateStartup().catch((err) => {
    logger.error({ err }, 'System account mapping validation failed');
  });

  // RBAC: pastikan role bawaan + matriks izin default ada (idempoten, no-regression).
  ensureRbacSeed().catch((err) => {
    logger.error({ err }, 'ensureRbacSeed failed');
  });
  ensureProjectGuaranteeAccount().catch((err) => {
    logger.error({ err }, 'ensureProjectGuaranteeAccount failed');
  });

  // All background jobs (token purge, quotation sweep, recurring runner) go
  // through the central scheduler. Postgres advisory locks make it safe to
  // run multiple replicas — only one will pick up each scheduled tick.
  startScheduler();
});
