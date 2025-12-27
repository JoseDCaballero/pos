import { ref } from 'vue';
import { defineStore } from 'pinia';

export interface UserData {
  email?: string;
  [key: string]: unknown;
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(sessionStorage.getItem('token') || null);
  const user = ref<UserData | null>(JSON.parse(sessionStorage.getItem('user') || 'null'));

  function setToken(newToken: string | null) {
    token.value = newToken;
    if (newToken) {
      sessionStorage.setItem('token', newToken);
    } else {
      sessionStorage.removeItem('token');
    }
  }

  function setUser(userData: UserData | null) {
    user.value = userData;
    if (userData) {
      sessionStorage.setItem('user', JSON.stringify(userData));
    } else {
      sessionStorage.removeItem('user');
    }
  }

  function login(newToken: string, userData: UserData | null = null) {
    setToken(newToken);
    setUser(userData);
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  function isAuthenticated() {
    return !!token.value;
  }

  return {
    token,
    user,
    setToken,
    setUser,
    login,
    logout,
    isAuthenticated,
  };
});
