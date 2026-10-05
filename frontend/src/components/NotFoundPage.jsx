import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Scissors, ArrowLeft, LayoutDashboard } from 'lucide-react';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ffffff',
        padding: '2rem 1.5rem',
        textAlign: 'center',
        color: '#16181d',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      {/* Brand Header */}
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
          maxWidth: 440,
          width: '100%',
          backgroundColor: '#ffffff',
          border: '1px solid #e6e6e1',
          borderRadius: '8px',
          padding: '2.5rem 2rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        }}
      >
        <h1
          style={{
            fontSize: '3.5rem',
            fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
            fontWeight: 700,
            color: '#16181d',
            lineHeight: 1,
            margin: '0 0 0.5rem 0',
            letterSpacing: '-0.03em',
          }}
        >
          404
        </h1>

        <h2
          style={{
            fontSize: '1.35rem',
            fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
            fontWeight: 700,
            color: '#16181d',
            margin: '0 0 0.75rem 0',
          }}
        >
          Page Not Found
        </h2>

        <p
          style={{
            fontSize: '0.925rem',
            color: '#5b616b',
            lineHeight: 1.6,
            margin: '0 0 2rem 0',
          }}
        >
          The page or video project you requested could not be found. It may have been deleted, moved, or does not exist.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button
            onClick={() => navigate('/studio')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#1f6f4a',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            <LayoutDashboard size={16} />
            Go to Studio
          </button>

          <button
            onClick={() => navigate('/')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.7rem 1.5rem',
              backgroundColor: '#ffffff',
              color: '#16181d',
              border: '1px solid #e6e6e1',
              borderRadius: '6px',
              fontSize: '0.9rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <ArrowLeft size={16} />
            Return to Home
          </button>
        </div>
      </div>
    </div>
  );
}
