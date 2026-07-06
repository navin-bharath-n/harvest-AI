import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import DashboardPage from './DashboardPage';

export default {
  title: 'Pages/DashboardPage',
  component: DashboardPage,
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
