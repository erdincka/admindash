'use client'

import { useEffect } from 'react';
import { clusterApi, ClusterMetrics } from '@/lib/api/cluster';

import { useContext, useState } from 'react';
import {
    Box,
    Button,
    Grid,
    Heading,
    Page,
    PageContent,
    ResponsiveContext,
    Text,
    Accordion,
    AccordionPanel,
    Card,
    CardBody,
    CardHeader,
    Meter,
    Stack,
    Menu,
    Tabs,
    Tab,
    FileInput,
    TextArea,
    Form,
    FormField,
    TextInput,
    CheckBox,
    Select,
    Layer
} from 'grommet';

import {
    Apps,
    Connect,
    Database,
    Analytics,
    Dashboard,
    CloudUpload,
    Cube,
    TreeOption,
    Network,
    Gamepad,
    Storage,
    Folder,
    FormNext,
    StatusGoodSmall,
    Menu as MenuIcon
} from 'grommet-icons';
import { notify } from '@/lib/utils/notifications';
import { deploymentsApi, namespacesApi } from '@/lib/api/deployments';
import { DeploymentCreate } from '@/types/deployment';

// Define the navigation structure
const MENU_ITEMS = [
    {
        label: 'Applications',
        icon: <Apps />,
        items: [
            { label: 'Import', icon: <CloudUpload size="small" />, id: 'apps-import' },
            { label: 'Resources', icon: <Cube size="small" />, id: 'apps-resources' },
            { label: 'Charts', icon: <TreeOption size="small" />, id: 'apps-charts' },
        ]
    },
    {
        label: 'Endpoints',
        icon: <Connect />,
        items: [
            { label: 'Virtual Services', icon: <Network size="small" />, id: 'endpoints-services' },
            { label: 'Model Endpoints', icon: <Cube size="small" />, id: 'endpoints-models' },
            { label: 'Playgrounds', icon: <Gamepad size="small" />, id: 'endpoints-playgrounds' },
        ]
    },
    {
        label: 'Data Sources',
        icon: <Database />,
        items: [
            { label: 'Source List', icon: <Storage size="small" />, id: 'data-list' },
            { label: 'Data Browser', icon: <Folder size="small" />, id: 'data-browser' },
        ]
    },
    {
        label: 'Monitoring',
        icon: <Analytics />,
        id: 'monitoring'
    }
];

// Placeholder component for content
const ContentPlaceholder = ({ title, description }: { title: string, description: string }) => (
    <Box pad="large" gap="medium" animation="fadeIn">
        <Heading level="2" margin="none">{title}</Heading>
        <Text color="text-weak" size="large">{description}</Text>
        <Box
            height="medium"
            border={{ style: 'dashed', size: 'small', color: 'border' }}
            round="small"
            align="center"
            justify="center"
            background="light-1"
        >
            <Text color="text-xweak">Content for {title} will be populated here</Text>
        </Box>
    </Box>
);

// Import Application Component
const ImportApplication = () => {
    const [formData, setFormData] = useState<Partial<DeploymentCreate>>({
        name: '',
        image: '',
        port: 80,
        is_public: false,
        expose_service: false,
        is_gpu: false,
        run_as_root: false,
        user_namespace: '',
        is_sso: false,
        is_user_volume: false,
        is_shared_volume: false,
        command: [],
        env_vars: {},
        resources: { cpu_request: '100m', memory_request: '128Mi', cpu_limit: '1000m', memory_limit: '1Gi' }
    });
    const [namespaces, setNamespaces] = useState<string[]>([]);
    const [envVarsText, setEnvVarsText] = useState('');
    const [resourcesText, setResourcesText] = useState('cpu: 100m, memory: 128Mi');
    const [limitsText, setLimitsText] = useState('cpu: 1000m, memory: 1Gi');
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [pendingDeployment, setPendingDeployment] = useState<DeploymentCreate | null>(null);

    useEffect(() => {
        const fetchNamespaces = async () => {
            try {
                const res = await namespacesApi.list();
                if (res.data) {
                    setNamespaces(res.data.map(ns => ns.name));
                }
            } catch (e) {
                console.error("Failed to fetch namespaces", e);
            }
        };
        fetchNamespaces();
    }, []);

    const handleShowConfirmation = async () => {
        // Validation
        if (!formData.name || formData.name.trim() === '') {
            notify.warning('Application name is required');
            return;
        }
        if (!formData.image || formData.image.trim() === '') {
            notify.warning('Container image is required');
            return;
        }
        if (!formData.port || formData.port < 1 || formData.port > 65535) {
            notify.warning('Port must be between 1 and 65535');
            return;
        }
        // Validate name format (lowercase alphanumeric with hyphens)
        if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(formData.name)) {
            notify.warning('Application name must be lowercase alphanumeric with hyphens');
            return;
        }
        // If not public, user_namespace is required
        if (!formData.is_public && (!formData.user_namespace || formData.user_namespace.trim() === '')) {
            notify.warning('User namespace is required when not making the deployment public');
            return;
        }

        // Parse Env Vars
        const env_vars: Record<string, string> = {};
        envVarsText.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) env_vars[key.trim()] = value.trim();
        });

        // Parse Resources
        const parseResources = (text: string) => {
            const res: any = {};
            text.split(',').forEach(part => {
                const [key, value] = part.split(':');
                if (key && value) {
                    if (key.trim() === 'cpu') res.cpu = value.trim();
                    if (key.trim() === 'memory') res.memory = value.trim();
                }
            });
            return res;
        };
        const reqs = parseResources(resourcesText);
        const limits = parseResources(limitsText);

        const payload: DeploymentCreate = {
            name: formData.name,
            namespace: 'default', // Will be overridden by backend logic
            image: formData.image,
            port: Number(formData.port),
            replicas: 1,
            expose_service: formData.expose_service || false,
            service_type: 'ClusterIP',
            is_public: formData.is_public,
            run_as_root: formData.run_as_root,
            // Clear user namespace options if is_public is true
            is_sso: formData.is_public ? false : formData.is_sso,
            is_user_volume: formData.is_public ? false : formData.is_user_volume,
            is_shared_volume: formData.is_public ? false : formData.is_shared_volume,
            is_gpu: formData.is_gpu,
            user_namespace: formData.is_public ? undefined : formData.user_namespace,
            env_vars: env_vars,
            command: formData.command,
            resources: {
                cpu_request: reqs.cpu,
                memory_request: reqs.memory,
                cpu_limit: limits.cpu,
                memory_limit: limits.memory,
                gpu: formData.is_gpu ? 1 : undefined
            },
            volume_mounts: []
        };

        setPendingDeployment(payload);
        setShowConfirmation(true);
    };

    const handleConfirmDeploy = async () => {
        if (!pendingDeployment) return;

        try {
            await deploymentsApi.create(pendingDeployment);
            notify.normal(`Deployment ${pendingDeployment.name} created successfully!`);
            setShowConfirmation(false);
            setPendingDeployment(null);
            // Reset form
            setFormData({
                name: '',
                image: '',
                port: 80,
                is_public: false,
                expose_service: false,
                is_gpu: false,
                run_as_root: false,
                user_namespace: '',
                is_sso: false,
                is_user_volume: false,
                is_shared_volume: false,
                command: [],
                env_vars: {},
                resources: { cpu_request: '100m', memory_request: '128Mi', cpu_limit: '1000m', memory_limit: '1Gi' }
            });
            setEnvVarsText('');
            setResourcesText('cpu: 100m, memory: 128Mi');
            setLimitsText('cpu: 1000m, memory: 1Gi');
        } catch (error: any) {
            notify.critical(`Failed to deploy: ${error.message || 'Unknown error'}`);
        }
    };

    return (
        <Box pad="large" gap="medium" animation="fadeIn">
            <Heading level="2" margin="none">Import Application</Heading>
            <Text color="text-weak">Deploy applications using various methods.</Text>

            <Tabs>
                <Tab title="YAML URL">
                    <Box pad="medium" gap="medium" width="large">
                        <Text>Deploy from a remote YAML manifest.</Text>
                        <FormField label="Manifest URL">
                            <TextInput placeholder="https://example.com/deployment.yaml" />
                        </FormField>
                        <Button label="Import" primary alignSelf="start" onClick={() => notify.warning(`Will be implemented in the next release`)} />
                    </Box>
                </Tab>
                <Tab title="Helm Chart">
                    <Box pad="medium" gap="medium" width="large">
                        <Text>Deploy using a Helm Chart.</Text>
                        <Tabs>
                            <Tab title="From URL">
                                <Box pad="medium" gap="medium">
                                    <FormField label="Chart URL">
                                        <TextInput placeholder="https://charts.bitnami.com/bitnami/nginx-1.0.0.tgz" />
                                    </FormField>
                                    <Button label="Deploy" primary alignSelf="start" onClick={() => notify.warning(`Will be implemented in the next release`)} />
                                </Box>
                            </Tab>
                            <Tab title="Upload">
                                <Box pad="medium" gap="medium">
                                    <FormField label="Chart File (.tgz)">
                                        <FileInput accept=".tgz" />
                                    </FormField>
                                    <Button label="Upload & Deploy" primary alignSelf="start" onClick={() => notify.warning(`Will be implemented in the next release`)} />
                                </Box>
                            </Tab>
                        </Tabs>
                    </Box>
                </Tab>
                <Tab title="Paste YAML">
                    <Box pad="medium" gap="medium" width="large">
                        <Text>Directly paste your Kubernetes manifest.</Text>
                        <TextArea placeholder="apiVersion: apps/v1..." rows={15} style={{ fontFamily: 'monospace' }} />
                        <Button label="Apply" primary alignSelf="start" onClick={() => notify.warning(`Will be implemented in the next release`)} />
                    </Box>
                </Tab>
                <Tab title="Image Wizard">
                    <Box pad="medium" gap="medium" width="xlarge">
                        <Text>Create a simple deployment from a container image.</Text>
                        <Grid columns={['flex', 'flex']} gap="large">
                            <Box gap="medium">
                                <Heading level="4" margin="none">Basic Options</Heading>
                                <FormField label="Application Name">
                                    <TextInput
                                        placeholder="my-app"
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </FormField>
                                <FormField label="Container Image">
                                    <TextInput
                                        placeholder="nginx:latest"
                                        value={formData.image}
                                        onChange={e => setFormData({ ...formData, image: e.target.value })}
                                    />
                                </FormField>
                                <FormField label="Port">
                                    <TextInput
                                        placeholder="80"
                                        value={formData.port}
                                        onChange={e => setFormData({ ...formData, port: Number(e.target.value) })}
                                    />
                                </FormField>

                                <Box gap="small">
                                    <CheckBox
                                        label="Make Public"
                                        checked={formData.is_public}
                                        onChange={e => setFormData({
                                            ...formData,
                                            is_public: e.target.checked,
                                            // Clear user namespace options when making public
                                            user_namespace: e.target.checked ? '' : formData.user_namespace,
                                            is_sso: e.target.checked ? false : formData.is_sso,
                                            is_user_volume: e.target.checked ? false : formData.is_user_volume,
                                            is_shared_volume: e.target.checked ? false : formData.is_shared_volume
                                        })}
                                    />
                                    <CheckBox
                                        label="Expose as Service"
                                        checked={formData.expose_service}
                                        onChange={e => setFormData({ ...formData, expose_service: e.target.checked })}
                                    />
                                    <CheckBox
                                        label="Assign GPU"
                                        checked={formData.is_gpu}
                                        onChange={e => setFormData({ ...formData, is_gpu: e.target.checked })}
                                    />
                                    <CheckBox
                                        label="Run as Root"
                                        checked={formData.run_as_root}
                                        onChange={e => setFormData({ ...formData, run_as_root: e.target.checked })}
                                    />
                                </Box>

                                {!formData.is_public && (
                                    <Box gap="small" border={{ side: 'top', color: 'border' }} pad={{ top: 'small' }}>
                                        <FormField label="User Namespace" required>
                                            <Select
                                                options={namespaces}
                                                value={formData.user_namespace}
                                                onChange={({ option }) => setFormData({ ...formData, user_namespace: option })}
                                                placeholder="Select user namespace"
                                            />
                                        </FormField>
                                        <CheckBox
                                            label="Mount User Token (SSO)"
                                            checked={formData.is_sso}
                                            disabled={!formData.user_namespace}
                                            onChange={e => setFormData({ ...formData, is_sso: e.target.checked })}
                                        />
                                        <CheckBox
                                            label="Mount User Volume"
                                            checked={formData.is_user_volume}
                                            disabled={!formData.user_namespace}
                                            onChange={e => setFormData({ ...formData, is_user_volume: e.target.checked })}
                                        />
                                        <CheckBox
                                            label="Mount Shared Volume"
                                            checked={formData.is_shared_volume}
                                            disabled={!formData.user_namespace}
                                            onChange={e => setFormData({ ...formData, is_shared_volume: e.target.checked })}
                                        />
                                    </Box>
                                )}
                            </Box>

                            <Box gap="medium">
                                <Heading level="4" margin="none">Advanced Options</Heading>
                                <FormField label="Command">
                                    <TextInput
                                        placeholder="nginx"
                                        value={formData.command?.join(' ')}
                                        onChange={e => setFormData({ ...formData, command: e.target.value ? e.target.value.split(' ') : [] })}
                                    />
                                </FormField>
                                <FormField label="Environment Variables (NAME=VALUE)">
                                    <TextArea
                                        placeholder="DB_HOST=localhost&#10;DB_PORT=5432"
                                        rows={5}
                                        value={envVarsText}
                                        onChange={e => setEnvVarsText(e.target.value)}
                                        style={{ fontFamily: 'monospace' }}
                                    />
                                </FormField>
                                <FormField label="Resource Requests">
                                    <TextInput
                                        placeholder="cpu: 100m, memory: 128Mi"
                                        value={resourcesText}
                                        onChange={e => setResourcesText(e.target.value)}
                                    />
                                </FormField>
                                <FormField label="Resource Limits">
                                    <TextInput
                                        placeholder="cpu: 1000m, memory: 1Gi"
                                        value={limitsText}
                                        onChange={e => setLimitsText(e.target.value)}
                                    />
                                </FormField>
                            </Box>
                        </Grid>
                        <Button label="Generate & Deploy" primary onClick={handleShowConfirmation} alignSelf="start" margin={{ top: 'medium' }} />
                    </Box>
                </Tab>
            </Tabs>

            {/* Confirmation Modal */}
            {showConfirmation && pendingDeployment && (
                <Layer
                    onEsc={() => setShowConfirmation(false)}
                    onClickOutside={() => setShowConfirmation(false)}
                >
                    <Box pad="large" gap="medium" width="large">
                        <Heading level="3" margin="none">Confirm Deployment</Heading>
                        <Text>The following resources will be created in your cluster:</Text>

                        <Box gap="small" pad="small" background="light-2" round="small">
                            <Heading level="4" margin="none">Deployment</Heading>
                            <Box pad={{ left: 'small' }} gap="xsmall">
                                <Text size="small"><strong>Name:</strong> {pendingDeployment.name}-deployment</Text>
                                <Text size="small"><strong>Namespace:</strong> {pendingDeployment.is_public ? 'default' : (pendingDeployment.user_namespace || 'default')}</Text>
                                <Text size="small"><strong>Image:</strong> {pendingDeployment.image}</Text>
                                <Text size="small"><strong>Port:</strong> {pendingDeployment.port}</Text>
                                <Text size="small"><strong>Replicas:</strong> {pendingDeployment.replicas}</Text>
                                {pendingDeployment.is_gpu && <Text size="small" color="accent-1"><strong>GPU:</strong> 1 GPU requested</Text>}
                                {pendingDeployment.run_as_root && <Text size="small" color="status-warning"><strong>Security:</strong> Running as root</Text>}
                            </Box>
                        </Box>

                        {pendingDeployment.expose_service && (
                            <>
                                <Box gap="small" pad="small" background="light-2" round="small">
                                    <Heading level="4" margin="none">Service</Heading>
                                    <Box pad={{ left: 'small' }} gap="xsmall">
                                        <Text size="small"><strong>Name:</strong> {pendingDeployment.name}</Text>
                                        <Text size="small"><strong>Type:</strong> {pendingDeployment.service_type}</Text>
                                        <Text size="small"><strong>Port:</strong> {pendingDeployment.port}</Text>
                                    </Box>
                                </Box>

                                <Box gap="small" pad="small" background="light-2" round="small">
                                    <Heading level="4" margin="none">VirtualService (Istio)</Heading>
                                    <Box pad={{ left: 'small' }} gap="xsmall">
                                        <Text size="small"><strong>Name:</strong> {pendingDeployment.name}-vs</Text>
                                        <Text size="small"><strong>Hostname:</strong> {pendingDeployment.name}.{'<domain>'}</Text>
                                        <Text size="small"><strong>Gateway:</strong> istio-system/ezaf-gateway</Text>
                                    </Box>
                                </Box>

                                <Box gap="small" pad="small" background="light-2" round="small">
                                    <Heading level="4" margin="none">AuthorizationPolicy (OAuth2)</Heading>
                                    <Box pad={{ left: 'small' }} gap="xsmall">
                                        <Text size="small"><strong>Name:</strong> {pendingDeployment.name}-auth-policy</Text>
                                        <Text size="small"><strong>Namespace:</strong> istio-system</Text>
                                        <Text size="small"><strong>Provider:</strong> oauth2-proxy</Text>
                                    </Box>
                                </Box>
                            </>
                        )}

                        {(pendingDeployment.is_user_volume || pendingDeployment.is_shared_volume) && (
                            <Box gap="small" pad="small" background="light-2" round="small">
                                <Heading level="4" margin="none">Volumes</Heading>
                                <Box pad={{ left: 'small' }} gap="xsmall">
                                    {pendingDeployment.is_user_volume && <Text size="small">• User PVC mounted at /mnt/user</Text>}
                                    {pendingDeployment.is_shared_volume && <Text size="small">• Shared PVC mounted at /mnt/shared</Text>}
                                    {(pendingDeployment.is_user_volume || pendingDeployment.is_shared_volume) && <Text size="small">• Data sources CSI at /mnt/datasources</Text>}
                                </Box>
                            </Box>
                        )}

                        {Object.keys(pendingDeployment.env_vars).length > 0 && (
                            <Box gap="small" pad="small" background="light-2" round="small">
                                <Heading level="4" margin="none">Environment Variables</Heading>
                                <Box pad={{ left: 'small' }} gap="xsmall">
                                    {Object.entries(pendingDeployment.env_vars).map(([key, value]) => (
                                        <Text key={key} size="small">{key}={value}</Text>
                                    ))}
                                </Box>
                            </Box>
                        )}

                        <Box direction="row" gap="medium" justify="end" margin={{ top: 'medium' }}>
                            <Button label="Cancel" onClick={() => setShowConfirmation(false)} />
                            <Button label="Confirm & Deploy" primary onClick={handleConfirmDeploy} />
                        </Box>
                    </Box>
                </Layer>
            )}
        </Box>
    );
};

// Cluster Overview Widget (Superuser Visibility)
const ClusterOverview = ({ metrics, loading }: { metrics: ClusterMetrics | null, loading: boolean }) => {
    if (loading || !metrics) {
        return (
            <Grid columns={{ count: 'fit', size: 'small' }} gap="medium">
                {[1, 2, 3, 4].map(i => (
                    <Card key={i} background="white" pad="medium" gap="small" height="small" justify="center" align="center">
                        <Text color="text-weak">Loading...</Text>
                    </Card>
                ))}
            </Grid>
        );
    }

    return (
        <Box direction="row" justify="between" gap="medium" wrap>
            <Box direction="row" gap="medium" align="center">
                <Box>
                    <Text size="small" color="text-weak">Cluster Health</Text>
                    <Box direction="row" gap="small" align="center">
                        <Text size="xlarge" weight="bold">{metrics.health_score}%</Text>
                        <StatusGoodSmall color={metrics.health_score > 90 ? "status-ok" : "status-warning"} size="small" />
                    </Box>
                    <Text size="xsmall" color="text-weak">Nodes Ready</Text>
                </Box>
            </Box>

            <Box direction="row" gap="medium" align="center">
                <Stack anchor="center">
                    <Meter
                        type="circle"
                        background="light-2"
                        values={[{ value: metrics.cpu_usage_percent, color: 'brand' }]}
                        size="xsmall"
                        thickness="small"
                    />
                    <Box align="center">
                        <Text size="small" weight="bold">{metrics.cpu_usage_percent}%</Text>
                    </Box>
                </Stack>
                <Box>
                    <Text size="small" color="text-weak">CPU Usage</Text>
                    <Text size="xsmall" color="text-weak">of Total Capacity</Text>
                </Box>
            </Box>

            <Box direction="row" gap="medium" align="center">
                <Stack anchor="center">
                    <Meter
                        type="circle"
                        background="light-2"
                        values={[{ value: metrics.memory_usage_percent, color: 'accent-1' }]}
                        size="xsmall"
                        thickness="small"
                    />
                    <Box align="center">
                        <Text size="small" weight="bold">{metrics.memory_usage_percent}%</Text>
                    </Box>
                </Stack>
                <Box>
                    <Text size="small" color="text-weak">Memory Usage</Text>
                    <Text size="xsmall" color="text-weak">of Total Capacity</Text>
                </Box>
            </Box>

            <Box direction="row" gap="medium" align="center">
                <Box>
                    <Text size="small" color="text-weak">Active Pods</Text>
                    <Text size="xlarge" weight="bold">{metrics.active_pods}</Text>
                    <Text size="xsmall" color="text-weak">Running / {metrics.total_pods} Total</Text>
                </Box>
            </Box>
        </Box>
    );
};

export default function Home() {
    const size = useContext(ResponsiveContext);
    const [activeItem, setActiveItem] = useState('dashboard');
    const [expandedMenu, setExpandedMenu] = useState<number[]>([0, 1, 2]);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
    const [metrics, setMetrics] = useState<ClusterMetrics | null>(null);
    const [loadingMetrics, setLoadingMetrics] = useState(false);

    useEffect(() => {
        if (activeItem === 'dashboard') {
            loadMetrics();
        }
    }, [activeItem]);

    const loadMetrics = async () => {
        setLoadingMetrics(true);
        try {
            const response = await clusterApi.getMetrics();
            if (response) {
                setMetrics(response);
            }
        } catch (error) {
            console.error("Failed to load cluster metrics:", error);
        } finally {
            setLoadingMetrics(false);
        }
    };

    const renderContent = () => {
        switch (activeItem) {
            case 'dashboard':
                return (
                    <Box pad="large" gap="large" animation="fadeIn">
                        <Box gap="small">
                            <Heading level="2" margin="none">Cluster Overview</Heading>
                            <Text color="text-weak">Real-time visibility into your AI infrastructure</Text>
                        </Box>
                        <ClusterOverview metrics={metrics} loading={loadingMetrics} />
                        <Box direction="row" gap="medium" wrap>
                            <Button primary label="Deploy New App" onClick={() => setActiveItem('apps-import')} />
                            <Button label="Connect Data Source" onClick={() => setActiveItem('data-list')} />
                        </Box>
                    </Box>
                );
            case 'apps-import':
                return <ImportApplication />;
            case 'apps-resources':
                return <ContentPlaceholder title="Kubernetes Resources" description="View and manage low-level Kubernetes resources." />;
            case 'apps-charts':
                return <ContentPlaceholder title="Helm Charts" description="Manage installed Helm releases and repositories." />;
            case 'endpoints-services':
                return <ContentPlaceholder title="Virtual Services" description="Manage ingress, routing, and load balancing for your services." />;
            case 'endpoints-models':
                return <ContentPlaceholder title="Model Endpoints" description="Serve and scale your AI models via API endpoints." />;
            case 'endpoints-playgrounds':
                return <ContentPlaceholder title="Playgrounds" description="Interactive environments for testing and experimenting with models." />;
            case 'data-list':
                return <ContentPlaceholder title="Data Sources" description="Manage connections to databases, object stores, and file systems." />;
            case 'data-browser':
                return <ContentPlaceholder title="Data Browser" description="Explore and manage files across your connected data sources." />;
            case 'monitoring':
                return <ContentPlaceholder title="Monitoring" description="Comprehensive metrics, logs, and traces for your cluster." />;
            default:
                return <ContentPlaceholder title="Not Found" description="Select an item from the menu." />;
        }
    };

    return (
        <Page background="background-back" flex="grow">
            <PageContent>
                <Grid
                    columns={['auto', 'flex']}
                    rows={['auto']}
                    areas={[['sidebar', 'main']]}
                    gap="medium"
                    pad={{ top: 'medium', bottom: 'large' }}
                >
                    {/* Sidebar Navigation */}
                    <Box gridArea="sidebar" width={sidebarCollapsed ? 'auto' : 'small'} gap="medium" animation="fadeIn">
                        <Box
                            background="white"
                            round="small"
                            pad="medium"
                            elevation="small"
                            gap="medium"
                            align={sidebarCollapsed ? 'center' : 'stretch'}
                            height="100%"
                        >
                            <Box direction="row" justify={sidebarCollapsed ? 'center' : 'between'} align="center">
                                {!sidebarCollapsed && <Text weight="bold" size="large">Menu</Text>}
                                <Button
                                    icon={<MenuIcon />}
                                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                                    plain
                                />
                            </Box>

                            <Button
                                icon={<Dashboard />}
                                label={!sidebarCollapsed ? "Overview" : undefined}
                                active={activeItem === 'dashboard'}
                                onClick={() => setActiveItem('dashboard')}
                                plain
                                tip={sidebarCollapsed ? "Overview" : undefined}
                                style={{
                                    padding: '10px',
                                    borderRadius: '6px',
                                    fontWeight: activeItem === 'dashboard' ? 'bold' : 'normal',
                                    background: activeItem === 'dashboard' ? '#F2F2F2' : 'transparent',
                                    justifyContent: sidebarCollapsed ? 'center' : 'flex-start'
                                }}
                            />

                            {sidebarCollapsed ? (
                                // Collapsed View: Icons with Menus
                                <Box gap="small">
                                    {MENU_ITEMS.map((menu) => {
                                        if (menu.items) {
                                            return (
                                                <Menu
                                                    key={menu.label}
                                                    dropAlign={{ left: 'right', top: 'top' }}
                                                    icon={menu.icon}
                                                    items={menu.items.map(item => ({
                                                        label: item.label,
                                                        icon: item.icon,
                                                        onClick: () => setActiveItem(item.id)
                                                    }))}
                                                    style={{
                                                        padding: '10px',
                                                        borderRadius: '6px',
                                                        justifyContent: 'center',
                                                        background: (menu.items.some(i => i.id === activeItem)) ? '#E6F4F1' : 'transparent'
                                                    }}
                                                />
                                            );
                                        } else {
                                            return (
                                                <Button
                                                    key={menu.label}
                                                    icon={menu.icon}
                                                    onClick={() => setActiveItem(menu.id!)}
                                                    plain
                                                    tip={menu.label}
                                                    style={{
                                                        padding: '10px',
                                                        borderRadius: '6px',
                                                        justifyContent: 'center',
                                                        background: (menu.id && activeItem === menu.id) ? '#E6F4F1' : 'transparent'
                                                    }}
                                                />
                                            );
                                        }
                                    })}
                                </Box>
                            ) : (
                                // Expanded View: Accordion
                                <Accordion
                                    multiple
                                    activeIndex={expandedMenu}
                                    onActive={(newActive) => setExpandedMenu(newActive)}
                                >
                                    {MENU_ITEMS.map((menu) => (
                                        <AccordionPanel
                                            key={menu.label}
                                            label={<Box direction="row" gap="small" align="center">{menu.icon}<Text>{menu.label}</Text></Box>}
                                        >
                                            <Box pad={{ vertical: 'small', left: 'small' }} gap="small">
                                                {menu.items ? menu.items.map((item) => (
                                                    <Button
                                                        key={item.id}
                                                        label={item.label}
                                                        icon={item.icon}
                                                        active={activeItem === item.id}
                                                        onClick={() => setActiveItem(item.id)}
                                                        plain
                                                        hoverIndicator
                                                        style={{
                                                            padding: '8px 12px',
                                                            borderRadius: '4px',
                                                            background: activeItem === item.id ? '#E6F4F1' : 'transparent',
                                                            color: activeItem === item.id ? '#00739D' : 'inherit'
                                                        }}
                                                    />
                                                )) : (
                                                    <Button
                                                        label={menu.label} // Fallback if no items (e.g. Monitoring)
                                                        active={activeItem === menu.id}
                                                        onClick={() => setActiveItem(menu.id!)}
                                                    />
                                                )}
                                            </Box>
                                        </AccordionPanel>
                                    ))}
                                </Accordion>
                            )}
                        </Box>
                    </Box>

                    {/* Main Content Area */}
                    <Box
                        gridArea="main"
                        background="white"
                        round="small"
                        elevation="small"
                        style={{ minHeight: '80vh' }}
                    >
                        {renderContent()}
                    </Box>
                </Grid>
            </PageContent>
        </Page>
    );
}
