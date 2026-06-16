import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import DashboardPage from './components/DashboardPage';
import ProjectDetailPage from './components/ProjectDetailPage';
import VideoProcessingPage from './components/VideoProcessingPage';
import MasterGeneratorPage from './components/MasterGeneratorPage';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/project/:projectId" element={<ProjectDetailPage />} />
        <Route path="/video/:videoId" element={<VideoProcessingPage />} />
        <Route path="/master-generator/:videoId" element={<MasterGeneratorPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
