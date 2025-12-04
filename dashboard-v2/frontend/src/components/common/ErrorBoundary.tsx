'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { Box, Heading, Text, Button } from 'grommet'
import { Alert } from 'grommet-icons'

interface Props {
    children?: ReactNode
}

interface State {
    hasError: boolean
    error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    }

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error }
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo)
    }

    public render() {
        if (this.state.hasError) {
            return (
                <Box
                    fill
                    align="center"
                    justify="center"
                    background="status-critical"
                    pad="large"
                >
                    <Box
                        background="white"
                        pad="large"
                        round="medium"
                        align="center"
                        gap="medium"
                        elevation="medium"
                    >
                        <Alert size="large" color="status-critical" />
                        <Heading level="3" margin="none">
                            Something went wrong
                        </Heading>
                        <Text textAlign="center">
                            {this.state.error?.message || 'An unexpected error occurred.'}
                        </Text>
                        <Button
                            primary
                            label="Reload Page"
                            onClick={() => window.location.reload()}
                        />
                    </Box>
                </Box>
            )
        }

        return this.props.children
    }
}
