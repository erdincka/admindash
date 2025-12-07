
import { notify } from '@/lib/utils/notifications';
import { storageApi, FileItem, FileContent } from '@/lib/api/storage';
import { Box, Button, DataTable, Heading, Layer, Text, Spinner } from 'grommet';
import { useEffect, useState } from 'react';
import {
    Close, FormPrevious, Home, Folder, Refresh, DocumentText, DocumentImage, DocumentVideo
} from 'grommet-icons';
import dynamic from 'next/dynamic';

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

export const DataBrowser = () => {
    const [currentPath, setCurrentPath] = useState('/');
    const [files, setFiles] = useState<FileItem[]>([]);
    const [loading, setLoading] = useState(false);

    // File Viewing State
    const [viewingFile, setViewingFile] = useState<{ name: string, path: string } | null>(null);
    const [fileContent, setFileContent] = useState<FileContent | null>(null);
    const [loadingFile, setLoadingFile] = useState(false);

    useEffect(() => {
        fetchFiles(currentPath);
    }, [currentPath]);

    const fetchFiles = async (path: string) => {
        setLoading(true);
        try {
            const res = await storageApi.fsList({ path });
            if (res.data) {
                setFiles(res.data);
            }
        } catch (error: any) {
            notify.critical(`Failed to list directory: ${error.message || 'Unknown error'}`);
            // If path failed (e.g. permission denied), go back? Or just stay.
        } finally {
            setLoading(false);
        }
    };

    const handleNavigate = (path: string) => {
        // Ensure path ends with / for consistency or just handle plain strings
        // Actually for FS, /etc/secrets is a dir path.
        setCurrentPath(path);
    };

    const handleUp = () => {
        if (currentPath === '/') return;
        const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
        handleNavigate(parentPath);
    };

    const handleOpenFile = async (file: FileItem) => {
        // Construct full path
        const filePath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;

        setViewingFile({ name: file.name, path: filePath });
        setLoadingFile(true);
        setFileContent(null);

        try {
            const res = await storageApi.fsRead({ path: filePath });
            if (res.data) {
                setFileContent(res.data);
            }
        } catch (error: any) {
            notify.critical(`Failed to read file: ${error.message || 'Unknown error'}`);
            setViewingFile(null); // Close on error
        } finally {
            setLoadingFile(false);
        }
    };

    const getFileIcon = (file: FileItem) => {
        if (file.type === 'folder') return <Folder color="brand" />;
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '')) return <DocumentImage />;
        if (['mp4', 'webm', 'ogg', 'mov'].includes(ext || '')) return <DocumentVideo />;
        return <DocumentText />;
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const renderFileContent = () => {
        if (loadingFile) return <Box align="center" justify="center" pad="large"><Spinner size="medium" /></Box>;
        if (!fileContent) return <Text>No content</Text>;

        const { content, base64_content, mime_type } = fileContent;

        if (mime_type?.startsWith('image/') && base64_content) {
            return (
                <Box align="center" justify="center" fill>
                    <img
                        src={`data:${mime_type};base64,${base64_content}`}
                        alt="File content"
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    />
                </Box>
            );
        }

        if (mime_type?.startsWith('video/') && base64_content) {
            return (
                <Box align="center" justify="center" fill>
                    <video controls style={{ maxWidth: '100%', maxHeight: '100%' }}>
                        <source src={`data:${mime_type};base64,${base64_content}`} type={mime_type} />
                        Your browser does not support the video tag.
                    </video>
                </Box>
            );
        }

        // Text / Code
        return (
            <Editor
                height="100%"
                defaultLanguage={determineLanguage(viewingFile?.name || '')}
                value={content || ''}
                theme="vs-dark"
                options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    wordWrap: 'on'
                }}
            />
        );
    };

    const determineLanguage = (filename: string) => {
        const ext = filename.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'js': return 'javascript';
            case 'ts': return 'typescript';
            case 'py': return 'python';
            case 'json': return 'json';
            case 'html': return 'html';
            case 'css': return 'css';
            case 'md': return 'markdown';
            case 'yaml':
            case 'yml': return 'yaml';
            case 'xml': return 'xml';
            case 'sh': return 'shell';
            case 'sql': return 'sql';
            default: return 'plaintext';
        }
    };

    return (
        <Box pad="large" gap="medium" animation="fadeIn" fill>
            <Box direction="row" justify="between" align="center">
                <Box>
                    <Heading level="2" margin="none">Data Browser</Heading>
                    <Text color="text-weak">Explore the local filesystem.</Text>
                </Box>
                <Button
                    icon={<Refresh />}
                    onClick={() => fetchFiles(currentPath)}
                    tip="Refresh"
                    disabled={loading}
                />
            </Box>

            {/* Navigation Bar */}
            <Box direction="row" align="center" gap="small" background="light-1" pad="small" round="small">
                <Button icon={<Home />} onClick={() => handleNavigate('/')} tip="Root" />
                <Button
                    icon={<FormPrevious />}
                    onClick={handleUp}
                    disabled={currentPath === '/'}
                    tip="Up one level"
                />
                <Text weight="bold" style={{ fontFamily: 'monospace' }}>{currentPath}</Text>
                {loading && <Spinner size="small" />}
            </Box>

            {/* File List */}
            <Box flex overflow="auto" background="white" border={{ color: 'border', size: 'small' }} round="small">
                <DataTable
                    data={files}
                    columns={[
                        {
                            property: 'name',
                            header: 'Name',
                            primary: true,
                            render: (datum: FileItem) => (
                                <Box direction="row" gap="small" align="center">
                                    {getFileIcon(datum)}
                                    {datum.type === 'folder' ? (
                                        <Button
                                            label={datum.name}
                                            plain
                                            onClick={() => handleNavigate(currentPath === '/' ? `/${datum.name}` : `${currentPath}/${datum.name}`)}
                                            style={{ textAlign: 'left', fontWeight: 'bold' }}
                                        />
                                    ) : (
                                        <Button
                                            label={datum.name}
                                            plain
                                            onClick={() => handleOpenFile(datum)}
                                            style={{ textAlign: 'left' }}
                                        />
                                    )}
                                </Box>
                            ),
                            sortable: true
                        },
                        {
                            property: 'size',
                            header: 'Size',
                            size: 'small',
                            render: (datum: FileItem) => <Text size="small">{datum.type === 'file' ? formatSize(datum.size || 0) : '-'}</Text>,
                            align: 'end',
                            sortable: true
                        },
                        {
                            property: 'permissions',
                            header: 'Permissions',
                            size: 'small',
                            render: (datum: FileItem) => <Text size="small" style={{ fontFamily: 'monospace' }}>{datum.permissions || '-'}</Text>,
                        },
                        {
                            property: 'last_modified',
                            header: 'Modified',
                            size: 'medium',
                            render: (datum: FileItem) => <Text size="small">{datum.last_modified ? new Date(datum.last_modified).toLocaleString() : '-'}</Text>,
                            sortable: true
                        }
                    ]}
                    pin
                    sortable
                />
                {!loading && files.length === 0 && (
                    <Box align="center" pad="large">
                        <Text color="text-weak">Directory is empty</Text>
                    </Box>
                )}
            </Box>

            {/* File Viewer Modal */}
            {viewingFile && (
                <Layer
                    onEsc={() => setViewingFile(null)}
                    onClickOutside={() => setViewingFile(null)}
                    full
                    margin="medium"
                >
                    <Box fill background="white" pad="medium" gap="small">
                        <Box direction="row" justify="between" align="center">
                            <Box>
                                <Heading level="3" margin="none">{viewingFile.name}</Heading>
                                <Text size="small" color="text-weak">{viewingFile.path}</Text>
                            </Box>
                            <Button icon={<Close />} onClick={() => setViewingFile(null)} plain />
                        </Box>
                        <Box flex border={{ color: 'border', size: 'small' }} round="small" overflow="hidden">
                            {renderFileContent()}
                        </Box>
                    </Box>
                </Layer>
            )}
        </Box>
    );
};
