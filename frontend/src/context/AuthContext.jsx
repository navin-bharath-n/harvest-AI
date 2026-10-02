import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('harvest_token') || null);
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('harvest_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('login'); // 'login' | 'register'

  // Validate existing session on mount
  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const savedToken = localStorage.getItem('harvest_token');
      if (!savedToken) {
        if (mounted) {
          setUser(null);
          setToken(null);
          setIsLoading(false);
        }
        return;
      }

      try {
        const currentUser = await api.getCurrentUser();
        if (mounted) {
          setUser(currentUser);
          setToken(savedToken);
          localStorage.setItem('harvest_user', JSON.stringify(currentUser));
        }
      } catch (err) {
        console.warn('Session verification failed, logging out:', err);
        if (mounted) {
          localStorage.removeItem('harvest_token');
          localStorage.removeItem('harvest_user');
          setUser(null);
          setToken(null);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    checkSession();

    // Listen for unauthorized 401 events dispatched from client.js
    const handleUnauthorized = () => {
      if (mounted) {
        setUser(null);
        setToken(null);
      }
    };
    window.addEventListener('harvest:unauthorized', handleUnauthorized);

    return () => {
      mounted = false;
      window.removeEventListener('harvest:unauthorized', handleUnauthorized);
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api.login(email, password);
    setToken(data.access_token);
    setUser(data.user);
    setIsAuthModalOpen(false);
    return data.user;
  }, []);

  const register = useCallback(async (email, password, fullName) => {
    const data = await api.register(email, password, fullName);
    setToken(data.access_token);
    setUser(data.user);
    setIsAuthModalOpen(false);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    api.logout();
    setToken(null);
    setUser(null);
  }, []);

  const openLogin = useCallback(() => {
    setAuthModalMode('login');
    setIsAuthModalOpen(true);
  }, []);

  const openRegister = useCallback(() => {
    setAuthModalMode('register');
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
  }, []);

  const value = {
    user,
    token,
    isAuthenticated: Boolean(token && user),
    isLoading,
    isAuthModalOpen,
    authModalMode,
    setAuthModalMode,
    login,
    register,
    logout,
    openLogin,
    openRegister,
    closeAuthModal,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
