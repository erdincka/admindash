
import { apiClient } from './client';

export interface PromResult {
    resultType: 'matrix' | 'vector' | 'scalar' | 'string';
    result: Array<{
        metric: Record<string, string>;
        value?: [number, string]; // for vector/scalar
        values?: Array<[number, string]>; // for matrix
    }>;
}

export const monitoringApi = {
    query: async (query: string, time?: string) => {
        return apiClient.get<PromResult>('/monitoring/query', { params: { query, time } });
    },
    queryRange: async (query: string, start: string, end: string, step: string = '60s') => {
        return apiClient.get<PromResult>('/monitoring/query_range', { params: { query, start, end, step } });
    }
};
