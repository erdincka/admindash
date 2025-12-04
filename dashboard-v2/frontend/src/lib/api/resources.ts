import { apiClient, ApiResponse } from './client'

export interface K8sResource {
    name: string
    namespace: string
    created_at: string
    labels: Record<string, string>
    annotations: Record<string, string>
    status: any
    full_data: any
}

export const resourcesApi = {
    list: async (kind: string, namespace?: string): Promise<ApiResponse<K8sResource[]>> => {
        const query = namespace ? `?namespace=${namespace}` : ''
        return apiClient.get<K8sResource[]>(`/resources/${kind}${query}`)
    },

    get: async (kind: string, namespace: string, name: string): Promise<ApiResponse<any>> => {
        return apiClient.get<any>(`/resources/${kind}/${namespace}/${name}`)
    },
}
