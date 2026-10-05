import React from 'react';
import { Link } from 'react-router-dom';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      style={{
        backgroundColor: '#ffffff',
        borderTop: '1px solid #e6e6e1',
        padding: '2.5rem 1.5rem',
        marginTop: 'auto',
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.25rem',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1.75rem',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          <Link
            to="/studio"
            style={{ color: '#5b616b', textDecoration: 'none', fontSize: '0.88rem', fontWeight: 500 }}
          >
            Studio
          </Link>
          <Link
            to="/privacy"
            style={{ color: '#5b616b', textDecoration: 'none', fontSize: '0.88rem', fontWeight: 500 }}
          >
            Privacy Policy
          </Link>
          <Link
            to="/terms"
            style={{ color: '#5b616b', textDecoration: 'none', fontSize: '0.88rem', fontWeight: 500 }}
          >
            Terms of Service
          </Link>
          <Link
            to="/cookies"
            style={{ color: '#5b616b', textDecoration: 'none', fontSize: '0.88rem', fontWeight: 500 }}
          >
            Cookie Policy
          </Link>
        </div>

        <p
          style={{
            margin: 0,
            fontSize: '0.825rem',
            color: '#7a808a',
          }}
        >
          &copy; {currentYear} Harvest. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
