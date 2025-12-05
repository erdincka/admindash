import { apiClient, ApiResponse } from './client'
import { DeploymentCreate, Deployment } from '@/types/deployment'

export const deploymentsApi = {
    create: async (deployment: DeploymentCreate): Promise<ApiResponse<Deployment>> => {
        return apiClient.post<Deployment>('/deployments', deployment)
    },

    list: async (namespace?: string): Promise<ApiResponse<Deployment[]>> => {
        const query = namespace ? `?namespace=${namespace}` : ''
        return apiClient.get<Deployment[]>(`/deployments${query}`)
    },

    get: async (name: string, namespace: string = 'default'): Promise<ApiResponse<Deployment>> => {
        return apiClient.get<Deployment>(`/deployments/${name}?namespace=${namespace}`)
    },

    delete: async (name: string, namespace: string = 'default'): Promise<ApiResponse<{ deleted: boolean }>> => {
        return apiClient.delete<{ deleted: boolean }>(`/deployments/${name}?namespace=${namespace}`)
    },

    validate: async (deployment: DeploymentCreate): Promise<ApiResponse<{ valid: boolean }>> => {
        return apiClient.post<{ valid: boolean }>('/deployments/validate', deployment)
    },
}

export const namespacesApi = {
    list: async (): Promise<ApiResponse<Array<{ name: string; status: string; created_at: string }>>> => {
        return apiClient.get('/namespaces')
    },
}
