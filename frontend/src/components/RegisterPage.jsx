import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, AlertCircle, Loader } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import harvestLogo from '../Untitled Design.png';

export default function RegisterPage() {
  const { register, loginWithGoogleData, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const googlePopupRef = useRef(null);

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
        navigate('/studio', { replace: true });
      } else if (event.data?.type === 'HARVEST_GOOGLE_LOGIN_FAILURE') {
        setError(event.data.error || 'Google registration failed. Please try again.');
        setGoogleLoading(false);
      }
    };
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [loginWithGoogleData, navigate]);

  // Support redirect URL params fallback
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
        navigate('/studio', { replace: true });
      } catch (err) {
        console.error('Failed to parse Google OAuth credentials from URL:', err);
      }
    }
  }, [loginWithGoogleData, navigate]);

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

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/studio', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Password strength check
  const hasMinLen = password.length >= 8;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=[\]{}|;:,.<>?/~`'"\\]/.test(password);
  const strengthScore = [hasMinLen, hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length;

  const getStrengthMeta = () => {
    if (!password) return { label: '', color: '#d7d7d1', width: '0%' };
    if (strengthScore <= 2) return { label: 'Weak', color: '#dc2626', width: '30%' };
    if (strengthScore <= 3) return { label: 'Fair', color: '#d97706', width: '60%' };
    if (strengthScore <= 4) return { label: 'Good', color: '#2563eb', width: '80%' };
    return { label: 'Strong', color: '#1f6f4a', width: '100%' };
  };

  const strength = getStrengthMeta();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (honeypot.trim()) return;

    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName || !cleanEmail || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }

    const emailRegex = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (!hasLower || !hasUpper || !hasDigit || !hasSpecial) {
      setError('Password must contain uppercase, lowercase, a number, and a symbol.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await register(cleanEmail, password, cleanName);
      navigate('/studio', { replace: true });
    } catch (err) {
      console.error('Registration error:', err);
      const msg = err.response?.data?.detail || 'Registration failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fafaf8',
        color: '#16181d',
        padding: '1.25rem 1rem',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        WebkitFontSmoothing: 'antialiased',
        boxSizing: 'border-box',
      }}
    >
      {/* Compact Card */}
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          backgroundColor: '#ffffff',
          border: '1px solid #e6e6e1',
          borderRadius: 12,
          padding: '1.75rem 1.5rem',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)',
          boxSizing: 'border-box',
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <Link
            to="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              textDecoration: 'none',
              color: '#16181d',
              marginBottom: '0.5rem',
            }}
          >
            <img src={harvestLogo} alt="Harvest logo" style={{ width: 28, height: 28, objectFit: 'contain' }} />
            <span
              style={{
                fontSize: '1.15rem',
                fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
                fontWeight: 700,
                letterSpacing: '-0.02em',
              }}
            >
              Harvest
            </span>
          </Link>
          <h1
            style={{
              fontSize: '1.45rem',
              fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              margin: '0 0 0.2rem',
              color: '#16181d',
            }}
          >
            Create an Account
          </h1>
          <p style={{ fontSize: '0.84rem', color: '#667085', margin: 0 }}>
            Get started with Harvest in seconds
          </p>
        </div>

        {/* 1-Click Google Sign Up */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={googleLoading || loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.65rem',
            width: '100%',
            height: 40,
            borderRadius: 7,
            backgroundColor: '#ffffff',
            color: '#16181d',
            border: '1px solid #d7d7d1',
            fontSize: '0.88rem',
            fontWeight: 600,
            cursor: (googleLoading || loading) ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.15s ease, border-color 0.15s ease',
            boxSizing: 'border-box',
          }}
        >
          <svg width="17" height="17" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" />
            <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.173 0 7.548 0 9s.347 2.827.957 4.039l3.007-2.332z" />
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" />
          </svg>
          <span>{googleLoading ? 'Connecting…' : 'Continue with Google'}</span>
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', margin: '1rem 0', gap: '0.65rem' }}>
          <div style={{ flex: 1, height: 1, backgroundColor: '#e6e6e1' }} />
          <span style={{ fontSize: '0.72rem', color: '#8892a0', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>or with email</span>
          <div style={{ flex: 1, height: 1, backgroundColor: '#e6e6e1' }} />
        </div>

        {/* Error Notification */}
        {error && (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
              padding: '0.6rem 0.75rem',
              borderRadius: 6,
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#b91c1c',
              fontSize: '0.82rem',
              marginBottom: '1rem',
              lineHeight: 1.45,
            }}
          >
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {/* Honeypot field */}
          <div style={{ display: 'none' }} aria-hidden="true">
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </div>

          {/* Full Name */}
          <div>
            <label
              htmlFor="reg-name"
              style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#272b33', marginBottom: '0.35rem' }}
            >
              Full Name
            </label>
            <div style={{ position: 'relative' }}>
              <User
                size={15}
                style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#8892a0', pointerEvents: 'none' }}
              />
              <input
                id="reg-name"
                type="text"
                autoComplete="name"
                required
                maxLength={100}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
                style={{
                  width: '100%',
                  height: 38,
                  padding: '0 0.75rem 0 2.25rem',
                  borderRadius: 6,
                  backgroundColor: '#ffffff',
                  border: '1px solid #d7d7d1',
                  color: '#16181d',
                  fontSize: '0.88rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Email Address */}
          <div>
            <label
              htmlFor="reg-email"
              style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#272b33', marginBottom: '0.35rem' }}
            >
              Email
            </label>
            <div style={{ position: 'relative' }}>
              <Mail
                size={15}
                style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#8892a0', pointerEvents: 'none' }}
              />
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                style={{
                  width: '100%',
                  height: 38,
                  padding: '0 0.75rem 0 2.25rem',
                  borderRadius: 6,
                  backgroundColor: '#ffffff',
                  border: '1px solid #d7d7d1',
                  color: '#16181d',
                  fontSize: '0.88rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <label
                htmlFor="reg-password"
                style={{ fontSize: '0.82rem', fontWeight: 600, color: '#272b33' }}
              >
                Password
              </label>
              {password && (
                <span style={{ fontSize: '0.74rem', fontWeight: 600, color: strength.color }}>
                  {strength.label}
                </span>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <Lock
                size={15}
                style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#8892a0', pointerEvents: 'none' }}
              />
              <input
                id="reg-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8+ chars (letters, numbers, symbol)"
                style={{
                  width: '100%',
                  height: 38,
                  padding: '0 2.25rem 0 2.25rem',
                  borderRadius: 6,
                  backgroundColor: '#ffffff',
                  border: '1px solid #d7d7d1',
                  color: '#16181d',
                  fontSize: '0.88rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '0.65rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: '#8892a0',
                  cursor: 'pointer',
                  padding: 3,
                  display: 'flex',
                }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            {/* Subtle password bar */}
            {password && (
              <div style={{ height: 3, width: '100%', backgroundColor: '#eee', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: strength.width, backgroundColor: strength.color, transition: 'all 0.25s ease' }} />
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.45rem',
              width: '100%',
              height: 40,
              borderRadius: 6,
              backgroundColor: loading ? '#5b616b' : '#1f6f4a',
              color: '#ffffff',
              border: 'none',
              fontSize: '0.92rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: '0.35rem',
              transition: 'background-color 0.15s ease',
            }}
          >
            {loading ? (
              <>
                <Loader size={15} style={{ animation: 'spin 0.8s linear infinite' }} />
                Creating account…
              </>
            ) : (
              <>
                <span>Create Account</span>
                <ArrowRight size={15} />
              </>
            )}
          </button>

          {/* Terms subtext */}
          <p style={{ fontSize: '0.74rem', color: '#8892a0', textAlign: 'center', margin: '0.15rem 0 0', lineHeight: 1.4 }}>
            By creating an account, you agree to our{' '}
            <Link to="/terms" target="_blank" style={{ color: '#5b616b', textDecoration: 'underline' }}>Terms</Link>{' '}
            &amp;{' '}
            <Link to="/privacy" target="_blank" style={{ color: '#5b616b', textDecoration: 'underline' }}>Privacy Policy</Link>.
          </p>
        </form>

        {/* Footer Link */}
        <div style={{ textAlign: 'center', marginTop: '1.15rem', paddingTop: '0.9rem', borderTop: '1px solid #f0f0eb' }}>
          <p style={{ fontSize: '0.825rem', color: '#667085', margin: 0 }}>
            Already have an account?{' '}
            <Link
              to="/login"
              style={{
                color: '#1f6f4a',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
