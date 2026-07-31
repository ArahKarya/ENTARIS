import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import api from './lib/api';
import { can } from './lib/permissions';
import { useNumberInputGuard } from './hooks/useNumberInputGuard';
import { CompanySettingsProvider } from './contexts/CompanySettingsContext';
import { MainLayout } from './layouts/MainLayout';
import LoginPage from './pages/LoginPage';
import PublicAssetScan from './pages/PublicAssetScan';

import { EamDashboard } from './pages/EamDashboard';
import { Notifications } from './pages/Notifications';
import { GaAssetsPage } from './pages/ga/GaAssetsPage';
import { GaDocumentsPage } from './pages/ga/GaDocumentsPage';
import { GaInventoryPage } from './pages/ga/GaInventoryPage';
import { GaMaintenancePage } from './pages/ga/GaMaintenancePage';
import { GaMaterialRequestPage } from './pages/ga/GaMaterialRequestPage';
import { GaVehiclePage } from './pages/ga/GaVehiclePage';
import { GaFleetReportPage } from './pages/ga/GaFleetReportPage';
import { GaBuildingPage } from './pages/ga/GaBuildingPage';
import { GaEquipmentPage } from './pages/ga/GaEquipmentPage';
import { GaMasterPage } from './pages/ga/GaMasterPage';
import FixedAssetsPage from './pages/FixedAssetsPage';

// EAM standalone app: subset of the ERP PMD frontend, scoped to General
// Affairs / Enterprise Asset Management modules only. Same backend/DB/auth
// as ERP (shared cookie SSO across *.panganmasadepan.com) — see PRD
// EAM-Standalone-v0.1 Section 10.
//
// Protected shell: refresh /auth/me sekali saat load supaya permissions/caps di
// localStorage selalu fresh (mis. setelah Admin mengubah matriks izin). Server
// tetap enforce; ini menjaga UI sinkron. 401 → ke /login.
const ProtectedRoute = () => {
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

  if (!authed && !localStorage.getItem('user')) return <Navigate to="/login" replace />;
  if (!ready) return null; // hindari flash UI sebelum permissions ter-refresh
  return <Outlet />;
};

// Gate route berdasarkan izin modul (view). Tanpa akses → ke aset (home EAM).
const PermRoute = ({ module, children }: { module: string; children: React.ReactNode }) => {
  if (can(module, 'view')) return <>{children}</>;
  return <Navigate to="/" replace />;
};

function App() {
  useNumberInputGuard();
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/aset/:qrCode" element={<PublicAssetScan />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<CompanySettingsProvider><MainLayout /></CompanySettingsProvider>}>
            {/* Home EAM = dashboard ringkas (aset/NBV/WO), bukan dashboard finance ERP */}
            <Route path="/" element={<EamDashboard />} />
            <Route path="/notifications" element={<Notifications />} />
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
            <Route path="/fixed-assets" element={<PermRoute module="fixed_assets"><FixedAssetsPage /></PermRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
