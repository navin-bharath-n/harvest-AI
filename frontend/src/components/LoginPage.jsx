import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Scissors, Lock, Mail, Eye, EyeOff, ArrowRight,
  AlertCircle, Loader, ShieldCheck, Clock
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

export default function LoginPage() {
  const { login, loginWithGoogleData, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const googlePopupRef = useRef(null);

  // Client-side rate-limit & brute force defense state
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutCountdown, setLockoutCountdown] = useState(0);

  // Listen for Google OAuth popup messages
  useEffect(() => {
    const handleOAuthMessage = (event) => {
      const isAllowed =
        api.isAllowedOAuthOrigin(event.origin) ||
        (googlePopupRef.current && event.source === googlePopupRef.current);
      if (!isAllowed) return;

      if (event.data?.type === 'HARVEST_GOOGLE_LOGIN_SUCCESS') {
        const { token: userToken, user: userData } = event.data;
        loginWithGoogleData(userToken, userData);
        setGoogleLoading(false);
        if (googlePopupRef.current && !googlePopupRef.current.closed) {
          try { googlePopupRef.current.close(); } catch (e) {}
        }
        const from = location.state?.from?.pathname || '/studio';
        navigate(from, { replace: true });
      } else if (event.data?.type === 'HARVEST_GOOGLE_LOGIN_FAILURE') {
        setError(event.data.error || 'Google login failed. Please try again.');
        setGoogleLoading(false);
      }
    };
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [loginWithGoogleData, navigate, location]);

  // Support redirect URL params fallback (e.g., if popup was blocked or redirected)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleToken = params.get('google_token');
    const googleUser = params.get('google_user');
    if (googleToken) {
      try {
        let parsedUser = null;
        if (googleUser) {
          parsedUser = typeof googleUser === 'object' ? googleUser : JSON.parse(decodeURIComponent(googleUser));
        }
        loginWithGoogleData(googleToken, parsedUser);
        const from = location.state?.from?.pathname || '/studio';
        navigate(from, { replace: true });
      } catch (err) {
        console.error('Failed to parse Google OAuth credentials from URL:', err);
      }
    }
  }, [loginWithGoogleData, navigate, location]);

  const handleGoogleLogin = () => {
    setError('');
    setGoogleLoading(true);
    const googleUrl = api.getGoogleLoginUrl();
    const width = 500;
    const height = 650;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    googlePopupRef.current = window.open(
      googleUrl,
      'harvest_google_auth',
      `width=${width},height=${height},left=${left},top=${top},status=0,toolbar=0,menubar=0`
    );
  };

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

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', margin: '1.15rem 0', gap: '0.75rem' }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#e6e6e1' }} />
            <span style={{ fontSize: '0.74rem', color: '#7a808a', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 650 }}>or</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#e6e6e1' }} />
          </div>

          {/* Google Sign In Button */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading || loading || isLocked}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              width: '100%',
              padding: '0.75rem',
              borderRadius: '6px',
              backgroundColor: '#ffffff',
              color: '#16181d',
              border: '1px solid #d7d7d1',
              fontSize: '0.92rem',
              fontWeight: 600,
              cursor: (googleLoading || loading || isLocked) ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" />
              <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.173 0 7.548 0 9s.347 2.827.957 4.039l3.007-2.332z" />
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" />
            </svg>
            <span>{googleLoading ? 'Connecting to Google…' : 'Continue with Google'}</span>
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
