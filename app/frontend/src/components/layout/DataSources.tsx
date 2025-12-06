
import { notify } from '@/lib/utils/notifications';
import { resourcesApi } from '@/lib/api/resources';
import { storageApi, FileItem } from '@/lib/api/storage';
import { Box, Button, DataTable, Heading, Layer, Text, TextInput } from 'grommet';
import { useEffect, useState } from 'react';
import {
    Close, FolderOpen, FormNext, FormPrevious, Refresh, Document, Folder
} from 'grommet-icons';

export const DataSources = () => {
    const [resources, setResources] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Browser State
    const [showBrowse, setShowBrowse] = useState(false);
    const [browsingResource, setBrowsingResource] = useState<any>(null);
    const [currentPath, setCurrentPath] = useState('');
    const [files, setFiles] = useState<FileItem[]>([]);
    const [loadingFiles, setLoadingFiles] = useState(false);

    // Describe State (kept for other providers or fallback)
    const [showDescribe, setShowDescribe] = useState(false);
    const [describeContent, setDescribeContent] = useState('');
    const [describeTitle, setDescribeTitle] = useState('');

    useEffect(() => {
        fetchResources();
    }, []);

    const fetchResources = async () => {
        setLoading(true);
        try {
            const res = await resourcesApi.list('ezdatasource');
            if (res.data) {
                const resourcesWithId = res.data.map((r: any) => ({
                    ...r,
                    id: `${r.name}-${r.namespace}`
                }));
                setResources(resourcesWithId);
            }
        } catch (e) {
            console.error(`Failed to fetch Data Sources`, e);
            notify.critical(`Failed to fetch Data Sources: ${e}`);
        } finally {
            setLoading(false);
        }
    };

    const fetchFiles = async (resource: any, path: string) => {
        setLoadingFiles(true);
        try {
            const res = await storageApi.browse({
                namespace: resource.namespace,
                resource_name: resource.name,
                path: path
            });
            if (res.data) {
                setFiles(res.data);
            }
        } catch (error: any) {
            notify.critical(`Failed to list files: ${error.message || 'Unknown error'}`);
            setFiles([]); // Clear on error
        } finally {
            setLoadingFiles(false);
        }
    };

    const handleBrowse = (resource: any) => {
        setBrowsingResource(resource);
        setCurrentPath('');
        setShowBrowse(true);
        fetchFiles(resource, '');
    };

    const handleNavigate = (path: string) => {
        setCurrentPath(path);
        if (browsingResource) {
            fetchFiles(browsingResource, path);
        }
    };

    const handleUp = () => {
        if (!currentPath) return;
        // removing trailing slash first if exists
        const cleanPath = currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath;
        const parts = cleanPath.split('/');
        parts.pop();
        const newPath = parts.length > 0 ? parts.join('/') + '/' : '';
        handleNavigate(newPath);
    };

    const getColumns = () => {
        return [
            {
                property: 'name',
                header: 'Name',
                render: (datum: any) => <Text weight="bold">{datum.name}</Text>,
                sortable: true
            },
            {
                property: 'namespace',
                header: 'Namespace',
                size: 'small',
                sortable: true
            },
            {
                property: 'provider',
                header: 'Provider',
                render: (datum: any) => <Text>{datum.full_data?.spec?.provider || '-'}</Text>,
                size: 'small',
                sortable: true
            },
            {
                property: 'status',
                header: 'Status',
                render: (datum: any) => <Text>{datum.status?.status || '-'}</Text>,
                size: 'small',
                sortable: true
            },
            {
                property: 'endpoint',
                header: 'Endpoint',
                render: (datum: any) => {
                    const spec = datum.full_data?.spec || {};
                    const provider = spec.provider;
                    const providerSpec = spec[provider] || {};
                    const endpoint = providerSpec.endpoint || providerSpec.clustername || '-';
                    return <Text>{endpoint}</Text>;
                },
                size: 'medium',
                sortable: true
            },
            {
                property: 'actions',
                header: 'Actions',
                size: 'small',
                render: (datum: any) => (
                    <Box direction="row" gap="xsmall">
                        {datum.full_data?.spec?.provider?.includes('s3') && (
                            <Button
                                icon={<FolderOpen size="small" />}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleBrowse(datum);
                                }}
                                tip="Browse"
                                plain
                                hoverIndicator
                            />
                        )}
                    </Box>
                )
            }
        ];
    };

    // Formatter for file size
    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <Box pad="large" gap="medium" animation="fadeIn">
            <Box direction="row" justify="between" align="center">
                <Box>
                    <Heading level="2" margin="none">Data Sources</Heading>
                    <Text color="text-weak">Manage connections to external data providers.</Text>
                </Box>
                <Button
                    icon={<Refresh />}
                    onClick={fetchResources}
                    tip="Refresh"
                    disabled={loading}
                />
            </Box>

            {/* Search Filter */}
            <Box width="medium">
                <TextInput
                    placeholder="Search data sources..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    icon={<FormNext />}
                />
            </Box>

            {/* Resources Table */}
            <Box>
                {loading ? (
                    <Box align="center" pad="large">
                        <Text>Loading Data Sources...</Text>
                    </Box>
                ) : resources.filter(resource => {
                    if (!searchQuery) return true;
                    const query = searchQuery.toLowerCase();
                    return (
                        resource.name?.toLowerCase().includes(query) ||
                        resource.namespace?.toLowerCase().includes(query) ||
                        (typeof resource.status === 'string' && resource.status.toLowerCase().includes(query))
                    );
                }).length === 0 ? (
                    <Box align="center" pad="large">
                        <Text color="text-weak">
                            {searchQuery ? `No Data Sources match your search` : `No Data Sources found`}
                        </Text>
                    </Box>
                ) : (
                    <DataTable
                        primaryKey="id"
                        data={resources.filter(resource => {
                            if (!searchQuery) return true;
                            const query = searchQuery.toLowerCase();
                            return (
                                resource.name?.toLowerCase().includes(query) ||
                                resource.namespace?.toLowerCase().includes(query) ||
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

            {/* Browse Modal */}
            {showBrowse && browsingResource && (
                <Layer
                    onEsc={() => setShowBrowse(false)}
                    onClickOutside={() => setShowBrowse(false)}
                    full
                    margin="medium"
                >
                    <Box fill background="white" pad="medium" gap="medium">
                        <Box direction="row" justify="between" align="center">
                            <Box>
                                <Heading level="3" margin="none">File Browser</Heading>
                                <Text color="text-weak">{browsingResource.namespace}/{browsingResource.name}</Text>
                            </Box>
                            <Button icon={<Close />} onClick={() => setShowBrowse(false)} plain />
                        </Box>

                        {/* Breadcrumbs / Navigation */}
                        <Box direction="row" align="center" gap="small" background="light-1" pad="small" round="small">
                            <Button
                                icon={<FormPrevious />}
                                onClick={handleUp}
                                disabled={!currentPath}
                                tip="Up one level"
                            />
                            <Text weight="bold" color="text">/{currentPath}</Text>
                            {loadingFiles && <Text size="small" color="text-weak">Loading...</Text>}
                        </Box>

                        {/* File List */}
                        <Box flex border={{ color: 'border', size: 'small' }} round="small" overflow="auto">
                            <DataTable
                                data={files}
                                columns={[
                                    {
                                        property: 'name',
                                        header: 'Name',
                                        primary: true,
                                        render: (datum: FileItem) => (
                                            <Box direction="row" gap="small" align="center">
                                                {datum.type === 'folder' ? <Folder color="brand" /> : <Document />}
                                                {datum.type === 'folder' ? (
                                                    <Button
                                                        label={datum.name}
                                                        plain
                                                        onClick={() => handleNavigate(currentPath + datum.name)}
                                                        style={{ textAlign: 'left', fontWeight: 'bold' }}
                                                    />
                                                ) : (
                                                    <Text>{datum.name}</Text>
                                                )}
                                            </Box>
                                        )
                                    },
                                    {
                                        property: 'size',
                                        header: 'Size',
                                        size: 'small',
                                        render: (datum: FileItem) => <Text size="small">{datum.type === 'file' ? formatSize(datum.size || 0) : '-'}</Text>,
                                        align: 'end'
                                    },
                                    {
                                        property: 'last_modified',
                                        header: 'Modified',
                                        size: 'medium',
                                        render: (datum: FileItem) => <Text size="small">{datum.last_modified ? new Date(datum.last_modified).toLocaleString() : '-'}</Text>
                                    }
                                ]}
                                sortable
                            />
                            {!loadingFiles && files.length === 0 && (
                                <Box align="center" pad="large">
                                    <Text color="text-weak">No files found</Text>
                                </Box>
                            )}
                        </Box>
                    </Box>
                </Layer>
            )}
        </Box>
    );
};
