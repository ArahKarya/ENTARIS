import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { CompanySettingsProvider } from './contexts/CompanySettingsContext';
import { MainLayout } from './layouts/MainLayout';
import { Dashboard } from './pages/Dashboard';
import { GeneralLedger } from './pages/GeneralLedger';
import { COAPage } from './pages/COAPage';
import { SalesInvoices } from './pages/SalesInvoices';
import { PurchaseInvoices } from './pages/PurchaseInvoices';
import Quotations from './pages/Quotations';
import Inquiries from './pages/Inquiries';
import Warehouses from './pages/Warehouses';
import WarehouseStockDashboard from './pages/WarehouseStockDashboard';
import StockTransfers from './pages/StockTransfers';
import { Payments } from './pages/Payments';
import { PartiesPage } from './pages/PartiesPage';
import { InventoryPage } from './pages/InventoryPage';
import { StockOpnamePage } from './pages/StockOpnamePage';
import LoginPage from './pages/LoginPage';
import PublicInquiry from './pages/PublicInquiry';

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
import { CustomerDeposits } from './pages/CustomerDeposits';
import TaxReport from './pages/reports/TaxReport';
import LedgerBook from './pages/reports/LedgerBook';
import HealthCheckPage from './pages/HealthCheckPage';
import HppReport from './pages/reports/HppReport';
import PayableSchedule from './pages/reports/PayableSchedule';
import ReceivableSchedule from './pages/reports/ReceivableSchedule';
import FixedAssetsPage from './pages/FixedAssetsPage';
import ApprovalsPage from './pages/ApprovalsPage';
import DailyReport from './pages/reports/DailyReport';


const ProtectedRoute = () => {
  const user = localStorage.getItem('user');
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
};

function getUserRole(): string | null {
  try { return JSON.parse(localStorage.getItem('user') || 'null')?.role ?? null; }
  catch { return null; }
}

const RoleRoute = ({ allowed, children }: { allowed: string[]; children: React.ReactNode }) => {
  const role = getUserRole();
  if (role && !allowed.includes(role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

// Shorthand: routes only accessible to finance roles (not StaffProduksi)
const FinanceRoute = ({ children }: { children: React.ReactNode }) => (
  <RoleRoute allowed={['Admin', 'Accountant', 'Viewer']}>{children}</RoleRoute>
);
const AdminRoute = ({ children }: { children: React.ReactNode }) => (
  <RoleRoute allowed={['Admin']}>{children}</RoleRoute>
);

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/tanya" element={<PublicInquiry />} />
        <Route path="/inquire" element={<PublicInquiry />} />
        
        <Route element={<ProtectedRoute />}>
          <Route element={<CompanySettingsProvider><MainLayout /></CompanySettingsProvider>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/coa" element={<FinanceRoute><COAPage /></FinanceRoute>} />
            <Route path="/gl" element={<FinanceRoute><GeneralLedger /></FinanceRoute>} />
            <Route path="/sales" element={<FinanceRoute><SalesInvoices /></FinanceRoute>} />
            <Route path="/inquiries" element={<FinanceRoute><Inquiries /></FinanceRoute>} />
            <Route path="/quotations" element={<FinanceRoute><Quotations /></FinanceRoute>} />
            <Route path="/purchase" element={<RoleRoute allowed={['Admin', 'Accountant', 'StaffProduksi']}><PurchaseInvoices /></RoleRoute>} />
            <Route path="/payments" element={<FinanceRoute><Payments /></FinanceRoute>} />
            <Route path="/vendor-deposits" element={<RoleRoute allowed={['Admin', 'Accountant', 'StaffProduksi']}><VendorDeposits /></RoleRoute>} />
            <Route path="/customer-deposits" element={<RoleRoute allowed={['Admin', 'Accountant']}><CustomerDeposits /></RoleRoute>} />
            <Route path="/parties" element={<RoleRoute allowed={['Admin', 'Accountant', 'StaffProduksi']}><PartiesPage /></RoleRoute>} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/stock-opname" element={<RoleRoute allowed={['Admin', 'Accountant']}><StockOpnamePage /></RoleRoute>} />
            <Route path="/warehouses" element={<RoleRoute allowed={['Admin', 'Accountant', 'StaffProduksi']}><Warehouses /></RoleRoute>} />
            <Route path="/warehouse-stock" element={<RoleRoute allowed={['Admin', 'Accountant', 'StaffProduksi', 'Viewer']}><WarehouseStockDashboard /></RoleRoute>} />
            <Route path="/stock-transfers" element={<RoleRoute allowed={['Admin', 'Accountant', 'StaffProduksi']}><StockTransfers /></RoleRoute>} />

            {/* Report Routes */}
            <Route path="/reports" element={<FinanceRoute><Reports /></FinanceRoute>} />
            <Route path="/reports/daily" element={<FinanceRoute><DailyReport /></FinanceRoute>} />
            <Route path="/reports/trial-balance" element={<FinanceRoute><TrialBalance /></FinanceRoute>} />
            <Route path="/reports/profit-loss" element={<FinanceRoute><ProfitLoss /></FinanceRoute>} />
            <Route path="/reports/balance-sheet" element={<FinanceRoute><BalanceSheet /></FinanceRoute>} />
            <Route path="/reports/cash-flow" element={<FinanceRoute><CashFlow /></FinanceRoute>} />
            <Route path="/reports/aging-ar" element={<FinanceRoute><AgingAnalysis type="Customer" /></FinanceRoute>} />
            <Route path="/reports/aging-ap" element={<FinanceRoute><AgingAnalysis type="Supplier" /></FinanceRoute>} />
            <Route path="/reports/tax" element={<FinanceRoute><TaxReport /></FinanceRoute>} />
            <Route path="/reports/ledger-book" element={<FinanceRoute><LedgerBook /></FinanceRoute>} />
            <Route path="/reports/hpp" element={<FinanceRoute><HppReport /></FinanceRoute>} />
            <Route path="/reports/payable-schedule" element={<FinanceRoute><PayableSchedule /></FinanceRoute>} />
            <Route path="/reports/receivable-schedule" element={<FinanceRoute><ReceivableSchedule /></FinanceRoute>} />

            <Route path="/reconciliation" element={<RoleRoute allowed={['Admin', 'Accountant']}><BankReconciliation /></RoleRoute>} />
            <Route path="/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
            <Route path="/users" element={<AdminRoute><UserManagement /></AdminRoute>} />
            <Route path="/audit" element={<AdminRoute><AuditTrail /></AdminRoute>} />
            <Route path="/health-check" element={<AdminRoute><HealthCheckPage /></AdminRoute>} />
            <Route path="/fixed-assets" element={<RoleRoute allowed={['Admin', 'Accountant']}><FixedAssetsPage /></RoleRoute>} />
            <Route path="/approvals" element={<RoleRoute allowed={['Admin', 'Accountant']}><ApprovalsPage /></RoleRoute>} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/recurring" element={<RoleRoute allowed={['Admin', 'Accountant']}><RecurringTransactions /></RoleRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
