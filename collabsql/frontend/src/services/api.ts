import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || '';
      // Don't redirect on auth endpoints - let the page handle the error
      const isAuthRequest = url.includes('/auth/login') || url.includes('/auth/register');
      if (!isAuthRequest && localStorage.getItem('token')) {
        localStorage.removeItem('token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth APIs
export const authAPI = {
  register: (data: { email: string; username: string; password: string }) =>
    api.post('/auth/register', data),

  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),

  getProfile: () =>
    api.get('/auth/me'),

  verifyToken: () =>
    api.get('/auth/verify'),

  logout: () =>
    api.post('/auth/logout'),

  verifyEmail: (token: string) =>
    api.get(`/auth/verify-email/${token}`),

  resendVerification: (data: { email: string }) =>
    api.post('/auth/resend-verification', data),

  forgotPassword: (data: { email: string }) =>
    api.post('/auth/forgot-password', data),

  resetPassword: (data: { token: string; newPassword: string }) =>
    api.post('/auth/reset-password', data),
};

// Database APIs
export const databaseAPI = {
  upload: (formData: FormData) =>
    api.post('/database/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  list: () =>
    api.get('/database/list'),

  getDetails: (databaseId: number) =>
    api.get(`/database/${databaseId}`),

  getSchema: (databaseId: number, refresh = false) =>
    api.get(`/database/${databaseId}/schema`, { params: { refresh } }),

  getSampleData: (databaseId: number, tableName: string, limit = 5) =>
    api.get(`/database/${databaseId}/table/${tableName}/sample`, { params: { limit } }),

  getAnalyticsSummary: (databaseId: number) =>
    api.get(`/database/${databaseId}/analytics-summary`),

  delete: (databaseId: number) =>
    api.delete(`/database/${databaseId}`),

  download: (databaseId: number) =>
    api.get(`/database/${databaseId}/download`, { responseType: 'blob' }),
};

// Query APIs
export const queryAPI = {
  convertNL: (data: { databaseId: number; query: string; conversationHistory?: any[]; selectedTable?: string }) =>
    api.post('/query/nl', data),

  execute: (data: { databaseId: number; query: string; isWrite?: boolean }) =>
    api.post('/query/execute', data),

  getSuggestions: (databaseId: number) =>
    api.get(`/query/suggestions/${databaseId}`),
};

// Collaboration APIs
export const collaborationAPI = {
  getCollaborators: (databaseId: number) =>
    api.get(`/collaboration/${databaseId}/collaborators`),

  addCollaborator: (databaseId: number, data: { userEmail: string; permissionLevel: string }) =>
    api.post(`/collaboration/${databaseId}/collaborators`, data),

  updatePermission: (databaseId: number, userId: number, data: { permissionLevel: string }) =>
    api.put(`/collaboration/${databaseId}/collaborators/${userId}`, data),

  removeCollaborator: (databaseId: number, userId: number) =>
    api.delete(`/collaboration/${databaseId}/collaborators/${userId}`),

  getActiveUsers: (databaseId: number) =>
    api.get(`/collaboration/${databaseId}/active`),
};

// History APIs
export const historyAPI = {
  getCommits: (databaseId: number, params?: any) =>
    api.get(`/history/${databaseId}`, { params }),

  getCommitDetails: (databaseId: number, commitId: number) =>
    api.get(`/history/${databaseId}/commits/${commitId}`),

  getStats: (databaseId: number) =>
    api.get(`/history/${databaseId}/stats`),

  rollback: (databaseId: number, commitId: number) =>
    api.post(`/history/${databaseId}/rollback/${commitId}`),
};

export default api;
