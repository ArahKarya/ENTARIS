import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { authMiddleware, requireAnyPerm, requirePerm, requireWrite } from './middleware/auth';
import { auditTrailMiddleware } from './middleware/auditTrail';
import { responseLanguage } from './middleware/responseLanguage';
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
import coaRoutes from './routes/coa';
import journalRoutes from './routes/journals';
import cashBookDraftRoutes from './routes/cashBookDrafts';
import salesRoutes from './routes/sales';
import purchaseRoutes from './routes/purchase';
import paymentRoutes from './routes/payments';
import partyRoutes from './routes/parties';
import dashboardRoutes from './routes/dashboard';
import dashboardMaintenanceRoutes from './routes/dashboardMaintenance';
import reportRoutes from './routes/reports';
import aiConfigRoutes from './routes/ai/config';
import aiMcpAdminRoutes from './routes/ai/mcp';
import aiChatRoutes from './routes/ai/chat';
import chatHistoryRoutes from './routes/chatHistory';
import mcpRouter from './mcp/router';
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
import attachmentLinkRoutes from './routes/attachmentLinks';
import fileDownloadRoutes from './routes/files';
import stockOpnameRoutes from './routes/stockOpname';
import quotationRoutes from './routes/quotations';
import proformaInvoiceRoutes from './routes/proformaInvoices';
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
import paymentRequestRoutes from './routes/paymentRequests';
import paymentRequestTypeRoutes from './routes/paymentRequestTypes';
import roleRoutes from './routes/roles';
import cogsBackfillRoutes from './routes/cogsBackfill';
import { systemAccounts } from './services/systemAccounts';
import { ensureRbacSeed } from './services/rbacSeed';
import { ensureProjectGuaranteeAccount } from './services/projectGuaranteeSeed';
import { failOrphanedDemoBatches } from './services/demoData/runner';

const app = express();
const port = process.env.PORT || 3001;

// Trust proxy — required when running behind Docker/reverse proxy
app.set('trust proxy', 1);

// Cookie Parser
app.use(cookieParser());

// Security Headers
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

// CORS
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
    // Let the login page read the rate-limit window when the client is served
    // from another origin (cross-origin deploys hide non-safelisted headers).
    exposedHeaders: ['RateLimit-Reset', 'RateLimit-Limit', 'RateLimit-Remaining', 'Retry-After'],
  })
);

// Stateless MCP endpoint for the AIRA engine. It has its own auth (MCP bearer token + actor assertion) and body limit,
// so it mounts before the global body parser and /api auth.
app.use('/mcp', mcpRouter);

// Body Parsing
// 5mb agar upload logo (base64 ~4MB) bisa masuk sebelum sampai ke /api/settings
app.use(express.json({ limit: '5mb' }));

// Rate Limiter
const apiRateLimit = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// Health Check
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// English error/message text for clients that ask for it (X-Entaris-Lang / Accept-Language).
// Registered first so rate-limit and auth rejections are translated too.
app.use('/api', responseLanguage);

// Rate-limit ALL /api routes (including /api/auth/*)
app.use('/api', apiRateLimit);

// Public Routes
app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/ga/public', gaPublicQrRoutes); // GA: QR publik (tanpa auth)
app.use('/api/files', fileDownloadRoutes); // unduh via tiket bertanda tangan (agen MCP, tanpa cookie); ACL dicek ulang

// Changes on every process start (every deploy); the client VersionWatcher uses it to prompt a reload.
const BUILD_VERSION = `${Date.now()}`;
logger.info({ buildVersion: BUILD_VERSION }, 'Build version stamped for this process');

app.get('/api/version', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ version: BUILD_VERSION });
});

// Protected Routes
app.use('/api', authMiddleware);
app.use('/api', auditTrailMiddleware);

// requirePerm(module): GET needs view, writes need edit. requireWrite(module): GET open (reference data), writes need edit.
// Routers mounted without a gate check permissions per endpoint; sensitive actions use requireCap in the route file.

// Data referensi (GET terbuka untuk mengisi form di seluruh app):
app.use('/api/coa', requireWrite('coa'), coaRoutes);
app.use('/api/parties', requireWrite('parties'), partyRoutes);
app.use('/api/warehouses', requireWrite('warehouse'), warehouseRoutes);
app.use('/api/fiscal-years', requireWrite('settings'), fiscalYearRoutes);
app.use('/api/tax', requireWrite('settings'), taxRoutes);
app.use('/api/system-accounts', requireWrite('settings'), systemAccountRoutes);
app.use('/api/service-items', requireWrite('sales_invoice'), serviceItemRoutes);
app.use('/api/import', requireWrite('settings'), importRoutes);
app.use('/api/payment-request-types', requireWrite('settings'), paymentRequestTypeRoutes);

// Transaksional (view+edit per modul):
app.use('/api/journals', requirePerm('journal'), journalRoutes);
app.use('/api/cash-book-drafts', requirePerm('journal'), cashBookDraftRoutes); // Draft Buku Kas: izin = Jurnal Umum
app.use('/api/sales/invoices', requirePerm('sales_invoice'), salesRoutes);
app.use('/api/purchase/invoices', requirePerm('purchase_invoice'), purchaseRoutes);
app.use('/api/payments', requirePerm('payment'), paymentRoutes);
app.use('/api/reports', requirePerm('reports'), reportRoutes);
app.use('/api/reconciliation', requirePerm('reconciliation'), reconciliationRoutes);
app.use('/api/recurring', requirePerm('recurring'), recurringRoutes);
app.use('/api/vendor-deposits', requirePerm('vendor_deposit'), vendorDepositRoutes);
app.use('/api/project-guarantees', requirePerm('project_guarantee'), projectGuaranteeRoutes);
  // General Affairs (GA) modules
app.use('/api/ga/master', requirePerm('ga_master'), gaMasterRoutes);
app.use('/api/ga/assets', requirePerm('ga_assets'), gaAssetsRoutes);
app.use('/api/ga/documents', requirePerm('ga_documents'), gaDocumentsRoutes);
app.use('/api/ga/inventory', requirePerm('ga_inventory'), gaInventoryRoutes);
app.use('/api/ga/maintenance', requirePerm('ga_maintenance'), gaMaintenanceRoutes);
app.use('/api/ga/material-requests', requirePerm('ga_material_request'), gaMaterialRequestRoutes);
app.use('/api/ga/vehicle', requirePerm('ga_vehicle'), gaVehicleRoutes);
app.use('/api/ga/building', requirePerm('ga_building'), gaBuildingRoutes);
app.use('/api/ga/equipment', requirePerm('ga_equipment'), gaEquipmentRoutes);
app.use('/api/customer-deposits', requirePerm('customer_deposit'), customerDepositRoutes);
app.use('/api/stock-opname', requirePerm('stock_opname'), stockOpnameRoutes);
app.use('/api/fixed-assets', requirePerm('fixed_assets'), fixedAssetRoutes);
app.use('/api/quotations', requirePerm('quotation'), quotationRoutes);
app.use('/api/proforma-invoices', requirePerm('proforma_invoice'), proformaInvoiceRoutes);
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

// System modules: by default only Admin holds the audit and settings permissions.
app.use('/api/audit-logs', requirePerm('audit'), auditRoutes);
app.use('/api/health-check', requirePerm('audit'), healthCheckRoutes);
app.use('/api/backup', requirePerm('audit'), backupRoutes);
app.use('/api/telegram', requirePerm('settings'), telegramRoutes);

// Gate di dalam file (mixed-sensitivity / endpoint terbuka khusus):
// Pemeliharaan: gate per sumber (ga_maintenance/ga_vehicle/ga_documents) di dalam route, bukan 'reports'.
app.use('/api/dashboard/maintenance', dashboardMaintenanceRoutes);
// Ringkasan finansial → izin 'reports'. Peringatan stok dipakai kartu stok semua role gudang,
// jadi cukup izin 'inventory' ATAU 'reports'.
const INVENTORY_DASHBOARD_PATHS = new Set(['/stock-alerts', '/negative-stock']);
app.use(
  '/api/dashboard',
  (req, res, next) => (INVENTORY_DASHBOARD_PATHS.has(req.path) ? requireAnyPerm(['reports', 'inventory']) : requirePerm('reports'))(req, res, next),
  dashboardRoutes,
);
app.use('/api/search', searchRoutes);                // pencarian global
app.use('/api/attachments', attachmentLinkRoutes);
app.use('/api/attachments', attachmentRoutes);       // access follows the parent document
app.use('/api/notifications', notificationRoutes);   // per-user; POST /check di-gate di file
app.use('/api/settings', settingsRoutes);            // GET /company terbuka; tulis di-gate di file
app.use('/api/users', usersRoutes);                  // /me/password open; other endpoints requirePerm('users')
app.use('/api/roles', roleRoutes);                   // kelola RBAC — guard requireCap('rbac.manage') di file
app.use('/api/inventory', inventoryRoutes);          // gate per sub-router di inventory/index.ts
app.use('/api/payment-requests', paymentRequestRoutes);    // semua user login; izin keuangan/direktur dicek per endpoint

// AIRA admin: tool config and MCP tokens need the settings permission, plus rbac.manage on sensitive endpoints.
// Agents execute tools only through /mcp, never through /api/ai.
app.use('/api/ai/config', requirePerm('settings'), aiConfigRoutes);
app.use('/api/ai/mcp', requirePerm('settings'), aiMcpAdminRoutes);
app.use('/api/ai/chat', aiChatRoutes);          // panel chat: sesi/pesan disimpan Entaris, agen via API engine
app.use('/api/chat-history', chatHistoryRoutes);  // dipakai tool MCP chat_* (hanya sesi milik aktor)

// The client requests /uploads/<...> directly, so it must be served before the SPA fallback.
const uploadsDir = path.resolve(process.env.UPLOADS_DIR || './uploads');
app.use('/uploads', express.static(uploadsDir));

// Built client: hashed /assets/* are cached for a year; index.html is never cached so a reload picks up new builds.
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

// Fallback for uncaught throws: log the full error, return only a generic message (never Prisma, stack or schema details).
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

// Process Handlers
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
  // A demo-data batch runs in this process; one still 'running' at boot was cut off by a restart.
  failOrphanedDemoBatches().catch((err) => {
    logger.error({ err }, 'failOrphanedDemoBatches failed');
  });

  // All background jobs go through the central scheduler; Postgres advisory locks let only one replica run each tick.
  startScheduler();
});
