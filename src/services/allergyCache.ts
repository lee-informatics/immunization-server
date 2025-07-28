export interface AllergyCache {
  data?: any[];
  timestamp?: number;
}

export const ALLERGY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

export let allergyCache: AllergyCache = {}; 