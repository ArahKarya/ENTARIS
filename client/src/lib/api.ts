import axios from 'axios';
import { queryClient } from './queryClient';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  // Add CSRF token for state-changing requests
  if (['post', 'put', 'patch', 'delete'].includes(config.method || '')) {
    const csrfToken = document.cookie
      .split('; ')
      .find((c) => c.startsWith('csrf-token='))
      ?.split('=')[1];
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const isLoginRequest = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && !isLoginRequest) {
      // A stored user means a session existed and has now ended: show the
      // "Sesi Anda berakhir" notice. Skip when already on /login (no reload loop).
      const hadSession = Boolean(localStorage.getItem('user'));
      localStorage.removeItem('user');
      queryClient.clear();
      if (window.location.pathname !== '/login') {
        window.location.href = hadSession ? '/login?alasan=sesi' : '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
