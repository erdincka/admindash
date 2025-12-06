// Helm Charts Component

import { useEffect, useState } from 'react';
import { Box, Button, DataTable, Heading, TextInput, Text, FormField, Layer, CheckBox } from 'grommet';
import { notify } from '@/lib/utils/notifications';
import { chartsApi } from '@/lib/api/charts';
import { Add, FormNext, Refresh, Trash } from 'grommet-icons';

export const HelmCharts = () => {
    const [charts, setCharts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [showInstall, setShowInstall] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Install form state
    const [installForm, setInstallForm] = useState({
        name: '',
        chart: '',
        namespace: 'default',
        repo_url: '',
        repo_name: '',
        version: '',
        create_namespace: true
    });

    useEffect(() => {
        fetchCharts();
    }, []);

    const fetchCharts = async () => {
        setLoading(true);
        try {
            const res = await chartsApi.list();
            if (res.data) {
                setCharts(res.data);
            }
        } catch (error: any) {
            notify.critical(`Failed to fetch charts: ${error.message || 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    };

    const handleInstall = async () => {
        // Validation
        if (!installForm.name || !installForm.chart) {
            notify.warning('Name and chart are required');
            return;
        }

        try {
            const request: any = {
                name: installForm.name,
                chart: installForm.chart,
                namespace: installForm.namespace,
                create_namespace: installForm.create_namespace
            };

            if (installForm.repo_url && installForm.repo_name) {
                request.repo_url = installForm.repo_url;
                request.repo_name = installForm.repo_name;
            }

            if (installForm.version) {
                request.version = installForm.version;
            }

            await chartsApi.install(request);
            notify.normal(`Helm chart ${installForm.name} installed successfully`);
            setShowInstall(false);
            setInstallForm({
                name: '',
                chart: '',
                namespace: 'default',
                repo_url: '',
                repo_name: '',
                version: '',
                create_namespace: true
            });
            fetchCharts();
        } catch (error: any) {
            notify.critical(`Failed to install chart: ${error.message || 'Unknown error'}`);
        }
    };

    return (
        <Box pad="large" gap="medium" animation="fadeIn">
            <Box direction="row" justify="between" align="center">
                <Box>
                    <Heading level="2" margin="none">Helm Releases</Heading>
                    <Text color="text-weak">Manage installed Helm releases in the cluster</Text>
                </Box>
                <Box direction="row" gap="small">
                    <Button
                        icon={<Refresh />}
                        onClick={fetchCharts}
                        tip="Refresh"
                        disabled={loading}
                    />
                    <Button
                        icon={<Add />}
                        // onClick={() => setShowInstall(true)}
                        tip="Not implemented"
                    />
                </Box>
            </Box>

            {/* Search Filter */}
            <Box width="medium">
                <TextInput
                    placeholder="Search releases..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    icon={<FormNext />}
                />
            </Box>

            {/* Charts Table */}
            <Box>
                {loading ? (
                    <Box align="center" pad="large">
                        <Text>Loading charts...</Text>
                    </Box>
                ) : (() => {
                    const filteredCharts = charts.filter(chart => {
                        if (!searchQuery) return true;
                        const query = searchQuery.toLowerCase();
                        return (
                            chart.name?.toLowerCase().includes(query) ||
                            chart.namespace?.toLowerCase().includes(query) ||
                            chart.chart?.toLowerCase().includes(query) ||
                            chart.status?.toLowerCase().includes(query)
                        );
                    });

                    return filteredCharts.length === 0 ? (
                        <Box align="center" pad="large">
                            <Text color="text-weak">
                                {searchQuery ? 'No releases match your search' : 'No Helm releases installed'}
                            </Text>
                        </Box>
                    ) : (
                        <DataTable
                            primaryKey="name"
                            data={filteredCharts}
                            columns={[
                                {
                                    property: 'name',
                                    header: 'Name',
                                    render: (datum: any) => <Text weight="bold">{datum.name}</Text>
                                },
                                {
                                    property: 'namespace',
                                    header: 'Namespace',
                                    size: 'small'
                                },
                                {
                                    property: 'chart',
                                    header: 'Chart',
                                    size: 'medium'
                                },
                                {
                                    property: 'revision',
                                    header: 'Revision',
                                    size: 'xsmall',
                                    render: (datum: any) => <Text>{datum.revision || '-'}</Text>
                                },
                                {
                                    property: 'version',
                                    header: 'Version',
                                    size: 'xsmall'
                                },
                                {
                                    property: 'app_version',
                                    header: 'App Version',
                                    size: 'xsmall'
                                },
                                {
                                    property: 'status',
                                    header: 'Status',
                                    size: 'xsmall',
                                    render: (datum: any) => {
                                        const status = datum.status.toLowerCase();
                                        let color = 'status-unknown';
                                        if (status === 'deployed') color = 'status-ok';
                                        else if (status === 'failed') color = 'status-critical';
                                        else if (status.includes('pending')) color = 'status-warning';

                                        return (
                                            <Box direction="row" align="center" gap="xsmall">
                                                <Box
                                                    width="8px"
                                                    height="8px"
                                                    round="full"
                                                    background={color}
                                                />
                                                <Text size="small">{datum.status}</Text>
                                            </Box>
                                        );
                                    }
                                },
                                {
                                    property: 'updated',
                                    header: 'Updated',
                                    size: 'small',
                                    render: (datum: any) => {
                                        if (!datum.updated) return <Text>-</Text>;
                                        try {
                                            const updated = new Date(datum.updated);
                                            const now = new Date();
                                            const diffMs = now.getTime() - updated.getTime();
                                            const diffMins = Math.floor(diffMs / 60000);
                                            const diffHours = Math.floor(diffMins / 60);
                                            const diffDays = Math.floor(diffHours / 24);

                                            if (diffDays > 0) return <Text>{diffDays}d ago</Text>;
                                            if (diffHours > 0) return <Text>{diffHours}h ago</Text>;
                                            if (diffMins > 0) return <Text>{diffMins}m ago</Text>;
                                            return <Text>Just now</Text>;
                                        } catch {
                                            return <Text>-</Text>;
                                        }
                                    }
                                },
                                {
                                    property: 'actions',
                                    header: 'Actions',
                                    size: 'xsmall',
                                    render: (datum: any) => (
                                        <Box direction="row" gap="xsmall">
                                            <Button
                                                icon={<Trash size="small" color="status-critical" />}
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    if (confirm(`Are you sure you want to uninstall ${datum.name} from ${datum.namespace}?`)) {
                                                        try {
                                                            await chartsApi.delete(datum.name, datum.namespace);
                                                            notify.normal(`Helm release ${datum.name} deleted successfully`);
                                                            fetchCharts();
                                                        } catch (error: any) {
                                                            notify.critical(`Failed to delete release: ${error.message || 'Unknown error'}`);
                                                        }
                                                    }
                                                }}
                                                tip="Uninstall"
                                                plain
                                                hoverIndicator
                                            />
                                        </Box>
                                    )
                                }
                            ]}
                            background={{
                                header: 'light-2',
                                body: ['white', 'light-1']
                            }}
                            border={{
                                body: {
                                    color: 'border',
                                    side: 'bottom'
                                }
                            }}
                            pad="small"
                            pin
                            sortable
                            paginate={{
                                size: 'small',
                                step: 10,
                            }}
                        />
                    );
                })()}
            </Box>

            {/* Install Chart Modal */}
            {showInstall && (
                <Layer
                    onEsc={() => setShowInstall(false)}
                    onClickOutside={() => setShowInstall(false)}
                >
                    <Box pad="large" gap="medium" width="large">
                        <Heading level="3" margin="none">Install Helm Chart</Heading>

                        <FormField label="Release Name" required>
                            <TextInput
                                placeholder="my-release"
                                value={installForm.name}
                                onChange={e => setInstallForm({ ...installForm, name: e.target.value })}
                            />
                        </FormField>

                        <FormField label="Chart" required>
                            <TextInput
                                placeholder="bitnami/nginx or https://example.com/chart.tgz"
                                value={installForm.chart}
                                onChange={e => setInstallForm({ ...installForm, chart: e.target.value })}
                            />
                        </FormField>

                        <FormField label="Namespace">
                            <TextInput
                                placeholder="default"
                                value={installForm.namespace}
                                onChange={e => setInstallForm({ ...installForm, namespace: e.target.value })}
                            />
                        </FormField>

                        <Box border={{ side: 'top', color: 'border' }} pad={{ top: 'small' }} gap="small">
                            <Text weight="bold" size="small">Repository (Optional)</Text>

                            <FormField label="Repository Name">
                                <TextInput
                                    placeholder="bitnami"
                                    value={installForm.repo_name}
                                    onChange={e => setInstallForm({ ...installForm, repo_name: e.target.value })}
                                />
                            </FormField>

                            <FormField label="Repository URL">
                                <TextInput
                                    placeholder="https://charts.bitnami.com/bitnami"
                                    value={installForm.repo_url}
                                    onChange={e => setInstallForm({ ...installForm, repo_url: e.target.value })}
                                />
                            </FormField>
                        </Box>

                        <FormField label="Version (Optional)">
                            <TextInput
                                placeholder="1.0.0"
                                value={installForm.version}
                                onChange={e => setInstallForm({ ...installForm, version: e.target.value })}
                            />
                        </FormField>

                        <CheckBox
                            label="Create namespace if it doesn't exist"
                            checked={installForm.create_namespace}
                            onChange={e => setInstallForm({ ...installForm, create_namespace: e.target.checked })}
                        />

                        <Box direction="row" gap="medium" justify="end">
                            <Button label="Cancel" onClick={() => setShowInstall(false)} />
                            <Button label="Install" primary onClick={handleInstall} />
                        </Box>
                    </Box>
                </Layer>
            )}
        </Box>
    );
};

