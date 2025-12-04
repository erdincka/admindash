'use client'

import { useState, useEffect } from 'react'
import { Notification, StatusType } from 'grommet'
import { registerNotificationListener } from '@/lib/utils/notifications'

export function NotificationProvider() {
    const [notification, setNotification] = useState<{ message: string; status: StatusType } | null>(null)

    useEffect(() => {
        return registerNotificationListener((n) => {
            setNotification(n)
        })
    }, [])

    if (!notification) return null

    return (
        <Notification
            toast
            status={notification.status}
            message={notification.message}
            onClose={() => setNotification(null)}
        />
    )
}
