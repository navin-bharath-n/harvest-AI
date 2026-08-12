import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import DashboardPage from './components/DashboardPage';
import ProjectDetailPage from './components/ProjectDetailPage';
import VideoProcessingPage from './components/VideoProcessingPage';
import MasterGeneratorPage from './components/MasterGeneratorPage';
import { GenerationProvider } from './context/GenerationContext';
import FloatingGenerationWidget from './components/FloatingGenerationWidget';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <GenerationProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/project/:projectId" element={<ProjectDetailPage />} />
          <Route path="/video/:videoId" element={<VideoProcessingPage />} />
          <Route path="/master-generator/:videoId" element={<MasterGeneratorPage />} />
        </Routes>
        <FloatingGenerationWidget />
      </GenerationProvider>
    </BrowserRouter>
  );
}

export default App;
