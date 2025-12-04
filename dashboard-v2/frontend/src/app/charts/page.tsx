'use client'

import React, { useState, useEffect } from 'react'
import { Box, Button, Heading, Page, PageContent, DataTable, Text, CheckBox } from 'grommet'
import { Trash } from 'grommet-icons'
import { chartsApi, HelmChart } from '@/lib/api/charts'
import { notify } from '@/lib/utils/notifications'

export default function ChartsPage() {
    const [charts, setCharts] = useState<HelmChart[]>([])
    const [loading, setLoading] = useState(true)
    const [selected, setSelected] = useState<string[]>([])

    useEffect(() => {
        loadCharts()
    }, [])

    const loadCharts = async () => {
        try {
            const response = await chartsApi.list()
            if (response.data) {
                setCharts(response.data)
            }
        } catch (error) {
            console.error('Failed to load charts:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (name: string, namespace: string) => {
        if (!confirm(`Delete Helm release ${name}?`)) return

        try {
            await chartsApi.delete(name, namespace)
            notify.success(`Helm release ${name} deleted`)
            loadCharts()
        } catch (error: any) {
            notify.error(error.message || 'Failed to delete chart')
        }
    }

    const handleBulkDelete = async () => {
        if (selected.length === 0) return
        if (!confirm(`Delete ${selected.length} Helm releases?`)) return

        try {
            for (const chartKey of selected) {
                const [name, namespace] = chartKey.split(':')
                await chartsApi.delete(name, namespace)
            }
            notify.success(`Deleted ${selected.length} Helm releases`)
            setSelected([])
            loadCharts()
        } catch (error: any) {
            notify.error(error.message || 'Failed to delete charts')
        }
    }

    return (
        <Page kind="wide">
            <PageContent>
                <Box pad="large" gap="medium">
                    <Box direction="row" justify="between" align="center">
                        <Heading level="2">Helm Charts</Heading>
                        {selected.length > 0 && (
                            <Button
                                icon={<Trash />}
                                label={`Delete ${selected.length} selected`}
                                onClick={handleBulkDelete}
                            />
                        )}
                    </Box>

                    {loading ? (
                        <Text>Loading...</Text>
                    ) : charts.length === 0 ? (
                        <Box pad="large" align="center">
                            <Text>No Helm charts found</Text>
                        </Box>
                    ) : (
                        <DataTable
                            columns={[
                                {
                                    property: 'select',
                                    header: (
                                        <CheckBox
                                            checked={selected.length === charts.length}
                                            indeterminate={selected.length > 0 && selected.length < charts.length}
                                            onChange={() => {
                                                if (selected.length === charts.length) {
                                                    setSelected([])
                                                } else {
                                                    setSelected(charts.map(c => `${c.name}:${c.namespace}`))
                                                }
                                            }}
                                        />
                                    ),
                                    render: (datum: HelmChart) => (
                                        <CheckBox
                                            checked={selected.includes(`${datum.name}:${datum.namespace}`)}
                                            onChange={() => {
                                                const key = `${datum.name}:${datum.namespace}`
                                                if (selected.includes(key)) {
                                                    setSelected(selected.filter(s => s !== key))
                                                } else {
                                                    setSelected([...selected, key])
                                                }
                                            }}
                                        />
                                    ),
                                },
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
                                    property: 'version',
                                    header: <Text>Version</Text>,
                                },
                                {
                                    property: 'status',
                                    header: <Text>Status</Text>,
                                },
                                {
                                    property: 'created_at',
                                    header: <Text>Created</Text>,
                                    render: (datum: HelmChart) => (
                                        <Text size="small">
                                            {datum.created_at ? new Date(datum.created_at).toLocaleString() : 'N/A'}
                                        </Text>
                                    ),
                                },
                                {
                                    property: 'actions',
                                    header: <Text>Actions</Text>,
                                    render: (datum: HelmChart) => (
                                        <Button
                                            icon={<Trash />}
                                            onClick={() => handleDelete(datum.name, datum.namespace)}
                                            plain
                                        />
                                    ),
                                },
                            ]}
                            data={charts}
                        />
                    )}
                </Box>
            </PageContent>
        </Page>
    )
}
