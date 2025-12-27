import axios from 'axios';
import { useAuthStore } from 'src/stores/auth';

const api = axios.create({
  baseURL: import.meta.env.VITE_API,
});

api.interceptors.request.use(
  (config) => {
    const authStore = useAuthStore();
    const tk = authStore.token;
    if (tk) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${tk}`;
    }
    return config;
  },
  (error: unknown) => Promise.reject(error instanceof Error ? error : new Error(String(error))),
);

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const err = error instanceof Error ? error : new Error(String(error));
    if (typeof error === 'object' && error !== null && 'response' in error) {
      const apiError = error as { response?: { status?: number } };
      if (apiError.response?.status === 401) {
        const authStore = useAuthStore();
        authStore.logout();
        // Optionally redirect to login
        // window.location.href = '/'
      }
    }
    return Promise.reject(err);
  },
);

export default api;
