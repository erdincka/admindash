export interface ResourceRequirements {
    cpu_request?: string
    cpu_limit?: string
    memory_request?: string
    memory_limit?: string
    gpu?: number
}

export interface VolumeMount {
    name: string
    mount_path: string
    read_only: boolean
}

export interface DeploymentCreate {
    name: string
    namespace: string
    image: string
    port?: number
    replicas: number
    expose_service: boolean
    service_type: 'ClusterIP' | 'NodePort' | 'LoadBalancer'

    // Advanced Options
    is_public?: boolean
    run_as_root?: boolean
    is_sso?: boolean
    is_user_volume?: boolean
    is_shared_volume?: boolean
    is_gpu?: boolean
    user_namespace?: string

    resources?: ResourceRequirements
    env_vars: Record<string, string>
    command?: string[]
    args?: string[]
    volume_mounts: VolumeMount[]
}

export interface Deployment {
    name: string
    namespace: string
    replicas: number
    available_replicas: number
    created_at: string
    image: string
    status: string
}
