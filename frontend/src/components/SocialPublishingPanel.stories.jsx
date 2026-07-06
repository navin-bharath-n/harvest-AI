import React from 'react';
import { fireEvent, within, fn, waitFor } from 'storybook/test';
import { expect, vi } from 'vitest';
import SocialPublishingPanel from './SocialPublishingPanel';
import { api } from '../api/client';

// Keep original API methods to restore them
const originalApi = { ...api };

// Decorator to reset and setup mocks
const mockApiDecorator = (setupMocks) => (Story) => {
  // Restore all original methods first
  Object.keys(originalApi).forEach(key => {
    api[key] = originalApi[key];
  });
  // Apply the custom mocks for this story
  Object.keys(setupMocks).forEach(key => {
    api[key] = setupMocks[key];
  });
  return <Story />;
};

export default {
  title: 'Components/SocialPublishingPanel',
  component: SocialPublishingPanel,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
  args: {
    clip: {
      id: 1,
      title: 'Amazing Highlight Clip',
      duration: 45.5,
    },
    onClose: fn(),
  },
};

export const Default = {
  decorators: [
    mockApiDecorator({
      getUserConnections: vi.fn().mockResolvedValue([]),
    })
  ],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    // Verify initially all platforms show Not Connected
    expect(canvas.getByText('YouTube Shorts')).toBeInTheDocument();
    
    // Check for "Not Connected" badges
    const notConnectedBadges = canvas.getAllByText('Not Connected');
    expect(notConnectedBadges.length).toBe(3);

    // Mock window.open and window.alert
    const originalWindowOpen = window.open;
    const originalAlert = window.alert;
    const mockPopup = { closed: false, close: vi.fn() };
    window.open = vi.fn().mockReturnValue(mockPopup);
    window.alert = vi.fn();

    try {
      // 1. Test failed connection popup
      const connectButtons = canvas.getAllByRole('button', { name: 'Connect' });
      fireEvent.click(connectButtons[0]); // Connect Youtube

      expect(window.open).toHaveBeenCalledWith(
        expect.stringContaining('/users/auth/youtube/login'),
        'Connect youtube',
        expect.any(String)
      );

      // Dispatch HARVEST_AUTH_FAILURE event to trigger auth failure block
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'HARVEST_AUTH_FAILURE', error: 'OAuth cancelled' }
      }));

      expect(window.alert).toHaveBeenCalledWith('Authentication failed: OAuth cancelled');

      // 2. Test successful connection popup
      // Setup mock connections return to resolve with connected YouTube platform
      api.getUserConnections = vi.fn().mockResolvedValue([
        { platform: 'youtube', account_name: 'Mock YouTube Channel', account_handle: '@mockyt', credentials: { token: 'yt123' } }
      ]);

      fireEvent.click(connectButtons[0]); // Connect Youtube again

      // Dispatch HARVEST_AUTH_SUCCESS event to trigger auth success block
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'HARVEST_AUTH_SUCCESS', platform: 'youtube' }
      }));

      // Verify connection success updates UI
      const connectedLabel = await canvas.findByText('Connected: Mock YouTube Channel');
      expect(connectedLabel).toBeInTheDocument();

    } finally {
      window.open = originalWindowOpen;
      window.alert = originalAlert;
    }
  }
};

export const WithConnections = {
  args: {
    clip: {
      id: 2,
      title: 'Gameplay Highlight',
      duration: 30.0,
    },
    onClose: fn(),
  },
  decorators: [
    mockApiDecorator({
      getUserConnections: vi.fn().mockResolvedValue([
        { platform: 'youtube', account_name: 'Mock YouTube', account_handle: '@mockyt', credentials: { token: 'yt123' } },
        { platform: 'facebook', account_name: 'Mock Facebook', account_handle: 'mockfb' }
      ]),
      deleteUserConnection: vi.fn().mockResolvedValue({ status: 'success' }),
      publishClip: vi.fn().mockResolvedValue({ task_id: 'task-123' }),
      getClip: vi.fn().mockResolvedValue({
        id: 2,
        published_urls: {}
      })
    })
  ],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    console.log('[Test] Verify initial connections...');
    // Verify initial connections loaded
    const connectedLabel = await canvas.findByText('Connected: Mock YouTube');
    expect(connectedLabel).toBeInTheDocument();
    expect(canvas.getByText('Connected: Mock Facebook')).toBeInTheDocument();
    expect(canvas.getByText('Not Connected')).toBeInTheDocument(); // Instagram

    // Test hover on unconnected platform row (covers lines 386-389)
    const instagramLabel = canvas.getByText('Instagram Reels');
    const instagramRow = instagramLabel.parentElement?.parentElement?.parentElement;
    if (instagramRow) {
      fireEvent.mouseEnter(instagramRow);
      fireEvent.mouseOver(instagramRow);
      fireEvent.mouseLeave(instagramRow);
      fireEvent.mouseOut(instagramRow);
    }

    // Test hover on connected and selected platform row (covers else branch of lines 386-389)
    const youtubeRow = canvas.getByText('YouTube Shorts').parentElement?.parentElement?.parentElement;
    if (youtubeRow) {
      fireEvent.mouseEnter(youtubeRow);
      fireEvent.mouseOver(youtubeRow);
      fireEvent.mouseLeave(youtubeRow);
      fireEvent.mouseOut(youtubeRow);
    }

    // Test text area and title change
    const titleInput = canvas.getByPlaceholderText('e.g. Crazy Gaming Clip! #shorts');
    fireEvent.change(titleInput, { target: { value: 'New Epic Title' } });

    const descTextarea = canvas.getByPlaceholderText('Enter caption or post text...');
    fireEvent.change(descTextarea, { target: { value: 'Epic gameplay highlight!' } });

    // Test dropdown selection
    const selectElement = canvasElement.querySelector('select');
    if (selectElement) {
      fireEvent.change(selectElement, { target: { value: 'unlisted' } });
    }

    // Test disconnect platform
    const disconnectButtons = canvas.getAllByRole('button', { name: 'Disconnect' });
    fireEvent.click(disconnectButtons[1]); // Disconnect Facebook

    expect(api.deleteUserConnection).toHaveBeenCalledWith(1, 'facebook');
    
    // Wait for the UI state update to render the new "Not Connected" badge for Facebook
    await waitFor(() => {
      const notConnectedBadges = canvas.getAllByText('Not Connected');
      expect(notConnectedBadges.length).toBe(2); // Instagram & Facebook now not connected
    });

    // Test selection toggles
    const youtubeLabel = canvas.getByText('YouTube Shorts');
    // Toggle YouTube selection off
    fireEvent.click(youtubeLabel);

    // Try to publish with nothing selected (since Youtube is off and Facebook/Instagram not connected)
    const originalAlert = window.alert;
    window.alert = vi.fn();
    try {
      const publishButton = canvas.getByRole('button', { name: 'Publish Selected Platforms' });
      fireEvent.click(publishButton);
      expect(window.alert).toHaveBeenCalledWith('Please select at least one connected social platform to publish to.');
    } finally {
      window.alert = originalAlert;
    }

    // Toggle youtube back on
    fireEvent.click(youtubeLabel);

    // Mock window.open to connect Instagram dynamically
    const originalWindowOpen = window.open;
    const mockPopup = { closed: false, close: vi.fn() };
    window.open = vi.fn().mockReturnValue(mockPopup);

    try {
      // Setup mock connections return to include YouTube, Instagram, and unsupported TikTok
      api.getUserConnections = vi.fn().mockResolvedValue([
        { platform: 'youtube', account_name: 'Mock YouTube', account_handle: '@mockyt', credentials: { token: 'yt123' } },
        { platform: 'instagram', account_name: 'Mock Instagram', account_handle: 'mockinst' },
        { platform: 'tiktok', account_name: 'Mock TikTok', account_handle: '@mocktt' } // Unsupported platform
      ]);

      const connectButtons = canvas.getAllByRole('button', { name: 'Connect' });
      fireEvent.click(connectButtons[1]); // Connect Instagram (second connect button in list)

      // Dispatch HARVEST_AUTH_SUCCESS event for Instagram connection
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'HARVEST_AUTH_SUCCESS', platform: 'instagram' }
      }));

      // Verify Instagram and YouTube are now connected
      await waitFor(() => {
        expect(canvas.getByText('Connected: Mock Instagram')).toBeInTheDocument();
      });

    } finally {
      window.open = originalWindowOpen;
    }

    console.log('[Test] Intercept setInterval for first publishing flow...');
    // Intercept setInterval and clearInterval globally, filtering for component specific delays (3000/2000)
    // to avoid overriding Vitest runner's internal timing execution hooks.
    const originalSetInterval = window.setInterval;
    const originalClearInterval = window.clearInterval;
    let intervalCallback = null;
    
    window.setInterval = vi.fn().mockImplementation((callback, delay) => {
      console.log(`[Mock setInterval] delay=${delay}`);
      if (delay === 3000 || delay === 2000) {
        intervalCallback = callback;
        return 999;
      }
      return originalSetInterval(callback, delay);
    });
    window.clearInterval = vi.fn().mockImplementation((id) => {
      console.log(`[Mock clearInterval] id=${id}`);
      if (id === 999) return;
      return originalClearInterval(id);
    });

    try {
      // Mock getClip for polling stages (includes testing the catch error block for lines 299-301)
      let getClipCallCount = 0;
      api.getClip = vi.fn().mockImplementation(async (clipId) => {
        console.log(`[Mock getClip] callCount=${getClipCallCount + 1}`);
        getClipCallCount++;
        if (getClipCallCount === 1) {
          throw new Error('Database polling failed'); // Trigger catch block in interval polling
        }
        if (getClipCallCount === 2) {
          return {
            id: clipId,
            published_urls: {
              youtube: 'https://youtube.com/shorts/awesome123',
              tiktok: 'error:TikTok publishing failed'
            }
          }; // Poll 2: youtube done, tiktok failed, instagram still running
        }
        return {
          id: clipId,
          published_urls: {
            youtube: 'https://youtube.com/shorts/awesome123',
            instagram: 'https://instagram.com/reels/awesome123',
            tiktok: 'error:TikTok publishing failed'
          }
        }; // Poll 3: completed successfully
      });

      const publishButton = canvas.getByRole('button', { name: 'Publish Selected Platforms' });
      console.log('[Test] Triggering first successful publish click...');
      fireEvent.click(publishButton);

      // Verify publish API was called with youtube, instagram, and unsupported tiktok platform
      expect(api.publishClip).toHaveBeenCalledWith(
        2,
        ['youtube', 'instagram', 'tiktok'],
        'New Epic Title',
        'Epic gameplay highlight!',
        'unlisted',
        expect.any(Object)
      );

      // Verify loader is showing
      const progressLabel = await canvas.findByText('Publishing in Progress');
      expect(progressLabel).toBeInTheDocument();

      // Trigger the captured setInterval callback manually
      expect(intervalCallback).toBeDefined();
      console.log('[Test] Manually invoking interval polling callbacks...');
      await intervalCallback(); // Trigger poll 1 (throws and triggers lines 299-301)
      await intervalCallback(); // Trigger poll 2 (youtube done, tiktok failed, instagram running)
      
      // Wait for UI to update and verify the statuses in the progress list
      await waitFor(() => {
        expect(canvas.getByText('Done')).toBeInTheDocument();
        expect(canvas.getByText('Failed')).toBeInTheDocument();
      });

      await intervalCallback(); // Trigger poll 3 (success)

      // Verify success screen is showing
      const successLabel = await canvas.findByText('Publication Success!');
      expect(successLabel).toBeInTheDocument();
      
      // Test link hover styles (covers lines 602-603)
      const viewLinkLabel = canvas.getByText('View on YouTube Shorts');
      const viewLink = viewLinkLabel.parentElement?.parentElement;
      if (viewLink) {
        fireEvent.mouseEnter(viewLink);
        fireEvent.mouseOver(viewLink);
        fireEvent.mouseLeave(viewLink);
        fireEvent.mouseOut(viewLink);
      }

      // Test "Publish Again" button
      const publishAgainButton = canvas.getByRole('button', { name: 'Publish Again' });
      fireEvent.click(publishAgainButton);

      // Verify we are back to the main form screen
      const formButton = await canvas.findByRole('button', { name: 'Publish Selected Platforms' });
      expect(formButton).toBeInTheDocument();

      console.log('[Test] Triggering offline error publishing flow...');
      // 1. Test handlePublish error catch block (lines 304-308)
      api.publishClip = vi.fn().mockRejectedValue(new Error('Publish Server Offline'));
      const originalAlert = window.alert;
      window.alert = vi.fn();
      
      try {
        fireEvent.click(formButton);
        await waitFor(() => {
          expect(window.alert).toHaveBeenCalledWith('Publishing failed: Publish Server Offline');
        });
      } finally {
        window.alert = originalAlert;
      }

      // Wait for the loader to disappear, indicating that the offline error state transition has fully updated the DOM
      await waitFor(() => {
        expect(canvas.queryByText('Publishing in Progress')).not.toBeInTheDocument();
      });

      // Get the fresh active button from the reset form
      const formButtonFailureFlow = canvas.getByRole('button', { name: 'Publish Selected Platforms' });
      console.log('[Test] Retrieved fresh form button.');

      // 2. Test publishing complete failure (lines 295-297)
      api.publishClip = vi.fn().mockResolvedValue({ task_id: 'task-fail' });
      api.getClip = vi.fn().mockResolvedValue({
        id: 2,
        published_urls: {
          youtube: 'error:Insufficient API quota',
          instagram: 'error:Insufficient API quota',
          tiktok: 'error:Insufficient API quota'
        }
      });
      
      window.alert = vi.fn();

      try {
        console.log('[Test] Triggering complete failure publishing flow click...');
        // Click to publish again
        fireEvent.click(formButtonFailureFlow);
        
        console.log('[Test] Waiting for setInterval to be called 2 times...');
        await waitFor(() => {
          console.log(`[Test] setInterval call count check: ${window.setInterval.mock.calls.length}`);
          const componentCalls = window.setInterval.mock.calls.filter(c => c[1] === 3000 || c[1] === 2000);
          expect(componentCalls.length).toBe(2);
        });

        // Execute polling interval callback
        console.log('[Test] Invoking failure polling callback...');
        await intervalCallback();
        await waitFor(() => {
          expect(window.alert).toHaveBeenCalledWith('All social publishing requests failed. Please check the connection credentials and try again.');
        });
      } finally {
        window.alert = originalAlert;
      }

      // Restore api.publishClip for general test execution
      api.publishClip = vi.fn().mockResolvedValue({ task_id: 'task-123' });

      // Test close button click
      const closeButton = canvasElement.querySelector('svg.lucide-x')?.closest('button');
      if (closeButton) {
        fireEvent.click(closeButton);
        expect(args.onClose).toHaveBeenCalled();
      }

    } finally {
      window.setInterval = originalSetInterval;
      window.clearInterval = originalClearInterval;
    }
  }
};

export const EdgeCases = {
  args: {
    clip: {
      id: 3,
      title: 'Edge Case Clip',
      duration: 15.0,
    },
    onClose: fn(),
  },
  decorators: [
    mockApiDecorator({
      getUserConnections: vi.fn().mockResolvedValue([
        { platform: 'youtube', account_name: 'Mock YouTube', account_handle: '@mockyt', credentials: { token: 'yt123' } }
      ]),
      deleteUserConnection: vi.fn().mockResolvedValue({ status: 'success' }),
      publishClip: vi.fn().mockResolvedValue({ task_id: 'task-edge' }),
      getClip: vi.fn().mockResolvedValue({ id: 3, published_urls: {} })
    })
  ],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    // Spy on window.alert to intercept calls and prevent thread-blocking dialogs
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    try {
      // 1. Test Disconnect DB error (Lines 174-177)
      api.deleteUserConnection = vi.fn().mockRejectedValue(new Error('Delete connection failed'));

      const disconnectButtons = canvas.getAllByRole('button', { name: 'Disconnect' });
      fireEvent.click(disconnectButtons[0]); // Disconnect Youtube

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Failed to disconnect from database.');
      });
      
      // Restore deleteUserConnection mock and clear alert spy calls
      api.deleteUserConnection = vi.fn().mockResolvedValue({ status: 'success' });
      alertSpy.mockClear();

      // 2. Test Popup Blocker error (Line 90) and 3. Row container click on unconnected platform (Lines 182-183)
      const originalWindowOpen = window.open;
      window.open = vi.fn().mockReturnValue(null); // Simulate popup blocker

      const instagramLabel = canvas.getByText('Instagram Reels');
      const instagramRow = instagramLabel.parentElement?.parentElement?.parentElement;
      
      if (instagramRow) {
        fireEvent.click(instagramRow); // triggers togglePlatformSelection -> handleConnect
      }

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Please disable your popup blocker to log in.');
      });
      window.open = originalWindowOpen;
      alertSpy.mockClear();

      // 4. Test Live Login Sync error (Lines 115-117)
      window.open = vi.fn().mockReturnValue({ closed: false, close: vi.fn() });
      api.getUserConnections = vi.fn().mockRejectedValue(new Error('Sync failed'));

      const facebookLabel = canvas.getByText('Facebook Reels');
      const facebookRow = facebookLabel.parentElement?.parentElement?.parentElement;
      if (facebookRow) {
        fireEvent.click(facebookRow); // Triggers handleConnect for Facebook
      }

      // Dispatch auth success message event
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'HARVEST_AUTH_SUCCESS', platform: 'facebook' }
      }));

      // Expect api.getUserConnections to have been called
      expect(api.getUserConnections).toHaveBeenCalled();
      window.open = originalWindowOpen;

      // 5. Test Popup Close error (Lines 154-156)
      const mockPopupWithError = {
        closed: false,
        close: vi.fn().mockImplementation(() => {
          throw new Error('Popup close failed');
        })
      };
      window.open = vi.fn().mockReturnValue(mockPopupWithError);
      
      // Make getUserConnections succeed this time
      api.getUserConnections = vi.fn().mockResolvedValue([
        { platform: 'youtube', account_name: 'Mock YouTube', account_handle: '@mockyt', credentials: { token: 'yt123' } },
        { platform: 'facebook', account_name: 'Mock Facebook', account_handle: 'mockfb', credentials: { token: 'fb123' } }
      ]);

      if (facebookRow) {
        fireEvent.click(facebookRow); // Triggers handleConnect for Facebook
      }

      // Dispatch auth success message event
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'HARVEST_AUTH_SUCCESS', platform: 'facebook' }
      }));

      // Verify connection success updates UI to show Facebook connected
      await waitFor(() => {
        expect(canvas.getByText('Connected: Mock Facebook')).toBeInTheDocument();
      });
      window.dispatchEvent(new MessageEvent('message', { data: null })); // Cover line 119 null data check
      window.open = originalWindowOpen;

      // 6. Test Polling interval fallback tests (Lines 130-162)
      console.log('[Test] Triggering polling interval fallback tests...');
      const originalSetInterval = window.setInterval;
      const originalClearInterval = window.clearInterval;
      let pollIntervalCallback = null;
      
      window.setInterval = vi.fn().mockImplementation((callback, delay) => {
        if (delay === 2000) {
          pollIntervalCallback = callback;
          return 888;
        }
        return originalSetInterval(callback, delay);
      });
      window.clearInterval = vi.fn().mockImplementation((id) => {
        if (id === 888) return;
        return originalClearInterval(id);
      });

      try {
        const mockPopup = { closed: false, close: vi.fn() };
        window.open = vi.fn().mockReturnValue(mockPopup);

        // Subtest 6a: Polling error catch block (Lines 159-161)
        api.getUserConnections = vi.fn().mockRejectedValue(new Error('Polling DB failed'));

        if (instagramRow) {
          fireEvent.click(instagramRow); // triggers handleConnect -> setInterval(..., 2000)
        }

        await waitFor(() => {
          expect(pollIntervalCallback).not.toBeNull();
        });

        // Run interval callback once to trigger DB polling catch block
        await pollIntervalCallback();

        // Subtest 6b: popup.closed is true (Lines 130-133)
        mockPopup.closed = true;
        await pollIntervalCallback();
        mockPopup.closed = false; // Reset

        // Subtest 6b2: connection not found (Line 137 falsy branch)
        api.getUserConnections = vi.fn().mockResolvedValue([
          { platform: 'youtube', account_name: 'Mock YouTube', account_handle: '@mockyt', credentials: { token: 'yt123' } }
        ]);
        await pollIntervalCallback();

        // Subtest 6c: Successful DB polling connection (Lines 134-158)
        api.getUserConnections = vi.fn().mockResolvedValue([
          { platform: 'youtube', account_name: 'Mock YouTube', account_handle: '@mockyt', credentials: { token: 'yt123' } },
          { platform: 'facebook', account_name: 'Mock Facebook', account_handle: 'mockfb', credentials: { token: 'fb123' } },
          { platform: 'instagram', account_name: 'Mock Instagram', account_handle: 'mockinst' }
        ]);

        // Mock popup.close to throw an error to cover line 155
        mockPopup.close = vi.fn().mockImplementation(() => {
          throw new Error('Popup close failed');
        });

        await pollIntervalCallback();

        // Verify connection success updates UI to show Instagram connected
        await waitFor(() => {
          expect(canvas.getByText('Connected: Mock Instagram')).toBeInTheDocument();
        });
        expect(mockPopup.close).toHaveBeenCalled();

      } finally {
        window.open = originalWindowOpen;
        window.setInterval = originalSetInterval;
        window.clearInterval = originalClearInterval;
      }

      // 7. Test Publishing Timeout (Lines 244-247)
      console.log('[Test] Triggering publishing timeout flow...');
      const originalSetIntervalPub = window.setInterval;
      const originalClearIntervalPub = window.clearInterval;
      let publishIntervalCallback = null;
      
      window.setInterval = vi.fn().mockImplementation((callback, delay) => {
        if (delay === 3000 || delay === 2000) {
          publishIntervalCallback = callback;
          return 999;
        }
        return originalSetIntervalPub(callback, delay);
      });
      window.clearInterval = vi.fn().mockImplementation((id) => {
        if (id === 999) return;
        return originalClearIntervalPub(id);
      });

      try {
        api.publishClip = vi.fn().mockResolvedValue({ task_id: 'task-timeout' });
        api.getClip = vi.fn().mockResolvedValue({ id: 3, published_urls: {} }); // keeps processing

        const publishButton = canvas.getByRole('button', { name: 'Publish Selected Platforms' });
        fireEvent.click(publishButton);

        // Wait for setInterval to register the callback
        await waitFor(() => {
          expect(publishIntervalCallback).not.toBeNull();
        });
        
        alertSpy.mockClear();

        // Trigger the publishIntervalCallback 100 times to hit maxAttempts timeout
        for (let i = 0; i < 100; i++) {
          await publishIntervalCallback();
        }

        await waitFor(() => {
          expect(alertSpy).toHaveBeenCalledWith('Publishing timed out on the backend server.');
        });
        expect(canvas.queryByText('Publishing in Progress')).not.toBeInTheDocument();
      } finally {
        window.setInterval = originalSetIntervalPub;
        window.clearInterval = originalClearIntervalPub;
      }
    } finally {
      alertSpy.mockRestore();
    }
  }
};

export const MountError = {
  args: {
    clip: {
      id: 4,
      duration: 10.0,
    },
    onClose: fn(),
  },
  decorators: [
    mockApiDecorator({
      getUserConnections: vi.fn().mockRejectedValue(new Error('Initial load connection failed'))
    })
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Verify that it renders correctly even with the connection load error
    expect(canvas.getByText('YouTube Shorts')).toBeInTheDocument();
  }
};


