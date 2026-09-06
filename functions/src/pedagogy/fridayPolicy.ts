export const FRIDAY_TIME_ZONE = 'Africa/Douala';
export interface FridayPolicy { enabled: boolean; localTime: string; classIds: string[] }
export function parseFridayPolicy(value: unknown): FridayPolicy {
  const policy = value as FridayPolicy;
  if (!policy || typeof policy.enabled !== 'boolean' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(policy.localTime || '') ||
      !Array.isArray(policy.classIds) || policy.classIds.length > 100 ||
      (policy.enabled && policy.classIds.length === 0) ||
      policy.classIds.some(id => typeof id !== 'string' || !id.trim() || id.includes('/') || id.length > 100) ||
      new Set(policy.classIds).size !== policy.classIds.length) throw new Error('FRIDAY_CONFIGURATION_INVALID');
  return { enabled: policy.enabled, localTime: policy.localTime, classIds: [...policy.classIds].sort() };
}
export function fridayWindow(now: Date, policy: FridayPolicy) {
  if (!Number.isFinite(now.getTime())) throw new Error('INVALID_SCHEDULER_TIME');
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: FRIDAY_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || '';
  const date = `${part('year')}-${part('month')}-${part('day')}`;
  return { date, due: policy.enabled && part('weekday') === 'Fri' && `${part('hour')}:${part('minute')}` >= policy.localTime };
}
