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

    getLogs: async (namespace: string, name: string, container?: string, tailLines: number = 1000): Promise<ApiResponse<string>> => {
        const params = new URLSearchParams()
        if (container) params.append('container', container)
        params.append('tail_lines', tailLines.toString())
        const query = params.toString() ? `?${params.toString()}` : ''
        return apiClient.get<string>(`/resources/pod/${namespace}/${name}/logs${query}`)
    },

    describe: async (kind: string, namespace: string, name: string): Promise<ApiResponse<string>> => {
        return apiClient.get<string>(`/resources/${kind}/${namespace}/${name}/describe`)
    },

    delete: async (kind: string, namespace: string, name: string): Promise<ApiResponse<any>> => {
        return apiClient.delete<any>(`/resources/${kind}/${namespace}/${name}`)
    },

    getDependencies: async (kind: string, namespace: string, name: string): Promise<ApiResponse<ResourceDependencies>> => {
        return apiClient.get<ResourceDependencies>(`/resources/${kind}/${namespace}/${name}/dependencies`)
    },

    applyYaml: async (yaml: string): Promise<ApiResponse<YamlApplyResult>> => {
        return apiClient.post<YamlApplyResult>('/resources/apply', { yaml })
    }
}

export interface ResourceDependency {
    kind: string
    name: string
    namespace: string
    status?: string
    replicas?: string
    relation?: string
}

export interface ResourceDependencies {
    upstream: ResourceDependency[]
    downstream: ResourceDependency[]
    related: ResourceDependency[]
}

export interface YamlApplyResult {
    created: number
    exists: number
    failed: number
    total: number
    results: Array<{
        kind: string
        name: string
        namespace: string
        status: string
        message: string
    }>
}
