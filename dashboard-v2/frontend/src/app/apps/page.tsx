'use client'

import React, { useState, useEffect } from 'react'
import { Box, Button, Heading, Page, PageContent, DataTable, Text } from 'grommet'
import { Add, Trash } from 'grommet-icons'
import { useRouter } from 'next/navigation'
import { deploymentsApi } from '@/lib/api/deployments'
import { Deployment } from '@/types/deployment'
import { notify } from '@/lib/utils/notifications'

export default function AppsPage() {
    const router = useRouter()
    const [deployments, setDeployments] = useState<Deployment[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadDeployments()
    }, [])

    const loadDeployments = async () => {
        try {
            const response = await deploymentsApi.list()
            if (response.data) {
                setDeployments(response.data)
            }
        } catch (error) {
            console.error('Failed to load deployments:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (name: string, namespace: string) => {
        if (!confirm(`Delete deployment ${name}?`)) return

        try {
            await deploymentsApi.delete(name, namespace)
            notify.success(`Deployment ${name} deleted`)
            loadDeployments()
        } catch (error: any) {
            notify.error(error.message || 'Failed to delete deployment')
        }
    }

    return (
        <Page kind="wide">
            <PageContent>
                <Box pad="large" gap="medium">
                    <Box direction="row" justify="between" align="center">
                        <Heading level="2">Applications</Heading>
                        <Button
                            primary
                            icon={<Add />}
                            label="Deploy"
                            onClick={() => router.push('/apps/deploy')}
                        />
                    </Box>

                    {loading ? (
                        <Text>Loading...</Text>
                    ) : deployments.length === 0 ? (
                        <Box pad="large" align="center">
                            <Text>No deployments found. Deploy your first application!</Text>
                        </Box>
                    ) : (
                        <DataTable
                            columns={[
                                {
                                    property: 'name',
                                    header: <Text>Name</Text>,
                                    primary: true,
                                },
                                {
                                    property: 'namespace',
                                    header: <Text>Namespace</Text>,
                                },
                                {
                                    property: 'image',
                                    header: <Text>Image</Text>,
                                },
                                {
                                    property: 'replicas',
                                    header: <Text>Replicas</Text>,
                                    render: (datum: Deployment) => (
                                        <Text>{datum.available_replicas}/{datum.replicas}</Text>
                                    ),
                                },
                                {
                                    property: 'status',
                                    header: <Text>Status</Text>,
                                    render: (datum: Deployment) => (
                                        <Text color={datum.status === 'Running' ? 'status-ok' : 'status-warning'}>
                                            {datum.status}
                                        </Text>
                                    ),
                                },
                                {
                                    property: 'actions',
                                    header: <Text>Actions</Text>,
                                    render: (datum: Deployment) => (
                                        <Button
                                            icon={<Trash />}
                                            onClick={() => handleDelete(datum.name, datum.namespace)}
                                            plain
                                        />
                                    ),
                                },
                            ]}
                            data={deployments}
                        />
                    )}
                </Box>
            </PageContent>
        </Page>
    )
}
