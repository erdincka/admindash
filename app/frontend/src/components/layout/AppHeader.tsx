'use client'

import { Header, Box, PageHeader, ThemeContext, Anchor } from 'grommet'
import { useWebSocket } from '@/lib/hooks/useWebSocket'
import { ConnectionStatus } from '@/components/common/ConnectionStatus'
import { useContext, useEffect, useState } from 'react'
import { clusterApi } from '@/lib/api/cluster'

export function AppHeader() {
    const [domain, setDomain] = useState('no.domain');

    useEffect(() => {
        // Fetch domain once on mount
        loadDomain();
    }, []);

    const loadDomain = async () => {
        try {
            const response = await clusterApi.getDomain();
            // Backend returns { domain: "..." } directly
            if (response && response.domain) {
                setDomain(response.domain);
            }
        } catch (error) {
            console.error("Failed to load cluster domain:", error);
        }
    };

    const { isConnected } = useWebSocket()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const theme = useContext(ThemeContext) as any;

    return (
        <Header elevation="small" background={{
            size: 'full',
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

            <Box direction="column" gap="medium" align="end">
                <Anchor href={`https://home.${domain}`} target="_blank">{domain}</Anchor>
                <ConnectionStatus isConnected={isConnected} />
            </Box>
        </Header >
    )
}
