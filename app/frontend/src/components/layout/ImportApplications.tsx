// Import Application Component

import {
    Box,
    Button,
    Grid,
    Heading,
    Text,
    Tabs,
    Tab,
    FileInput,
    TextArea,
    FormField,
    TextInput,
    CheckBox,
    Select,
    Layer,
} from 'grommet';
import { useEffect, useState } from 'react';

import { DeploymentCreate } from '@/types/deployment';
import { deploymentsApi, namespacesApi } from '@/lib/api/deployments';
import { resourcesApi } from '@/lib/api/resources';
import { notify } from '@/lib/utils/notifications';
import dynamic from 'next/dynamic';

// Dynamically import Monaco Editor to avoid SSR issues
const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

export const ImportApplication = () => {
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

