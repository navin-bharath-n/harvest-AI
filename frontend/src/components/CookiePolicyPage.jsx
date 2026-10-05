import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Cookie, ArrowLeft, Scissors } from 'lucide-react';
import Footer from './Footer';

export default function CookiePolicyPage() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#ffffff',
        color: '#16181d',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      {/* Top Header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e6e6e1',
          padding: '0.85rem clamp(1rem, 4vw, 3rem)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <button
          onClick={() => navigate('/')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            background: 'none',
            border: 'none',
            color: '#16181d',
            fontSize: '0.9rem',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '0.4rem 0.6rem',
            borderRadius: '6px',
          }}
          aria-label="Back to home"
        >
          <ArrowLeft size={16} />
          Back to Home
        </button>

        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            textDecoration: 'none',
            color: '#16181d',
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: '5px',
              backgroundColor: '#16181d',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
            }}
          >
            <Scissors size={14} />
          </div>
          <span
            style={{
              fontSize: '1.15rem',
              fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: '#16181d',
            }}
          >
            Harvest
          </span>
        </Link>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, maxWidth: 840, width: '100%', margin: '0 auto', padding: '3rem 1.5rem 5rem', boxSizing: 'border-box' }}>
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            border: '1px solid #e6e6e1',
            padding: 'clamp(1.75rem, 5vw, 3rem)',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1rem', color: '#16181d' }}>
            <Cookie size={24} color="#1f6f4a" />
            <h1
              style={{
                fontSize: 'clamp(1.75rem, 3.5vw, 2.25rem)',
                fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
                fontWeight: 700,
                margin: 0,
                color: '#16181d',
                letterSpacing: '-0.02em',
              }}
            >
              Cookie Policy
            </h1>
          </div>

          <p style={{ fontSize: '0.975rem', lineHeight: 1.7, color: '#5b616b', marginBottom: '2rem' }}>
            This Cookie Policy explains how Harvest uses cookies and browser local storage to deliver, secure, and operate our services.
          </p>

          <section style={{ marginBottom: '2.25rem' }}>
            <h2
              style={{
                fontSize: '1.25rem',
                fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
                fontWeight: 700,
                color: '#16181d',
                marginBottom: '0.75rem',
              }}
            >
              1. What Technologies We Use
            </h2>
            <p style={{ lineHeight: 1.7, marginBottom: '0.75rem', color: '#16181d' }}>
              We primarily utilize standard web storage (<code>localStorage</code>) and temporary session cookies:
            </p>
            <ul style={{ paddingLeft: '1.4rem', lineHeight: 1.8, color: '#5b616b' }}>
              <li><strong>Strictly Essential Storage:</strong> Storing your authentication JWT (<code>harvest_token</code>) and cached user session (<code>harvest_user</code>) to keep you signed in securely across page reloads.</li>
              <li><strong>Workflow State:</strong> Storing active background task IDs (<code>harvest_active_generations</code>) so your video processing continues seamlessly if you refresh or switch tabs.</li>
              <li><strong>User Preferences:</strong> Storing your cookie banner choice (<code>harvest_cookie_consent</code>) and interface settings.</li>
            </ul>
          </section>

          <section style={{ marginBottom: '2.25rem' }}>
            <h2
              style={{
                fontSize: '1.25rem',
                fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
                fontWeight: 700,
                color: '#16181d',
                marginBottom: '0.75rem',
              }}
            >
              2. Third-Party Tracking &amp; Advertising
            </h2>
            <p style={{ lineHeight: 1.7, color: '#16181d' }}>
              Harvest does <strong>not</strong> load third-party ad network tracking beacons, cross-site tracking pixels, or sell browsing profiles to data brokers. Any third-party connections (such as YouTube OAuth) are loaded only when you explicitly connect an account.
            </p>
          </section>

          <section style={{ marginBottom: '2.25rem' }}>
            <h2
              style={{
                fontSize: '1.25rem',
                fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
                fontWeight: 700,
                color: '#16181d',
                marginBottom: '0.75rem',
              }}
            >
              3. Managing Your Storage &amp; Cookies
            </h2>
            <p style={{ lineHeight: 1.7, color: '#16181d' }}>
              You can clear browser local storage or cookies at any time via your browser settings. Please note that clearing essential storage will sign you out and require logging back into your workspace.
            </p>
          </section>

          <section
            style={{
              backgroundColor: '#fafaf8',
              border: '1px solid #e6e6e1',
              borderRadius: '6px',
              padding: '1.5rem',
            }}
          >
            <h2
              style={{
                fontSize: '1.15rem',
                fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
                fontWeight: 700,
                color: '#16181d',
                marginBottom: '0.5rem',
              }}
            >
              Contact
            </h2>
            <p style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#5b616b', margin: 0 }}>
              If you have any questions about our use of storage or cookies, please contact:{' '}
              <a
                href="mailto:support@harvest.ai"
                style={{
                  color: '#16181d',
                  textDecoration: 'underline',
                  textDecorationColor: '#b9b9b2',
                  textUnderlineOffset: '4px',
                }}
              >
                support@harvest.ai
              </a>
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
