import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Plus, UploadCloud, Video, Sparkles, Play,
  Download, LogOut, Scissors, RefreshCw, Wand2, Loader,
  CheckCircle2, Film, Clock, XCircle
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function StudioPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Projects State
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [projectModalError, setProjectModalError] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  // Videos & Active Pipeline State
  const [videos, setVideos] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [clips, setClips] = useState([]);
  const [selectedClip, setSelectedClip] = useState(null);
  const [clipPlaybackError, setClipPlaybackError] = useState(false);

  useEffect(() => {
    setClipPlaybackError(false);
  }, [selectedClip]);

  // Upload State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);

  // Pipeline Action State & Real-Time Analysis Report
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const pollIntervalRef = useRef(null);
  const timerIntervalRef = useRef(null);

  // Publishing State
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState('');

  const SERVER_URL = (import.meta.env.VITE_SERVER_URL || '').replace(/\/$/, '');

  // 1. Load Projects on Mount
  const loadProjects = useCallback(async () => {
    try {
      const data = await api.getProjects();
      setProjects(data || []);
      if (data && data.length > 0 && !activeProjectId) {
        setActiveProjectId(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
  }, [activeProjectId]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // 2. Load Videos when activeProjectId changes
  const loadVideos = useCallback(async () => {
    if (!activeProjectId) {
      setVideos([]);
      setSelectedVideo(null);
      return;
    }
    try {
      const allVideos = await api.getVideos(activeProjectId);
      setVideos(allVideos || []);
      if (allVideos && allVideos.length > 0) {
        setSelectedVideo((prev) => {
          if (prev) {
            const updated = allVideos.find((v) => v.id === prev.id);
            return updated || allVideos[0];
          }
          return allVideos[0];
        });
      } else {
        setSelectedVideo(null);
        setClips([]);
      }
    } catch (err) {
      console.error('Failed to load videos:', err);
    }
  }, [activeProjectId]);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  // 3. Load Clips when selectedVideo changes
  const loadClips = useCallback(async () => {
    if (!selectedVideo) {
      setClips([]);
      setSelectedClip(null);
      return;
    }
    try {
      // Load both clips and master variations
      const [clipList, varList] = await Promise.all([
        api.getClips(selectedVideo.id).catch(() => []),
        api.getVariations(selectedVideo.id).catch(() => []),
      ]);

      // Deduplicate by ID and priority
      const combined = [...(varList || []), ...(clipList || [])];
      const seen = new Set();
      const uniqueClips = [];
      for (const c of combined) {
        if (!seen.has(c.id)) {
          seen.add(c.id);
          uniqueClips.push(c);
        }
      }

      setClips(uniqueClips);
      if (uniqueClips.length > 0) {
        setSelectedClip((prev) => {
          if (prev) {
            const found = uniqueClips.find((c) => c.id === prev.id);
            return found || uniqueClips[0];
          }
          return uniqueClips[0];
        });
      } else {
        setSelectedClip(null);
      }
    } catch (err) {
      console.error('Failed to load clips:', err);
    }
  }, [selectedVideo]);

  useEffect(() => {
    loadClips();
  }, [loadClips]);

  // Clean up polling & timers on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  // Poll video status whenever an analysis is running or selectedVideo is processing
  const startStatusPolling = useCallback((videoId) => {
    if (!videoId) return;

    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

    setElapsedSeconds(0);
    setIsAnalyzing(true);
    setActionLoading(true);

    timerIntervalRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    const checkStatus = async () => {
      try {
        const statusData = await api.getVideoStatus(videoId);
        setPipelineStatus(statusData);

        // Fetch any ready clips
        await loadClips();

        const isDone = statusData?.is_done || statusData?.is_complete || (statusData?.variations_ready >= 5);
        const isFailed = statusData?.stage === 'failed' || statusData?.video_status === 'failed';

        if (isDone) {
          clearInterval(pollIntervalRef.current);
          clearInterval(timerIntervalRef.current);
          setIsAnalyzing(false);
          setActionLoading(false);
          setActionMessage('Master AI generation completed! 5 vertical shorts ready.');
          await loadVideos();
          await loadClips();
          setTimeout(() => setActionMessage(''), 5000);
        } else if (isFailed) {
          clearInterval(pollIntervalRef.current);
          clearInterval(timerIntervalRef.current);
          setIsAnalyzing(false);
          setActionLoading(false);
          setActionMessage(statusData?.stage_label || 'Generation failed. Please try again.');
          await loadVideos();
        }
      } catch (err) {
        console.error('Status check error:', err);
      }
    };

    // Run first check immediately, then every 1500ms
    checkStatus();
    pollIntervalRef.current = setInterval(checkStatus, 1500);
  }, [loadClips, loadVideos]);

  // If user selects a video that is currently processing in the background, attach polling automatically
  useEffect(() => {
    if (selectedVideo && (selectedVideo.status === 'processing' || selectedVideo.status === 'pending')) {
      startStatusPolling(selectedVideo.id);
    }
  }, [selectedVideo, startStatusPolling]);

  // Handle Video Upload: Immediately upload & automatically launch master generation pipeline!
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeProjectId) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadError('');

    try {
      const uploadedVideo = await api.uploadVideo(activeProjectId, file, (progressEvent) => {
        if (progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percent);
        }
      });

      // Reload project footage
      await loadVideos();

      if (uploadedVideo && uploadedVideo.id) {
        setSelectedVideo(uploadedVideo);
        // Automatically launch master generation pipeline & real-time report!
        handleRunMasterPipeline(uploadedVideo.id);
      }
    } catch (err) {
      console.error('Upload failed:', err);
      setUploadError(err.response?.data?.detail || 'Failed to upload video. Please try again.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Run Master Pipeline
  const handleRunMasterPipeline = async (targetVideoId = null) => {
    const vidId = targetVideoId || selectedVideo?.id;
    if (!vidId) return;

    setActionLoading(true);
    setIsAnalyzing(true);
    setActionMessage('Launching AI analysis and 9:16 vertical shorts pipeline…');

    try {
      await api.masterGenerate(vidId, {
        preset: 'viral_hook',
        caption_style: 'kinetic',
        aspect_ratio: '9:16',
      });
      // Start real-time analysis polling
      startStatusPolling(vidId);
    } catch (err) {
      console.error('Pipeline error:', err);
      setActionMessage('Master pipeline error: ' + (err.response?.data?.detail || err.message));
      setActionLoading(false);
      setIsAnalyzing(false);
    }
  };

  // Cancel generation
  const handleCancelGeneration = async () => {
    if (!selectedVideo) return;
    try {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      await api.cancelGeneration(selectedVideo.id);
      setIsAnalyzing(false);
      setActionLoading(false);
      setActionMessage('Generation cancelled.');
      await loadVideos();
    } catch (err) {
      console.error('Cancel error:', err);
    }
  };

  // Step Trigger: Transcribe
  const handleTranscribe = async () => {
    if (!selectedVideo) return;
    setActionLoading(true);
    setActionMessage('Transcribing audio via Whisper speech model…');
    try {
      await api.transcribeVideo(selectedVideo.id);
      await loadVideos();
      setActionMessage('Transcription complete.');
      setTimeout(() => setActionMessage(''), 4000);
    } catch (err) {
      console.error('Transcribe error:', err);
      setActionMessage('Transcription failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  // Step Trigger: Detect Highlights
  const handleDetectHighlights = async () => {
    if (!selectedVideo) return;
    setActionLoading(true);
    setActionMessage('Analyzing transcript for conversational focal points and viral hooks…');
    try {
      await api.detectHighlights(selectedVideo.id);
      await loadClips();
      setActionMessage('Hook detection complete.');
      setTimeout(() => setActionMessage(''), 4000);
    } catch (err) {
      console.error('Highlight detection error:', err);
      setActionMessage('Highlight detection failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  // Step Trigger: Smart Crop
  const handleSmartCrop = async () => {
    if (!selectedVideo) return;
    setActionLoading(true);
    setActionMessage('Tracking subjects and reframing to 9:16 vertical orientation…');
    try {
      await api.smartCrop(selectedVideo.id);
      await loadClips();
      setActionMessage('9:16 smart cropping complete.');
      setTimeout(() => setActionMessage(''), 4000);
    } catch (err) {
      console.error('Smart crop error:', err);
      setActionMessage('Smart crop failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  // Handle New Project Creation
  const handleCreateProject = async (e) => {
    e.preventDefault();
    const cleanTitle = newProjectName.trim();
    if (!cleanTitle) return;

    setIsCreatingProject(true);
    setProjectModalError('');

    try {
      const newProj = await api.createProject({
        title: cleanTitle,
        name: cleanTitle,
        description: newProjectDesc.trim() || undefined,
      });
      setShowNewProjectModal(false);
      setNewProjectName('');
      setNewProjectDesc('');
      await loadProjects();
      if (newProj && newProj.id) {
        setActiveProjectId(newProj.id);
      }
    } catch (err) {
      console.error('Failed to create project:', err);
      const detail = err.response?.data?.detail;
      const msg = typeof detail === 'string'
        ? detail
        : (Array.isArray(detail) ? detail[0]?.msg : 'Could not create project. Please verify that your backend server is running.');
      setProjectModalError(msg);
    } finally {
      setIsCreatingProject(false);
    }
  };

  // Handle Social Publishing
  const handlePublishClip = async (platform) => {
    if (!selectedClip) return;
    setPublishing(true);
    setPublishStatus(`Publishing to ${platform}…`);

    try {
      await api.publishClip(
        selectedClip.id,
        [platform],
        selectedClip.title || 'Short Clip',
        'Generated with Harvest',
        'public',
        {}
      );
      setPublishStatus(`Successfully published to ${platform}!`);
      setTimeout(() => setPublishStatus(''), 4000);
    } catch (err) {
      console.error('Social publish error:', err);
      setPublishStatus(`Publishing failed: ${err.response?.data?.detail || err.message}`);
    } finally {
      setPublishing(false);
    }
  };

  const formatVideoUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const cleanPath = path.replace(/^\/+/, '');
    return SERVER_URL ? `${SERVER_URL}/${cleanPath}` : `/${cleanPath}`;
  };

  const formatTimer = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Calculate dynamic progress percent
  const getProgressPercentage = () => {
    if (!pipelineStatus) return 10;
    const stage = pipelineStatus.stage;
    const ready = pipelineStatus.variations_ready || 0;
    if (stage === 'transcribing') return 25;
    if (stage === 'analyzing') return 45;
    if (stage === 'highlighting') return 60;
    if (stage === 'cropping') return 75;
    if (stage === 'rendering') return Math.min(95, 75 + ready * 5);
    if (stage === 'done' || pipelineStatus.is_done) return 100;
    return 15;
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#ffffff',
        color: '#16181d',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      {/* ── Studio Header ── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.85rem clamp(1.2rem, 4vw, 2.5rem)',
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e6e6e1',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.75rem', flexWrap: 'wrap' }}>
          {/* Brand */}
          <Link
            to="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              textDecoration: 'none',
              color: '#16181d',
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: '6px',
                backgroundColor: '#16181d',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
              }}
            >
              <Scissors size={16} />
            </div>
            <span
              style={{
                fontSize: '1.25rem',
                fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: '#16181d',
              }}
            >
              Harvest Studio
            </span>
          </Link>

          {/* Project Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <select
              value={activeProjectId || ''}
              onChange={(e) => setActiveProjectId(Number(e.target.value))}
              style={{
                backgroundColor: '#ffffff',
                color: '#16181d',
                border: '1px solid #e6e6e1',
                padding: '0.45rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: 500,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title || p.name || `Project #${p.id}`}
                </option>
              ))}
            </select>

            <button
              onClick={() => setShowNewProjectModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.45rem 0.8rem',
                borderRadius: '6px',
                backgroundColor: '#ffffff',
                border: '1px solid #e6e6e1',
                color: '#16181d',
                fontSize: '0.825rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
              }}
            >
              <Plus size={14} /> New Project
            </button>
          </div>
        </div>

        {/* User Info & Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.875rem', color: '#5b616b' }}>{user?.full_name || user?.email}</span>
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            title="Sign Out"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.8rem',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              border: '1px solid #e6e6e1',
              color: '#5b616b',
              fontSize: '0.825rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </header>

      {/* ── Main Studio Workspace Layout ── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left Column: Video List & Upload */}
        <aside
          style={{
            width: '320px',
            backgroundColor: '#ffffff',
            borderRight: '1px solid #e6e6e1',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
          }}
        >
          {/* Upload Button */}
          <div style={{ padding: '1rem', borderBottom: '1px solid #e6e6e1' }}>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="video/*,.mp4,.mov,.mkv,.webm"
              style={{ display: 'none' }}
            />
            <button
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '6px',
                backgroundColor: isUploading ? '#5b616b' : '#1f6f4a',
                color: '#ffffff',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: isUploading ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.15s ease',
              }}
            >
              <UploadCloud size={18} />
              {isUploading ? `Uploading ${uploadProgress}%…` : 'Upload Video File'}
            </button>

            {uploadError && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#b91c1c' }}>
                {uploadError}
              </div>
            )}
          </div>

          {/* Videos List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#7a808a',
                padding: '0.25rem 0.5rem 0.5rem',
              }}
            >
              Project Footage ({videos.length})
            </div>

            {videos.length === 0 ? (
              <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#5b616b', fontSize: '0.875rem' }}>
                No videos uploaded yet.<br />Click Upload above to begin.
              </div>
            ) : (
              videos.map((vid) => {
                const isSelected = selectedVideo?.id === vid.id;
                const isProcessingThis = (isSelected && isAnalyzing) || vid.status === 'processing';
                const statusColor =
                  isProcessingThis ? '#b45309' : (vid.status === 'completed' ? '#1f6f4a' : '#7a808a');
                return (
                  <div
                    key={vid.id}
                    onClick={() => {
                      setSelectedVideo(vid);
                      if (vid.status === 'processing') {
                        startStatusPolling(vid.id);
                      }
                    }}
                    style={{
                      padding: '0.75rem',
                      borderRadius: '6px',
                      backgroundColor: isSelected ? '#fafaf8' : '#ffffff',
                      border: isSelected ? '1px solid #16181d' : '1px solid #e6e6e1',
                      marginBottom: '0.45rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.65rem',
                      transition: 'border-color 0.15s ease, background-color 0.15s ease',
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '4px',
                        backgroundColor: '#fafaf8',
                        border: '1px solid #e6e6e1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#16181d',
                      }}
                    >
                      {isProcessingThis ? (
                        <Loader size={16} color="#b45309" style={{ animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <Video size={16} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          color: '#16181d',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {vid.original_filename || `Video #${vid.id}`}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: statusColor, marginTop: '2px' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: statusColor }} />
                        <span style={{ textTransform: 'capitalize' }}>
                          {isProcessingThis ? 'Processing…' : (vid.status || 'pending')}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Center & Right Column: Pipeline Stage & Clip Player */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#fafaf8', overflowY: 'auto' }}>
          {selectedVideo ? (
            <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1200px', width: '100%', boxSizing: 'border-box', margin: '0 auto' }}>
              {/* Pipeline Actions Bar */}
              <div
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e6e6e1',
                  borderRadius: '8px',
                  padding: '1.25rem 1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                }}
              >
                <div>
                  <h2
                    style={{
                      fontSize: '1.25rem',
                      fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
                      fontWeight: 700,
                      margin: '0 0 0.25rem',
                      color: '#16181d',
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {selectedVideo.original_filename || `Video #${selectedVideo.id}`}
                  </h2>
                  <p style={{ fontSize: '0.85rem', color: '#5b616b', margin: 0 }}>
                    Status: <strong style={{ color: '#16181d' }}>{selectedVideo.status}</strong> • Transcription:{' '}
                    <strong style={{ color: '#16181d' }}>{selectedVideo.transcription_status || 'idle'}</strong>
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  {/* Master Generate 1-Click */}
                  <button
                    disabled={actionLoading || isAnalyzing}
                    onClick={() => handleRunMasterPipeline()}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      padding: '0.65rem 1.15rem',
                      borderRadius: '6px',
                      backgroundColor: (actionLoading || isAnalyzing) ? '#5b616b' : '#1f6f4a',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      cursor: (actionLoading || isAnalyzing) ? 'not-allowed' : 'pointer',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    <Wand2 size={15} /> 1-Click Master Generate
                  </button>

                  {/* Step by step backend triggers */}
                  <button
                    disabled={actionLoading || isAnalyzing}
                    onClick={handleTranscribe}
                    style={{
                      padding: '0.65rem 0.95rem',
                      borderRadius: '6px',
                      backgroundColor: '#ffffff',
                      border: '1px solid #e6e6e1',
                      color: '#16181d',
                      fontSize: '0.825rem',
                      fontWeight: 500,
                      cursor: (actionLoading || isAnalyzing) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Transcribe
                  </button>
                  <button
                    disabled={actionLoading || isAnalyzing}
                    onClick={handleDetectHighlights}
                    style={{
                      padding: '0.65rem 0.95rem',
                      borderRadius: '6px',
                      backgroundColor: '#ffffff',
                      border: '1px solid #e6e6e1',
                      color: '#16181d',
                      fontSize: '0.825rem',
                      fontWeight: 500,
                      cursor: (actionLoading || isAnalyzing) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Find Hooks
                  </button>
                  <button
                    disabled={actionLoading || isAnalyzing}
                    onClick={handleSmartCrop}
                    style={{
                      padding: '0.65rem 0.95rem',
                      borderRadius: '6px',
                      backgroundColor: '#ffffff',
                      border: '1px solid #e6e6e1',
                      color: '#16181d',
                      fontSize: '0.825rem',
                      fontWeight: 500,
                      cursor: (actionLoading || isAnalyzing) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    9:16 Reframe
                  </button>
                </div>
              </div>

              {actionMessage && (
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: '6px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #e6e6e1',
                    color: '#16181d',
                    fontSize: '0.875rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <Sparkles size={16} color="#1f6f4a" />
                  <span>{actionMessage}</span>
                </div>
              )}

              {/* ── REAL-TIME ANALYSIS & GENERATION REPORT ── */}
              {isAnalyzing ? (
                <div
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e6e6e1',
                    borderRadius: '12px',
                    padding: '2rem',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.75rem',
                  }}
                >
                  {/* Top Bar with Stage & Timer */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid #e6e6e1', paddingBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: '8px',
                          backgroundColor: '#ecfdf5',
                          border: '1px solid #a7f3d0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#1f6f4a',
                        }}
                      >
                        <Loader size={20} style={{ animation: 'spin 1.2s linear infinite' }} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#1f6f4a' }}>
                            AI Pipeline Active
                          </span>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#1f6f4a', animation: 'pulse 1.5s infinite' }} />
                        </div>
                        <h3
                          style={{
                            fontSize: '1.2rem',
                            fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
                            fontWeight: 700,
                            margin: '0.2rem 0 0',
                            color: '#16181d',
                          }}
                        >
                          {pipelineStatus?.stage_label || 'Analyzing video and generating 9:16 vertical shorts…'}
                        </h3>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem', color: '#5b616b' }}>
                        <Clock size={16} />
                        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#16181d' }}>
                          {formatTimer(elapsedSeconds)}
                        </span>
                      </div>
                      <button
                        onClick={handleCancelGeneration}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.45rem 0.8rem',
                          borderRadius: '6px',
                          backgroundColor: '#ffffff',
                          border: '1px solid #e6e6e1',
                          color: '#5b616b',
                          fontSize: '0.8rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        <XCircle size={14} /> Cancel
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                      <span style={{ fontWeight: 600, color: '#16181d' }}>Progress</span>
                      <span style={{ fontWeight: 700, color: '#1f6f4a' }}>
                        {getProgressPercentage()}%
                      </span>
                    </div>
                    <div
                      style={{
                        width: '100%',
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: '#e6e6e1',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${getProgressPercentage()}%`,
                          backgroundColor: '#1f6f4a',
                          borderRadius: 4,
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>

                  {/* 4-Stage Step-by-Step Analysis Checklist */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                    {/* Step 1: Transcription */}
                    {(() => {
                      const isComplete = pipelineStatus?.transcription_status === 'completed' || pipelineStatus?.variations_ready > 0;
                      const isRunning = pipelineStatus?.stage === 'transcribing';
                      return (
                        <div
                          style={{
                            padding: '1rem',
                            borderRadius: '8px',
                            backgroundColor: isRunning ? '#fafaf8' : '#ffffff',
                            border: isRunning ? '1px solid #16181d' : '1px solid #e6e6e1',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                            <span style={{ fontSize: '0.725rem', fontWeight: 700, color: '#7a808a' }}>STEP 01</span>
                            {isComplete ? (
                              <CheckCircle2 size={16} color="#1f6f4a" />
                            ) : isRunning ? (
                              <Loader size={16} color="#1f6f4a" style={{ animation: 'spin 1s linear infinite' }} />
                            ) : (
                              <Clock size={15} color="#7a808a" />
                            )}
                          </div>
                          <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', fontWeight: 650, color: '#16181d' }}>
                            Audio Transcription
                          </h4>
                          <p style={{ margin: 0, fontSize: '0.8rem', color: '#5b616b', lineHeight: 1.5 }}>
                            Whisper STT model converting spoken speech to timestamps
                          </p>
                        </div>
                      );
                    })()}

                    {/* Step 2: Highlight Detection */}
                    {(() => {
                      const isComplete = pipelineStatus?.highlight_status === 'completed' || pipelineStatus?.variations_ready > 0;
                      const isRunning = pipelineStatus?.stage === 'analyzing' || pipelineStatus?.stage === 'highlighting';
                      return (
                        <div
                          style={{
                            padding: '1rem',
                            borderRadius: '8px',
                            backgroundColor: isRunning ? '#fafaf8' : '#ffffff',
                            border: isRunning ? '1px solid #16181d' : '1px solid #e6e6e1',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                            <span style={{ fontSize: '0.725rem', fontWeight: 700, color: '#7a808a' }}>STEP 02</span>
                            {isComplete ? (
                              <CheckCircle2 size={16} color="#1f6f4a" />
                            ) : isRunning ? (
                              <Loader size={16} color="#1f6f4a" style={{ animation: 'spin 1s linear infinite' }} />
                            ) : (
                              <Clock size={15} color="#7a808a" />
                            )}
                          </div>
                          <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', fontWeight: 650, color: '#16181d' }}>
                            Hook &amp; Highlight Detection
                          </h4>
                          <p style={{ margin: 0, fontSize: '0.8rem', color: '#5b616b', lineHeight: 1.5 }}>
                            Identifying conversational focal points and viral moments
                          </p>
                        </div>
                      );
                    })()}

                    {/* Step 3: 9:16 Reframe */}
                    {(() => {
                      const isComplete = pipelineStatus?.crop_status === 'completed' || pipelineStatus?.variations_ready > 0;
                      const isRunning = pipelineStatus?.stage === 'cropping';
                      return (
                        <div
                          style={{
                            padding: '1rem',
                            borderRadius: '8px',
                            backgroundColor: isRunning ? '#fafaf8' : '#ffffff',
                            border: isRunning ? '1px solid #16181d' : '1px solid #e6e6e1',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                            <span style={{ fontSize: '0.725rem', fontWeight: 700, color: '#7a808a' }}>STEP 03</span>
                            {isComplete ? (
                              <CheckCircle2 size={16} color="#1f6f4a" />
                            ) : isRunning ? (
                              <Loader size={16} color="#1f6f4a" style={{ animation: 'spin 1s linear infinite' }} />
                            ) : (
                              <Clock size={15} color="#7a808a" />
                            )}
                          </div>
                          <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', fontWeight: 650, color: '#16181d' }}>
                            Speaker Tracking &amp; Reframe
                          </h4>
                          <p style={{ margin: 0, fontSize: '0.8rem', color: '#5b616b', lineHeight: 1.5 }}>
                            Centering active speakers dynamically for vertical screens
                          </p>
                        </div>
                      );
                    })()}

                    {/* Step 4: Variations Rendering */}
                    {(() => {
                      const readyCount = pipelineStatus?.variations_ready || 0;
                      const isComplete = readyCount >= 5 || pipelineStatus?.is_done;
                      const isRunning = pipelineStatus?.stage === 'rendering' || readyCount > 0;
                      return (
                        <div
                          style={{
                            padding: '1rem',
                            borderRadius: '8px',
                            backgroundColor: isRunning ? '#fafaf8' : '#ffffff',
                            border: isRunning ? '1px solid #16181d' : '1px solid #e6e6e1',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                            <span style={{ fontSize: '0.725rem', fontWeight: 700, color: '#7a808a' }}>STEP 04</span>
                            {isComplete ? (
                              <CheckCircle2 size={16} color="#1f6f4a" />
                            ) : isRunning ? (
                              <Loader size={16} color="#1f6f4a" style={{ animation: 'spin 1s linear infinite' }} />
                            ) : (
                              <Clock size={15} color="#7a808a" />
                            )}
                          </div>
                          <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', fontWeight: 650, color: '#16181d' }}>
                            Shorts Rendering ({readyCount}/5)
                          </h4>
                          <p style={{ margin: 0, fontSize: '0.8rem', color: '#5b616b', lineHeight: 1.5 }}>
                            Burning synced subtitles and exporting 5 vertical variations
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ) : null}

              {/* ── Main Content: Clips Showcase & Player (Always shown or updated once ready) ── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(300px, 360px)', gap: '1.5rem', alignItems: 'start' }}>
                {/* Generated Clips Grid */}
                <div
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e6e6e1',
                    borderRadius: '8px',
                    padding: '1.5rem',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                    <h3
                      style={{
                        fontSize: '1.15rem',
                        fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
                        fontWeight: 700,
                        margin: 0,
                        color: '#16181d',
                      }}
                    >
                      Generated Clips ({clips.length})
                    </h3>
                    <button
                      onClick={loadClips}
                      title="Refresh Clips"
                      style={{ background: 'transparent', border: 'none', color: '#5b616b', cursor: 'pointer', padding: 4 }}
                    >
                      <RefreshCw size={15} />
                    </button>
                  </div>

                  {clips.length === 0 ? (
                    <div
                      style={{
                        padding: '3.5rem 1.5rem',
                        textAlign: 'center',
                        color: '#5b616b',
                        fontSize: '0.9rem',
                        border: '1px dashed #d7d7d1',
                        borderRadius: '6px',
                        backgroundColor: '#fafaf8',
                      }}
                    >
                      <Sparkles size={22} color="#1f6f4a" style={{ marginBottom: '0.5rem' }} />
                      <p style={{ margin: 0, fontWeight: 600, color: '#16181d' }}>No vertical clips generated yet.</p>
                      <p style={{ fontSize: '0.825rem', color: '#5b616b', marginTop: '0.35rem' }}>
                        Click &ldquo;1-Click Master Generate&rdquo; above to automatically cut and reframe highlights into 5 vertical shorts.
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
                      {clips.map((clip) => {
                        const isSelected = selectedClip?.id === clip.id;
                        return (
                          <div
                            key={clip.id}
                            onClick={() => setSelectedClip(clip)}
                            style={{
                              backgroundColor: isSelected ? '#fafaf8' : '#ffffff',
                              border: isSelected ? '1px solid #16181d' : '1px solid #e6e6e1',
                              borderRadius: '6px',
                              padding: '0.85rem',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.6rem',
                              transition: 'border-color 0.15s ease, background-color 0.15s ease',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span
                                style={{
                                  fontSize: '0.725rem',
                                  fontWeight: 700,
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  backgroundColor: '#ecfdf5',
                                  color: '#1f6f4a',
                                  border: '1px solid #a7f3d0',
                                }}
                              >
                                {clip.viral_score || 95}/100 Score
                              </span>
                              <span style={{ fontSize: '0.75rem', color: '#5b616b' }}>
                                {Math.round(clip.duration || 30)}s
                              </span>
                            </div>

                            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#16181d', minHeight: '38px', lineHeight: 1.4 }}>
                              {clip.title || `Short #${clip.id}`}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#5b616b' }}>
                              <span>Status: {clip.status || 'ready'}</span>
                              <Play size={14} color="#16181d" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Right: Vertical Player & Publisher */}
                <div
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e6e6e1',
                    borderRadius: '8px',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                  }}
                >
                  <h3
                    style={{
                      fontSize: '1.15rem',
                      fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
                      fontWeight: 700,
                      margin: 0,
                      color: '#16181d',
                    }}
                  >
                    9:16 Short Preview
                  </h3>

                  {selectedClip && selectedClip.storage_path ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div
                        style={{
                          width: '100%',
                          aspectRatio: '9/16',
                          maxHeight: '380px',
                          backgroundColor: '#16181d',
                          borderRadius: '6px',
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <video
                          key={selectedClip.storage_path}
                          src={formatVideoUrl(selectedClip.storage_path)}
                          controls
                          onError={() => setClipPlaybackError(true)}
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                      </div>

                      {clipPlaybackError && (
                        <div
                          style={{
                            padding: '0.85rem 1rem',
                            backgroundColor: '#fffdf5',
                            border: '1px solid #e8dfc8',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            color: '#73571d',
                            lineHeight: 1.5,
                          }}
                        >
                          <strong>Media not found on this server (HTTP 404):</strong> This clip file exists on the machine where it was originally processed, or was cleared after an ephemeral cloud container restart. Click <em>Generate 5 Master Variations</em> below to re-render it directly on this server.
                        </div>
                      )}

                      {/* Download */}
                      <a
                        href={formatVideoUrl(selectedClip.storage_path)}
                        download
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.45rem',
                          padding: '0.7rem',
                          borderRadius: '6px',
                          backgroundColor: '#1f6f4a',
                          color: '#ffffff',
                          textDecoration: 'none',
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          transition: 'background-color 0.15s ease',
                        }}
                      >
                        <Download size={15} /> Download 9:16 Video
                      </a>

                      {/* 1-Click Social Publishing */}
                      <div style={{ borderTop: '1px solid #e6e6e1', paddingTop: '1rem' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#7a808a', marginBottom: '0.6rem' }}>
                          Publish to Social Channels
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            disabled={publishing}
                            onClick={() => handlePublishClip('youtube')}
                            style={{
                              flex: 1,
                              padding: '0.55rem',
                              borderRadius: '6px',
                              backgroundColor: '#ffffff',
                              color: '#16181d',
                              border: '1px solid #e6e6e1',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: publishing ? 'not-allowed' : 'pointer',
                            }}
                          >
                            YouTube
                          </button>
                          <button
                            disabled={publishing}
                            onClick={() => handlePublishClip('tiktok')}
                            style={{
                              flex: 1,
                              padding: '0.55rem',
                              borderRadius: '6px',
                              backgroundColor: '#ffffff',
                              color: '#16181d',
                              border: '1px solid #e6e6e1',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: publishing ? 'not-allowed' : 'pointer',
                            }}
                          >
                            TikTok
                          </button>
                          <button
                            disabled={publishing}
                            onClick={() => handlePublishClip('instagram')}
                            style={{
                              flex: 1,
                              padding: '0.55rem',
                              borderRadius: '6px',
                              backgroundColor: '#ffffff',
                              color: '#16181d',
                              border: '1px solid #e6e6e1',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: publishing ? 'not-allowed' : 'pointer',
                            }}
                          >
                            Instagram
                          </button>
                        </div>

                        {publishStatus && (
                          <div style={{ marginTop: '0.65rem', fontSize: '0.8rem', color: '#16181d', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                            <CheckCircle2 size={14} color="#1f6f4a" />
                            <span>{publishStatus}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: '3rem 1rem',
                        textAlign: 'center',
                        color: '#5b616b',
                        fontSize: '0.875rem',
                        backgroundColor: '#fafaf8',
                        borderRadius: '6px',
                        border: '1px dashed #d7d7d1',
                      }}
                    >
                      <Film size={22} color="#7a808a" style={{ marginBottom: '0.4rem' }} />
                      <p style={{ margin: 0 }}>Select a generated clip on the left to preview and publish.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                color: '#5b616b',
                padding: '3rem 2rem',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '8px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e6e6e1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#16181d',
                  marginBottom: '1rem',
                }}
              >
                <Video size={24} />
              </div>
              <h3
                style={{
                  fontSize: '1.35rem',
                  fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
                  fontWeight: 700,
                  color: '#16181d',
                  margin: '0 0 0.5rem',
                }}
              >
                Select or Upload a Video
              </h3>
              <p style={{ maxWidth: '420px', fontSize: '0.925rem', margin: 0, color: '#5b616b', lineHeight: 1.6 }}>
                Choose a video from the project footage sidebar or upload new recordings to launch automatic transcription, hook detection, and 9:16 vertical cropping.
              </p>
            </div>
          )}
        </main>
      </div>

      {/* New Project Modal */}
      {showNewProjectModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(22, 24, 29, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1.5rem',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '400px',
              backgroundColor: '#ffffff',
              border: '1px solid #e6e6e1',
              borderRadius: '8px',
              padding: '1.75rem',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
            }}
          >
            <h3
              style={{
                fontSize: '1.25rem',
                fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
                fontWeight: 700,
                margin: '0 0 1rem',
                color: '#16181d',
              }}
            >
              Create New Project
            </h3>

            {projectModalError && (
              <div
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: '6px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  fontSize: '0.825rem',
                  marginBottom: '1rem',
                  lineHeight: 1.45,
                }}
              >
                {projectModalError}
              </div>
            )}

            <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#16181d', marginBottom: '0.4rem' }}>
                  Project Name
                </label>
                <input
                  type="text"
                  required
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g., Tech Podcast Season 2"
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '6px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #d7d7d1',
                    color: '#16181d',
                    outline: 'none',
                    boxSizing: 'border-box',
                    fontSize: '0.9rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#16181d', marginBottom: '0.4rem' }}>
                  Description (Optional)
                </label>
                <input
                  type="text"
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  placeholder="e.g., Weekly interviews"
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '6px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #d7d7d1',
                    color: '#16181d',
                    outline: 'none',
                    boxSizing: 'border-box',
                    fontSize: '0.9rem',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewProjectModal(false);
                    setProjectModalError('');
                  }}
                  style={{
                    padding: '0.55rem 0.95rem',
                    borderRadius: '6px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #e6e6e1',
                    color: '#5b616b',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingProject}
                  style={{
                    padding: '0.55rem 1.15rem',
                    borderRadius: '6px',
                    backgroundColor: isCreatingProject ? '#5b616b' : '#1f6f4a',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    cursor: isCreatingProject ? 'not-allowed' : 'pointer',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  {isCreatingProject ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
