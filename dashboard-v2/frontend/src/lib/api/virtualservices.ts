import { apiClient, ApiResponse } from './client'

export interface VirtualService {
    metadata: {
        name: string
        namespace: string
    }
    spec: {
        hosts: string[]
        gateways: string[]
        http?: any[]
    }
}

export interface Service {
    name: string
    namespace: string
    ports: Array<{
        name: string
        port: number
    }>
    labels: Record<string, string>
}

export interface CreateVirtualServiceRequest {
    namespace: string
    service_name: string
    hostname: string
    domain: string
    labels?: Record<string, string>
}

export const virtualservicesApi = {
    list: async (namespace?: string): Promise<ApiResponse<VirtualService[]>> => {
        const query = namespace ? `?namespace=${namespace}` : ''
        return apiClient.get<VirtualService[]>(`/virtualservices/virtualservices${query}`)
    },

    create: async (data: CreateVirtualServiceRequest): Promise<ApiResponse<any>> => {
        return apiClient.post<any>('/virtualservices/virtualservices', data)
    },

    listServices: async (namespace: string): Promise<ApiResponse<Service[]>> => {
        return apiClient.get<Service[]>(`/virtualservices/services?namespace=${namespace}`)
    }
}
