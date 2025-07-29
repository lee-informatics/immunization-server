export interface ConditionCache {
  data?: { [patientId: string]: any[] };
  timestamp?: number;
}

export const CONDITION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

export let conditionCache: ConditionCache = {};