import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie, X, Check } from 'lucide-react';

const STORAGE_KEY = 'harvest_cookie_consent';

export default function CookieConsentBanner() {
  const [show, setShow] = useState(() => {
    try {
      return !localStorage.getItem(STORAGE_KEY);
    } catch {
      return false;
    }
  });

  const handleConsent = (level) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        level,
        timestamp: new Date().toISOString()
      }));
    } catch {
      // Ignore local storage write errors
    }
    setShow(false);
  };

  if (!show) return null;

  return (
    <aside
      aria-label="Cookie and data storage preferences"
      role="region"
      style={{
        position: 'fixed',
        bottom: '1.25rem',
        left: '1.25rem',
        right: '1.25rem',
        maxWidth: 520,
        zIndex: 9000,
        backgroundColor: '#ffffff',
        border: '1px solid #e6e6e1',
        borderRadius: '8px',
        padding: '1.25rem',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
        color: '#16181d',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: '6px',
              backgroundColor: '#fafaf8',
              border: '1px solid #e6e6e1',
              color: '#1f6f4a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Cookie size={16} />
          </div>
          <strong
            style={{
              fontSize: '0.95rem',
              color: '#16181d',
              fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
              fontWeight: 700,
            }}
          >
            Data Storage Notice
          </strong>
        </div>
        <button
          onClick={() => handleConsent('essential')}
          style={{
            background: 'none',
            border: 'none',
            color: '#7a808a',
            cursor: 'pointer',
            padding: 4,
            borderRadius: 4,
            display: 'flex',
          }}
          aria-label="Dismiss notice"
        >
          <X size={16} />
        </button>
      </div>

      <p style={{ fontSize: '0.825rem', lineHeight: 1.55, color: '#5b616b', margin: 0 }}>
        Harvest uses essential local storage to keep your session authenticated and track active background video rendering jobs. We do not use third-party ad tracking cookies. Learn more in our{' '}
        <Link
          to="/cookies"
          style={{
            color: '#16181d',
            textDecoration: 'underline',
            textDecorationColor: '#b9b9b2',
            textUnderlineOffset: '3px',
          }}
        >
          Cookie Policy
        </Link>{' '}
        and{' '}
        <Link
          to="/privacy"
          style={{
            color: '#16181d',
            textDecoration: 'underline',
            textDecorationColor: '#b9b9b2',
            textUnderlineOffset: '3px',
          }}
        >
          Privacy Policy
        </Link>.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
        <button
          onClick={() => handleConsent('all')}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#1f6f4a',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '0.825rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            transition: 'background-color 0.15s ease',
          }}
        >
          <Check size={14} />
          Accept All
        </button>

        <button
          onClick={() => handleConsent('essential')}
          style={{
            padding: '0.5rem 0.9rem',
            backgroundColor: '#ffffff',
            color: '#16181d',
            border: '1px solid #e6e6e1',
            borderRadius: '6px',
            fontSize: '0.825rem',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Essential Only
        </button>
      </div>
    </aside>
  );
}
