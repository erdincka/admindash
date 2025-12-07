import type { Metadata } from 'next'
import { Grommet } from 'grommet'
import { hpe } from 'grommet-theme-hpe'
import StyledComponentsRegistry from './registry'

export const metadata: Metadata = {
    title: 'AI Essentials Dashboard',
    description: 'Dashboard for HPE AI Essentials',
}

import { AppHeader } from '@/components/layout/AppHeader'
import { NotificationProvider } from '@/components/layout/NotificationProvider'

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en">
            <body>
                <StyledComponentsRegistry>
                    <Grommet theme={hpe} full>
                        <NotificationProvider />
                        <AppHeader />
                        {children}
                    </Grommet>
                </StyledComponentsRegistry>
            </body>
        </html>
    )
}
