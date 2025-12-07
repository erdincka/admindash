'use client'

import { Box, Text, Tip } from 'grommet'
import { StatusGood, StatusCritical } from 'grommet-icons'

interface ConnectionStatusProps {
    isConnected: boolean
    showText?: boolean
}

export function ConnectionStatus({ isConnected, showText = false }: ConnectionStatusProps) {
    return (
        isConnected ? (
            <>
                <StatusGood color="status-ok" size="small" tip="Websocket connected" />
                {showText && <Text size="xsmall" color="status-ok">Connected</Text>}
            </>
        ) : (
            <>
                <StatusCritical color="status-critical" size="small" />
                {showText && <Text size="xsmall" color="status-critical">Disconnected</Text>}
            </>
        )
    )
}
