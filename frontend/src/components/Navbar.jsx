import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, LayoutDashboard, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import harvestLogo from '../Untitled Design.png';

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.9rem clamp(1.2rem, 5vw, 3.5rem)',
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e6e6e1',
        color: '#16181d',
      }}
    >
      {/* Brand */}
      <Link
        to="/"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          textDecoration: 'none',
          color: '#16181d',
        }}
      >
        <img src={harvestLogo} alt="Harvest AI logo" style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: '6px' }} />
        <span
          style={{
            fontSize: '1.25rem',
            fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
            fontWeight: 700,
            letterSpacing: '-0.02em',
          }}
        >
          Harvest
        </span>
      </Link>

      {/* Nav Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {isAuthenticated ? (
          <>
            <button
              onClick={() => navigate('/studio')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.55rem 1rem',
                borderRadius: '6px',
                backgroundColor: '#1f6f4a',
                color: '#ffffff',
                border: 'none',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
              }}
            >
              <LayoutDashboard size={15} />
              Open Studio
            </button>
            <button
              onClick={logout}
              title="Sign Out"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.5rem 0.8rem',
                borderRadius: '6px',
                backgroundColor: 'transparent',
                color: '#5b616b',
                border: '1px solid #e6e6e1',
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              <LogOut size={14} />
              <span>{user?.full_name?.split(' ')[0] || 'Sign Out'}</span>
            </button>
          </>
        ) : (
          <>
            <Link
              to="/login"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.5rem 0.8rem',
                borderRadius: '6px',
                color: '#16181d',
                textDecoration: 'none',
                fontSize: '0.92rem',
                fontWeight: 500,
              }}
            >
              <LogIn size={15} />
              Sign In
            </Link>
            <Link
              to="/register"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.55rem 1.15rem',
                borderRadius: '6px',
                backgroundColor: '#1f6f4a',
                color: '#ffffff',
                textDecoration: 'none',
                fontSize: '0.92rem',
                fontWeight: 600,
                transition: 'background-color 0.15s ease',
              }}
            >
              Get Started
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
