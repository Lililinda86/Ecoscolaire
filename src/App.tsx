import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAppContext } from './context/AppContext';

import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Staff from './pages/Staff';
import Attendance from './pages/Attendance';
import Buses from './pages/Buses';
import Inventory from './pages/Inventory';
import Settings from './pages/Settings';
import Grades from './pages/Grades';
import Payments from './pages/Payments';
import Classes from './pages/Classes';
import Login from './pages/Login';
import SuperAdmin from './pages/SuperAdmin';
import ParentPortal from './pages/ParentPortal';
import UsersManagement from './pages/UsersManagement';
import ValidationDashboard from './pages/ValidationDashboard';
import AIDirector from './pages/AIDirector';
import AITeacher from './pages/AITeacher';
import Communication from './pages/Communication';
import AuditLogs from './pages/AuditLogs';

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

function App() {
  const { db, saveDB } = useAppContext();

  useEffect(() => {
    if (!db || !db.school) return;

    let shouldSave = false;
    let newClasses = [...db.classes];

    // 1. Scrub Mère -> Maternelle
    newClasses = newClasses.map(c => {
      if (c.name.match(/m[èe]re/i)) {
        shouldSave = true;
        return { ...c, name: c.name.replace(/m[èe]re/ig, 'Maternelle') };
      }
      return c;
    });

    const standardFranco = ['Maternelle 1', 'Maternelle 2', 'Maternelle 3', 'SIL', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'];
    const standardAnglo = ['Nursery 1', 'Nursery 2', 'Nursery 3', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6'];
    
    const normalize = (name: string) => name.toLowerCase().trim().replace(/m[èe]re/gi, 'maternelle');

    const existingFranco = newClasses.filter(c => c.type === 'francophone').map(c => normalize(c.name));
    const existingAnglo = newClasses.filter(c => c.type === 'anglophone').map(c => normalize(c.name));

    standardFranco.forEach(name => {
      if (!existingFranco.includes(normalize(name))) {
        shouldSave = true;
        newClasses.push({ id: crypto.randomUUID(), name, type: 'francophone' as const });
      }
    });

    standardAnglo.forEach(name => {
      if (!existingAnglo.includes(normalize(name))) {
        shouldSave = true;
        newClasses.push({ id: crypto.randomUUID(), name, type: 'anglophone' as const });
      }
    });

    const uniqueClassesMap = new Map<string, string>(); // hash -> id
    const duplicateClassIdsToRemap = new Map<string, string>(); // oldId -> newId
    const deduplicatedClasses: typeof newClasses = [];

    newClasses.forEach(c => {
      const hash = `${c.type}_${normalize(c.name)}`;
      if (!uniqueClassesMap.has(hash)) {
        uniqueClassesMap.set(hash, c.id);
        deduplicatedClasses.push(c);
      } else {
        shouldSave = true;
        duplicateClassIdsToRemap.set(c.id, uniqueClassesMap.get(hash)!);
      }
    });

    if (shouldSave) {
      const payload: any = { ...db, classes: deduplicatedClasses };
      
      if (duplicateClassIdsToRemap.size > 0) {
        payload.students = db.students.map((s: any) => s.classId && duplicateClassIdsToRemap.has(s.classId) 
          ? { ...s, classId: duplicateClassIdsToRemap.get(s.classId)! } 
          : s
        );
        payload.staff = db.staff.map((s: any) => s.assignedClassId && duplicateClassIdsToRemap.has(s.assignedClassId)
          ? { ...s, assignedClassId: duplicateClassIdsToRemap.get(s.assignedClassId)! }
          : s
        );
      }

      saveDB(payload);
    }
  }, [db?.classes, db?.school, saveDB]);

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={
          <ProtectedRouteForLogin>
            <Login />
          </ProtectedRouteForLogin>
        } />
        <Route path="/diagnostic" element={<Diagnostic />} />
        
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
          <ProtectedRoute>
            <Layout><Dashboard /></Layout>
          </ProtectedRoute>
        } />
        
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Layout><Dashboard /></Layout>
          </ProtectedRoute>
        } />
        
        <Route path="/school-dashboard" element={
          <ProtectedRoute>
            <Layout><Dashboard /></Layout>
          </ProtectedRoute>
        } />
        
        <Route path="/students" element={<ProtectedRoute><Layout><Students /></Layout></ProtectedRoute>} />
        <Route path="/classes" element={<ProtectedRoute><Layout><Classes /></Layout></ProtectedRoute>} />
        <Route path="/staff" element={<ProtectedRoute><Layout><Staff /></Layout></ProtectedRoute>} />
        <Route path="/attendance" element={<ProtectedRoute><Layout><Attendance /></Layout></ProtectedRoute>} />
        <Route path="/buses" element={<ProtectedRoute><Layout><Buses /></Layout></ProtectedRoute>} />
        <Route path="/inventory" element={<ProtectedRoute><Layout><Inventory /></Layout></ProtectedRoute>} />
        <Route path="/grades" element={<ProtectedRoute><Layout><Grades /></Layout></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Layout><Settings /></Layout></ProtectedRoute>} />
        <Route path="/payments" element={<ProtectedRoute><Layout><Payments /></Layout></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute><Layout><UsersManagement /></Layout></ProtectedRoute>} />
        <Route path="/validations" element={<ProtectedRoute><Layout><ValidationDashboard /></Layout></ProtectedRoute>} />
        <Route path="/ai-director" element={<ProtectedRoute><Layout><AIDirector /></Layout></ProtectedRoute>} />
        <Route path="/ai-teacher" element={<ProtectedRoute><Layout><AITeacher /></Layout></ProtectedRoute>} />
        <Route path="/communication" element={<ProtectedRoute><Layout><Communication /></Layout></ProtectedRoute>} />
        <Route path="/audit" element={<ProtectedRoute><Layout><AuditLogs /></Layout></ProtectedRoute>} />
        
        {/* Redirection fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
