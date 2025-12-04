'use client'

import React, { useState, useEffect } from 'react'
import { Box, Button, Heading, Page, PageContent, Select, DataTable, Text, Layer, TextArea } from 'grommet'
import { Close, View } from 'grommet-icons'
import { resourcesApi, K8sResource } from '@/lib/api/resources'
import { namespacesApi } from '@/lib/api/deployments'
import { notify } from '@/lib/utils/notifications'

const RESOURCE_KINDS = [
    'pod',
    'deployment',
    'service',
    'configmap',
    'secret',
    'persistentvolumeclaim',
    'persistentvolume',
    'statefulset',
    'daemonset'
]

export default function ObjectsPage() {
    const [selectedKind, setSelectedKind] = useState('pod')
    const [selectedNamespace, setSelectedNamespace] = useState<string>('all')
    const [namespaces, setNamespaces] = useState<string[]>(['all'])
    const [resources, setResources] = useState<K8sResource[]>([])
    const [loading, setLoading] = useState(false)
    const [selectedResource, setSelectedResource] = useState<any>(null)
    const [showDetails, setShowDetails] = useState(false)

    useEffect(() => {
        loadNamespaces()
    }, [])

    useEffect(() => {
        if (selectedKind) {
            loadResources()
        }
    }, [selectedKind, selectedNamespace])

    const loadNamespaces = async () => {
        try {
            const response = await namespacesApi.list()
            if (response.data) {
                setNamespaces(['all', ...response.data.map(ns => ns.name)])
            }
        } catch (error) {
            console.error('Failed to load namespaces:', error)
        }
    }

    const loadResources = async () => {
        setLoading(true)
        try {
            const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace
            const response = await resourcesApi.list(selectedKind, namespace)
            if (response.data) {
                setResources(response.data)
            }
        } catch (error: any) {
            notify.error(error.message || 'Failed to load resources')
        } finally {
            setLoading(false)
        }
    }

    const handleViewDetails = async (resource: K8sResource) => {
        try {
            const response = await resourcesApi.get(selectedKind, resource.namespace, resource.name)
            if (response.data) {
                setSelectedResource(response.data)
                setShowDetails(true)
            }
        } catch (error: any) {
            notify.error(error.message || 'Failed to load resource details')
        }
    }

    return (
        <Page kind="wide">
            <PageContent>
                <Box pad="large" gap="medium">
                    <Heading level="2">Kubernetes Objects</Heading>

                    <Box direction="row" gap="medium" align="center">
                        <Box width="medium">
                            <Text size="small" weight="bold">Resource Type</Text>
                            <Select
                                options={RESOURCE_KINDS}
                                value={selectedKind}
                                onChange={({ option }) => setSelectedKind(option)}
                            />
                        </Box>

                        <Box width="medium">
                            <Text size="small" weight="bold">Namespace</Text>
                            <Select
                                options={namespaces}
                                value={selectedNamespace}
                                onChange={({ option }) => setSelectedNamespace(option)}
                            />
                        </Box>
                    </Box>

                    {loading ? (
                        <Text>Loading...</Text>
                    ) : resources.length === 0 ? (
                        <Box pad="large" align="center">
                            <Text>No {selectedKind} resources found</Text>
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
                                    property: 'created_at',
                                    header: <Text>Created</Text>,
                                    render: (datum: K8sResource) => (
                                        <Text size="small">
                                            {datum.created_at ? new Date(datum.created_at).toLocaleString() : 'N/A'}
                                        </Text>
                                    ),
                                },
                                {
                                    property: 'actions',
                                    header: <Text>Actions</Text>,
                                    render: (datum: K8sResource) => (
                                        <Button
                                            icon={<View />}
                                            onClick={() => handleViewDetails(datum)}
                                            plain
                                            tip="View YAML"
                                        />
                                    ),
                                },
                            ]}
                            data={resources}
                            paginate
                            step={20}
                        />
                    )}
                </Box>

                {showDetails && selectedResource && (
                    <Layer
                        onEsc={() => setShowDetails(false)}
                        onClickOutside={() => setShowDetails(false)}
                    >
                        <Box pad="medium" gap="small" width="large" height="large">
                            <Box direction="row" justify="between" align="center">
                                <Heading level="3" margin="none">
                                    {selectedResource.metadata?.name}
                                </Heading>
                                <Button icon={<Close />} onClick={() => setShowDetails(false)} />
                            </Box>

                            <Box flex overflow="auto">
                                <TextArea
                                    value={JSON.stringify(selectedResource, null, 2)}
                                    readOnly
                                    fill
                                    style={{ fontFamily: 'monospace', fontSize: '12px' }}
                                />
                            </Box>
                        </Box>
                    </Layer>
                )}
            </PageContent>
        </Page>
    )
}
