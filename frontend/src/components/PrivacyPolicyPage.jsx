import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, ArrowLeft, Scissors } from 'lucide-react';
import Footer from './Footer';

export default function PrivacyPolicyPage() {
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
            <Shield size={24} color="#1f6f4a" />
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
              Privacy Policy
            </h1>
          </div>

          <p style={{ fontSize: '0.975rem', lineHeight: 1.7, color: '#5b616b', marginBottom: '2rem' }}>
            This Privacy Policy explains how Harvest (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) collects, uses, processes, and protects your personal data when you use our video processing studio.
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
              1. Information We Collect
            </h2>
            <p style={{ lineHeight: 1.7, marginBottom: '0.75rem', color: '#16181d' }}>
              We collect only the minimum data necessary to operate our service:
            </p>
            <ul style={{ paddingLeft: '1.4rem', lineHeight: 1.8, color: '#5b616b' }}>
              <li><strong>Account Credentials:</strong> Full name, email address, and salted Bcrypt password hash for authentication and workspace isolation.</li>
              <li><strong>Media &amp; Content:</strong> Videos you upload, extracted audio streams, generated speech transcripts, and processed short video variations.</li>
              <li><strong>Third-Party Social Tokens:</strong> When you connect YouTube, TikTok, or Instagram accounts for publishing, we store encrypted API tokens exclusively to publish clips upon your manual request.</li>
              <li><strong>System Logs:</strong> Server operational logs (timestamps, API status codes) for reliability and security audit purposes.</li>
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
              2. How We Use Your Data
            </h2>
            <p style={{ lineHeight: 1.7, marginBottom: '0.75rem', color: '#16181d' }}>
              Your data is processed strictly for the following purposes:
            </p>
            <ul style={{ paddingLeft: '1.4rem', lineHeight: 1.8, color: '#5b616b' }}>
              <li>Performing speech-to-text audio transcription and optional translation.</li>
              <li>Running computer vision to track active speakers for 9:16 vertical video reframing.</li>
              <li>Rendering video clips according to your chosen styling parameters.</li>
              <li>Publishing rendered clips to connected social media platforms when you trigger publication.</li>
            </ul>
            <p style={{ lineHeight: 1.7, marginTop: '0.75rem', color: '#5b616b' }}>
              We do <strong>not</strong> sell your data, use your video footage to train public commercial models without consent, or share your content with third-party advertisers.
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
              3. Data Retention and Deletion
            </h2>
            <p style={{ lineHeight: 1.7, color: '#16181d' }}>
              You retain full ownership and control of your content. You can delete individual videos, rendered clips, or entire projects directly from your studio at any time. When deleted, source files, frames, and audio clips are purged from the server filesystem and database.
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
              4. Compliance and Data Rights
            </h2>
            <p style={{ lineHeight: 1.7, marginBottom: '0.75rem', color: '#16181d' }}>
              We process personal data in accordance with applicable data protection regulations:
            </p>
            <ul style={{ paddingLeft: '1.4rem', lineHeight: 1.8, color: '#5b616b' }}>
              <li><strong>Notice &amp; Consent:</strong> Data is collected only upon specific, informed consent provided during registration and video processing.</li>
              <li><strong>Right to Access &amp; Correction:</strong> You may review, update, or correct your personal profile information anytime.</li>
              <li><strong>Right to Erasure:</strong> You have the right to request deletion of your account and all associated video data.</li>
            </ul>
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
              5. Legal Entity &amp; Contact
            </h2>
            <p style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#5b616b', margin: 0 }}>
              <strong>Data Fiduciary:</strong> Harvest<br />
              <strong>Contact:</strong>{' '}
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
