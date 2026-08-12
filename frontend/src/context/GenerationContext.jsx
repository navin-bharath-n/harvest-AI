import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';

const GenerationContext = createContext(null);

const STORAGE_KEY = 'harvest_active_generations';

export function GenerationProvider({ children }) {
  const [activeTasks, setActiveTasks] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [completedTasks, setCompletedTasks] = useState([]);
  const activeTasksRef = useRef(activeTasks);
  activeTasksRef.current = activeTasks;

  // Persist active tasks to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(activeTasks));
    } catch (e) {
      console.warn('Failed to save active generations to localStorage', e);
    }
  }, [activeTasks]);

  // Start tracking a newly launched video generation task
  const startTracking = useCallback((videoId, videoTitle) => {
    setActiveTasks(prev => {
      const exists = prev.find(t => t.videoId === Number(videoId));
      if (exists) {
        return prev.map(t => t.videoId === Number(videoId) ? {
          ...t,
          videoTitle: videoTitle || t.videoTitle,
          stage: 'generating',
          stageLabel: 'Starting AI Master Agent...',
          variationsReady: 0,
          variationsTotal: 5,
          startedAt: Date.now()
        } : t);
      }
      return [...prev, {
        videoId: Number(videoId),
        videoTitle: videoTitle || `Video #${videoId}`,
        stage: 'generating',
        stageLabel: 'Starting AI Master Agent...',
        variationsReady: 0,
        variationsTotal: 5,
        startedAt: Date.now()
      }];
    });
  }, []);

  // Start tracking multiple videos in batch
  const startTrackingBatch = useCallback((videosList) => {
    setActiveTasks(prev => {
      let next = [...prev];
      for (const item of videosList) {
        const vid = Number(item.videoId);
        const idx = next.findIndex(t => t.videoId === vid);
        const taskObj = {
          videoId: vid,
          videoTitle: item.videoTitle || `Video #${vid}`,
          stage: 'generating',
          stageLabel: 'Starting AI Master Agent...',
          variationsReady: 0,
          variationsTotal: 5,
          startedAt: Date.now()
        };
        if (idx >= 0) {
          next[idx] = { ...next[idx], ...taskObj };
        } else {
          next.push(taskObj);
        }
      }
      return next;
    });
  }, []);

  // Stop tracking a specific video task
  const stopTracking = useCallback((videoId) => {
    setActiveTasks(prev => prev.filter(t => t.videoId !== Number(videoId)));
  }, []);

  // Cancel video generation task on the backend and remove from tracking immediately
  const cancelGeneration = useCallback(async (videoId) => {
    stopTracking(videoId);
    try {
      await api.cancelGeneration(videoId);
    } catch (e) {
      console.error(`Failed to cancel generation for video ${videoId}:`, e);
    }
  }, [stopTracking]);

  // Cancel ALL active video generation tasks across the system and clear tracking
  const cancelAllGenerations = useCallback(async () => {
    setActiveTasks([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    try {
      await api.cancelAllGenerations();
    } catch (e) {
      console.error('Failed to cancel all generations:', e);
    }
  }, []);

  // Dismiss completed task popup
  const dismissCompleted = useCallback((videoId) => {
    setCompletedTasks(prev => prev.filter(t => t.videoId !== Number(videoId)));
  }, []);

  // Background polling loop
  useEffect(() => {
    if (activeTasks.length === 0) return;

    const interval = setInterval(async () => {
      const currentTasks = activeTasksRef.current;
      if (currentTasks.length === 0) return;

      for (const task of currentTasks) {
        try {
          const status = await api.getVideoStatus(task.videoId);
          
          if (status.is_done || status.is_complete || (status.variations_ready >= 5)) {
            // Task is completed!
            setActiveTasks(prev => prev.filter(t => t.videoId !== task.videoId));
            setCompletedTasks(prev => {
              const alreadyNotified = prev.find(c => c.videoId === task.videoId);
              if (alreadyNotified) return prev;
              return [...prev, {
                videoId: task.videoId,
                videoTitle: status.original_filename || task.videoTitle,
                completedAt: Date.now()
              }];
            });
          } else if (status.video_status === 'failed' || (status.video_status === 'completed' && status.stage === 'idle' && (status.variations_ready || 0) === 0)) {
            // Task failed or is idle in DB (not generating)
            setActiveTasks(prev => prev.filter(t => t.videoId !== task.videoId));
          } else {
            // Update progress
            setActiveTasks(prev => prev.map(t => {
              if (t.videoId === task.videoId) {
                return {
                  ...t,
                  videoTitle: status.original_filename || t.videoTitle,
                  stage: status.stage || t.stage,
                  stageLabel: status.stage_label || t.stageLabel,
                  variationsReady: status.variations_ready || 0,
                  variationsTotal: status.variations_total || 5,
                  videoStatus: status.video_status
                };
              }
              return t;
            }));
          }
        } catch (err) {
          console.warn(`Background poll error for video ${task.videoId}:`, err);
        }
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [activeTasks.length]);

  return (
    <GenerationContext.Provider value={{
      activeTasks,
      completedTasks,
      startTracking,
      startTrackingBatch,
      stopTracking,
      cancelGeneration,
      cancelAllGenerations,
      dismissCompleted
    }}>
      {children}
    </GenerationContext.Provider>
  );
}

export function useGeneration() {
  const context = useContext(GenerationContext);
  if (!context) {
    throw new Error('useGeneration must be used within a GenerationProvider');
  }
  return context;
}
