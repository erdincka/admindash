import { apiClient, ApiResponse } from './client'

export interface HelmChart {
    name: string
    namespace: string
    version: string
    chart: string
    status: string
    app_version: string
    created_at: string
}

export interface HelmInstallRequest {
    name: string
    chart: string
    namespace?: string
    repo_url?: string
    repo_name?: string
    version?: string
    values?: Record<string, any>
    create_namespace?: boolean
}

export interface HelmUpgradeRequest {
    chart: string
    namespace?: string
    version?: string
    values?: Record<string, any>
}

export const chartsApi = {
    list: async (): Promise<ApiResponse<HelmChart[]>> => {
        return apiClient.get<HelmChart[]>('/charts')
    },

    install: async (request: HelmInstallRequest): Promise<ApiResponse<any>> => {
        return apiClient.post<any>('/charts/install', request)
    },

    upgrade: async (name: string, request: HelmUpgradeRequest): Promise<ApiResponse<any>> => {
        return apiClient.put<any>(`/charts/${name}/upgrade`, request)
    },

    delete: async (name: string, namespace: string = 'default'): Promise<ApiResponse<{ deleted: boolean; name: string; namespace: string }>> => {
        return apiClient.delete<{ deleted: boolean; name: string; namespace: string }>(`/charts/${name}?namespace=${namespace}`)
    },
}
