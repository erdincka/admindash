import { StatusType } from "grommet"

type NotificationStatus = StatusType

type NotificationEvent = {
    message: string
    status: NotificationStatus
}

type Listener = (notification: NotificationEvent) => void

let listener: Listener | null = null

export const registerNotificationListener = (fn: Listener) => {
    listener = fn
    return () => {
        listener = null
    }
}

export const notify = {
    success: (message: string) => listener?.({ message, status: 'normal' }),
    error: (message: string) => listener?.({ message, status: 'critical' }),
    loading: (message: string) => listener?.({ message, status: 'unknown' }),
    info: (message: string) => listener?.({ message, status: 'normal' }),
    dismiss: () => { },
    custom: (message: string) => listener?.({ message, status: 'normal' }),
}
