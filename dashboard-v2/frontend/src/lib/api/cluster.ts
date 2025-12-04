import { apiClient, ApiResponse } from './client'

export interface ClusterMetrics {
    health_score: number
    cpu_usage_percent: number
    memory_usage_percent: number
    active_pods: number
    total_pods: number
}

export const clusterApi = {
    getMetrics: () => apiClient.get<ClusterMetrics>('/cluster/metrics'),
}
