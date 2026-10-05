import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Scissors, Lock, Mail, Eye, EyeOff, ArrowRight,
  AlertCircle, Loader, ShieldCheck, Clock
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Client-side rate-limit & brute force defense state
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutCountdown, setLockoutCountdown] = useState(0);

  // If already authenticated, redirect to studio immediately
  useEffect(() => {
    if (isAuthenticated) {
      const from = location.state?.from?.pathname || '/studio';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location]);

  // Active countdown timer when locked out
  useEffect(() => {
    if (lockoutCountdown <= 0) return;
    const timer = setInterval(() => {
      setLockoutCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutCountdown]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (lockoutCountdown > 0) {
      setError(`Too many failed attempts. Please wait ${lockoutCountdown} seconds before trying again.`);
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setError('Please provide both your email address and password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await login(cleanEmail, cleanPassword);
      setFailedAttempts(0);
      const from = location.state?.from?.pathname || '/studio';
      navigate(from, { replace: true });
    } catch (err) {
      console.error('Login error:', err);
      const status = err.response?.status;
      const msg = err.response?.data?.detail || 'Incorrect email or password. Please try again.';

      const newFailed = failedAttempts + 1;
      setFailedAttempts(newFailed);

      if (status === 429) {
        setLockoutCountdown(60);
        setError(msg);
      } else if (newFailed >= 5) {
        setLockoutCountdown(30);
        setError('Too many failed attempts. Login temporarily paused for 30 seconds.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const isLocked = lockoutCountdown > 0;

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        color: '#16181d',
        padding: '2.5rem 1.5rem',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      {/* Brand header */}
      <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.6rem',
            textDecoration: 'none',
            color: '#16181d',
            marginBottom: '0.75rem',
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
        <h1
          style={{
            fontSize: '1.85rem',
            fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            margin: '0 0 0.35rem',
            color: '#16181d',
          }}
        >
          Sign In
        </h1>
        <p style={{ fontSize: '0.95rem', color: '#5b616b', margin: 0 }}>
          Enter your credentials to access your studio workspace
        </p>
      </div>

      {/* Form Card */}
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          backgroundColor: '#ffffff',
          border: '1px solid #e6e6e1',
          borderRadius: '8px',
          padding: '2rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        }}
      >
        {/* Error or Lockout Notification */}
        {error && (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.65rem',
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              backgroundColor: isLocked ? '#fffbeb' : '#fef2f2',
              border: isLocked ? '1px solid #fde68a' : '1px solid #fecaca',
              color: isLocked ? '#92400e' : '#b91c1c',
              fontSize: '0.85rem',
              marginBottom: '1.25rem',
              lineHeight: 1.5,
            }}
          >
            {isLocked ? (
              <Clock size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            ) : (
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            )}
            <div>
              <span>{error}</span>
              {isLocked && (
                <div style={{ marginTop: '0.35rem', fontWeight: 700 }}>
                  Retry permitted in: {lockoutCountdown}s
                </div>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Email Address */}
          <div>
            <label
              htmlFor="login-email"
              style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#16181d', marginBottom: '0.45rem' }}
            >
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <Mail
                size={16}
                style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#7a808a' }}
              />
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                disabled={isLocked}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem 0.65rem 2.4rem',
                  borderRadius: '6px',
                  backgroundColor: isLocked ? '#fafaf8' : '#ffffff',
                  border: '1px solid #d7d7d1',
                  color: '#16181d',
                  fontSize: '0.92rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
              <label
                htmlFor="login-password"
                style={{ fontSize: '0.875rem', fontWeight: 600, color: '#16181d' }}
              >
                Password
              </label>
            </div>
            <div style={{ position: 'relative' }}>
              <Lock
                size={16}
                style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#7a808a' }}
              />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                disabled={isLocked}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                style={{
                  width: '100%',
                  padding: '0.65rem 2.4rem 0.65rem 2.4rem',
                  borderRadius: '6px',
                  backgroundColor: isLocked ? '#fafaf8' : '#ffffff',
                  border: '1px solid #d7d7d1',
                  color: '#16181d',
                  fontSize: '0.92rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: '#7a808a',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || isLocked}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              width: '100%',
              padding: '0.75rem',
              borderRadius: '6px',
              backgroundColor: (loading || isLocked) ? '#5b616b' : '#1f6f4a',
              color: '#ffffff',
              border: 'none',
              fontSize: '0.98rem',
              fontWeight: 600,
              cursor: (loading || isLocked) ? 'not-allowed' : 'pointer',
              marginTop: '0.5rem',
              transition: 'background-color 0.15s ease',
            }}
          >
            {loading ? (
              <>
                <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
                Authenticating…
              </>
            ) : isLocked ? (
              `Locked (${lockoutCountdown}s)`
            ) : (
              <>
                Sign In
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Security Indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
            marginTop: '1.25rem',
            fontSize: '0.78rem',
            color: '#7a808a',
          }}
        >
          <ShieldCheck size={14} color="#1f6f4a" />
          <span>256-bit TLS encrypted session &amp; brute-force protection</span>
        </div>

        {/* Footer link */}
        <div style={{ textAlign: 'center', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #e6e6e1' }}>
          <p style={{ fontSize: '0.88rem', color: '#5b616b', margin: 0 }}>
            Don't have an account?{' '}
            <Link
              to="/register"
              style={{
                color: '#16181d',
                fontWeight: 600,
                textDecoration: 'underline',
                textDecorationColor: '#b9b9b2',
                textUnderlineOffset: '4px',
              }}
            >
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
