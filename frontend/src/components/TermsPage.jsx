import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, ArrowLeft, Scissors } from 'lucide-react';
import Footer from './Footer';

export default function TermsPage() {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
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
        </div>

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
            <FileText size={24} color="#1f6f4a" />
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
              Terms of Service
            </h1>
          </div>

          <p style={{ fontSize: '0.975rem', lineHeight: 1.7, color: '#5b616b', marginBottom: '2rem' }}>
            Please read these Terms of Service (&ldquo;Terms&rdquo;) carefully before using the Harvest platform and services. By creating an account or accessing the studio, you agree to be bound by these Terms.
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
              1. Service Description
            </h2>
            <p style={{ lineHeight: 1.7, color: '#16181d' }}>
              Harvest provides automated video processing tools including transcription, smart cropping, subtitle burn-in, audio dubbing, and social media clip generation. Features and processing speeds may vary depending on model availability, hardware, and source media complexity.
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
              2. User Content &amp; Intellectual Property
            </h2>
            <p style={{ lineHeight: 1.7, marginBottom: '0.75rem', color: '#16181d' }}>
              You retain all copyright, ownership, and intellectual property rights in and to any videos, audio, or text you upload to Harvest.
            </p>
            <p style={{ lineHeight: 1.7, color: '#16181d' }}>
              You represent and warrant that you own or possess the necessary licenses, rights, and permissions to upload, process, and publish any media you submit through the service.
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
              3. Prohibited Content and Conduct
            </h2>
            <p style={{ lineHeight: 1.7, marginBottom: '0.75rem', color: '#16181d' }}>
              You agree not to use the service to process or distribute:
            </p>
            <ul style={{ paddingLeft: '1.4rem', lineHeight: 1.8, color: '#5b616b' }}>
              <li>Content that violates copyright, trademark, privacy, or publicity rights of any third party.</li>
              <li>Defamatory, obscene, unlawful, harassing, or sexually explicit material.</li>
              <li>Malicious software, automated scraping, or denial-of-service attempts.</li>
              <li>Unauthorized voice cloning or impersonation intended to defraud or mislead.</li>
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
              4. Accuracy &amp; Review
            </h2>
            <p style={{ lineHeight: 1.7, color: '#16181d' }}>
              Transcription, translation, facial detection, and video cropping are automated algorithms and may contain inaccuracies. Users are encouraged to review generated preview clips before publishing them to third-party platforms.
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
              5. Termination
            </h2>
            <p style={{ lineHeight: 1.7, color: '#16181d' }}>
              You may terminate your account at any time. We reserve the right to suspend or terminate accounts that violate these Terms or engage in abusive platform usage.
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
              6. Contact Information
            </h2>
            <p style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#5b616b', margin: 0 }}>
              Questions about these Terms should be sent to:<br />
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
              </a><br />
              <strong>Entity:</strong> Harvest
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
