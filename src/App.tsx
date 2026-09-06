import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAppContext } from './context/AppContext';

import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import BoardViewerDashboard from './pages/BoardViewerDashboard';
import Students from './pages/Students';
import Staff from './pages/Staff';
import Attendance from './pages/Attendance';
import Buses from './pages/Buses';
import Inventory from './pages/Inventory';
import Settings from './pages/Settings';
import Grades from './pages/Grades';
import ReportCards from './pages/ReportCards';
import Payments from './pages/Payments';
import Classes from './pages/Classes';
import SubjectsProgram from './pages/SubjectsProgram';
import Login from './pages/Login';
import SuperAdmin from './pages/SuperAdmin';
import ParentPortal from './pages/ParentPortal';
import ParentSignup from './pages/ParentSignup';
import UsersManagement from './pages/UsersManagement';
import ValidationDashboard from './pages/ValidationDashboard';
import AIDirector from './pages/AIDirector';
import AITeacher from './pages/AITeacher';
import Communication from './pages/Communication';
import AuditLogs from './pages/AuditLogs';
import AcademicPeriods from './pages/AcademicPeriods';
import PedagogyDashboard from './features/pedagogy/pages/PedagogyDashboard';
import PedagogyProgram from './features/pedagogy/pages/PedagogyProgram';
import PedagogyPlanning from './features/pedagogy/pages/PedagogyPlanning';
import PedagogyHistory from './features/pedagogy/pages/PedagogyHistory';
import PedagogyPreparations from './features/pedagogy/pages/PedagogyPreparations';
import PedagogyPreparationImport from './features/pedagogy/pages/PedagogyPreparationImport';
import PedagogyMissingPreparations from './features/pedagogy/pages/PedagogyMissingPreparations';
import PedagogyAssessments from './features/pedagogy/pages/PedagogyAssessments';
import PedagogyObservations from './features/pedagogy/pages/PedagogyObservations';
import PedagogySettings from './features/pedagogy/pages/PedagogySettings';
import PedagogyResults from './features/pedagogy/pages/PedagogyResults';

import Diagnostic from './pages/Diagnostic';

const ProtectedRouteForLogin = ({ children }: { children: React.ReactNode }) => {
  const { currentUser, authLoading } = useAppContext();
  
  if (authLoading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Chargement en cours...</div>;
  if (currentUser) {
    if (currentUser.role === 'superAdmin') return <Navigate to="/superadmin" replace />;
    if (currentUser.role === 'parent') return <Navigate to="/parent" replace />;
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

const RoleAwareDashboard = () => {
  const { currentUser } = useAppContext();
  return currentUser?.role === 'boardViewer' ? <BoardViewerDashboard /> : <Dashboard />;
};

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={
          <ProtectedRouteForLogin>
            <Login />
          </ProtectedRouteForLogin>
        } />
        <Route path="/diagnostic" element={<Diagnostic />} />
        <Route path="/parent-signup" element={<ParentSignup />} />
        
        {/* Route Parent Portal protégée */}
        <Route path="/parent" element={
          <ProtectedRoute allowedRoles={['parent']}>
            <ParentPortal />
          </ProtectedRoute>
        } />
        
        {/* Route Super Admin protégée */}
        <Route path="/superadmin" element={
          <ProtectedRoute allowedRoles={['superAdmin']}>
            <SuperAdmin />
          </ProtectedRoute>
        } />
        
        <Route path="/superadmin/users" element={
          <ProtectedRoute allowedRoles={['superAdmin']}>
            <UsersManagement />
          </ProtectedRoute>
        } />

        {/* Routes du Dashboard avec Layout */}
        <Route path="/" element={
          <ProtectedRoute allowedRoles={['superAdmin', 'owner', 'director', 'secretary', 'accountant', 'teacher', 'boardViewer']}>
            <Layout><RoleAwareDashboard /></Layout>
          </ProtectedRoute>
        } />
        
        <Route path="/dashboard" element={
          <ProtectedRoute allowedRoles={['superAdmin', 'owner', 'director', 'secretary', 'accountant', 'teacher', 'boardViewer']}>
            <Layout><RoleAwareDashboard /></Layout>
          </ProtectedRoute>
        } />
        
        <Route path="/school-dashboard" element={
          <ProtectedRoute allowedRoles={['superAdmin', 'owner', 'director', 'secretary', 'accountant', 'teacher', 'boardViewer']}>
            <Layout><RoleAwareDashboard /></Layout>
          </ProtectedRoute>
        } />
        
        <Route path="/students" element={<ProtectedRoute requireSchool allowedRoles={['superAdmin', 'owner', 'director', 'secretary']}><Layout><Students /></Layout></ProtectedRoute>} />
        <Route path="/classes" element={<ProtectedRoute requireSchool allowedRoles={['superAdmin', 'owner', 'director', 'secretary']}><Layout><Classes /></Layout></ProtectedRoute>} />
        <Route path="/subjects-program" element={<ProtectedRoute requireSchool allowedRoles={['superAdmin', 'owner', 'director', 'secretary', 'teacher']}><Layout><SubjectsProgram /></Layout></ProtectedRoute>} />
        <Route path="/staff" element={<ProtectedRoute requireSchool allowedRoles={['owner', 'director', 'secretary', 'superAdmin']}><Layout><Staff /></Layout></ProtectedRoute>} />
        <Route path="/attendance" element={<ProtectedRoute requireSchool allowedRoles={['superAdmin', 'owner', 'director', 'secretary', 'teacher']}><Layout><Attendance /></Layout></ProtectedRoute>} />
        <Route path="/buses" element={<ProtectedRoute requireSchool allowedRoles={['superAdmin', 'owner', 'director', 'secretary', 'driver']}><Layout><Buses /></Layout></ProtectedRoute>} />
        <Route path="/inventory" element={<ProtectedRoute requireSchool allowedRoles={['owner', 'director', 'secretary', 'accountant', 'superAdmin']}><Layout><Inventory /></Layout></ProtectedRoute>} />
        <Route path="/grades" element={<ProtectedRoute requireSchool allowedRoles={['superAdmin', 'owner', 'director', 'secretary', 'teacher']}><Layout><Grades /></Layout></ProtectedRoute>} />
        <Route path="/report-cards" element={<ProtectedRoute requireSchool allowedRoles={['superAdmin', 'owner', 'director', 'secretary']}><Layout><ReportCards /></Layout></ProtectedRoute>} />
        <Route path="/academic-periods" element={<ProtectedRoute requireSchool allowedRoles={['superAdmin', 'owner', 'director', 'secretary', 'teacher']}><Layout><AcademicPeriods /></Layout></ProtectedRoute>} />
        <Route path="/pedagogy" element={<ProtectedRoute requireSchool allowedRoles={['superAdmin', 'owner', 'director', 'secretary', 'boardViewer']}><Layout><PedagogyDashboard /></Layout></ProtectedRoute>} />
        <Route path="/pedagogy/program" element={<ProtectedRoute requireSchool allowedRoles={['superAdmin', 'owner', 'director', 'secretary', 'boardViewer']}><Layout><PedagogyProgram /></Layout></ProtectedRoute>} />
        <Route path="/pedagogy/planning" element={<ProtectedRoute requireSchool allowedRoles={['superAdmin', 'owner', 'director', 'secretary', 'boardViewer']}><Layout><PedagogyPlanning /></Layout></ProtectedRoute>} />
        <Route path="/pedagogy/history" element={<ProtectedRoute requireSchool allowedRoles={['superAdmin', 'owner', 'director', 'secretary', 'boardViewer']}><Layout><PedagogyHistory /></Layout></ProtectedRoute>} />
        <Route path="/pedagogy/preparations" element={<ProtectedRoute requireSchool allowedRoles={['superAdmin', 'owner', 'director', 'secretary']}><Layout><PedagogyPreparations /></Layout></ProtectedRoute>} />
        <Route path="/pedagogy/preparations/import" element={<ProtectedRoute requireSchool allowedRoles={['superAdmin', 'owner', 'director', 'secretary']}><Layout><PedagogyPreparationImport /></Layout></ProtectedRoute>} />
        <Route path="/pedagogy/preparations/missing" element={<ProtectedRoute requireSchool allowedRoles={['superAdmin', 'owner', 'director', 'secretary']}><Layout><PedagogyMissingPreparations /></Layout></ProtectedRoute>} />
        <Route path="/pedagogy/assessments" element={<ProtectedRoute requireSchool allowedRoles={['superAdmin', 'owner', 'director', 'secretary']}><Layout><PedagogyAssessments /></Layout></ProtectedRoute>} />
        <Route path="/pedagogy/observations" element={<ProtectedRoute requireSchool allowedRoles={['superAdmin', 'owner', 'director', 'secretary']}><Layout><PedagogyObservations /></Layout></ProtectedRoute>} />
        <Route path="/pedagogy/settings" element={<ProtectedRoute requireSchool allowedRoles={['superAdmin', 'owner', 'director', 'secretary']}><Layout><PedagogySettings /></Layout></ProtectedRoute>} />
        <Route path="/pedagogy/results" element={<ProtectedRoute requireSchool allowedRoles={['superAdmin', 'owner', 'director', 'secretary']}><Layout><PedagogyResults /></Layout></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute requireSchool allowedRoles={['superAdmin', 'owner', 'director']}><Layout><Settings /></Layout></ProtectedRoute>} />
        <Route path="/payments" element={<ProtectedRoute requireSchool allowedRoles={['owner', 'director', 'accountant', 'secretary', 'superAdmin']}><Layout><Payments /></Layout></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute allowedRoles={['superAdmin', 'owner', 'director']}><Layout><UsersManagement /></Layout></ProtectedRoute>} />
        <Route path="/validations" element={<ProtectedRoute requireSchool allowedRoles={['superAdmin', 'owner', 'director']}><Layout><ValidationDashboard /></Layout></ProtectedRoute>} />
        <Route path="/ai-director" element={<ProtectedRoute requireSchool allowedRoles={['superAdmin', 'owner', 'director']}><Layout><AIDirector /></Layout></ProtectedRoute>} />
        <Route path="/ai-teacher" element={<ProtectedRoute requireSchool allowedRoles={['teacher']}><Layout><AITeacher /></Layout></ProtectedRoute>} />
        <Route path="/communication" element={<ProtectedRoute requireSchool allowedRoles={['superAdmin', 'owner', 'director', 'teacher']}><Layout><Communication /></Layout></ProtectedRoute>} />
        <Route path="/audit" element={<ProtectedRoute requireSchool allowedRoles={['superAdmin', 'owner', 'director']}><Layout><AuditLogs /></Layout></ProtectedRoute>} />
        
        {/* Redirection fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
