// API Configuration
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Helper function to get auth token
const getAuthToken = (): string | null => {
    return localStorage.getItem('token');
};

// Helper function to make authenticated requests
async function apiRequest<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const token = getAuthToken();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    // Merge any additional headers from options
    if (options.headers) {
        Object.assign(headers, options.headers);
    }

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'An error occurred' }));
        throw new Error(error.detail || error.message || 'Request failed');
    }

    return response.json();
}

// Auth API
export const authAPI = {
    register: async (email: string, password: string, username: string) => {
        const response = await apiRequest<{
            message: string;
            user: { id: number; email: string; username: string };
            token: string;
        }>('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password, username }),
        });
        localStorage.setItem('token', response.token);
        return response;
    },

    login: async (email: string, password: string) => {
        const response = await apiRequest<{
            message: string;
            user: { id: number; email: string; username: string };
            token: string;
        }>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
        localStorage.setItem('token', response.token);
        return response;
    },

    logout: async () => {
        await apiRequest('/auth/logout', { method: 'POST' });
        localStorage.removeItem('token');
    },

    verifyToken: async () => {
        return apiRequest<{
            valid: boolean;
            user: { id: number; email: string; username: string };
        }>('/auth/verify');
    },

    getMe: async () => {
        return apiRequest<{
            user: { id: number; email: string; username: string };
        }>('/auth/me');
    },
};

// Database API
export const databaseAPI = {
    upload: async (name: string, file: File) => {
        const token = getAuthToken();
        const formData = new FormData();
        formData.append('name', name);
        formData.append('file', file);

        const response = await fetch(`${API_URL}/database/upload`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
            },
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
            throw new Error(error.detail || 'Upload failed');
        }

        return response.json();
    },

    list: async () => {
        return apiRequest<{
            databases: Array<{
                id: number;
                name: string;
                original_filename: string;
                file_path: string;
                owner_id: number;
                created_at: string;
            }>;
        }>('/database/list');
    },

    getDetails: async (databaseId: number) => {
        return apiRequest<{
            database: {
                id: number;
                name: string;
                original_filename: string;
                owner_username: string;
                created_at: string;
                updated_at: string;
                schema: {
                    tables: Array<{
                        name: string;
                        columns: Array<{
                            name: string;
                            type: string;
                            notNull: boolean;
                            primaryKey: boolean;
                        }>;
                        rowCount: number;
                    }>;
                };
                collaborators: any[];
                userPermission: string;
            };
        }>(`/database/${databaseId}`);
    },

    getSchema: async (databaseId: number, refresh = false) => {
        return apiRequest<{
            schema: {
                tables: Array<{
                    name: string;
                    columns: Array<{
                        name: string;
                        type: string;
                        notNull: boolean;
                        primaryKey: boolean;
                    }>;
                    rowCount: number;
                }>;
            };
        }>(`/database/${databaseId}/schema?refresh=${refresh}`);
    },

    getAnalytics: async (databaseId: number) => {
        return apiRequest<{
            summary: {
                tableCount: number;
                tables: any[];
            };
        }>(`/database/${databaseId}/analytics`);
    },

    download: async (databaseId: number, format: 'db' | 'sqlite' | 'sqlite3' | 'csv' = 'db') => {
        const token = getAuthToken();
        const response = await fetch(`${API_URL}/database/${databaseId}/download?format=${format}`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            throw new Error('Download failed');
        }

        return response.blob();
    },

    delete: async (databaseId: number) => {
        return apiRequest<{ message: string }>(`/database/${databaseId}`, {
            method: 'DELETE',
        });
    },

    getSampleData: async (databaseId: number, tableName: string, limit = 5) => {
        return apiRequest<{
            data: any[];
        }>(`/database/${databaseId}/table/${tableName}/sample?limit=${limit}`);
    },
};

// Query API
export const queryAPI = {
    convertNL: async (
        databaseId: number,
        query: string,
        conversationHistory: any[] = [],
        selectedTable?: string
    ) => {
        return apiRequest<{
            type: string;
            query?: string;
            explanation?: string;
            message?: string;
            result?: any[];
            changes?: number;
            error?: string;
        }>('/query/nl', {
            method: 'POST',
            body: JSON.stringify({
                databaseId,
                query,
                conversationHistory,
                selectedTable,
            }),
        });
    },

    execute: async (databaseId: number, query: string, isWrite = false) => {
        return apiRequest<{
            success: boolean;
            result?: any;
            queryType: string;
            message?: string;
            error?: string;
        }>('/query/execute', {
            method: 'POST',
            body: JSON.stringify({
                databaseId,
                query,
                isWrite,
            }),
        });
    },

    getSuggestions: async (databaseId: number) => {
        return apiRequest<{
            suggestions: Array<{
                category: string;
                query: string;
                description: string;
            }>;
        }>(`/query/suggestions/${databaseId}`);
    },
};

// History API
export const historyAPI = {
    getHistory: async (databaseId: number) => {
        return apiRequest<{
            commits: Array<{
                id: number;
                database_id: number;
                user_id: number;
                username: string;
                query_executed: string;
                rows_affected: number;
                operation_type: string;
                timestamp: string;
            }>;
        }>(`/history/${databaseId}`);
    },

    getStats: async (databaseId: number) => {
        return apiRequest<{
            totalCommits: number;
            operationStats: Array<{
                operation_type: string;
                count: number;
            }>;
        }>(`/history/${databaseId}/stats`);
    },
};

// Collaboration API
export const collaborationAPI = {
    getCollaborators: async (databaseId: number) => {
        return apiRequest<{
            collaborators: any[];
        }>(`/collaboration/${databaseId}/collaborators`);
    },

    addCollaborator: async (
        databaseId: number,
        userEmail: string,
        permissionLevel: string
    ) => {
        return apiRequest<{ message: string }>(
            `/collaboration/${databaseId}/collaborators`,
            {
                method: 'POST',
                body: JSON.stringify({ userEmail, permissionLevel }),
            }
        );
    },

    getActiveUsers: async (databaseId: number) => {
        return apiRequest<any[]>(`/collaboration/${databaseId}/active`);
    },
};
