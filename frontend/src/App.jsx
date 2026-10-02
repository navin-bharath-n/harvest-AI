import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import DashboardPage from './components/DashboardPage';
import ProjectDetailPage from './components/ProjectDetailPage';
import VideoProcessingPage from './components/VideoProcessingPage';
import { GenerationProvider } from './context/GenerationContext';
import { AuthProvider } from './context/AuthContext';
import AuthModal from './components/AuthModal';
import ProtectedRoute from './components/ProtectedRoute';
import FloatingGenerationWidget from './components/FloatingGenerationWidget';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <GenerationProvider>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/project/:projectId" element={<ProtectedRoute><ProjectDetailPage /></ProtectedRoute>} />
            <Route path="/video/:videoId" element={<ProtectedRoute><VideoProcessingPage /></ProtectedRoute>} />
            <Route path="/master-generator/:videoId" element={<ProtectedRoute><VideoProcessingPage /></ProtectedRoute>} />
          </Routes>
          <FloatingGenerationWidget />
          <AuthModal />
        </GenerationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
