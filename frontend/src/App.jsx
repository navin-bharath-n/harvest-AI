import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GenerationProvider } from './context/GenerationContext';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import './index.css';

// Streamlined lazy-loaded routes
const HomePage = lazy(() => import('./components/HomePage'));
const LoginPage = lazy(() => import('./components/LoginPage'));
const RegisterPage = lazy(() => import('./components/RegisterPage'));
const StudioPage = lazy(() => import('./components/StudioPage'));
const SocialPublishPage = lazy(() => import('./components/SocialPublishPage'));
const PrivacyPolicyPage = lazy(() => import('./components/PrivacyPolicyPage'));
const TermsPage = lazy(() => import('./components/TermsPage'));
const CookiePolicyPage = lazy(() => import('./components/CookiePolicyPage'));
const NotFoundPage = lazy(() => import('./components/NotFoundPage'));
const CookieConsentBanner = lazy(() => import('./components/CookieConsentBanner'));

function PageFallback() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ffffff',
        color: '#5b616b',
        gap: '1rem',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          border: '3px solid #e6e6e1',
          borderTopColor: '#1f6f4a',
          animation: 'spin 0.7s linear infinite',
        }}
      />
      <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#16181d' }}>
        Loading Harvest…
      </span>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <GenerationProvider>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              {/* Public Marketing & Auth */}
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />

              {/* Core Studio Workspace */}
              <Route
                path="/studio"
                element={
                  <ProtectedRoute>
                    <StudioPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <StudioPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/studio/:projectId"
                element={
                  <ProtectedRoute>
                    <StudioPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/publish"
                element={
                  <ProtectedRoute>
                    <SocialPublishPage />
                  </ProtectedRoute>
                }
              />

              {/* Legacy route redirects to studio */}
              <Route path="/project/:projectId" element={<Navigate to="/studio" replace />} />
              <Route path="/video/:videoId" element={<Navigate to="/studio" replace />} />
              <Route path="/master-generator/:videoId" element={<Navigate to="/studio" replace />} />

              {/* Legal & Policy Pages */}
              <Route path="/privacy" element={<PrivacyPolicyPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/cookies" element={<CookiePolicyPage />} />

              {/* 404 Not Found */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>

          <Suspense fallback={null}>
            <CookieConsentBanner />
          </Suspense>
        </GenerationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
