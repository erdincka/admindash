// Virtual Services Component
import { useState } from "react";
import { notify } from "@/lib/utils/notifications";
import { namespacesApi } from '@/lib/api/deployments';
import { resourcesApi } from '@/lib/api/resources';
import { useEffect } from "react";
import { Box, Button, Grid, Heading, Text, FormField, Select, DataTable, TextInput, Layer } from "grommet";
import { Close, Info, Trash } from "grommet-icons";
import dynamic from "next/dynamic";
// Dynamically import Monaco Editor to avoid SSR issues
const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

export const VirtualServices = ({ domain }: { domain: string }) => {
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

