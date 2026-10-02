import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Lock, ArrowRight, Loader, Video } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading, openLogin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      openLogin();
    }
  }, [isLoading, isAuthenticated, openLogin]);

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--bg-app, #090d16)',
        color: '#94a3b8',
        gap: '1rem',
      }}>
        <Loader size={28} color="#6366f1" style={{ animation: 'spin 1.2s linear infinite' }} />
        <p style={{ fontSize: '0.9rem', margin: 0 }}>Authenticating session…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at top, #141b2d 0%, #090d16 100%)',
        padding: '1.5rem',
      }}>
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            maxWidth: 420,
            width: '100%',
            textAlign: 'center',
            background: 'rgba(19, 23, 40, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '1.25rem',
            padding: '2.5rem 2rem',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div
            style={{
              width: 54,
              height: 54,
              margin: '0 auto 1.25rem',
              borderRadius: '1rem',
              background: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#818cf8',
            }}
          >
            <Lock size={24} />
          </div>

          <h2 style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
            Authentication Required
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 1.75rem 0' }}>
            Please sign in to access your projects, videos, and private AI generation data.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button
              onClick={openLogin}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.8rem 1.25rem',
                borderRadius: '0.75rem',
                background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.95rem',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 6px 20px rgba(79, 70, 229, 0.4)',
              }}
            >
              <span>Sign In / Create Account</span>
              <ArrowRight size={16} />
            </button>

            <button
              onClick={() => navigate('/')}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '0.75rem',
                padding: '0.7rem 1.25rem',
                color: '#94a3b8',
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              Return to Home
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return children;
}
