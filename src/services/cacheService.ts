export interface CacheData {
  data?: { [patientId: string]: any[] };
  timestamp?: number;
}

export const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

export class CacheService {
  private cache: CacheData = {};
  private readonly cacheType: string;

  constructor(cacheType: string) {
    this.cacheType = cacheType;
  }

  get data(): { [patientId: string]: any[] } | undefined {
    return this.cache.data;
  }

  set data(value: { [patientId: string]: any[] } | undefined) {
    this.cache.data = value;
  }

  get timestamp(): number | undefined {
    return this.cache.timestamp;
  }

  set timestamp(value: number | undefined) {
    this.cache.timestamp = value;
  }

  clear(): void {
    this.cache.data = undefined;
    this.cache.timestamp = undefined;
  }

  isExpired(): boolean {
    if (!this.cache.timestamp) return true;
    return Date.now() - this.cache.timestamp > CACHE_TTL;
  }
}

// Create instances for each cache type
export const allergyCache = new CacheService('allergy');
export const conditionCache = new CacheService('condition');
export const immunizationCache = new CacheService('immunization'); 