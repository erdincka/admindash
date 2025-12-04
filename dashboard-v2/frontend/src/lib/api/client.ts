import { notify } from '@/lib/utils/notifications'

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

export interface ApiResponse<T> {
    success: boolean
    data?: T
    error?: {
        code: string
        message: string
        details?: Record<string, any>
    }
    timestamp: string
}

class ApiClient {
    private baseUrl: string

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl
    }

    private async handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
        let data: any
        try {
            data = await response.json()
        } catch (e) {
            const errorMessage = 'Failed to parse response'
            notify.error(errorMessage)
            throw new Error(errorMessage)
        }

        if (!response.ok || (data && data.success === false)) {
            const errorMessage = data?.error?.message || data?.message || 'An unexpected error occurred'
            // Don't notify for 401/403 as they might be handled by auth flow
            if (response.status !== 401 && response.status !== 403) {
                notify.error(errorMessage)
            }
            throw new Error(errorMessage)
        }

        return data as ApiResponse<T>
    }

    async get<T>(path: string): Promise<ApiResponse<T>> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        })
        return this.handleResponse<T>(response)
    }

    async post<T>(path: string, data?: any): Promise<ApiResponse<T>> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: data ? JSON.stringify(data) : undefined,
        })
        return this.handleResponse<T>(response)
    }

    async put<T>(path: string, data?: any): Promise<ApiResponse<T>> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: data ? JSON.stringify(data) : undefined,
        })
        return this.handleResponse<T>(response)
    }

    async delete<T>(path: string): Promise<ApiResponse<T>> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
        })
        return this.handleResponse<T>(response)
    }
}

export const apiClient = new ApiClient(API_URL)
