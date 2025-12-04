import { apiClient, ApiResponse } from './client'

export interface HelmChart {
    name: string
    namespace: string
    version: string
    status: string
    created_at: string
}

export const chartsApi = {
    list: async (): Promise<ApiResponse<HelmChart[]>> => {
        return apiClient.get<HelmChart[]>('/charts')
    },

    delete: async (name: string, namespace: string = 'default'): Promise<ApiResponse<{ deleted: boolean; secrets_removed: number }>> => {
        return apiClient.delete<{ deleted: boolean; secrets_removed: number }>(`/charts/${name}?namespace=${namespace}`)
    },
}
