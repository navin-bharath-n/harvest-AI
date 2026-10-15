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
          background-color: rgba(255, 255, 255, 0.94);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid #e6e6e1;
          color: #16181d;
          transition: padding 0.15s ease;
        }
        .hv-nav-brand {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          text-decoration: none;
          color: #16181d;
          flex-shrink: 0;
        }
        .hv-nav-logo {
          width: 38px;
          height: 38px;
          object-fit: contain;
          border-radius: 6px;
        }
        .hv-nav-brand-text {
          font-size: 1.25rem;
          font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
          font-weight: 700;
          letter-spacing: -0.02em;
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
          border-radius: 6px;
          background-color: #1f6f4a;
          color: #ffffff;
          text-decoration: none;
          border: none;
          font-size: 0.92rem;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          transition: background-color 0.15s ease;
        }
        .hv-nav-btn-primary:hover {
          background-color: #185a3c;
        }
        .hv-nav-btn-ghost {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.5rem 0.8rem;
          border-radius: 6px;
          background-color: transparent;
          color: #16181d;
          text-decoration: none;
          border: none;
          font-size: 0.92rem;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
          transition: color 0.15s ease, background-color 0.15s ease;
        }
        .hv-nav-btn-ghost:hover {
          background-color: #f4f4f2;
        }
        .hv-nav-btn-outline {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.5rem 0.8rem;
          border-radius: 6px;
          background-color: transparent;
          color: #5b616b;
          border: 1px solid #e6e6e1;
          font-size: 0.85rem;
          cursor: pointer;
          white-space: nowrap;
          transition: background-color 0.15s ease;
        }
        .hv-nav-btn-outline:hover {
          background-color: #f7f7f5;
        }
        @media (max-width: 640px) {
          .hv-nav-header {
            padding: 0.65rem 0.85rem;
          }
          .hv-nav-brand {
            gap: 0.45rem;
          }
          .hv-nav-logo {
            width: 32px;
            height: 32px;
          }
          .hv-nav-brand-text {
            font-size: 1.12rem;
          }
          .hv-nav-actions {
            gap: 0.35rem;
          }
          .hv-nav-btn-primary {
            padding: 0.42rem 0.72rem;
            font-size: 0.82rem;
            gap: 0.3rem;
          }
          .hv-nav-btn-ghost {
            padding: 0.42rem 0.52rem;
            font-size: 0.82rem;
            gap: 0.25rem;
          }
          .hv-nav-btn-outline {
            padding: 0.42rem 0.52rem;
            font-size: 0.8rem;
            gap: 0.25rem;
          }
        }
      `}</style>
      <header className="hv-nav-header">
        {/* Brand */}
        <Link to="/" className="hv-nav-brand">
          <img src={harvestLogo} alt="Harvest AI logo" className="hv-nav-logo" />
          <span className="hv-nav-brand-text">Harvest</span>
        </Link>

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
              <Link to="/login" className="hv-nav-btn-ghost">
                <LogIn size={14} />
                <span>Sign In</span>
              </Link>
              <Link to="/register" className="hv-nav-btn-primary">
                <span>Get Started</span>
              </Link>
            </>
          )}
        </div>
      </header>
    </>
  );
}
