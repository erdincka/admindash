'use client'

import React from 'react'
import { Box, Text } from 'grommet'
import { StatusGood, StatusWarning, StatusCritical } from 'grommet-icons'

interface ConnectionStatusProps {
    isConnected: boolean
    showText?: boolean
}

export function ConnectionStatus({ isConnected, showText = true }: ConnectionStatusProps) {
    return (
        <Box direction="row" gap="xsmall" align="center">
            {isConnected ? (
                <>
                    <StatusGood color="status-ok" size="small" />
                    {showText && <Text size="xsmall" color="status-ok">Connected</Text>}
                </>
            ) : (
                <>
                    <StatusCritical color="status-critical" size="small" />
                    {showText && <Text size="xsmall" color="status-critical">Disconnected</Text>}
                </>
            )}
        </Box>
    )
}
