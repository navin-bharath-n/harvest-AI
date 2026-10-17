import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, LayoutDashboard, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import harvestLogo from '../Untitled Design.png';

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <>
      <style>{`
        .hv-nav-header {
          position: sticky;
          top: 0;
          z-index: 100;
          width: 100%;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.85rem clamp(1.2rem, 5vw, 3.5rem);
          background-color: rgba(13, 14, 22, 0.94);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid #2E3150;
          color: #F4F2EE;
          transition: padding 0.15s ease;
        }
        .hv-nav-brand {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          text-decoration: none;
          color: #F4F2EE;
          flex-shrink: 0;
        }
        .hv-nav-logo {
          width: 34px;
          height: 34px;
          object-fit: contain;
          border-radius: 8px;
        }
        .hv-nav-brand-text {
          font-size: 1.35rem;
          font-family: "Outfit", "Bricolage Grotesque", system-ui, sans-serif;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #F4F2EE;
        }
        .hv-nav-links {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }
        .hv-nav-link {
          color: #C9CBDD;
          text-decoration: none;
          font-size: 0.92rem;
          font-weight: 600;
          transition: color 0.15s ease;
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
        }
        .hv-nav-link:hover {
          color: #3DD6C6;
        }
        .hv-nav-actions {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          flex-shrink: 0;
        }
        .hv-nav-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.55rem 1.15rem;
          border-radius: 8px;
          background-color: #3DD6C6;
          color: #0D0E16;
          text-decoration: none;
          border: none;
          font-size: 0.92rem;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
          transition: opacity 0.15s ease;
        }
        .hv-nav-btn-primary:hover {
          opacity: 0.9;
        }
        .hv-nav-btn-ghost {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.5rem 0.8rem;
          border-radius: 8px;
          background-color: transparent;
          color: #C9CBDD;
          text-decoration: none;
          border: none;
          font-size: 0.92rem;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          transition: color 0.15s ease, background-color 0.15s ease;
        }
        .hv-nav-btn-ghost:hover {
          background-color: #1A1C2C;
          color: #F4F2EE;
        }
        .hv-nav-btn-outline {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.5rem 0.8rem;
          border-radius: 8px;
          background-color: transparent;
          color: #A9ABC2;
          border: 1px solid #2E3150;
          font-size: 0.85rem;
          cursor: pointer;
          white-space: nowrap;
          transition: background-color 0.15s ease;
        }
        .hv-nav-btn-outline:hover {
          background-color: #1A1C2C;
        }
        @media (max-width: 860px) {
          .hv-nav-links {
            display: none;
          }
        }
        @media (max-width: 640px) {
          .hv-nav-header {
            padding: 0.65rem 0.85rem;
          }
          .hv-nav-brand-text {
            font-size: 1.15rem;
          }
          .hv-nav-actions {
            gap: 0.35rem;
          }
          .hv-nav-btn-primary {
            padding: 0.42rem 0.72rem;
            font-size: 0.82rem;
          }
        }
      `}</style>
      <header className="hv-nav-header">
        {/* Brand */}
        <Link to="/" className="hv-nav-brand">
          <img src={harvestLogo} alt="Encore logo" className="hv-nav-logo" />
          <span className="hv-nav-brand-text">Encore</span>
        </Link>

        {/* Center Nav Links */}
        <nav className="hv-nav-links" aria-label="Main Navigation">
          <Link to="/check" className="hv-nav-link" style={{ color: '#3DD6C6' }}>
            <span>Video Check</span>
            <span style={{ fontSize: 10, fontWeight: 800, background: 'rgba(61, 214, 198, 0.15)', padding: '2px 6px', borderRadius: 4 }}>FREE</span>
          </Link>
          <Link to="/pricing" className="hv-nav-link">Rooms</Link>
          <Link to="/studio" className="hv-nav-link">Studio</Link>
          <Link to="/growth" className="hv-nav-link">Growth</Link>
          <Link to="/calendar" className="hv-nav-link">Calendar</Link>
        </nav>

        {/* Nav Actions */}
        <div className="hv-nav-actions">
          {isAuthenticated ? (
            <>
              <button
                type="button"
                onClick={() => navigate('/studio')}
                className="hv-nav-btn-primary"
              >
                <LayoutDashboard size={14} />
                <span>Open Studio</span>
              </button>
              <button
                type="button"
                onClick={logout}
                title="Sign Out"
                className="hv-nav-btn-outline"
              >
                <LogOut size={13} />
                <span>{user?.full_name?.split(' ')[0] || 'Sign Out'}</span>
              </button>
            </>
          ) : (
            <>
              <Link to="/check" className="hv-nav-btn-ghost">
                <span>Check Video</span>
              </Link>
              <Link to="/login" className="hv-nav-btn-ghost">
                <LogIn size={14} />
                <span>Sign In</span>
              </Link>
              <Link to="/register" className="hv-nav-btn-primary">
                <span>Start Free</span>
              </Link>
            </>
          )}
        </div>
      </header>
    </>
  );
}
