import React from 'react';
import { Lock, ArrowRight, Sparkles } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import harvestLogo from '../Untitled Design.png';

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
          backgroundColor: '#0D0E16',
          color: '#A9ABC2',
          gap: '1rem',
          fontFamily: '"Outfit", system-ui, sans-serif',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '3px solid #2E3150',
            borderTopColor: '#3DD6C6',
            animation: 'spin 0.7s linear infinite',
          }}
        />
        <p style={{ fontSize: '0.9rem', margin: 0, color: '#F4F2EE' }}>Authenticating Encore session…</p>
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
          backgroundColor: '#0D0E16',
          padding: '2rem 1.5rem',
          fontFamily: '"Outfit", system-ui, sans-serif',
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
            color: '#F4F2EE',
            marginBottom: '1.75rem',
          }}
        >
          <img
            src={harvestLogo}
            alt="Encore"
            style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 8 }}
          />
          <span
            style={{
              fontSize: '1.4rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: '#F4F2EE',
            }}
          >
            Encore
          </span>
        </Link>

        <div
          style={{
            maxWidth: 420,
            width: '100%',
            textAlign: 'center',
            backgroundColor: '#161827',
            border: '1px solid #2E3150',
            borderRadius: '16px',
            padding: '2.5rem 2rem',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              margin: '0 auto 1.25rem',
              borderRadius: '12px',
              backgroundColor: '#1A1C2C',
              border: '1px solid #2E3150',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#3DD6C6',
            }}
          >
            <Lock size={20} />
          </div>

          <h2
            style={{
              color: '#F4F2EE',
              fontSize: '1.5rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              margin: '0 0 0.5rem 0',
            }}
          >
            Authentication Required
          </h2>
          <p style={{ color: '#A9ABC2', fontSize: '0.925rem', lineHeight: 1.6, margin: '0 0 1.75rem 0' }}>
            Please sign in to access your creator studio, growth rooms, and content calendar.
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
                borderRadius: '10px',
                backgroundColor: '#3DD6C6',
                color: '#0D0E16',
                fontWeight: 700,
                fontSize: '0.95rem',
                border: 'none',
                cursor: 'pointer',
                transition: 'opacity 0.15s ease',
              }}
            >
              <span>Sign In</span>
              <ArrowRight size={16} />
            </button>

            <button
              onClick={() => navigate('/')}
              style={{
                backgroundColor: '#1A1C2C',
                border: '1px solid #2E3150',
                borderRadius: '10px',
                padding: '0.7rem 1.25rem',
                color: '#C9CBDD',
                fontSize: '0.9rem',
                fontWeight: 600,
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
