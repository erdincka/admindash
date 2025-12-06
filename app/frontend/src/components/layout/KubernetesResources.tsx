// Kubernetes Resources Component

import { notify } from '@/lib/utils/notifications';
import { resourcesApi, ResourceDependencies, ResourceEvent } from '@/lib/api/resources';
import dynamic from 'next/dynamic';
import { Box, Button, Card, CardBody, DataTable, Grid, Heading, Layer, Text, TextInput } from 'grommet';
import { useEffect, useState } from 'react';
import {
    Clock, Close, Document, FormNext, Info, ShareOption, StatusCritical, StatusGood, StatusUnknown, StatusWarning, Terminal as TerminalIcon,
} from 'grommet-icons';


const Terminal = dynamic(() => import('@/components/Terminal'), {
    ssr: false,
    loading: () => <Box pad="medium"><Text>Loading terminal...</Text></Box>
});
// Dynamically import Monaco Editor to avoid SSR issues
const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

export const KubernetesResources = ({ domain }: { domain: string }) => {
    const [resourceType, setResourceType] = useState('pod');
    const [resources, setResources] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [showTerminal, setShowTerminal] = useState(false);
    const [terminalPod, setTerminalPod] = useState<{ name: string, namespace: string, container: string } | null>(null);
    const [showLogs, setShowLogs] = useState(false);
    const [logsContent, setLogsContent] = useState('');
    const [logsTitle, setLogsTitle] = useState('');
    const [showDescribe, setShowDescribe] = useState(false);
    const [describeContent, setDescribeContent] = useState('');
    const [describeTitle, setDescribeTitle] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [showDependencies, setShowDependencies] = useState(false);
    const [dependenciesData, setDependenciesData] = useState<ResourceDependencies | null>(null);
    const [dependenciesTitle, setDependenciesTitle] = useState('');
    const [showEvents, setShowEvents] = useState(false);
    const [eventsData, setEventsData] = useState<ResourceEvent[]>([]);
    const [eventsTitle, setEventsTitle] = useState('');

    const resourceTypes = [
        { label: 'Pods', value: 'pod' },
        { label: 'Deployments', value: 'deployment' },
        { label: 'StatefulSets', value: 'statefulset' },
        { label: 'DaemonSets', value: 'daemonset' },
        { label: 'Services', value: 'service' },
        { label: 'ConfigMaps', value: 'configmap' },
        { label: 'Secrets', value: 'secret' },
        { label: 'PVs', value: 'persistentvolume' },
        { label: 'PVCs', value: 'persistentvolumeclaim' },
        { label: 'ReplicaSets', value: 'replicaset' }
    ];

    useEffect(() => {
        fetchResources();
    }, [resourceType]);

    const fetchResources = async () => {
        setLoading(true);
        try {
            const res = await resourcesApi.list(resourceType);
            if (res.data) {
                // Add unique ID to avoid key collisions
                const resourcesWithId = res.data.map((r: any) => ({
                    ...r,
                    id: `${r.name}-${r.namespace}`
                }));
                setResources(resourcesWithId);
            }
        } catch (e) {
            console.error(`Failed to fetch ${resourceType}s`, e);
            notify.critical(`Failed to fetch ${resourceType}s`);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenTerminal = (pod: any) => {
        const containerName = pod.full_data?.spec?.containers?.[0]?.name;
        if (containerName) {
            setTerminalPod({
                name: pod.name,
                namespace: pod.namespace,
                container: containerName
            });
            setShowTerminal(true);
        } else {
            notify.warning('No container found in pod');
        }
    };

    const handleShowLogs = async (resource: any) => {
        try {
            const containerName = resource.full_data?.spec?.containers?.[0]?.name;
            const res = await resourcesApi.getLogs(resource.namespace, resource.name, containerName);
            if (res.data) {
                setLogsContent(res.data);
                setLogsTitle(`Logs: ${resource.namespace}/${resource.name}${containerName ? ` (${containerName})` : ''}`);
                setShowLogs(true);
            }
        } catch (error: any) {
            notify.critical(`Failed to fetch logs: ${error.message || 'Unknown error'}`);
        }
    };

    const handleDescribe = async (resource: any) => {
        try {
            const res = await resourcesApi.describe(resourceType, resource.namespace, resource.name);
            if (res.data) {
                setDescribeContent(res.data);
                setDescribeTitle(`Describe: ${resourceType}/${resource.namespace}/${resource.name}`);
                setShowDescribe(true);
            }
        } catch (error: any) {
            notify.critical(`Failed to describe resource: ${error.message || 'Unknown error'}`);
        }
    };

    const handleEvents = async (resource: any) => {
        try {
            const res = await resourcesApi.getEvents(resourceType, resource.namespace, resource.name);
            if (res.data) {
                setEventsData(res.data);
                setEventsTitle(`Events: ${resourceType}/${resource.namespace}/${resource.name}`);
                setShowEvents(true);
            }
        } catch (error: any) {
            notify.critical(`Failed to fetch events: ${error.message || 'Unknown error'}`);
        }
    };

    const handleDependencies = async (resource: any) => {
        try {
            const res = await resourcesApi.getDependencies(resourceType, resource.namespace, resource.name);
            if (res.data) {
                setDependenciesData(res.data);
                setDependenciesTitle(`Dependencies: ${resourceType}/${resource.namespace}/${resource.name}`);
                setShowDependencies(true);
            }
        } catch (error: any) {
            notify.critical(`Failed to fetch dependencies: ${error.message || 'Unknown error'}`);
        }
    };

    const getColumns = () => {
        const baseColumns: any[] = [
            {
                property: 'name',
                header: 'Name',
                render: (datum: any) => <Text weight="bold">{datum.name}</Text>
            },
            {
                property: 'namespace',
                header: 'Namespace',
                size: 'small'
            }
        ];

        // Add resource-specific columns
        if (resourceType === 'pod') {
            baseColumns.push({
                property: 'status',
                header: 'Status',
                size: 'xsmall',
                render: (datum: any) => {
                    const phase = datum.status?.phase || 'Unknown';
                    let icon;
                    switch (phase) {
                        case 'Running':
                            icon = <StatusGood color="status-ok" />;
                            break;
                        case 'Pending':
                            icon = <StatusWarning color="status-warning" />;
                            break;
                        case 'Succeeded':
                            icon = <StatusGood color="status-ok" />;
                            break;
                        case 'Failed':
                            icon = <StatusCritical color="status-critical" />;
                            break;
                        default:
                            icon = <StatusUnknown color="status-unknown" />;
                    }
                    return (
                        <Box direction="row" align="center" gap="xsmall" title={phase}>
                            {icon}
                        </Box>
                    );
                }
            });
        }



        if (resourceType === 'deployment' || resourceType === 'statefulset' || resourceType === 'replicaset') {
            baseColumns.push({
                property: 'status',
                header: 'Ready',
                size: 'xsmall',
                render: (datum: any) => {
                    const ready = datum.status?.available_replicas || 0;
                    const total = datum.status?.replicas || 0;
                    return <Text>{ready}/{total}</Text>;
                }
            });
        }

        baseColumns.push({
            property: 'created_at',
            header: 'Age',
            size: 'small',
            render: (datum: any) => {
                if (!datum.created_at) return <Text>-</Text>;
                const created = new Date(datum.created_at);
                const now = new Date();
                const diffMs = now.getTime() - created.getTime();
                const diffMins = Math.floor(diffMs / 60000);
                const diffHours = Math.floor(diffMins / 60);
                const diffDays = Math.floor(diffHours / 24);

                if (diffDays > 0) return <Text>{diffDays}d</Text>;
                if (diffHours > 0) return <Text>{diffHours}h</Text>;
                return <Text>{diffMins}m</Text>;
            }
        });

        // Add actions column
        baseColumns.push({
            property: 'actions',
            header: 'Actions',
            size: 'small',
            render: (datum: any) => (
                <Box direction="row" gap="xsmall">
                    {resourceType === 'pod' && datum.status?.phase === 'Running' && (
                        <Button
                            icon={<TerminalIcon size="small" />}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleOpenTerminal(datum);
                            }}
                            tip="Open Terminal"
                            plain
                            hoverIndicator
                        />
                    )}
                    {resourceType === 'pod' && (
                        <Button
                            icon={<Document size="small" />}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleShowLogs(datum);
                            }}
                            tip="View Logs"
                            plain
                            hoverIndicator
                        />
                    )}
                    <Button
                        icon={<Clock size="small" />}
                        onClick={(e) => {
                            e.stopPropagation();
                            handleEvents(datum);
                        }}
                        tip="Events"
                        plain
                        hoverIndicator
                    />
                    <Button
                        icon={<ShareOption size="small" />}
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDependencies(datum);
                        }}
                        tip="Dependencies"
                        plain
                        hoverIndicator
                    />
                    <Button
                        icon={<Info size="small" />}
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDescribe(datum);
                        }}
                        tip="Describe"
                        plain
                        hoverIndicator
                    />
                </Box>
            )
        });

        return baseColumns;
    };

    return (
        <Box pad="large" gap="medium" animation="fadeIn">
            <Heading level="2" margin="none">Kubernetes Resources</Heading>
            <Text color="text-weak">View and manage cluster resources.</Text>

            {/* Resource Type Selector */}
            <Box direction="row" wrap gap="small">
                {resourceTypes.map(type => (
                    <Button
                        key={type.value}
                        label={type.label}
                        onClick={() => setResourceType(type.value)}
                        primary={resourceType === type.value}
                        secondary={resourceType !== type.value}
                        size="small"
                    />
                ))}
            </Box>

            {/* Search Filter */}
            <Box width="medium">
                <TextInput
                    placeholder="Search resources..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    icon={<FormNext />}
                />
            </Box>

            {/* Resources Table */}
            <Box>
                {loading ? (
                    <Box align="center" pad="large">
                        <Text>Loading {resourceType}s...</Text>
                    </Box>
                ) : resources.filter(resource => {
                    if (!searchQuery) return true;
                    const query = searchQuery.toLowerCase();
                    return (
                        resource.name?.toLowerCase().includes(query) ||
                        resource.namespace?.toLowerCase().includes(query) ||
                        resource.status?.phase?.toLowerCase().includes(query) ||
                        (typeof resource.status === 'string' && resource.status.toLowerCase().includes(query))
                    );
                }).length === 0 ? (
                    <Box align="center" pad="large">
                        <Text color="text-weak">
                            {searchQuery ? `No ${resourceType}s match your search` : `No ${resourceType}s found`}
                        </Text>
                    </Box>
                ) : (
                    <DataTable
                        primaryKey="name"
                        data={resources.filter(resource => {
                            if (!searchQuery) return true;
                            const query = searchQuery.toLowerCase();
                            return (
                                resource.name?.toLowerCase().includes(query) ||
                                resource.namespace?.toLowerCase().includes(query) ||
                                resource.status?.phase?.toLowerCase().includes(query) ||
                                (typeof resource.status === 'string' && resource.status.toLowerCase().includes(query))
                            );
                        })}
                        columns={getColumns()}
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
                            border: 'top',
                            direction: 'row',
                            fill: 'horizontal',
                            flex: false,
                            justify: 'end',
                            pad: { top: 'xsmall' },
                        }}
                        step={10}
                    />
                )}
            </Box>

            {/* Terminal Modal */}
            {showTerminal && terminalPod && (
                <Layer
                    onEsc={() => setShowTerminal(false)}
                    onClickOutside={() => setShowTerminal(false)}
                    full="horizontal"
                    margin="medium"
                >
                    <Box fill background="#1e1e1e" pad="small" gap="small">
                        <Box direction="row" justify="between" align="center">
                            <Text color="white" weight="bold">
                                Terminal: {terminalPod.namespace}/{terminalPod.name} ({terminalPod.container})
                            </Text>
                            <Button icon={<Close color="white" />} onClick={() => setShowTerminal(false)} plain />
                        </Box>
                        <Box flex>
                            <Terminal
                                namespace={terminalPod.namespace}
                                pod={terminalPod.name}
                                container={terminalPod.container}
                            />
                        </Box>
                    </Box>
                </Layer>
            )}

            {/* Logs Modal */}
            {showLogs && (
                <Layer
                    onEsc={() => setShowLogs(false)}
                    onClickOutside={() => setShowLogs(false)}
                    full="horizontal"
                    margin="medium"
                >
                    <Box fill background="white" pad="medium" gap="small">
                        <Box direction="row" justify="between" align="center">
                            <Text weight="bold">{logsTitle}</Text>
                            <Button icon={<Close />} onClick={() => setShowLogs(false)} plain />
                        </Box>
                        <Box
                            flex
                            overflow="auto"
                            background="#1e1e1e"
                            pad="small"
                            round="small"
                        >
                            <Text
                                style={{
                                    fontFamily: 'monospace',
                                    fontSize: '12px',
                                    whiteSpace: 'pre-wrap',
                                    color: '#d4d4d4'
                                }}
                            >
                                {logsContent || 'No logs available'}
                            </Text>
                        </Box>
                    </Box>
                </Layer>
            )}

            {/* Describe Modal */}
            {showDescribe && (
                <Layer
                    onEsc={() => setShowDescribe(false)}
                    onClickOutside={() => setShowDescribe(false)}
                    full
                    margin="medium"
                >
                    <Box fill background="white" pad="medium" gap="small">
                        <Box direction="row" justify="between" align="center">
                            <Text weight="bold">{describeTitle}</Text>
                            <Button icon={<Close />} onClick={() => setShowDescribe(false)} plain />
                        </Box>
                        <Box flex border={{ color: 'border', size: 'small' }} round="small">
                            <Editor
                                height="100%"
                                defaultLanguage="yaml"
                                value={describeContent}
                                theme="vs-dark"
                                options={{
                                    readOnly: true,
                                    minimap: { enabled: false },
                                    fontSize: 12,
                                    lineNumbers: 'on',
                                    scrollBeyondLastLine: false,
                                    automaticLayout: true,
                                    tabSize: 2,
                                }}
                            />
                        </Box>
                    </Box>
                </Layer>
            )}

            {/* Dependencies Modal */}
            {showDependencies && dependenciesData && (
                <Layer
                    onEsc={() => setShowDependencies(false)}
                    onClickOutside={() => setShowDependencies(false)}
                    margin="medium"
                    animation="fadeIn"
                    animate
                    full="horizontal"
                >
                    <Box background="white" pad="medium" gap="small" fill overflow="auto">
                        <Box direction="row" justify="between" align="center">
                            <Text weight="bold">{dependenciesTitle}</Text>
                            <Button icon={<Close />} onClick={() => setShowDependencies(false)} plain />
                        </Box>

                        <Grid columns={{ "count": "fit", "size": ["1/3", "1/3", "1/3"] }} fill gap="medium" align="between">
                            <Box gap="small">
                                <Heading level={4}>Upstream (Parents)</Heading>
                                {dependenciesData.upstream.length === 0 ? <Text color="text-weak">None</Text> :
                                    dependenciesData.upstream.map((dep, i) => (
                                        <Card key={i} background="light-1" pad="small">
                                            <CardBody>
                                                <Text weight="bold">{dep.kind}</Text>
                                                <Text>{dep.name}</Text>
                                            </CardBody>
                                        </Card>
                                    ))
                                }
                            </Box>

                            <Box gap="small">
                                <Heading level={4}>Downstream (Children)</Heading>
                                {dependenciesData.downstream.length === 0 ? <Text color="text-weak">None</Text> :
                                    dependenciesData.downstream.map((dep, i) => (
                                        <Card key={i} background="light-1" pad="small">
                                            <CardBody>
                                                <Text weight="bold">{dep.kind}</Text>
                                                <Text>{dep.name}</Text>
                                                {dep.status && <Text size="small" color={dep.status === 'Running' ? 'status-ok' : 'status-warning'}>{dep.status}</Text>}
                                                {dep.replicas && <Text size="small">{dep.replicas} replicas</Text>}
                                            </CardBody>
                                        </Card>
                                    ))
                                }
                            </Box>

                            <Box gap="small">
                                <Heading level={4}>Related</Heading>
                                {dependenciesData.related.length === 0 ? <Text color="text-weak">None</Text> :
                                    dependenciesData.related.map((dep, i) => (
                                        <Card key={i} background="light-1" pad="small">
                                            <CardBody>
                                                <Text weight="bold">{dep.kind}</Text>
                                                <Text>{dep.name}</Text>
                                                {dep.relation && <Text size="small" style={{ fontStyle: 'italic' }}>{dep.relation}</Text>}
                                            </CardBody>
                                        </Card>
                                    ))
                                }
                            </Box>
                        </Grid>
                    </Box>
                </Layer>
            )}

            {/* Events Modal */}
            {showEvents && (
                <Layer
                    onEsc={() => setShowEvents(false)}
                    onClickOutside={() => setShowEvents(false)}
                    margin="medium"
                >
                    <Box background="white" pad="medium" gap="small" width="large" height="medium" overflow="auto">
                        <Box direction="row" justify="between" align="center">
                            <Text weight="bold">{eventsTitle}</Text>
                            <Button icon={<Close />} onClick={() => setShowEvents(false)} plain />
                        </Box>

                        {eventsData.length === 0 ? (
                            <Box align="center" pad="large">
                                <Text color="text-weak">No events found</Text>
                            </Box>
                        ) : (
                            <DataTable
                                data={eventsData}
                                columns={[
                                    { property: 'type', header: 'Type', render: (datum) => <Text color={datum.type === 'Warning' ? 'status-warning' : 'status-ok'}>{datum.type}</Text> },
                                    { property: 'reason', header: 'Reason', size: 'small' },
                                    { property: 'message', header: 'Message', size: 'medium', render: (datum) => <Text truncate>{datum.message}</Text> },
                                    { property: 'count', header: 'Count', size: 'xsmall', align: 'end' },
                                    {
                                        property: 'last_timestamp',
                                        header: 'Age',
                                        size: 'small',
                                        render: (datum) => {
                                            const date = new Date(datum.last_timestamp);
                                            const now = new Date();
                                            const diff = Math.floor((now.getTime() - date.getTime()) / 60000);
                                            if (diff < 60) return <Text>{diff}m</Text>;
                                            const hours = Math.floor(diff / 60);
                                            if (hours < 24) return <Text>{hours}h</Text>;
                                            return <Text>{Math.floor(hours / 24)}d</Text>;
                                        }
                                    }
                                ]}
                            />
                        )}
                    </Box>
                </Layer>
            )}
        </Box>
    );
};

