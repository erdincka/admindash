'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8000/'

interface UseWebSocketOptions {
    autoConnect?: boolean
    onConnect?: () => void
    onDisconnect?: () => void
    onError?: (error: any) => void
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
    const {
        autoConnect = true,
        onConnect,
        onDisconnect,
        onError
    } = options

    const [isConnected, setIsConnected] = useState(false)
    const [socket, setSocket] = useState<Socket | null>(null)
    const reconnectAttempts = useRef(0)
    const maxReconnectAttempts = 5

    useEffect(() => {
        if (!autoConnect) return

        const socketInstance = io(SOCKET_URL, {
            path: '/socket.io',
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: maxReconnectAttempts,
        })

        socketInstance.on('connect', () => {
            console.log('WebSocket connected')
            setIsConnected(true)
            reconnectAttempts.current = 0
            onConnect?.()
        })

        socketInstance.on('disconnect', () => {
            console.log('WebSocket disconnected')
            setIsConnected(false)
            onDisconnect?.()
        })

        socketInstance.on('connect_error', (error) => {
            console.error('WebSocket connection error:', error)
            reconnectAttempts.current++

            if (reconnectAttempts.current >= maxReconnectAttempts) {
                console.error('Max reconnection attempts reached')
            }

            onError?.(error)
        })

        setSocket(socketInstance)

        return () => {
            socketInstance.disconnect()
        }
    }, [autoConnect, onConnect, onDisconnect, onError])

    const subscribe = useCallback((kind: string, namespace?: string) => {
        if (!socket) return

        socket.emit('subscribe_resources', { kind, namespace })
    }, [socket])

    const unsubscribe = useCallback((kind: string, namespace?: string) => {
        if (!socket) return

        socket.emit('unsubscribe_resources', { kind, namespace })
    }, [socket])

    const on = useCallback((event: string, callback: (data: any) => void) => {
        if (!socket) return

        socket.on(event, callback)

        return () => {
            socket.off(event, callback)
        }
    }, [socket])

    return {
        socket,
        isConnected,
        subscribe,
        unsubscribe,
        on,
    }
}
