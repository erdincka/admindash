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
    Meter,
    Stack,
    Menu,
    Tabs,
    Tab,
    FileInput,
    TextArea,
    FormField,
    TextInput,
    CheckBox,
    Select,
    Layer,
    DataTable,
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
    FormNext,
    StatusGoodSmall,
    Menu as MenuIcon,
    Close,
    Terminal as TerminalIcon,
    Document,
    Info,
    StatusGood,
    StatusWarning,
    StatusCritical,
    StatusUnknown,
    Upgrade,
    Trash,
    Add,
    Refresh,
    ShareOption,
    Clock
} from 'grommet-icons';
import { notify } from '@/lib/utils/notifications';
import { deploymentsApi, namespacesApi } from '@/lib/api/deployments';
import { DeploymentCreate } from '@/types/deployment';
import { resourcesApi, YamlApplyResult, ResourceDependencies, ResourceEvent } from '@/lib/api/resources';
import { chartsApi } from '@/lib/api/charts';
import dynamic from 'next/dynamic';

// Dynamically import Monaco Editor to avoid SSR issues
const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

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
    const [yamlContent, setYamlContent] = useState('');
    const [yamlErrors, setYamlErrors] = useState<string[]>([]);

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

    const handleApplyYaml = async () => {
        if (!yamlContent || yamlContent.trim() === '') {
            notify.warning('YAML content is required');
            return;
        }

        // Basic YAML validation
        try {
            const yaml = require('js-yaml');
            yaml.loadAll(yamlContent);
            setYamlErrors([]);
        } catch (e: any) {
            setYamlErrors([e.message]);
            notify.critical(`Invalid YAML: ${e.message}`);
            return;
        }

        try {
            const result = await resourcesApi.applyYaml(yamlContent);
            if (result.data) {
                const { created, exists, failed, total, results } = result.data;

                if (failed > 0) {
                    const errors = results.filter(r => r.status === 'error').map(r => `${r.kind}/${r.name}: ${r.message}`);
                    notify.critical(`Failed to apply ${failed} of ${total} resource(s):\n${errors.join('\n')}`);
                } else if (exists > 0 && created === 0) {
                    notify.info(`All ${total} resource(s) already exist in the cluster`);
                } else if (created > 0 && exists > 0) {
                    notify.normal(`Applied ${created} resource(s), ${exists} already existed`);
                    setYamlContent(''); // Clear on success
                } else if (created > 0) {
                    notify.normal(`Successfully created ${created} resource(s)`);
                    setYamlContent(''); // Clear on success
                }
            }
        } catch (error: any) {
            notify.critical(`Failed to apply YAML: ${error.message || 'Unknown error'}`);
        }
    };

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
                            <TextInput placeholder="https://no.domain/deployment.yaml" />
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
                    <Box pad="medium" gap="medium" width="xlarge">
                        <Text>Directly paste your Kubernetes manifest.</Text>
                        <Box
                            height="500px"
                            border={{ color: yamlErrors.length > 0 ? 'status-critical' : 'border', size: 'small' }}
                            round="small"
                        >
                            <Editor
                                height="100%"
                                defaultLanguage="yaml"
                                value={yamlContent}
                                onChange={(value) => setYamlContent(value || '')}
                                theme="vs-dark"
                                options={{
                                    minimap: { enabled: false },
                                    fontSize: 14,
                                    lineNumbers: 'on',
                                    scrollBeyondLastLine: false,
                                    automaticLayout: true,
                                    tabSize: 2,
                                }}
                            />
                        </Box>
                        {yamlErrors.length > 0 && (
                            <Box pad="small" background="status-critical" round="small">
                                <Text color="white" size="small">
                                    {yamlErrors.map((err, idx) => (
                                        <div key={idx}>• {err}</div>
                                    ))}
                                </Text>
                            </Box>
                        )}
                        <Box direction="row" gap="small">
                            <Button label="Apply" primary alignSelf="start" onClick={handleApplyYaml} />
                            <Button label="Clear" alignSelf="start" onClick={() => { setYamlContent(''); setYamlErrors([]); }} />
                        </Box>
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

// Virtual Services Component
const VirtualServices = ({ domain }: { domain: string }) => {
    const [virtualServices, setVirtualServices] = useState<any[]>([]);
    const [namespaces, setNamespaces] = useState<string[]>([]);
    const [selectedNamespace, setSelectedNamespace] = useState('default');
    const [services, setServices] = useState<any[]>([]);
    const [showExposeDialog, setShowExposeDialog] = useState(false);
    const [selectedService, setSelectedService] = useState<any>(null);
    const [hostname, setHostname] = useState('');
    const [loading, setLoading] = useState(false);
    const [showDescribe, setShowDescribe] = useState(false);
    const [describeContent, setDescribeContent] = useState('');
    const [describeTitle, setDescribeTitle] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [selectedVS, setSelectedVS] = useState<any>(null);

    useEffect(() => {
        fetchNamespaces();
        fetchVirtualServices();
    }, []);

    useEffect(() => {
        if (selectedNamespace) {
            fetchServices();
        }
    }, [selectedNamespace]);

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

    const fetchVirtualServices = async () => {
        try {
            const { virtualservicesApi } = await import('@/lib/api/virtualservices');
            const res = await virtualservicesApi.list();
            if (res.data) {
                setVirtualServices(res.data);
            }
        } catch (e) {
            console.error("Failed to fetch virtual services", e);
        }
    };

    const fetchServices = async () => {
        try {
            const { virtualservicesApi } = await import('@/lib/api/virtualservices');
            const res = await virtualservicesApi.listServices(selectedNamespace);
            if (res.data) {
                setServices(res.data);
            }
        } catch (e) {
            console.error("Failed to fetch services", e);
        }
    };

    const handleExposeService = async () => {
        if (!hostname || !selectedService) return;

        setLoading(true);
        try {
            const { virtualservicesApi } = await import('@/lib/api/virtualservices');
            await virtualservicesApi.create({
                namespace: selectedNamespace,
                service_name: selectedService.name,
                hostname,
                domain,
                labels: selectedService.labels
            });
            notify.normal(`Service exposed at https://${hostname}.${domain}`);
            setShowExposeDialog(false);
            setHostname('');
            setSelectedService(null);
            fetchVirtualServices();
        } catch (error: any) {
            notify.critical(`Failed to expose service: ${error.message || 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    };

    const handleDescribe = async (vs: any) => {
        try {
            const res = await resourcesApi.describe('virtualservice', vs.metadata.namespace, vs.metadata.name);
            if (res.data) {
                setDescribeContent(res.data);
                setDescribeTitle(`Describe: VirtualService/${vs.metadata.namespace}/${vs.metadata.name}`);
                setShowDescribe(true);
            }
        } catch (error: any) {
            notify.critical(`Failed to describe virtual service: ${error.message || 'Unknown error'}`);
        }
    };

    const handleDelete = async () => {
        if (!selectedVS) return;

        try {
            await resourcesApi.delete('virtualservice', selectedVS.metadata.namespace, selectedVS.metadata.name);
            notify.normal(`VirtualService ${selectedVS.metadata.name} deleted successfully`);
            setShowDeleteConfirm(false);
            setSelectedVS(null);
            fetchVirtualServices();
        } catch (error: any) {
            notify.critical(`Failed to delete virtual service: ${error.message || 'Unknown error'}`);
        }
    };

    // Filter VirtualServices that use the ezaf-gateway
    const filteredVS = virtualServices.filter(vs =>
        vs.spec?.gateways?.includes('istio-system/ezaf-gateway') &&
        vs.spec?.hosts?.some((h: string) => h.includes(domain))
    );

    return (
        <Box pad="large" gap="medium" animation="fadeIn">
            <Heading level="2" margin="none">Virtual Services</Heading>
            <Text color="text-weak">Manage Istio VirtualServices for ingress routing.</Text>

            {/* Create VirtualService Section */}
            <Box border={{ color: 'border', size: 'small' }} round="small" pad="medium" gap="medium">
                <Heading level="4" margin="none">Expose Service</Heading>
                <Grid columns={['small', 'flex']} gap="medium">
                    <FormField label="Namespace">
                        <Select
                            options={namespaces}
                            value={selectedNamespace}
                            onChange={({ option }) => setSelectedNamespace(option)}
                        />
                    </FormField>
                    <Box gap="small">
                        <Text size="small" weight="bold">Services</Text>
                        <Box direction="row" wrap gap="small">
                            {services.map(svc => (
                                <Button
                                    key={svc.name}
                                    label={`${svc.name} ${svc.ports.length > 0 ? `(${svc.ports[0].name}:${svc.ports[0].port})` : ''}`}
                                    onClick={() => {
                                        setSelectedService(svc);
                                        setShowExposeDialog(true);
                                    }}
                                    size="small"
                                />
                            ))}
                        </Box>
                    </Box>
                </Grid>
            </Box>

            {/* VirtualServices List */}
            <Box gap="small">
                <Heading level="4" margin="none">Exposed Services</Heading>
                {filteredVS.length === 0 ? (
                    <Text color="text-weak">No virtual services found</Text>
                ) : (
                    <Box gap="small">
                        <DataTable
                            primaryKey="id"
                            data={filteredVS.map(vs => ({
                                id: `${vs.metadata.name}-${vs.metadata.namespace}`,
                                name: vs.metadata.name.replace('-vs', ''),
                                namespace: vs.metadata.namespace,
                                host: vs.spec.hosts.find((h: string) => h.includes(domain)) || '',
                                gateway: vs.spec.gateways.join(', '),
                                url: `https://${vs.spec.hosts.find((h: string) => h.includes(domain))}`,
                                _original: vs
                            }))}
                            columns={[
                                {
                                    property: 'name',
                                    header: 'Name',
                                    render: datum => (
                                        <Text weight="bold">
                                            {datum.name}
                                        </Text>
                                    )
                                },
                                {
                                    property: 'namespace',
                                    header: 'Namespace',
                                    size: 'small'
                                },
                                {
                                    property: 'host',
                                    header: 'Hostname',
                                },
                                {
                                    property: 'url',
                                    header: 'URL',
                                    render: datum => (
                                        <Button
                                            label={datum.url}
                                            onClick={() => window.open(datum.url, '_blank')}
                                            plain
                                            style={{ textDecoration: 'underline' }}
                                        />
                                    )
                                },
                                {
                                    property: 'actions',
                                    header: 'Actions',
                                    size: 'xsmall',
                                    render: datum => (
                                        <Box direction="row" gap="xsmall">
                                            <Button
                                                icon={<Info size="small" />}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDescribe(datum._original);
                                                }}
                                                tip="Describe"
                                                plain
                                                hoverIndicator
                                            />
                                            <Button
                                                icon={<Trash size="small" color="status-critical" />}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedVS(datum._original);
                                                    setShowDeleteConfirm(true);
                                                }}
                                                tip="Delete"
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
                                border: 'top',
                                direction: 'row',
                                fill: 'horizontal',
                                flex: false,
                                justify: 'end',
                                pad: { top: 'xsmall' },
                            }}
                            step={10}
                        />
                    </Box>
                )}
            </Box>

            {/* Expose Service Dialog */}
            {showExposeDialog && selectedService && (
                <Layer
                    onEsc={() => setShowExposeDialog(false)}
                    onClickOutside={() => setShowExposeDialog(false)}
                >
                    <Box pad="large" gap="medium" width="medium">
                        <Heading level="3" margin="none">Expose Service</Heading>
                        <Text>Exposing service: <strong>{selectedService.name}</strong></Text>

                        <FormField label="Hostname" help={`Will be accessible at https://{hostname}.${domain}`}>
                            <TextInput
                                placeholder="my-app"
                                value={hostname}
                                onChange={e => setHostname(e.target.value)}
                            />
                        </FormField>

                        {hostname && (
                            <Box pad="small" background="light-2" round="small">
                                <Text size="small">
                                    <strong>URL:</strong> https://{hostname}.{domain}
                                </Text>
                                <Text size="small">
                                    <strong>Namespace:</strong> {selectedNamespace}
                                </Text>
                            </Box>
                        )}

                        <Box direction="row" gap="medium" justify="end" margin={{ top: 'medium' }}>
                            <Button label="Cancel" onClick={() => setShowExposeDialog(false)} />
                            <Button
                                label="Expose"
                                primary
                                disabled={!hostname || loading}
                                onClick={handleExposeService}
                            />
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

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && selectedVS && (
                <Layer
                    onEsc={() => setShowDeleteConfirm(false)}
                    onClickOutside={() => setShowDeleteConfirm(false)}
                >
                    <Box pad="large" gap="medium" width="medium">
                        <Heading level="3" margin="none">Delete VirtualService</Heading>

                        <Text>
                            Are you sure you want to delete <strong>{selectedVS.metadata.name}</strong> from namespace <strong>{selectedVS.metadata.namespace}</strong>?
                        </Text>

                        <Box background="status-warning" pad="small" round="small">
                            <Text size="small">
                                ⚠️ This will remove the VirtualService and the service will no longer be accessible via the ingress gateway.
                            </Text>
                        </Box>

                        <Box direction="row" gap="medium" justify="end">
                            <Button label="Cancel" onClick={() => setShowDeleteConfirm(false)} />
                            <Button
                                label="Delete"
                                color="status-critical"
                                primary
                                onClick={handleDelete}
                            />
                        </Box>
                    </Box>
                </Layer>
            )}
        </Box>
    );
};

// Helm Charts Component
const HelmCharts = () => {
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

// Kubernetes Resources Component
const Terminal = dynamic(() => import('@/components/Terminal'), {
    ssr: false,
    loading: () => <Box pad="medium"><Text>Loading terminal...</Text></Box>
});

const KubernetesResources = ({ domain }: { domain: string }) => {
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
        { label: 'PVCs', value: 'persistentvolumeclaim' },
        { label: 'PVs', value: 'persistentvolume' },
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
                            <Button primary label="Deploy New App" onClick={() => setActiveItem('apps-import')} />
                            <Button label="Connect Data Source" onClick={() => setActiveItem('data-list')} />
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
