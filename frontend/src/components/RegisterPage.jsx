import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Scissors, Lock, Mail, User, Eye, EyeOff, ArrowRight,
  AlertCircle, Loader, Check, ShieldCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const { register, isAuthenticated } = useAuth();
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
  const [error, setError] = useState('');

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
