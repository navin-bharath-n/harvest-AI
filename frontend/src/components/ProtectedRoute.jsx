import React from 'react';
import { Lock, ArrowRight, Scissors } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: '#ffffff',
          color: '#5b616b',
          gap: '1rem',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '3px solid #e6e6e1',
            borderTopColor: '#1f6f4a',
            animation: 'spin 0.7s linear infinite',
          }}
        />
        <p style={{ fontSize: '0.9rem', margin: 0, color: '#16181d' }}>Authenticating session…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: '#ffffff',
          padding: '2rem 1.5rem',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        {/* Brand Link */}
        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.6rem',
            textDecoration: 'none',
            color: '#16181d',
            marginBottom: '1.75rem',
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '6px',
              backgroundColor: '#16181d',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
            }}
          >
            <Scissors size={16} />
          </div>
          <span
            style={{
              fontSize: '1.3rem',
              fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: '#16181d',
            }}
          >
            Harvest
          </span>
        </Link>

        <div
          style={{
            maxWidth: 420,
            width: '100%',
            textAlign: 'center',
            backgroundColor: '#ffffff',
            border: '1px solid #e6e6e1',
            borderRadius: '8px',
            padding: '2.5rem 2rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              margin: '0 auto 1.25rem',
              borderRadius: '8px',
              backgroundColor: '#fafaf8',
              border: '1px solid #e6e6e1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#16181d',
            }}
          >
            <Lock size={18} />
          </div>

          <h2
            style={{
              color: '#16181d',
              fontSize: '1.5rem',
              fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              margin: '0 0 0.5rem 0',
            }}
          >
            Authentication Required
          </h2>
          <p style={{ color: '#5b616b', fontSize: '0.925rem', lineHeight: 1.6, margin: '0 0 1.75rem 0' }}>
            Please sign in to access your projects and studio workspace.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button
              onClick={() => navigate('/login')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.25rem',
                borderRadius: '6px',
                backgroundColor: '#1f6f4a',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '0.95rem',
                border: 'none',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
              }}
            >
              <span>Sign In</span>
              <ArrowRight size={16} />
            </button>

            <button
              onClick={() => navigate('/')}
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e6e6e1',
                borderRadius: '6px',
                padding: '0.7rem 1.25rem',
                color: '#16181d',
                fontSize: '0.9rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Return to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return children;
}
