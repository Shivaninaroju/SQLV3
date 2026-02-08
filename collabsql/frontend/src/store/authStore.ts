import { create } from 'zustand';
import { authAPI } from '../services/api';
import socketService from '../services/socket';

interface User {
  id: number;
  email: string;
  username: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (email: string, password: string) => Promise<void>;
  loginWithToken: (user: User, token: string) => void;
  register: (email: string, username: string, password: string) => Promise<any>;
  logout: () => void;
  loadUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),
  isLoading: false,

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const response = await authAPI.login({ email, password });
      const data = response?.data;
      if (!data || !data.token || !data.user) {
        set({ isLoading: false });
        throw new Error('Invalid response from server. Please try again.');
      }
      const { user, token } = data;
      localStorage.setItem('token', token);
      set({ user, token, isAuthenticated: true, isLoading: false });
      socketService.connect(token);
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  // Set auth state directly (used by VerifyEmail page after email verification)
  loginWithToken: (user: User, token: string) => {
    localStorage.setItem('token', token);
    set({ user, token, isAuthenticated: true, isLoading: false });
    socketService.connect(token);
  },

  register: async (email: string, username: string, password: string) => {
    set({ isLoading: true });
    try {
      const response = await authAPI.register({ email, username, password });
      const data = response?.data;
      if (!data) {
        set({ isLoading: false });
        throw new Error('Invalid response from server. Please try again.');
      }
      const { user, token } = data;
      if (token && user) {
        localStorage.setItem('token', token);
        set({ user, token, isAuthenticated: true, isLoading: false });
        socketService.connect(token);
      } else {
        set({ isLoading: false });
      }
      return data;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    socketService.disconnect();
    set({ user: null, token: null, isAuthenticated: false });
  },

  loadUser: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ isAuthenticated: false });
      return;
    }

    try {
      const response = await authAPI.getProfile();
      set({ user: response.data.user, isAuthenticated: true });

      // Connect socket
      socketService.connect(token);
    } catch (error) {
      localStorage.removeItem('token');
      set({ user: null, token: null, isAuthenticated: false });
    }
  },
}));
