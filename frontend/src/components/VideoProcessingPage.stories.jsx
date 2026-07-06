import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import VideoProcessingPage from './VideoProcessingPage';

export default {
  title: 'Pages/VideoProcessingPage',
  component: VideoProcessingPage,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <BrowserRouter>
        <Routes>
          {/* Providing a mock parameter so useParams doesn't crash if it expects an ID */}
          <Route path="*" element={<Story />} />
        </Routes>
      </BrowserRouter>
    ),
  ],
};

export const Default = {};
