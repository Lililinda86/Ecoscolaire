import React from 'react';
import { AcademicCalendarSettings } from '../components/Settings/AcademicCalendarSettings';
import { useAppContext } from '../context/AppContext';

const AcademicPeriods: React.FC = () => {
  const { db, currentSchool, currentUser } = useAppContext();
  if (!currentSchool || !currentUser) return null;
  return (
    <main className="p-4 sm:p-6 max-w-5xl mx-auto" data-testid="academic-periods-page">
      <AcademicCalendarSettings
        currentSchool={currentSchool}
        currentUser={currentUser}
        academicYears={db.academicYears || []}
        periods={db.periods || []}
      />
    </main>
  );
};

export default AcademicPeriods;
