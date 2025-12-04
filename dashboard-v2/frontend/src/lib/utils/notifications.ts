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
    normal: (message: string) => listener?.({ message, status: 'normal' }),
    critical: (message: string) => listener?.({ message, status: 'critical' }),
    unknown: (message: string) => listener?.({ message, status: 'unknown' }),
    info: (message: string) => listener?.({ message, status: 'info' }),
    dismiss: () => { },
    warning: (message: string) => listener?.({ message, status: 'warning' }),
}
