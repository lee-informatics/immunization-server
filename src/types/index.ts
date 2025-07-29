export interface AllergyCache {
  data?: { [patientId: string]: any[] };
  timestamp?: number;
}

export const ExportJobState = {
  IN_PROGRESS: 'IN_PROGRESS',
  FINISHED: 'FINISHED',
  FAILED: 'FAILED',
} as const;
export type ExportJobStateType = typeof ExportJobState[keyof typeof ExportJobState]; 