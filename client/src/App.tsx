import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import api from './lib/api';
import { can } from './lib/permissions';
import { useNumberInputGuard } from './hooks/useNumberInputGuard';
import { CompanySettingsProvider } from './contexts/CompanySettingsContext';
import { MainLayout } from './layouts/MainLayout';
import LoginPage from './pages/LoginPage';
import { lazyPage } from './app/lazy';
import { installLinkPreload } from './app/lazyUtils';

// Every page is code-split (see app/lazy.tsx). Login stays in the entry chunk.
const Dashboard = lazyPage(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const GeneralLedger = lazyPage(() => import('./pages/GeneralLedger').then((m) => ({ default: m.GeneralLedger })));
const COAPage = lazyPage(() => import('./pages/COAPage').then((m) => ({ default: m.COAPage })));
const SalesInvoices = lazyPage(() => import('./pages/SalesInvoices').then((m) => ({ default: m.SalesInvoices })));
const PurchaseInvoices = lazyPage(() => import('./pages/PurchaseInvoices').then((m) => ({ default: m.PurchaseInvoices })));
const Quotations = lazyPage(() => import('./pages/Quotations'));
const SalesOrders = lazyPage(() => import('./pages/SalesOrders'));
const SalesReturnsPage = lazyPage(() => import('./pages/SalesReturnsPage'));
const Inquiries = lazyPage(() => import('./pages/Inquiries'));
const Warehouses = lazyPage(() => import('./pages/Warehouses'));
const WarehouseStockDashboard = lazyPage(() => import('./pages/WarehouseStockDashboard'));
const StockTransfers = lazyPage(() => import('./pages/StockTransfers'));
const DeliveryOrders = lazyPage(() => import('./pages/DeliveryOrders'));
const GoodsReceipts = lazyPage(() => import('./pages/GoodsReceipts'));
const PurchaseOrders = lazyPage(() => import('./pages/PurchaseOrders'));
const Payments = lazyPage(() => import('./pages/Payments').then((m) => ({ default: m.Payments })));
const PartiesPage = lazyPage(() => import('./pages/PartiesPage').then((m) => ({ default: m.PartiesPage })));
const InventoryPage = lazyPage(() => import('./pages/InventoryPage').then((m) => ({ default: m.InventoryPage })));
const StockOpnamePage = lazyPage(() => import('./pages/StockOpnamePage').then((m) => ({ default: m.StockOpnamePage })));
const LandingPage = lazyPage(() => import('./pages/LandingPage'));
const PublicInquiry = lazyPage(() => import('./pages/PublicInquiry'));
const PublicAssetScan = lazyPage(() => import('./pages/PublicAssetScan'));
const Reports = lazyPage(() => import('./pages/Reports'));
const TrialBalance = lazyPage(() => import('./pages/reports/TrialBalance'));
const ProfitLoss = lazyPage(() => import('./pages/reports/ProfitLoss'));
const BalanceSheet = lazyPage(() => import('./pages/reports/BalanceSheet'));
const AgingAnalysis = lazyPage(() => import('./pages/reports/AgingAnalysis'));
const CashFlow = lazyPage(() => import('./pages/reports/CashFlow'));
const SettingsPage = lazyPage(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })));
const UserManagement = lazyPage(() => import('./pages/UserManagement').then((m) => ({ default: m.UserManagement })));
const AuditTrail = lazyPage(() => import('./pages/AuditTrail').then((m) => ({ default: m.AuditTrail })));
const Notifications = lazyPage(() => import('./pages/Notifications').then((m) => ({ default: m.Notifications })));
const RecurringTransactions = lazyPage(() => import('./pages/RecurringTransactions').then((m) => ({ default: m.RecurringTransactions })));
const BankReconciliation = lazyPage(() => import('./pages/BankReconciliation').then((m) => ({ default: m.BankReconciliation })));
const VendorDeposits = lazyPage(() => import('./pages/VendorDeposits').then((m) => ({ default: m.VendorDeposits })));
const ProjectGuarantees = lazyPage(() => import('./pages/ProjectGuarantees').then((m) => ({ default: m.ProjectGuarantees })));
const GaDashboardPage = lazyPage(() => import('./pages/ga/GaDashboardPage').then((m) => ({ default: m.GaDashboardPage })));
const GaAssetsPage = lazyPage(() => import('./pages/ga/GaAssetsPage').then((m) => ({ default: m.GaAssetsPage })));
const GaDocumentsPage = lazyPage(() => import('./pages/ga/GaDocumentsPage').then((m) => ({ default: m.GaDocumentsPage })));
const GaInventoryPage = lazyPage(() => import('./pages/ga/GaInventoryPage').then((m) => ({ default: m.GaInventoryPage })));
const GaMaintenancePage = lazyPage(() => import('./pages/ga/GaMaintenancePage').then((m) => ({ default: m.GaMaintenancePage })));
const GaMaterialRequestPage = lazyPage(() => import('./pages/ga/GaMaterialRequestPage').then((m) => ({ default: m.GaMaterialRequestPage })));
const GaVehiclePage = lazyPage(() => import('./pages/ga/GaVehiclePage').then((m) => ({ default: m.GaVehiclePage })));
const CustomerDeposits = lazyPage(() => import('./pages/CustomerDeposits').then((m) => ({ default: m.CustomerDeposits })));
const FixedAssetsPage = lazyPage(() => import('./pages/FixedAssetsPage'));
const ApprovalsPage = lazyPage(() => import('./pages/ApprovalsPage'));
const DailyReport = lazyPage(() => import('./pages/reports/DailyReport'));
const OeeReport = lazyPage(() => import('./pages/reports/OeeReport'));
const LedgerBook = lazyPage(() => import('./pages/reports/LedgerBook'));
const HealthCheckPage = lazyPage(() => import('./pages/HealthCheckPage'));
const AiraChat = lazyPage(() => import('./pages/AiraChat'));
const TaxReport = lazyPage(() => import('./pages/reports/TaxReport'));
const HppReport = lazyPage(() => import('./pages/reports/HppReport'));
const ProfitabilityPerSku = lazyPage(() => import('./pages/reports/ProfitabilityPerSku'));
const ProductionCostSummary = lazyPage(() => import('./pages/reports/ProductionCostSummary'));
const PayableSchedule = lazyPage(() => import('./pages/reports/PayableSchedule'));
const ReceivableSchedule = lazyPage(() => import('./pages/reports/ReceivableSchedule'));
const PoOutstanding = lazyPage(() => import('./pages/reports/PoOutstanding'));
const SupplierPerformance = lazyPage(() => import('./pages/reports/SupplierPerformance'));

const GaFleetReportPage = lazyPage(() => import('./pages/ga/GaFleetReportPage').then((m) => ({ default: m.GaFleetReportPage })));
const GaBuildingPage = lazyPage(() => import('./pages/ga/GaBuildingPage').then((m) => ({ default: m.GaBuildingPage })));
const GaEquipmentPage = lazyPage(() => import('./pages/ga/GaEquipmentPage').then((m) => ({ default: m.GaEquipmentPage })));
const GaMasterPage = lazyPage(() => import('./pages/ga/GaMasterPage').then((m) => ({ default: m.GaMasterPage })));
const PaymentRequests = lazyPage(() => import('./pages/PaymentRequests').then((m) => ({ default: m.PaymentRequests })));
const PaymentRequestForm = lazyPage(() => import('./pages/PaymentRequestForm').then((m) => ({ default: m.PaymentRequestForm })));
const PaymentRequestSettlementPage = lazyPage(() => import('./pages/PaymentRequestSettlement').then((m) => ({ default: m.PaymentRequestSettlementPage })));
const CashBookDrafts = lazyPage(() => import('./pages/CashBookDrafts').then((m) => ({ default: m.CashBookDrafts })));
const CashBookDraftReview = lazyPage(() => import('./pages/CashBookDraftReview').then((m) => ({ default: m.CashBookDraftReview })));
const PaymentRequestDetailPage = lazyPage(() => import('./pages/PaymentRequestDetail').then((m) => ({ default: m.PaymentRequestDetailPage })));
// Dev-only component review page; the import is dropped from production builds.
const UiPlayground = import.meta.env.DEV ? lazyPage(() => import('./pages/dev/UiPlayground')) : null;

const ROUTE_PRELOAD: Record<string, () => void> = {
  '/welcome': LandingPage.preload,
  '/tanya': PublicInquiry.preload,
  '/inquire': PublicInquiry.preload,
  '/': Dashboard.preload,
  '/aira': AiraChat.preload,
  '/coa': COAPage.preload,
  '/gl': GeneralLedger.preload,
  '/sales': SalesInvoices.preload,
  '/inquiries': Inquiries.preload,
  '/quotations': Quotations.preload,
  '/sales-orders': SalesOrders.preload,
  '/sales-returns': SalesReturnsPage.preload,
  '/purchase': PurchaseInvoices.preload,
  '/payments': Payments.preload,
  '/cash-book-drafts': CashBookDrafts.preload,
  '/vendor-deposits': VendorDeposits.preload,
  '/project-guarantees': ProjectGuarantees.preload,
  '/ga': GaDashboardPage.preload,
  '/ga/assets': GaAssetsPage.preload,
  '/ga/documents': GaDocumentsPage.preload,
  '/ga/inventory': GaInventoryPage.preload,
  '/ga/maintenance': GaMaintenancePage.preload,
  '/ga/material-requests': GaMaterialRequestPage.preload,
  '/ga/vehicle': GaVehiclePage.preload,
  '/customer-deposits': CustomerDeposits.preload,
  '/parties': PartiesPage.preload,
  '/inventory': InventoryPage.preload,
  '/stock-opname': StockOpnamePage.preload,
  '/warehouses': Warehouses.preload,
  '/warehouse-stock': WarehouseStockDashboard.preload,
  '/stock-transfers': StockTransfers.preload,
  '/delivery-orders': DeliveryOrders.preload,
  '/goods-receipts': GoodsReceipts.preload,
  '/purchase-orders': PurchaseOrders.preload,
  '/reports': Reports.preload,
  '/reports/daily': DailyReport.preload,
  '/reports/trial-balance': TrialBalance.preload,
  '/reports/profit-loss': ProfitLoss.preload,
  '/reports/balance-sheet': BalanceSheet.preload,
  '/reports/cash-flow': CashFlow.preload,
  '/reports/aging-ar': AgingAnalysis.preload,
  '/reports/aging-ap': AgingAnalysis.preload,
  '/reports/tax': TaxReport.preload,
  '/reports/ledger-book': LedgerBook.preload,
  '/reports/hpp': HppReport.preload,
  '/reports/profitability-per-sku': ProfitabilityPerSku.preload,
  '/reports/production-cost-summary': ProductionCostSummary.preload,
  '/reports/oee': OeeReport.preload,
  '/reports/payable-schedule': PayableSchedule.preload,
  '/reports/receivable-schedule': ReceivableSchedule.preload,
  '/reports/po-outstanding': PoOutstanding.preload,
  '/reports/supplier-performance': SupplierPerformance.preload,
  '/reconciliation': BankReconciliation.preload,
  '/settings': SettingsPage.preload,
  '/users': UserManagement.preload,
  '/audit': AuditTrail.preload,
  '/health-check': HealthCheckPage.preload,
  '/fixed-assets': FixedAssetsPage.preload,
  '/approvals': ApprovalsPage.preload,
  '/notifications': Notifications.preload,
  '/recurring': RecurringTransactions.preload,
};




// Protected shell: refresh /auth/me sekali saat load supaya permissions/caps di
// localStorage selalu fresh (mis. setelah Admin mengubah matriks izin). Server
// tetap enforce; ini menjaga UI sinkron. 401 → ke /login.
const ProtectedRoute = () => {
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState<boolean>(() => !!localStorage.getItem('user'));

  useEffect(() => {
    let cancelled = false;
    if (!localStorage.getItem('user')) { setReady(true); setAuthed(false); return; }
    api.get('/auth/me')
      .then((res) => {
        if (cancelled) return;
        if (res.data?.user) localStorage.setItem('user', JSON.stringify(res.data.user));
        setAuthed(true);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err?.response?.status === 401) {
          localStorage.removeItem('user');
          setAuthed(false);
        }
      })
      .finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);

  if (!authed && !localStorage.getItem('user')) {
    // Remember where the user was going; LoginForm returns there after sign-in.
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }
  if (!ready) return null; // hindari flash UI sebelum permissions ter-refresh
  return <Outlet />;
};

// Gate route berdasarkan izin modul (view). Tanpa akses → ke beranda (Dashboard
// selalu dapat diakses, jadi tak ada loop redirect).
const PermRoute = ({ module, children }: { module: string; children: React.ReactNode }) => {
  if (can(module, 'view')) return <>{children}</>;
  return <Navigate to="/" replace />;
};

function App() {
  useNumberInputGuard();
  useEffect(() => installLinkPreload(ROUTE_PRELOAD), []);
  return (
    <Router>
      <Routes>
        <Route path="/welcome" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/tanya" element={<PublicInquiry />} />
        <Route path="/inquire" element={<PublicInquiry />} />
        <Route path="/aset/:qrCode" element={<PublicAssetScan />} />
        {UiPlayground && <Route path="/_ui" element={<UiPlayground />} />}
        
        <Route element={<ProtectedRoute />}>
          <Route element={<CompanySettingsProvider><MainLayout /></CompanySettingsProvider>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/aira" element={<AiraChat />} />
            <Route path="/payment-requests" element={<PaymentRequests />} />
            <Route path="/payment-requests/new" element={<PaymentRequestForm />} />
            <Route path="/payment-requests/:id/edit" element={<PaymentRequestForm />} />
            <Route path="/payment-requests/:id/settlement" element={<PaymentRequestSettlementPage />} />
            <Route path="/payment-requests/:id" element={<PaymentRequestDetailPage />} />
            <Route path="/coa" element={<PermRoute module="coa"><COAPage /></PermRoute>} />
            <Route path="/gl" element={<PermRoute module="journal"><GeneralLedger /></PermRoute>} />
            <Route path="/sales" element={<PermRoute module="sales_invoice"><SalesInvoices /></PermRoute>} />
            <Route path="/inquiries" element={<PermRoute module="quotation"><Inquiries /></PermRoute>} />
            <Route path="/quotations" element={<PermRoute module="quotation"><Quotations /></PermRoute>} />
            <Route path="/sales-orders" element={<PermRoute module="sales_order"><SalesOrders /></PermRoute>} />
            <Route path="/sales-returns" element={<PermRoute module="sales_return"><SalesReturnsPage /></PermRoute>} />
            <Route path="/purchase" element={<PermRoute module="purchase_invoice"><PurchaseInvoices /></PermRoute>} />
            <Route path="/payments" element={<PermRoute module="payment"><Payments /></PermRoute>} />
            <Route path="/cash-book-drafts" element={<PermRoute module="journal"><CashBookDrafts /></PermRoute>} />
            <Route path="/cash-book-drafts/:id" element={<PermRoute module="journal"><CashBookDraftReview /></PermRoute>} />
            <Route path="/vendor-deposits" element={<PermRoute module="vendor_deposit"><VendorDeposits /></PermRoute>} />
            <Route path="/project-guarantees" element={<PermRoute module="project_guarantee"><ProjectGuarantees /></PermRoute>} />
            {/* General Affairs */}
            <Route path="/ga" element={<PermRoute module="ga_assets"><GaDashboardPage /></PermRoute>} />
            <Route path="/ga/assets" element={<PermRoute module="ga_assets"><GaAssetsPage /></PermRoute>} />
            <Route path="/ga/documents" element={<PermRoute module="ga_documents"><GaDocumentsPage /></PermRoute>} />
            <Route path="/ga/inventory" element={<PermRoute module="ga_inventory"><GaInventoryPage /></PermRoute>} />
            <Route path="/ga/maintenance" element={<PermRoute module="ga_maintenance"><GaMaintenancePage /></PermRoute>} />
            <Route path="/ga/material-requests" element={<PermRoute module="ga_material_request"><GaMaterialRequestPage /></PermRoute>} />
            <Route path="/ga/vehicle" element={<PermRoute module="ga_vehicle"><GaVehiclePage /></PermRoute>} />
            <Route path="/ga/vehicle/report" element={<PermRoute module="ga_vehicle"><GaFleetReportPage /></PermRoute>} />
            <Route path="/ga/building" element={<PermRoute module="ga_building"><GaBuildingPage /></PermRoute>} />
            <Route path="/ga/equipment" element={<PermRoute module="ga_equipment"><GaEquipmentPage /></PermRoute>} />
            <Route path="/ga/master" element={<PermRoute module="ga_master"><GaMasterPage /></PermRoute>} />
            {/* Retired page: Tagihan Aset & Umum moved into Pengajuan Pembayaran > Tagihan EAM. */}
            <Route path="/ga/finance" element={<Navigate to="/payment-requests?tab=eam" replace />} />
            <Route path="/customer-deposits" element={<PermRoute module="customer_deposit"><CustomerDeposits /></PermRoute>} />
            <Route path="/parties" element={<PermRoute module="parties"><PartiesPage /></PermRoute>} />
            <Route path="/inventory" element={<PermRoute module="inventory"><InventoryPage /></PermRoute>} />
            <Route path="/stock-opname" element={<PermRoute module="stock_opname"><StockOpnamePage /></PermRoute>} />
            <Route path="/warehouses" element={<PermRoute module="warehouse"><Warehouses /></PermRoute>} />
            <Route path="/warehouse-stock" element={<PermRoute module="inventory"><WarehouseStockDashboard /></PermRoute>} />
            <Route path="/stock-transfers" element={<PermRoute module="stock_transfer"><StockTransfers /></PermRoute>} />
            <Route path="/delivery-orders" element={<PermRoute module="delivery_order"><DeliveryOrders /></PermRoute>} />
            <Route path="/goods-receipts" element={<PermRoute module="goods_receipt"><GoodsReceipts /></PermRoute>} />
            <Route path="/purchase-orders" element={<PermRoute module="purchase_order"><PurchaseOrders /></PermRoute>} />

            {/* Report Routes — semua modul 'reports' */}
            <Route path="/reports" element={<PermRoute module="reports"><Reports /></PermRoute>} />
            <Route path="/reports/daily" element={<PermRoute module="reports"><DailyReport /></PermRoute>} />
            <Route path="/reports/trial-balance" element={<PermRoute module="reports"><TrialBalance /></PermRoute>} />
            <Route path="/reports/profit-loss" element={<PermRoute module="reports"><ProfitLoss /></PermRoute>} />
            <Route path="/reports/balance-sheet" element={<PermRoute module="reports"><BalanceSheet /></PermRoute>} />
            <Route path="/reports/cash-flow" element={<PermRoute module="reports"><CashFlow /></PermRoute>} />
            <Route path="/reports/aging-ar" element={<PermRoute module="reports"><AgingAnalysis type="Customer" /></PermRoute>} />
            <Route path="/reports/aging-ap" element={<PermRoute module="reports"><AgingAnalysis type="Supplier" /></PermRoute>} />
            <Route path="/reports/tax" element={<PermRoute module="reports"><TaxReport /></PermRoute>} />
            <Route path="/reports/ledger-book" element={<PermRoute module="reports"><LedgerBook /></PermRoute>} />
            <Route path="/reports/hpp" element={<PermRoute module="reports"><HppReport /></PermRoute>} />
            <Route path="/reports/profitability-per-sku" element={<PermRoute module="reports"><ProfitabilityPerSku /></PermRoute>} />
            <Route path="/reports/production-cost-summary" element={<PermRoute module="reports"><ProductionCostSummary /></PermRoute>} />
            <Route path="/reports/oee" element={<PermRoute module="reports"><OeeReport /></PermRoute>} />
            <Route path="/reports/payable-schedule" element={<PermRoute module="reports"><PayableSchedule /></PermRoute>} />
            <Route path="/reports/receivable-schedule" element={<PermRoute module="reports"><ReceivableSchedule /></PermRoute>} />
            <Route path="/reports/po-outstanding" element={<PermRoute module="reports"><PoOutstanding /></PermRoute>} />
            <Route path="/reports/supplier-performance" element={<PermRoute module="reports"><SupplierPerformance /></PermRoute>} />

            <Route path="/reconciliation" element={<PermRoute module="reconciliation"><BankReconciliation /></PermRoute>} />
            <Route path="/settings" element={<PermRoute module="settings"><SettingsPage /></PermRoute>} />
            <Route path="/users" element={<PermRoute module="users"><UserManagement /></PermRoute>} />
            <Route path="/audit" element={<PermRoute module="audit"><AuditTrail /></PermRoute>} />
            <Route path="/health-check" element={<PermRoute module="audit"><HealthCheckPage /></PermRoute>} />
            <Route path="/fixed-assets" element={<PermRoute module="fixed_assets"><FixedAssetsPage /></PermRoute>} />
            <Route path="/approvals" element={<PermRoute module="approvals"><ApprovalsPage /></PermRoute>} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/recurring" element={<PermRoute module="recurring"><RecurringTransactions /></PermRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
