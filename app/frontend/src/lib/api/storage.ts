
import { apiClient } from './client';

export interface FileItem {
    name: string;
    type: 'file' | 'folder';
    size?: number;
    last_modified?: string;
    permissions?: string;
}

export interface BrowseRequest {
    namespace: string;
    resource_name: string;
    path?: string;
}

export interface FSListRequest {
    path: string;
}

export interface FSReadRequest {
    path: string;
}

export interface FileContent {
    content?: string;
    base64_content?: string;
    mime_type?: string;
    size: number;
}

export const storageApi = {
    browse: async (request: BrowseRequest) => {
        return apiClient.post<FileItem[]>('/storage/browse', request);
    },
    fsList: async (request: FSListRequest) => {
        return apiClient.post<FileItem[]>('/storage/fs/list', request);
    },
    fsRead: async (request: FSReadRequest) => {
        return apiClient.post<FileContent>('/storage/fs/read', request);
    }
};
