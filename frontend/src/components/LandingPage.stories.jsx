import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import LandingPage from './LandingPage';

export default {
  title: 'Pages/LandingPage',
  component: LandingPage,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <BrowserRouter>
        <Story />
      </BrowserRouter>
    ),
  ],
};

export const Default = {};
