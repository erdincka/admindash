import { apiClient, ApiResponse } from './client'

export interface ClusterMetrics {
    health_score: number
    cpu_usage_percent: number
    memory_usage_percent: number
    active_pods: number
    total_pods: number
}

export const clusterApi = {
    getMetrics: async (): Promise<ClusterMetrics> => {
        // Backend returns ClusterMetrics directly, not wrapped in ApiResponse
        const response = await apiClient.get<ClusterMetrics>('/cluster/metrics')
        return response as any as ClusterMetrics
    },

    getDomain: async (): Promise<{ domain: string }> => {
        // Backend returns { domain: string } directly, not wrapped in ApiResponse
        const response = await apiClient.get<{ domain: string }>('/cluster/domain')
        return response as any as { domain: string }
    }
}
