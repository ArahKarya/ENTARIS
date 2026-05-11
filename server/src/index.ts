import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { authMiddleware } from './middleware/auth';
import { auditTrailMiddleware } from './middleware/auditTrail';
import { logger } from './lib/logger';

// Route handlers
import authRoutes from './routes/auth';
import publicRoutes from './routes/public';
import coaRoutes from './routes/coa';
import journalRoutes from './routes/journals';
import salesRoutes from './routes/sales';
import purchaseRoutes from './routes/purchase';
import paymentRoutes from './routes/payments';
import partyRoutes from './routes/parties';
import dashboardRoutes from './routes/dashboard';
import reportRoutes from './routes/reports';
import settingsRoutes from './routes/settings';
import fiscalYearRoutes from './routes/fiscalYears';
import inventoryRoutes from './routes/inventory';
import searchRoutes from './routes/search';
import usersRoutes from './routes/users';
import auditRoutes from './routes/audit';
import notificationRoutes from './routes/notifications';
import recurringRoutes from './routes/recurring';
import importRoutes from './routes/import';
import reconciliationRoutes from './routes/reconciliation';
import taxRoutes from './routes/tax';
import backupRoutes from './routes/backup';
import serviceItemRoutes from './routes/serviceItems';
import vendorDepositRoutes from './routes/vendorDeposits';
import customerDepositRoutes from './routes/customerDeposits';
import systemAccountRoutes from './routes/systemAccounts';
import attachmentRoutes from './routes/attachments';
import stockOpnameRoutes from './routes/stockOpname';
import quotationRoutes from './routes/quotations';
import inquiryRoutes from './routes/inquiries';
import warehouseRoutes from './routes/warehouses';
import stockTransferRoutes from './routes/stockTransfers';
import { startScheduler } from './jobs/scheduler';
import healthCheckRoutes from './routes/healthCheck';
import fixedAssetRoutes from './routes/fixedAssets';
import approvalRoutes from './routes/approvals';
import cogsBackfillRoutes from './routes/cogsBackfill';
import { systemAccounts } from './services/systemAccounts';

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

// ─── Protected Routes ──────────────────────────────────────────────────────────
app.use('/api', authMiddleware);
app.use('/api', auditTrailMiddleware);

app.use('/api/coa', coaRoutes);
app.use('/api/journals', journalRoutes);
app.use('/api/sales/invoices', salesRoutes);
app.use('/api/purchase/invoices', purchaseRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/parties', partyRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/fiscal-years', fiscalYearRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/recurring', recurringRoutes);
app.use('/api/import', importRoutes);
app.use('/api/reconciliation', reconciliationRoutes);
app.use('/api/tax', taxRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/service-items', serviceItemRoutes);
app.use('/api/vendor-deposits', vendorDepositRoutes);
app.use('/api/customer-deposits', customerDepositRoutes);
app.use('/api/system-accounts', systemAccountRoutes);
app.use('/api/attachments', attachmentRoutes);
app.use('/api/stock-opname', stockOpnameRoutes);
app.use('/api/health-check', healthCheckRoutes);
app.use('/api/fixed-assets', fixedAssetRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/cogs-backfill', cogsBackfillRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/inquiries', inquiryRoutes);
app.use('/api/warehouses', warehouseRoutes);
app.use('/api/stock-transfers', stockTransferRoutes);

// ─── Serve Frontend (Production) ──────────────────────────────────────────────
// In production, serve the built React client from ../client/dist
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*path', (_req, res, next) => {
  // Only serve index.html for non-API routes (SPA fallback)
  if (_req.path.startsWith('/api')) return next();
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

  // All background jobs (token purge, quotation sweep, recurring runner) go
  // through the central scheduler. Postgres advisory locks make it safe to
  // run multiple replicas — only one will pick up each scheduled tick.
  startScheduler();
});
