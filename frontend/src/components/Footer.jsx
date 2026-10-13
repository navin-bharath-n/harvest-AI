import React from 'react';
import { Link } from 'react-router-dom';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <>
      <style>{`
        .hv-footer {
          background-color: #ffffff;
          border-top: 1px solid #e6e6e1;
          padding: 2.5rem 1.5rem;
          margin-top: auto;
          width: 100%;
          box-sizing: border-box;
        }
        .hv-footer-inner {
          max-width: 960px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.25rem;
          text-align: center;
        }
        .hv-footer-links {
          display: flex;
          align-items: center;
          gap: 1.75rem;
          flex-wrap: wrap;
          justify-content: center;
        }
        .hv-footer-link {
          color: #5b616b;
          text-decoration: none;
          font-size: 0.88rem;
          font-weight: 500;
          transition: color 0.15s ease;
        }
        .hv-footer-link:hover {
          color: #16181d;
        }
        .hv-footer-copy {
          margin: 0;
          font-size: 0.825rem;
          color: #7a808a;
        }
        @media (max-width: 640px) {
          .hv-footer {
            padding: 2rem 1rem;
          }
          .hv-footer-inner {
            gap: 1rem;
          }
          .hv-footer-links {
            gap: 0.75rem 1.25rem;
          }
          .hv-footer-link {
            font-size: 0.84rem;
          }
          .hv-footer-copy {
            font-size: 0.78rem;
          }
        }
      `}</style>
      <footer className="hv-footer">
        <div className="hv-footer-inner">
          <div className="hv-footer-links">
            <Link to="/studio" className="hv-footer-link">
              Studio
            </Link>
            <Link to="/privacy" className="hv-footer-link">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hv-footer-link">
              Terms of Service
            </Link>
            <Link to="/cookies" className="hv-footer-link">
              Cookie Policy
            </Link>
          </div>

          <p className="hv-footer-copy">
            &copy; {currentYear} Harvest. All rights reserved.
          </p>
        </div>
      </footer>
    </>
  );
}
