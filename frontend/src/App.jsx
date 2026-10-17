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
const PricingPage = lazy(() => import('./components/PricingPage'));
const VideoCheckPage = lazy(() => import('./components/VideoCheckPage'));
const GrowthDashboardPage = lazy(() => import('./components/GrowthDashboardPage'));
const ContentCalendarPage = lazy(() => import('./components/ContentCalendarPage'));
const SmartLinkRedirectPage = lazy(() => import('./components/SmartLinkRedirectPage'));
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
        backgroundColor: '#0D0E16',
        color: '#C9CBDD',
        gap: '1rem',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          border: '3px solid #2E3150',
          borderTopColor: '#3DD6C6',
          animation: 'spin 0.7s linear infinite',
        }}
      />
      <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#F4F2EE' }}>
        Loading Encore…
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
              {/* Public Marketing & Growth */}
              <Route path="/" element={<HomePage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/rooms" element={<PricingPage />} />
              <Route path="/check" element={<VideoCheckPage />} />
              <Route path="/video-check" element={<VideoCheckPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />

              {/* Core Studio & Creator Growth Workspaces */}
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
                    <GrowthDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/growth"
                element={
                  <ProtectedRoute>
                    <GrowthDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/insights"
                element={
                  <ProtectedRoute>
                    <GrowthDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/calendar"
                element={
                  <ProtectedRoute>
                    <ContentCalendarPage />
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

              {/* Smart Link & Dynamic Tracked QR Redirection */}
              <Route path="/r/:slug" element={<SmartLinkRedirectPage />} />
              <Route path="/smart-link/:slug" element={<SmartLinkRedirectPage />} />

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
