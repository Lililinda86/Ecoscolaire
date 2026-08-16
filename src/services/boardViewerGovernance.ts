import { httpsCallable } from 'firebase/functions';
import { functions } from '../db/firebase';

export interface BoardViewerGovernanceSummary {
  school: { id: string; name: string; academicYear: string; activeAcademicYearId: string };
  students: { total: number; active: number; byClass: Array<{ className: string; count: number }> };
  attendance: { records: number; present: number; absent: number; late: number; rate: number };
  finance: {
    collected: number;
    expenses: number;
    netCash: number;
    latestClosure: { date: string; theoreticalBalance: number; discrepancy: number } | null;
  };
  transport: {
    activeBuses: number;
    activeRoutes: number;
    openBreakdowns: number;
    fuelCost: number;
    maintenanceCost: number;
    transportedStudents: number;
  };
  inventory: { itemTypes: number; totalQuantity: number; lowStockItems: number };
  academics: {
    publishedGrades: number;
    averageOutOf20: number | null;
    publishedPrograms: number;
    draftPrograms: number;
  };
  generatedAt: string;
}

export const loadBoardViewerGovernanceSummary = async (): Promise<BoardViewerGovernanceSummary> => {
  const callable = httpsCallable<Record<string, never>, BoardViewerGovernanceSummary>(
    functions,
    'getBoardViewerGovernanceSummary'
  );
  const result = await callable({});
  return result.data;
};
