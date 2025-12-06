'use client'

import { useEffect, useContext, useState } from 'react';
import { clusterApi, ClusterMetrics } from '@/lib/api/cluster';
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
    Meter,
    Stack,
    Menu,
    Anchor
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
    StatusGoodSmall,
    Menu as MenuIcon,
} from 'grommet-icons';
import { ImportApplication } from '@/components/layout/ImportApplications';
import { VirtualServices } from '@/components/layout/VirtualServices';
import { HelmCharts } from '@/components/layout/HelmCharts';
import { KubernetesResources } from '@/components/layout/KubernetesResources';
import { DataSources } from '@/components/layout/DataSources';
import { DataBrowser } from '@/components/layout/DataBrowser';
import { Monitoring } from '@/components/layout/Monitoring';


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
    const [domain, setDomain] = useState('no.domain');

    useEffect(() => {
        // Fetch domain once on mount
        loadDomain();
    }, []);

    useEffect(() => {
        if (activeItem === 'dashboard') {
            loadMetrics();
        }
    }, [activeItem]);

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

    const loadMetrics = async () => {
        setLoadingMetrics(true);
        try {
            const response = await clusterApi.getMetrics();
            // Backend returns ClusterMetrics directly
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
                            <Button label="Deploy New App" onClick={() => setActiveItem('apps-import')} />
                            <Button label="Resources" onClick={() => setActiveItem('apps-resources')} />
                            <Button label="Charts" onClick={() => setActiveItem('apps-charts')} />
                            <Button label="Data Browser" onClick={() => setActiveItem('data-browser')} />
                        </Box>
                    </Box>
                );
            case 'apps-import':
                return <ImportApplication />;
            case 'apps-resources':
                return <KubernetesResources domain={domain} />;
            case 'apps-charts':
                return <HelmCharts />;
            case 'endpoints-services':
                return <VirtualServices domain={domain} />;
            case 'endpoints-models':
                return <ContentPlaceholder title="Model Endpoints" description="Serve and scale your AI models via API endpoints." />;
            case 'endpoints-playgrounds':
                return <ContentPlaceholder title="Playgrounds" description="Interactive environments for testing and experimenting with models." />;
            case 'data-list':
                return <DataSources />;
            case 'data-browser':
                return <DataBrowser />;
            case 'monitoring':
                return <Monitoring />;
            default:
                return <ContentPlaceholder title="Not Found" description="Select an item from the menu." />;
        }
    };

    return (
        <Page background="background-back" flex="grow">
            <PageContent>
                {/* Header with Domain */}
                <Box
                    direction="row"
                    justify="between"
                    align="center"
                    pad={{ horizontal: 'medium', vertical: 'small' }}
                    background="white"
                    round="small"
                    elevation="small"
                    margin={{ bottom: 'medium' }}
                >
                    <Heading level="3" margin="none">HPE AI Essentials Dashboard</Heading>
                    <Box direction="row" gap="small" align="center">
                        <Text size="small" color="text-weak">Cluster:</Text>
                        <Anchor href={`https://home.${domain}`} target="_blank" weight="bold">{domain.toUpperCase()}</Anchor>
                    </Box>
                </Box>

                <Grid
                    columns={['auto', 'flex']}
                    rows={['auto']}
                    areas={[['sidebar', 'main']]}
                    gap="medium"
                    pad={{ bottom: 'large' }}
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
