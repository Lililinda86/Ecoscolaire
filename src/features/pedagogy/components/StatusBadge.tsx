import type { TeachingPlanStatus } from '../types';
import { pedagogyStatusLabel } from '../validators';

export const StatusBadge = ({ status }: { status: TeachingPlanStatus }) => (
  <span className={`pedagogy-status pedagogy-status--${status}`}>{pedagogyStatusLabel[status]}</span>
);
