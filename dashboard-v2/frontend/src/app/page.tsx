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
    TextInput
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

// Define the navigation structure
const MENU_ITEMS = [
    {
        label: 'Applications',
        icon: <Apps />,
        items: [
            { label: 'Import', icon: <CloudUpload size="small" />, id: 'apps-import' },
            { label: 'Objects', icon: <Cube size="small" />, id: 'apps-objects' },
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
                        <Button label="Import" primary alignSelf="start" />
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
                                    <Button label="Deploy" primary alignSelf="start" />
                                </Box>
                            </Tab>
                            <Tab title="Upload">
                                <Box pad="medium" gap="medium">
                                    <FormField label="Chart File (.tgz)">
                                        <FileInput accept=".tgz" />
                                    </FormField>
                                    <Button label="Upload & Deploy" primary alignSelf="start" />
                                </Box>
                            </Tab>
                        </Tabs>
                    </Box>
                </Tab>
                <Tab title="Paste YAML">
                    <Box pad="medium" gap="medium" width="large">
                        <Text>Directly paste your Kubernetes manifest.</Text>
                        <TextArea placeholder="apiVersion: apps/v1..." rows={15} style={{ fontFamily: 'monospace' }} />
                        <Button label="Apply" primary alignSelf="start" />
                    </Box>
                </Tab>
                <Tab title="Image Wizard">
                    <Box pad="medium" gap="medium" width="large">
                        <Text>Create a simple deployment from a container image.</Text>
                        <Form>
                            <FormField label="Application Name">
                                <TextInput placeholder="my-app" />
                            </FormField>
                            <FormField label="Container Image">
                                <TextInput placeholder="nginx:latest" />
                            </FormField>
                            <FormField label="Port">
                                <TextInput placeholder="80" />
                            </FormField>
                            <Button label="Generate & Deploy" primary type="submit" alignSelf="start" margin={{ top: 'medium' }} />
                        </Form>
                    </Box>
                </Tab>
            </Tabs>
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
            case 'apps-objects':
                return <ContentPlaceholder title="Kubernetes Objects" description="View and manage low-level Kubernetes resources." />;
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
