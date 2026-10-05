import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import api from './lib/api';
import { can } from './lib/permissions';
import { useNumberInputGuard } from './hooks/useNumberInputGuard';
import { CompanySettingsProvider } from './contexts/CompanySettingsContext';
import { MainLayout } from './layouts/MainLayout';
import { Dashboard } from './pages/Dashboard';
import { GeneralLedger } from './pages/GeneralLedger';
import { COAPage } from './pages/COAPage';
import { SalesInvoices } from './pages/SalesInvoices';
import { PurchaseInvoices } from './pages/PurchaseInvoices';
import Quotations from './pages/Quotations';
import SalesOrders from './pages/SalesOrders';
import SalesReturnsPage from './pages/SalesReturnsPage';
import Inquiries from './pages/Inquiries';
import Warehouses from './pages/Warehouses';
import WarehouseStockDashboard from './pages/WarehouseStockDashboard';
import StockTransfers from './pages/StockTransfers';
import DeliveryOrders from './pages/DeliveryOrders';
import GoodsReceipts from './pages/GoodsReceipts';
import PurchaseOrders from './pages/PurchaseOrders';
import { Payments } from './pages/Payments';
import { PartiesPage } from './pages/PartiesPage';
import { InventoryPage } from './pages/InventoryPage';
import { StockOpnamePage } from './pages/StockOpnamePage';
import LoginPage from './pages/LoginPage';
import LandingPage from './pages/LandingPage';
import PublicInquiry from './pages/PublicInquiry';
import PublicAssetScan from './pages/PublicAssetScan';

import Reports from './pages/Reports';
import TrialBalance from './pages/reports/TrialBalance';
import ProfitLoss from './pages/reports/ProfitLoss';
import BalanceSheet from './pages/reports/BalanceSheet';
import AgingAnalysis from './pages/reports/AgingAnalysis';
import CashFlow from './pages/reports/CashFlow';
import { SettingsPage } from './pages/Settings';
import { UserManagement } from './pages/UserManagement';
import { AuditTrail } from './pages/AuditTrail';
import { Notifications } from './pages/Notifications';
import { RecurringTransactions } from './pages/RecurringTransactions';
import { BankReconciliation } from './pages/BankReconciliation';
import { VendorDeposits } from './pages/VendorDeposits';
import { ProjectGuarantees } from './pages/ProjectGuarantees';
import { LoadingState } from '@/components/shared';
import { GaDashboardPage } from './pages/ga/GaDashboardPage';
import { GaAssetsPage } from './pages/ga/GaAssetsPage';
import { GaDocumentsPage } from './pages/ga/GaDocumentsPage';
import { GaInventoryPage } from './pages/ga/GaInventoryPage';
import { GaMaintenancePage } from './pages/ga/GaMaintenancePage';
import { GaMaterialRequestPage } from './pages/ga/GaMaterialRequestPage';
import { GaVehiclePage } from './pages/ga/GaVehiclePage';
import { CustomerDeposits } from './pages/CustomerDeposits';
import FixedAssetsPage from './pages/FixedAssetsPage';
import ApprovalsPage from './pages/ApprovalsPage';

// Dev-only component review page; the import is dropped from production builds.
// Pengajuan Pembayaran pages are code-split (keeps the main chunk under the PWA precache limit).
const GaFleetReportPage = lazy(() => import('./pages/ga/GaFleetReportPage').then((m) => ({ default: m.GaFleetReportPage })));
const GaBuildingPage = lazy(() => import('./pages/ga/GaBuildingPage').then((m) => ({ default: m.GaBuildingPage })));
const GaEquipmentPage = lazy(() => import('./pages/ga/GaEquipmentPage').then((m) => ({ default: m.GaEquipmentPage })));
const GaMasterPage = lazy(() => import('./pages/ga/GaMasterPage').then((m) => ({ default: m.GaMasterPage })));
const DailyReport = lazy(() => import('./pages/reports/DailyReport'));
const OeeReport = lazy(() => import('./pages/reports/OeeReport'));
const LedgerBook = lazy(() => import('./pages/reports/LedgerBook'));
const HealthCheckPage = lazy(() => import('./pages/HealthCheckPage'));
const AiraChat = lazy(() => import('./pages/AiraChat'));
const TaxReport = lazy(() => import('./pages/reports/TaxReport'));
const HppReport = lazy(() => import('./pages/reports/HppReport'));
const ProfitabilityPerSku = lazy(() => import('./pages/reports/ProfitabilityPerSku'));
const ProductionCostSummary = lazy(() => import('./pages/reports/ProductionCostSummary'));
const PayableSchedule = lazy(() => import('./pages/reports/PayableSchedule'));
const ReceivableSchedule = lazy(() => import('./pages/reports/ReceivableSchedule'));
const PoOutstanding = lazy(() => import('./pages/reports/PoOutstanding'));
const SupplierPerformance = lazy(() => import('./pages/reports/SupplierPerformance'));
const PaymentRequests = lazy(() => import('./pages/PaymentRequests').then((m) => ({ default: m.PaymentRequests })));
const PaymentRequestForm = lazy(() => import('./pages/PaymentRequestForm').then((m) => ({ default: m.PaymentRequestForm })));
const PaymentRequestSettlementPage = lazy(() => import('./pages/PaymentRequestSettlement').then((m) => ({ default: m.PaymentRequestSettlementPage })));
const PaymentRequestDetailPage = lazy(() => import('./pages/PaymentRequestDetail').then((m) => ({ default: m.PaymentRequestDetailPage })));
const UiPlayground = import.meta.env.DEV ? lazy(() => import('./pages/dev/UiPlayground')) : null;


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
  return (
    <Router>
      <Routes>
        <Route path="/welcome" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/tanya" element={<PublicInquiry />} />
        <Route path="/inquire" element={<PublicInquiry />} />
        <Route path="/aset/:qrCode" element={<PublicAssetScan />} />
        {UiPlayground && <Route path="/_ui" element={<Suspense fallback={null}><UiPlayground /></Suspense>} />}
        
        <Route element={<ProtectedRoute />}>
          <Route element={<CompanySettingsProvider><MainLayout /></CompanySettingsProvider>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/aira" element={<Suspense fallback={<LoadingState />}><AiraChat /></Suspense>} />
            <Route path="/payment-requests" element={<Suspense fallback={<LoadingState />}><PaymentRequests /></Suspense>} />
            <Route path="/payment-requests/new" element={<Suspense fallback={<LoadingState />}><PaymentRequestForm /></Suspense>} />
            <Route path="/payment-requests/:id/edit" element={<Suspense fallback={<LoadingState />}><PaymentRequestForm /></Suspense>} />
            <Route path="/payment-requests/:id/settlement" element={<Suspense fallback={<LoadingState />}><PaymentRequestSettlementPage /></Suspense>} />
            <Route path="/payment-requests/:id" element={<Suspense fallback={<LoadingState />}><PaymentRequestDetailPage /></Suspense>} />
            <Route path="/coa" element={<PermRoute module="coa"><COAPage /></PermRoute>} />
            <Route path="/gl" element={<PermRoute module="journal"><GeneralLedger /></PermRoute>} />
            <Route path="/sales" element={<PermRoute module="sales_invoice"><SalesInvoices /></PermRoute>} />
            <Route path="/inquiries" element={<PermRoute module="quotation"><Inquiries /></PermRoute>} />
            <Route path="/quotations" element={<PermRoute module="quotation"><Quotations /></PermRoute>} />
            <Route path="/sales-orders" element={<PermRoute module="sales_order"><SalesOrders /></PermRoute>} />
            <Route path="/sales-returns" element={<PermRoute module="sales_return"><SalesReturnsPage /></PermRoute>} />
            <Route path="/purchase" element={<PermRoute module="purchase_invoice"><PurchaseInvoices /></PermRoute>} />
            <Route path="/payments" element={<PermRoute module="payment"><Payments /></PermRoute>} />
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
            <Route path="/ga/vehicle/report" element={<PermRoute module="ga_vehicle"><Suspense fallback={<LoadingState />}><GaFleetReportPage /></Suspense></PermRoute>} />
            <Route path="/ga/building" element={<PermRoute module="ga_building"><Suspense fallback={<LoadingState />}><GaBuildingPage /></Suspense></PermRoute>} />
            <Route path="/ga/equipment" element={<PermRoute module="ga_equipment"><Suspense fallback={<LoadingState />}><GaEquipmentPage /></Suspense></PermRoute>} />
            <Route path="/ga/master" element={<PermRoute module="ga_master"><Suspense fallback={<LoadingState />}><GaMasterPage /></Suspense></PermRoute>} />
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
            <Route path="/reports/daily" element={<PermRoute module="reports"><Suspense fallback={<LoadingState />}><DailyReport /></Suspense></PermRoute>} />
            <Route path="/reports/trial-balance" element={<PermRoute module="reports"><TrialBalance /></PermRoute>} />
            <Route path="/reports/profit-loss" element={<PermRoute module="reports"><ProfitLoss /></PermRoute>} />
            <Route path="/reports/balance-sheet" element={<PermRoute module="reports"><BalanceSheet /></PermRoute>} />
            <Route path="/reports/cash-flow" element={<PermRoute module="reports"><CashFlow /></PermRoute>} />
            <Route path="/reports/aging-ar" element={<PermRoute module="reports"><AgingAnalysis type="Customer" /></PermRoute>} />
            <Route path="/reports/aging-ap" element={<PermRoute module="reports"><AgingAnalysis type="Supplier" /></PermRoute>} />
            <Route path="/reports/tax" element={<PermRoute module="reports"><Suspense fallback={<LoadingState />}><TaxReport /></Suspense></PermRoute>} />
            <Route path="/reports/ledger-book" element={<PermRoute module="reports"><Suspense fallback={<LoadingState />}><LedgerBook /></Suspense></PermRoute>} />
            <Route path="/reports/hpp" element={<PermRoute module="reports"><Suspense fallback={<LoadingState />}><HppReport /></Suspense></PermRoute>} />
            <Route path="/reports/profitability-per-sku" element={<PermRoute module="reports"><Suspense fallback={<LoadingState />}><ProfitabilityPerSku /></Suspense></PermRoute>} />
            <Route path="/reports/production-cost-summary" element={<PermRoute module="reports"><Suspense fallback={<LoadingState />}><ProductionCostSummary /></Suspense></PermRoute>} />
            <Route path="/reports/oee" element={<PermRoute module="reports"><Suspense fallback={<LoadingState />}><OeeReport /></Suspense></PermRoute>} />
            <Route path="/reports/payable-schedule" element={<PermRoute module="reports"><Suspense fallback={<LoadingState />}><PayableSchedule /></Suspense></PermRoute>} />
            <Route path="/reports/receivable-schedule" element={<PermRoute module="reports"><Suspense fallback={<LoadingState />}><ReceivableSchedule /></Suspense></PermRoute>} />
            <Route path="/reports/po-outstanding" element={<PermRoute module="reports"><Suspense fallback={<LoadingState />}><PoOutstanding /></Suspense></PermRoute>} />
            <Route path="/reports/supplier-performance" element={<PermRoute module="reports"><Suspense fallback={<LoadingState />}><SupplierPerformance /></Suspense></PermRoute>} />

            <Route path="/reconciliation" element={<PermRoute module="reconciliation"><BankReconciliation /></PermRoute>} />
            <Route path="/settings" element={<PermRoute module="settings"><SettingsPage /></PermRoute>} />
            <Route path="/users" element={<PermRoute module="users"><UserManagement /></PermRoute>} />
            <Route path="/audit" element={<PermRoute module="audit"><AuditTrail /></PermRoute>} />
            <Route path="/health-check" element={<PermRoute module="audit"><Suspense fallback={<LoadingState />}><HealthCheckPage /></Suspense></PermRoute>} />
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
