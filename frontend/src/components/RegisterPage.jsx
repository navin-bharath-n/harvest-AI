import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Scissors, Lock, Mail, User, Eye, EyeOff, ArrowRight,
  AlertCircle, Loader, Check, ShieldCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

export default function RegisterPage() {
  const { register, loginWithGoogleData, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [honeypot, setHoneypot] = useState(''); // Anti-bot honeypot
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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

  // Password Strength Evaluation
  const passwordChecks = {
    length: password.length >= 8 && password.length <= 72,
    hasLower: /[a-z]/.test(password),
    hasUpper: /[A-Z]/.test(password),
    hasDigit: /[0-9]/.test(password),
    hasSpecial: /[!@#$%^&*()_+\-=[\]{}|;:,.<>?/~`'"\\]/.test(password),
  };

  const strengthScore = Object.values(passwordChecks).filter(Boolean).length;
  const isPasswordValid = strengthScore === 5;
  const passwordsMatch = password && confirmPassword && password === confirmPassword;

  const getStrengthLabel = () => {
    if (!password) return { text: '', color: '#7a808a', width: '0%' };
    if (strengthScore <= 2) return { text: 'Weak', color: '#dc2626', width: '25%' };
    if (strengthScore <= 3) return { text: 'Fair', color: '#d97706', width: '50%' };
    if (strengthScore <= 4) return { text: 'Good', color: '#2563eb', width: '75%' };
    return { text: 'Strong', color: '#1f6f4a', width: '100%' };
  };

  const strength = getStrengthLabel();

  const handleSubmit = async (e) => {
    e.preventDefault();

    // 1. Anti-bot honeypot check
    if (honeypot.trim()) {
      return;
    }

    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();

    // 2. Client-side input validation
    if (!cleanName || !cleanEmail || !password.trim()) {
      setError('Please fill in all required fields.');
      return;
    }

    // RFC 5322 standard email check
    const emailRegex = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (!isPasswordValid) {
      setError('Please ensure your password meets all complexity requirements below.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter your password.');
      return;
    }

    if (!agreeTerms) {
      setError('You must agree to the Terms of Service and Privacy Policy to register.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await register(cleanEmail, password, cleanName);
      navigate('/studio', { replace: true });
    } catch (err) {
      console.error('Registration error:', err);
      const msg = err.response?.data?.detail || 'Registration failed. Please check your credentials and try again.';
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
          Create an Account
        </h1>
        <p style={{ fontSize: '0.95rem', color: '#5b616b', margin: 0 }}>
          Protected by salted Bcrypt hashing &amp; TLS encryption
        </p>
      </div>

      {/* Form Card */}
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          backgroundColor: '#ffffff',
          border: '1px solid #e6e6e1',
          borderRadius: '8px',
          padding: '2rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        }}
      >
        {error && (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.65rem',
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#b91c1c',
              fontSize: '0.85rem',
              marginBottom: '1.25rem',
              lineHeight: 1.5,
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Honeypot anti-bot field - invisible to human users */}
          <div style={{ display: 'none' }} aria-hidden="true">
            <label htmlFor="reg-url">Website URL (leave blank)</label>
            <input
              id="reg-url"
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
              style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#16181d', marginBottom: '0.4rem' }}
            >
              Full Name
            </label>
            <div style={{ position: 'relative' }}>
              <User
                size={16}
                style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#7a808a' }}
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
                  padding: '0.65rem 0.85rem 0.65rem 2.4rem',
                  borderRadius: '6px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #d7d7d1',
                  color: '#16181d',
                  fontSize: '0.92rem',
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
              style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#16181d', marginBottom: '0.4rem' }}
            >
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <Mail
                size={16}
                style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#7a808a' }}
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
                  padding: '0.65rem 0.85rem 0.65rem 2.4rem',
                  borderRadius: '6px',
                  backgroundColor: '#ffffff',
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <label
                htmlFor="reg-password"
                style={{ fontSize: '0.85rem', fontWeight: 600, color: '#16181d' }}
              >
                Password
              </label>
              {password && (
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: strength.color }}>
                  {strength.text}
                </span>
              )}
            </div>

            <div style={{ position: 'relative' }}>
              <Lock
                size={16}
                style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#7a808a' }}
              />
              <input
                id="reg-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                style={{
                  width: '100%',
                  padding: '0.65rem 2.4rem 0.65rem 2.4rem',
                  borderRadius: '6px',
                  backgroundColor: '#ffffff',
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

            {/* Password Strength Progress Bar */}
            {password && (
              <div style={{ marginTop: '0.4rem' }}>
                <div style={{ height: '4px', width: '100%', backgroundColor: '#e6e6e1', borderRadius: '2px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: strength.width,
                      backgroundColor: strength.color,
                      transition: 'all 0.3s ease',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Password Requirements Checklist */}
            <div
              style={{
                marginTop: '0.6rem',
                padding: '0.6rem 0.75rem',
                backgroundColor: '#fafaf8',
                border: '1px solid #e6e6e1',
                borderRadius: '6px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.35rem 0.5rem',
                fontSize: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: passwordChecks.length ? '#1f6f4a' : '#5b616b' }}>
                <Check size={12} strokeWidth={passwordChecks.length ? 3 : 2} />
                <span>8–72 characters</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: passwordChecks.hasUpper ? '#1f6f4a' : '#5b616b' }}>
                <Check size={12} strokeWidth={passwordChecks.hasUpper ? 3 : 2} />
                <span>Uppercase letter</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: passwordChecks.hasLower ? '#1f6f4a' : '#5b616b' }}>
                <Check size={12} strokeWidth={passwordChecks.hasLower ? 3 : 2} />
                <span>Lowercase letter</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: passwordChecks.hasDigit ? '#1f6f4a' : '#5b616b' }}>
                <Check size={12} strokeWidth={passwordChecks.hasDigit ? 3 : 2} />
                <span>Number (0–9)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', gridColumn: 'span 2', color: passwordChecks.hasSpecial ? '#1f6f4a' : '#5b616b' }}>
                <Check size={12} strokeWidth={passwordChecks.hasSpecial ? 3 : 2} />
                <span>Special symbol (!@#$%^&amp;*)</span>
              </div>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label
              htmlFor="reg-confirm-password"
              style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#16181d', marginBottom: '0.4rem' }}
            >
              Confirm Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock
                size={16}
                style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#7a808a' }}
              />
              <input
                id="reg-confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                maxLength={72}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                style={{
                  width: '100%',
                  padding: '0.65rem 2.4rem 0.65rem 2.4rem',
                  borderRadius: '6px',
                  backgroundColor: '#ffffff',
                  border: confirmPassword && !passwordsMatch ? '1px solid #dc2626' : '1px solid #d7d7d1',
                  color: '#16181d',
                  fontSize: '0.92rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
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
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {confirmPassword && !passwordsMatch && (
              <span style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem', display: 'block' }}>
                Passwords do not match.
              </span>
            )}
          </div>

          {/* Terms Agreement Checkbox */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', marginTop: '0.25rem' }}>
            <input
              id="agree-terms"
              type="checkbox"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              style={{
                marginTop: '0.2rem',
                accentColor: '#1f6f4a',
                cursor: 'pointer',
              }}
            />
            <label
              htmlFor="agree-terms"
              style={{ fontSize: '0.825rem', color: '#5b616b', lineHeight: 1.5, cursor: 'pointer' }}
            >
              I agree to the{' '}
              <Link
                to="/terms"
                target="_blank"
                style={{
                  color: '#16181d',
                  textDecoration: 'underline',
                  textDecorationColor: '#b9b9b2',
                  textUnderlineOffset: '3px',
                }}
              >
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link
                to="/privacy"
                target="_blank"
                style={{
                  color: '#16181d',
                  textDecoration: 'underline',
                  textDecorationColor: '#b9b9b2',
                  textUnderlineOffset: '3px',
                }}
              >
                Privacy Policy
              </Link>
              .
            </label>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || (password && !isPasswordValid) || (confirmPassword && !passwordsMatch)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              width: '100%',
              padding: '0.75rem',
              borderRadius: '6px',
              backgroundColor: loading ? '#5b616b' : '#1f6f4a',
              color: '#ffffff',
              border: 'none',
              fontSize: '0.98rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: '0.5rem',
              transition: 'background-color 0.15s ease',
            }}
          >
            {loading ? (
              <>
                <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
                Creating Secure Account…
              </>
            ) : (
              <>
                Create Account
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
            disabled={googleLoading || loading}
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
              cursor: (googleLoading || loading) ? 'not-allowed' : 'pointer',
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

        {/* Security Trust Indicator */}
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
          <span>Strict end-to-end data privacy &amp; zero ad-tracking</span>
        </div>

        {/* Footer link */}
        <div style={{ textAlign: 'center', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #e6e6e1' }}>
          <p style={{ fontSize: '0.88rem', color: '#5b616b', margin: 0 }}>
            Already have an account?{' '}
            <Link
              to="/login"
              style={{
                color: '#16181d',
                fontWeight: 600,
                textDecoration: 'underline',
                textDecorationColor: '#b9b9b2',
                textUnderlineOffset: '4px',
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
