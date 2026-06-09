import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAppContext } from './context/AppContext';

import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Staff from './pages/Staff';
import Attendance from './pages/Attendance';
import Buses from './pages/Buses';
import Inventory from './pages/Inventory';
import Setup from './pages/Setup';
import Settings from './pages/Settings';
import Grades from './pages/Grades';
import Payments from './pages/Payments';
import Classes from './pages/Classes';

function App() {
  const { db, saveDB } = useAppContext();

  useEffect(() => {
    if (!db.school) return;

    let shouldSave = false;
    let newClasses = [...db.classes];

    // 1. Scrub Mère -> Maternelle
    newClasses = newClasses.map(c => {
      if (c.name.match(/m[èe]re/i)) {
        shouldSave = true;
        // Fix typo: replace 'maternelle' with the properly capitalized version
        return { ...c, name: c.name.replace(/m[èe]re/ig, 'Maternelle') };
      }
      return c;
    });

    // 2. Ensure ALL standard curriculum classes exist globally
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

    // 3. Deduplicate classes to fix any previously created duplicates
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
        payload.students = db.students.map(s => s.classId && duplicateClassIdsToRemap.has(s.classId) 
          ? { ...s, classId: duplicateClassIdsToRemap.get(s.classId)! } 
          : s
        );
        payload.staff = db.staff.map(s => s.assignedClassId && duplicateClassIdsToRemap.has(s.assignedClassId)
          ? { ...s, assignedClassId: duplicateClassIdsToRemap.get(s.assignedClassId)! }
          : s
        );
      }

      saveDB(payload);
    }
  }, [db.classes, db.school]);

  if (!db.school) {
    return (
      <HashRouter>
        <Routes>
          <Route path="*" element={<Setup />} />
        </Routes>
      </HashRouter>
    );
  }

  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/students" element={<Students />} />
          <Route path="/classes" element={<Classes />} />
          <Route path="/staff" element={<Staff />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/buses" element={<Buses />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/grades" element={<Grades />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
}

export default App;
