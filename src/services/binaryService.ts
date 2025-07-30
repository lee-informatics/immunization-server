import axios, { AxiosResponse } from 'axios';

export async function fetchAndStoreBinaries(output: any[]): Promise<Record<string, any[]>> {
  const binaries: Record<string, any[]> = {};
  for (const entry of output) {
    if (entry.type && entry.url) {
      if (!binaries[entry.type]) binaries[entry.type] = [];
      try {
        const response: AxiosResponse = await axios.get(entry.url, { headers: { 'Accept': 'application/fhir+json' } });
        if (response.data) {
          binaries[entry.type].push(response.data);
        }
      } catch (err: any) {
        console.error(`[BINARY ERROR] url: ${entry.url} err:`, err.message);
      }
    }
  }
  return binaries;
}

export function decodeAndFilterRecords(binaries: Record<string, any[]>, patientId: string): Record<string, any[]> {
  const result: Record<string, any[]> = {};
  for (const type in binaries) {
    result[type] = [];
    for (const binary of binaries[type]) {
      if (!binary.data) continue;
      let decoded: string;
      try {
        decoded = Buffer.from(binary.data, 'base64').toString('utf-8');
      } catch (e) {
        continue;
      }
      const lines = decoded.trim().split(/\r?\n/);
      for (const line of lines) {
        try {
          const record = JSON.parse(line);
          const ref = record.patient?.reference || record.subject?.reference;
          if (ref === `Patient/${patientId}`) {
            result[type].push(record);
          }
        } catch (e) {}
      }
    }
    if (result[type].length === 0) delete result[type];
  }
  return result;
} 