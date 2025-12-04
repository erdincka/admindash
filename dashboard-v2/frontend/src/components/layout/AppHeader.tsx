'use client'

import { Header, Box, Text, Menu, Avatar, PageHeader, ThemeContext } from 'grommet'
import { User as UserIcon, Logout } from 'grommet-icons'
import { useAuth } from '@/lib/auth/AuthContext'
import { useWebSocket } from '@/lib/hooks/useWebSocket'
import { ConnectionStatus } from '@/components/common/ConnectionStatus'
import { useContext } from 'react'

export function AppHeader() {
    const { user, logout } = useAuth()
    const { isConnected } = useWebSocket()
    const theme = useContext(ThemeContext);

    return (
        <Header elevation="small" background={{
            fill: 'horizontal',
            color: theme.dark
                ? theme.global.colors['background-front']
                : theme.global.colors['background-back'].dark,
        }}
        >
            <PageHeader
                title="AI Essentials"
                subtitle={`Manage as if you've mastered Kubernetes.`}
                pad={{ vertical: 'small', horizontal: 'xsmall' }}
            />

            <Box direction="row" gap="medium" align="center">
                <ConnectionStatus isConnected={isConnected} />

                {user && (
                    <Box direction="row" gap="small" align="center">
                        <Box direction="column" align="end">
                            <Text weight="bold" size="small">
                                {user.username}
                            </Text>
                            <Text size="xsmall" color="text-weak">
                                {user.email}
                            </Text>
                        </Box>
                        <Menu
                            icon={
                                <Avatar background="accent-1">
                                    <UserIcon color="white" />
                                </Avatar>
                            }
                            dropAlign={{ top: 'bottom', right: 'right' }}
                            items={[
                                { label: 'Logout', icon: <Logout />, onClick: logout },
                            ]}
                        />
                    </Box>
                )}
            </Box>
        </Header>
    )
}
