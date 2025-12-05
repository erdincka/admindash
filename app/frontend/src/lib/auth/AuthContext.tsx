'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@/types/user'
import { apiClient, API_URL } from '@/lib/api/client'

interface AuthContextType {
    user: User | null
    isLoading: boolean
    isAuthenticated: boolean
    logout: () => void
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    logout: () => { },
})

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const checkAuth = async () => {
            try {
                // We're using fetch directly here because the backend 
                // doesn't yet return the standard ApiResponse envelope
                const response = await fetch(`${API_URL}/auth/me`)

                if (response.ok) {
                    const userData = await response.json()
                    setUser(userData)
                } else {
                    setUser(null)
                }
            } catch (error) {
                console.error('Auth check failed:', error)
                setUser(null)
            } finally {
                setIsLoading(false)
            }
        }

        checkAuth()
    }, [])

    const logout = () => {
        // In a real app with OAuth2-proxy, we'd redirect to the logout endpoint
        // window.location.href = '/oauth2/sign_out'
        setUser(null)
    }

    return (
        <AuthContext.Provider
            value={{
                user,
                isLoading,
                isAuthenticated: !!user,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    )
}
