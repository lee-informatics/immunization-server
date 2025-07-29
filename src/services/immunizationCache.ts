export interface ImmunizationCache {
  data?: { [patientId: string]: any[] };
  timestamp?: number;
}

export const immunizationCache: ImmunizationCache = {};

export const IMMUNIZATION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds