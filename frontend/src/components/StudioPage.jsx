import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Plus, UploadCloud, Video, Sparkles, Play, Pause, ArrowLeft,
  Download, LogOut, RefreshCw, Wand2, Loader,
  CheckCircle2, Film, Clock, XCircle, Trash2, AlertTriangle,
  Link2, Globe, Music, Volume2, X, Check, ArrowRight,
  ThumbsUp, MessageSquare, Bell, Heart, RotateCcw, ExternalLink,
  Search
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import harvestLogo from '../Untitled Design.png';

const MUSIC_PRESETS = [
  { id: 'lofi', label: 'Lo-Fi Chill & Relax', genre: 'Chill / Study Beat', emoji: '☕', desc: 'Mellow hip hop beats & relaxing vibe' },
  { id: 'upbeat', label: 'Upbeat & Energetic', genre: 'Electronic / Dance', emoji: '⚡', desc: 'High energy electronic groove & modern drive' },
  { id: 'cinematic', label: 'Cinematic & Epic', genre: 'Orchestral / Film', emoji: '🎬', desc: 'Powerful builds & dramatic atmosphere' },
  { id: 'gaming', label: 'Gaming & Synthwave', genre: 'Synthwave / Future', emoji: '🎮', desc: 'Cyberpunk synths & dynamic gaming tempo' },
  { id: 'ambient', label: 'Peaceful & Ambient', genre: 'Acoustic / Ambient', emoji: '🌿', desc: 'Soft acoustic tones & clean rhythm' },
  { id: 'suspenseful', label: 'Suspenseful & Thriller', genre: 'Dark Ambient / Thriller', emoji: '🕵️', desc: 'Dramatic tension, mystery & gripping mood' },
  { id: 'hiphop', label: 'Hip Hop Groove', genre: 'Boom Bap / Groove', emoji: '🎤', desc: 'Crisp rhythm & punchy head-nod beat' },
];

export default function StudioPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

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
  const [videoSearchQuery, setVideoSearchQuery] = useState('');
  const [selectedVideo, setSelectedVideo] = useState(null);

  // Memoized search filter for sidebar footage
  const filteredVideos = useMemo(() => {
    const q = videoSearchQuery.trim().toLowerCase();
    if (!q) return videos;
    return videos.filter((vid) => {
      const title = (vid.title || '').toLowerCase();
      const filename = (vid.filename || '').toLowerCase();
      const status = (vid.status || '').toLowerCase();
      return title.includes(q) || filename.includes(q) || status.includes(q);
    });
  }, [videos, videoSearchQuery]);
  const [clips, setClips] = useState([]);
  const [clipsVideoId, setClipsVideoId] = useState(null);
  const [selectedClip, setSelectedClip] = useState(null);
  const [selectedMomentId, setSelectedMomentId] = useState(null);
  const [clipLength, setClipLength] = useState(30);
  const [momentAudioUrls, setMomentAudioUrls] = useState([]);
  const [clipPlaybackError, setClipPlaybackError] = useState(false);
  const [clipMediaUrl, setClipMediaUrl] = useState('');
  const [clipMediaClipId, setClipMediaClipId] = useState(null);
  const [sourceVideoUrl, setSourceVideoUrl] = useState('');
  const [captionStyle, setCaptionStyle] = useState('pop');
  const [outputLanguage, setOutputLanguage] = useState('original');
  const [dubVoice, setDubVoice] = useState(false);
  const [speakerGender, setSpeakerGender] = useState('female');
  // Custom Audio & Background Music State
  const [audioMode, setAudioMode] = useState('original'); // 'original' | 'mix' | 'replace'
  const [audioSourceType, setAudioSourceType] = useState('preset'); // 'preset' | 'upload'
  const [musicPreset, setMusicPreset] = useState('lofi');
  const [musicVolume, setMusicVolume] = useState(0.18);
  const [customAudioPath, setCustomAudioPath] = useState('');
  const [customAudioName, setCustomAudioName] = useState('');
  const [customAudioPreviewUrl, setCustomAudioPreviewUrl] = useState('');
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [audioUploadError, setAudioUploadError] = useState('');
  const audioFileInputRef = useRef(null);
  const generatedOutputRef = useRef(null);

  // Preset Audio Preview State & Pop-up Modal
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [presetAudioUrls, setPresetAudioUrls] = useState({});
  const [playingPresetId, setPlayingPresetId] = useState(null);
  const [loadingPresetId, setLoadingPresetId] = useState(null);
  const [presetAudioError, setPresetAudioError] = useState('');
  const previewAudioRef = useRef(null);

  // Multi-step Moment Workflow State ('moments' | 'customize')
  const [momentWorkflowStep, setMomentWorkflowStep] = useState('moments');
  const [showAudioModal, setShowAudioModal] = useState(false);

  // Cloudflare R2 Video Templates State
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('bw_thanks_watching');
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [previewingModalTemplate, setPreviewingModalTemplate] = useState(null);
  const [playingTemplateCardId, setPlayingTemplateCardId] = useState(null);
  const [templateFilterCategory, setTemplateFilterCategory] = useState('all');
  // Outro Mode: 'template' (Cloudflare R2 video) | 'custom' (9:16 interactive builder) | 'none'
  const [outroMode, setOutroMode] = useState('template');

  // 9:16 Creator Outro Screen State (Custom builder)
  const [enableOutro, setEnableOutro] = useState(true);
  const [outroDuration, setOutroDuration] = useState(3.0); // 2, 3, 4 seconds
  const [showLikeAction, setShowLikeAction] = useState(true);
  const [outroLikeText, setOutroLikeText] = useState('Like');
  const [showCommentAction, setShowCommentAction] = useState(true);
  const [outroCommentText, setOutroCommentText] = useState('Comment');
  const [showSubscribeAction, setShowSubscribeAction] = useState(true);
  const [outroSubscribeText, setOutroSubscribeText] = useState('Subscribe');
  const [showFollowAction, setShowFollowAction] = useState(true);
  const [outroFollowText, setOutroFollowText] = useState('Follow');
  const [outroLongText, setOutroLongText] = useState('');
  const [outroPreviewKey, setOutroPreviewKey] = useState(0);
  const [outroMusicStyle, setOutroMusicStyle] = useState('upbeat');

  const loadTemplates = useCallback(async () => {
    try {
      setTemplatesLoading(true);
      setTemplatesError('');
      const data = await api.getTemplates();
      setTemplates(data || []);
      if (data && data.length > 0 && !selectedTemplateId) {
        setSelectedTemplateId(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load Cloudflare R2 templates:', err);
      setTemplatesError('Could not load templates from Cloudflare R2');
    } finally {
      setTemplatesLoading(false);
    }
  }, [selectedTemplateId]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const togglePlayPreset = async (presetId) => {
    if (playingPresetId === presetId) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
      setPlayingPresetId(null);
      return;
    }

    try {
      setPresetAudioError('');
      let audioUrl = presetAudioUrls[presetId];
      if (!audioUrl) {
        setLoadingPresetId(presetId);
        audioUrl = await api.getMusicPresetAudio(presetId);
        setPresetAudioUrls((prev) => ({ ...prev, [presetId]: audioUrl }));
        setLoadingPresetId(null);
      }

      if (previewAudioRef.current) {
        previewAudioRef.current.src = audioUrl;
        await previewAudioRef.current.play();
        setPlayingPresetId(presetId);
      }
    } catch (err) {
      console.warn('Failed to play preset:', err);
      setPresetAudioError('Could not stream preset audio track.');
      setLoadingPresetId(null);
      setPlayingPresetId(null);
    }
  };

  const handleSelectAndClosePreset = (presetId) => {
    setMusicPreset(presetId);
    setShowPresetModal(false);
  };

  useEffect(() => {
    setClipPlaybackError(false);
  }, [selectedClip]);

  useEffect(() => {
    if (selectedClip?.edit_options?.caption_style) {
      setCaptionStyle(selectedClip.edit_options.caption_style);
    }
  }, [selectedClip?.id]);

  useEffect(() => {
    setMomentWorkflowStep('moments');
  }, [selectedVideo?.id]);

  useEffect(() => {
    const moments = selectedVideo?.highlights?.clips || [];
    setSelectedMomentId(selectedVideo?.highlights?.selected_moment_id ?? null);
    let urls = [];
    let cancelled = false;
    if (selectedVideo?.id && moments.length) {
      Promise.all(moments.slice(0, 5).map((_, index) => api.getMomentAudio(selectedVideo.id, index).catch(() => '')))
        .then((loaded) => {
          if (cancelled) {
            loaded.forEach((url) => url && URL.revokeObjectURL(url));
            return;
          }
          urls = loaded;
          setMomentAudioUrls(loaded);
        });
    } else {
      setMomentAudioUrls([]);
    }
    return () => {
      cancelled = true;
      urls.forEach((url) => url && URL.revokeObjectURL(url));
    };
  }, [selectedVideo?.id, selectedVideo?.highlights]);

  useEffect(() => {
    let currentUrl = '';
    let active = true;
    setClipMediaUrl('');
    setClipMediaClipId(null);
    if (!selectedClip?.id || selectedClip.status !== 'completed' || !selectedClip.storage_path) return undefined;
    api.getClipMedia(selectedClip.id).then((url) => {
      if (!active) {
        URL.revokeObjectURL(url);
        return;
      }
      currentUrl = url;
      setClipMediaUrl(url);
      setClipMediaClipId(selectedClip.id);
    }).catch(() => {
      if (active) setClipPlaybackError(true);
    });
    return () => {
      active = false;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [selectedClip?.id, selectedClip?.status, selectedClip?.storage_path]);

  useEffect(() => {
    let active = true;
    let media = null;
    setSourceVideoUrl('');
    if (!selectedVideo?.id) return undefined;
    api.getVideoMedia(selectedVideo.id).then((result) => {
      media = result;
      if (active) setSourceVideoUrl(result.url);
      else if (result.objectUrl) URL.revokeObjectURL(result.url);
    }).catch((error) => {
      if (active) console.error('Source video preview failed to load:', error);
    });
    return () => {
      active = false;
      if (media?.objectUrl) URL.revokeObjectURL(media.url);
    };
  }, [selectedVideo?.id]);

  // Upload & Link Input State
  const [videoInputMode, setVideoInputMode] = useState('upload'); // 'upload' | 'link'
  const [videoUrl, setVideoUrl] = useState('');
  const [isImportingUrl, setIsImportingUrl] = useState(false);
  const [importUrlError, setImportUrlError] = useState('');
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

  // Deletion State — confirm-before-delete dialogs
  const [confirmDialog, setConfirmDialog] = useState(null); // { type, id, label }
  const [deleteLoading, setDeleteLoading] = useState(false);
  const selectedVideoRef = useRef(selectedVideo);
  useEffect(() => {
    selectedVideoRef.current = selectedVideo;
  }, [selectedVideo]);
  const visibleClips = clipsVideoId === selectedVideo?.id ? clips : [];
  const visibleSelectedClip = visibleClips.find((clip) => clip.id === selectedClip?.id) || null;
  const hasAnalyzedMoments = selectedVideo?.highlight_status === 'completed'
    && (selectedVideo?.highlights?.clips || []).length >= 5;


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
  const loadVideos = useCallback(async (preferredVideoId = null) => {
    if (!activeProjectId) {
      setVideos([]);
      setSelectedVideo(null);
      setClips([]);
      setClipsVideoId(null);
      setSelectedClip(null);
      return;
    }
    try {
      const allVideos = await api.getVideos(activeProjectId);
      setVideos(allVideos || []);
      // Opening or switching projects should land on the upload screen.
      // Select a video automatically only when the user just uploaded it.
      const preferred = preferredVideoId == null ? null : allVideos?.find((v) => v.id === preferredVideoId);
      setSelectedVideo((previous) => preferred || (previous && allVideos?.find((v) => v.id === previous.id)) || null);
      setClips([]);
      setClipsVideoId(null);
      setSelectedClip(null);
    } catch (err) {
      console.error('Failed to load videos:', err);
    }
  }, [activeProjectId]);

  useEffect(() => {
    setSelectedVideo(null);
    setClips([]);
    setClipsVideoId(null);
    setSelectedClip(null);
    loadVideos();
  }, [loadVideos]);

  // 3. Load Clips when selectedVideo changes
  const loadClips = useCallback(async () => {
    if (!selectedVideo) {
      setClips([]);
      setClipsVideoId(null);
      setSelectedClip(null);
      return;
    }
    try {
      const requestedVideoId = selectedVideo.id;
      // Load both clips and master variations
      const [clipList, varList] = await Promise.all([
        api.getClips(requestedVideoId).catch(() => []),
        api.getVariations(requestedVideoId).catch(() => []),
      ]);
      // Ignore late responses from a video the user has since switched away from.
      if (selectedVideoRef.current?.id !== requestedVideoId) return;

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
      setClipsVideoId(requestedVideoId);
      if (uniqueClips.length > 0) {
        const selectedMomentClip = uniqueClips.find((clip) => clip.edit_options?.workflow === 'selected_moment_v1');
        setSelectedClip((prev) => {
          if (selectedMomentClip) return selectedMomentClip;
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

  useEffect(() => {
    if (visibleSelectedClip?.status === 'completed' && visibleSelectedClip?.edit_options?.workflow === 'selected_moment_v1') {
      generatedOutputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [visibleSelectedClip?.id, visibleSelectedClip?.status]);

  useEffect(() => {
    if (!selectedVideo?.id || !selectedClip || !['pending', 'rendering'].includes(selectedClip.status)) return undefined;
    let active = true;
    const refresh = async () => {
      try {
        const latest = await api.getClips(selectedVideo.id);
        if (!active) return;
        setClips(latest || []);
        setClipsVideoId(selectedVideo.id);
        const updated = (latest || []).find((clip) => clip.id === selectedClip.id);
        if (updated) {
          setSelectedClip(updated);
          if (updated.status === 'completed') {
            setActionLoading(false);
            setActionMessage('The selected moment is ready. Its source audio and chosen caption style are saved.');
          } else if (updated.status === 'failed') {
            setActionLoading(false);
            setActionMessage('Rendering failed. Your selected moment and transcript are saved; retry after checking the worker logs.');
          }
        }
      } catch (error) {
        console.error('Clip render status check failed:', error);
      }
    };
    const timer = setInterval(refresh, 2000);
    refresh();
    return () => { active = false; clearInterval(timer); };
  }, [selectedVideo?.id, selectedClip?.id, selectedClip?.status]);

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

        const isFailed = statusData?.stage === 'failed' || statusData?.video_status === 'failed';
        const momentsReady = statusData?.video_status === 'completed' &&
          statusData?.highlight_status === 'completed' && (statusData?.moments_ready || 0) >= 5;
        const isDone = !isFailed && (momentsReady || (
          statusData?.video_status === 'completed' && (statusData?.is_done || statusData?.is_complete)
        ));

        if (isDone) {
          clearInterval(pollIntervalRef.current);
          clearInterval(timerIntervalRef.current);
          setIsAnalyzing(false);
          setActionLoading(false);
          if (momentsReady) {
            setMomentWorkflowStep('moments');
            setSelectedMomentId(null);
          }
          setActionMessage(momentsReady ? 'Five moments are ready to preview.' : 'Video generation completed.');
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
    pollIntervalRef.current = setInterval(checkStatus, 1500);
    checkStatus();
  }, [loadClips, loadVideos]);

  // If user selects a video that is currently processing in the background, attach polling automatically
  useEffect(() => {
    if (selectedVideo && (selectedVideo.status === 'processing' || selectedVideo.status === 'pending')) {
      startStatusPolling(selectedVideo.id);
    }
  }, [selectedVideo, startStatusPolling]);

  // Upload source media first; the user chooses the target length before analysis.
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

      if (uploadedVideo && uploadedVideo.id) {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        setIsAnalyzing(false);
        setClips([]);
        setClipsVideoId(null);
        setSelectedClip(null);
        setSelectedMomentId(null);
        setClipMediaUrl('');
        setClipMediaClipId(null);
        setClipPlaybackError(false);
        setMomentWorkflowStep('moments');
        setSelectedVideo(uploadedVideo);
        await loadVideos(uploadedVideo.id);
        setActionMessage('Video uploaded. Choose a short length, then analyze to find five moments.');
      }
    } catch (err) {
      console.error('Upload failed:', err);
      setUploadError(err.response?.data?.detail || 'Failed to upload video. Please try again.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Direct URL Import & Instant Auto-Analysis (YouTube, Instagram, TikTok, Facebook, etc.)
  const handleImportUrl = async (e) => {
    if (e) e.preventDefault();
    const cleanUrl = videoUrl.trim();
    if (!cleanUrl || !activeProjectId) return;

    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      setImportUrlError('Please enter a valid link starting with http:// or https://');
      return;
    }

    setIsImportingUrl(true);
    setImportUrlError('');
    setActionLoading(true);
    setActionMessage('Connecting to link and downloading video…');

    try {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      setIsAnalyzing(false);
      setClips([]);
      setClipsVideoId(null);
      setSelectedClip(null);
      setSelectedMomentId(null);
      setClipMediaUrl('');
      setClipMediaClipId(null);
      setClipPlaybackError(false);
      setMomentWorkflowStep('moments');

      // Download directly on server with auto_analyze = false so user lands on Step 1 (Set Up Your Short)
      const importedVideo = await api.importVideoUrl(activeProjectId, cleanUrl, false);
      setVideoUrl('');

      // Auto-select and refresh project video list so user can review the video and set options
      setSelectedVideo(importedVideo);
      await loadVideos(importedVideo.id);

      setActionLoading(false);
      setActionMessage('Video link downloaded. Check the preview, customize your length and caption options, then click Analyze.');
    } catch (err) {
      console.error('Failed to import video link:', err);
      const detail = err.response?.data?.detail;
      const msg = typeof detail === 'string'
        ? detail
        : (Array.isArray(detail) ? detail[0]?.msg : 'Could not process video from the link. Please make sure the video is public.');
      setImportUrlError(msg);
      setActionLoading(false);
      setIsAnalyzing(false);
      setActionMessage('');
    } finally {
      setIsImportingUrl(false);
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
        caption_style: captionStyle,
        translate_language: outputLanguage === 'original' ? 'none' : outputLanguage,
        caption_language: outputLanguage === 'original' ? 'original' : 'translated',
        dub_voice: dubVoice,
        length: 60,
        platform: 'youtube',
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

  const handleAnalyzeMoments = async () => {
    if (!selectedVideo) return;
    setMomentWorkflowStep('moments');
    setSelectedMomentId(null);
    setActionLoading(true);
    setIsAnalyzing(true);
    setElapsedSeconds(0);
    setPipelineStatus({ stage: 'queued', stage_label: 'Starting video analysis…' });
    setActionMessage('');
    try {
      const processingVideo = await api.extractHighlights(selectedVideo.id, clipLength);
      setSelectedVideo(processingVideo);
      startStatusPolling(selectedVideo.id);
    } catch (error) {
      setActionLoading(false);
      setIsAnalyzing(false);
      setActionMessage(error.response?.data?.detail || error.message || 'Could not queue moment analysis.');
    }
  };

  // Custom audio file upload handler
  const handleAudioUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAudio(true);
    setAudioUploadError('');

    try {
      const res = await api.uploadAudio(file);
      setCustomAudioPath(res.storage_path);
      setCustomAudioName(res.filename);
      const localUrl = URL.createObjectURL(file);
      setCustomAudioPreviewUrl(localUrl);
    } catch (err) {
      console.error('Audio upload failed:', err);
      const detail = err.response?.data?.detail;
      setAudioUploadError(typeof detail === 'string' ? detail : 'Failed to upload audio file. Supported formats: MP3, WAV, M4A, AAC.');
    } finally {
      setIsUploadingAudio(false);
      if (audioFileInputRef.current) audioFileInputRef.current.value = '';
    }
  };

  const handleRenderSelectedMoment = async () => {
    if (!selectedVideo || selectedMomentId == null) return;
    setActionLoading(true);
    setShowAudioModal(false);
    setActionMessage('Queueing a new vertical short with your chosen audio, captions & creator outro…');
    try {
      const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
      const isTemplateMode = outroMode === 'template' && selectedTemplate;
      const isCustomMode = outroMode === 'custom';

      const clip = await api.selectMoment(selectedVideo.id, selectedMomentId, captionStyle, {
        translateLanguage: outputLanguage === 'original' ? 'none' : outputLanguage,
        captionLanguage: outputLanguage === 'original' ? 'original' : 'translated',
        dubVoice,
        speakerGender,
        audioMode,
        customAudioPath: audioSourceType === 'upload' ? customAudioPath : null,
        musicPreset: audioSourceType === 'preset' ? musicPreset : 'none',
        musicVolume,
        enableOutro: isCustomMode,
        outroLikeText: isCustomMode && showLikeAction ? outroLikeText : '',
        outroCommentText: isCustomMode && showCommentAction ? outroCommentText : '',
        outroSubscribeText: isCustomMode && showSubscribeAction ? outroSubscribeText : '',
        outroFollowText: isCustomMode && showFollowAction ? outroFollowText : '',
        outroCustomText: isCustomMode ? outroLongText : '',
        outroDuration: isCustomMode ? outroDuration : (selectedTemplate?.duration || 3.0),
        outroMusicStyle: isCustomMode ? outroMusicStyle : 'upbeat',
        templateId: isTemplateMode ? selectedTemplate.id : null,
        templateStoragePath: isTemplateMode ? selectedTemplate.storage_path : null,
      });
      setSelectedClip(clip);
      setClips((items) => [clip, ...items.filter((item) => item.id !== clip.id)]);
      setClipsVideoId(selectedVideo.id);
      setMomentWorkflowStep('clips');
      setActionMessage('This moment is rendering. Your chosen soundtrack and creator outro are being applied.');
      setActionLoading(false);
      await loadVideos();
    } catch (error) {
      setActionLoading(false);
      setActionMessage(error.response?.data?.detail || error.message || 'Could not queue the selected moment.');
    }
  };

  const handleBackToProject = () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setIsAnalyzing(false);
    setActionLoading(false);
    setMomentWorkflowStep('moments');
    setSelectedVideo(null);
    setSelectedClip(null);
    setSelectedMomentId(null);
    setClips([]);
    setClipsVideoId(null);
    setClipMediaUrl('');
    setClipMediaClipId(null);
    setActionMessage('');
  };

  const handleCaptionRerender = async () => {
    if (!selectedClip) return;
    setActionLoading(true);
    setActionMessage('Queueing a caption-only rerender. The saved transcript and selected time range are reused.');
    try {
      const updated = await api.rerenderCaption(selectedClip.id, captionStyle);
      setSelectedClip(updated);
      setClips((items) => items.map((item) => item.id === updated.id ? updated : item));
    } catch (error) {
      setActionLoading(false);
      setActionMessage(error.response?.data?.detail || error.message || 'Could not queue the caption rerender.');
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

  const openPublishPage = () => {
    if (!visibleSelectedClip) return;
    navigate(`/publish?clip_id=${encodeURIComponent(visibleSelectedClip.id)}`, {
      state: { clip: visibleSelectedClip, returnTo: location.pathname },
    });
  };

  // Confirm-and-execute deletion
  const confirmDelete = async () => {
    if (!confirmDialog) return;
    setDeleteLoading(true);
    try {
      if (confirmDialog.type === 'clip') {
        await api.deleteClip(confirmDialog.id);
        // Remove from clips list and deselect if it was selected
        setClips((prev) => prev.filter((c) => c.id !== confirmDialog.id));
        if (selectedClip?.id === confirmDialog.id) setSelectedClip(null);
        setActionMessage('Clip deleted.');
      } else if (confirmDialog.type === 'video') {
        await api.deleteVideo(confirmDialog.id);
        setSelectedVideo(null);
        setClips([]);
        setClipsVideoId(null);
        setSelectedClip(null);
        await loadVideos();
        setActionMessage('Video deleted.');
      } else if (confirmDialog.type === 'project') {
        await api.deleteProject(confirmDialog.id);
        setActiveProjectId(null);
        setSelectedVideo(null);
        setClips([]);
        setClipsVideoId(null);
        setSelectedClip(null);
        await loadProjects();
        setActionMessage('Project deleted.');
      }
      setTimeout(() => setActionMessage(''), 4000);
    } catch (err) {
      console.error('Delete error:', err);
      const detail = err.response?.data?.detail;
      setActionMessage(typeof detail === 'string' ? detail : 'Deletion failed. Please try again.');
    } finally {
      setDeleteLoading(false);
      setConfirmDialog(null);
    }
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
      className="studio-shell"
      style={{
        height: '100vh',
        maxHeight: '100vh',
        overflow: 'hidden',
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
        className="studio-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.85rem clamp(1.2rem, 4vw, 2.5rem)',
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e6e6e1',
          flexShrink: 0,
          zIndex: 40,
        }}
      >
        <div className="studio-header-main" style={{ display: 'flex', alignItems: 'center', gap: '1.75rem', flexWrap: 'wrap' }}>
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
            <img src={harvestLogo} alt="Harvest AI logo" style={{ width: 42, height: 42, objectFit: 'contain', borderRadius: '6px' }} />
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
          <div className="studio-project-tools" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <select
              value={activeProjectId || ''}
              onChange={(e) => setActiveProjectId(e.target.value ? Number(e.target.value) : null)}
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
              {projects.length === 0 && <option value="">No projects yet</option>}
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


            {activeProjectId && (
              <button
                onClick={() => {
                  const p = projects.find((x) => x.id === activeProjectId);
                  setConfirmDialog({ type: 'project', id: activeProjectId, label: p?.title || p?.name || `Project #${activeProjectId}` });
                }}
                title="Delete this project"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.45rem',
                  borderRadius: '6px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e6e6e1',
                  color: '#c0392b',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease',
                }}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* User Info & Logout */}
        <div className="studio-user-tools" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
      <div className="studio-workspace" style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Left Column: Video List & Upload */}
        <aside
          className="studio-sidebar"
          style={{
            width: '320px',
            backgroundColor: '#ffffff',
            borderRight: '1px solid #e6e6e1',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            height: '100%',
            maxHeight: '100%',
            overflow: 'hidden',
          }}
        >
          {/* 2-Way Video Input: Upload File or Paste Link */}
          <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid #e6e6e1', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.75rem', backgroundColor: '#f1f1ee', padding: '3px', borderRadius: '6px' }}>
              <button
                type="button"
                onClick={() => setVideoInputMode('upload')}
                style={{
                  flex: 1,
                  padding: '0.4rem 0.5rem',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: videoInputMode === 'upload' ? '#ffffff' : 'transparent',
                  color: videoInputMode === 'upload' ? '#16181d' : '#7a808a',
                  boxShadow: videoInputMode === 'upload' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                  transition: 'all 0.15s ease',
                }}
              >
                <UploadCloud size={13} />
                Upload File
              </button>
              <button
                type="button"
                onClick={() => setVideoInputMode('link')}
                style={{
                  flex: 1,
                  padding: '0.4rem 0.5rem',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: videoInputMode === 'link' ? '#ffffff' : 'transparent',
                  color: videoInputMode === 'link' ? '#16181d' : '#7a808a',
                  boxShadow: videoInputMode === 'link' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                  transition: 'all 0.15s ease',
                }}
              >
                <Link2 size={13} />
                Paste Link
              </button>
            </div>

            {videoInputMode === 'upload' ? (
              <>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="video/*,.mp4,.mov,.mkv,.webm"
                  style={{ display: 'none' }}
                />
                <button
                  disabled={isUploading || isImportingUrl || !activeProjectId}
                  onClick={() => activeProjectId ? fileInputRef.current?.click() : setShowNewProjectModal(true)}
                  style={{
                    width: '100%',
                    padding: '0.7rem',
                    borderRadius: '6px',
                    backgroundColor: isUploading || !activeProjectId ? '#7a808a' : '#1f6f4a',
                    color: '#ffffff',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: isUploading || !activeProjectId ? 'not-allowed' : 'pointer',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  <UploadCloud size={16} />
                  {isUploading ? `Uploading ${uploadProgress}%…` : activeProjectId ? 'Choose Video File' : 'Create Project First'}
                </button>
                {uploadError && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#b91c1c' }}>
                    {uploadError}
                  </div>
                )}
              </>
            ) : (
              <form onSubmit={handleImportUrl} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ position: 'relative' }}>
                  <input
                    type="url"
                    value={videoUrl}
                    onChange={(e) => {
                      setVideoUrl(e.target.value);
                      if (importUrlError) setImportUrlError('');
                    }}
                    placeholder="YouTube, Insta, TikTok URL…"
                    disabled={isImportingUrl || isUploading}
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.65rem 0.55rem 2rem',
                      borderRadius: '6px',
                      border: '1px solid #d7d7d1',
                      fontSize: '0.8rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                      backgroundColor: '#ffffff',
                      color: '#16181d',
                    }}
                  />
                  <Link2
                    size={13}
                    style={{
                      position: 'absolute',
                      left: '0.65rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#7a808a',
                      pointerEvents: 'none',
                    }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isImportingUrl || isUploading || !videoUrl.trim() || !activeProjectId}
                  style={{
                    width: '100%',
                    padding: '0.65rem',
                    borderRadius: '6px',
                    backgroundColor: isImportingUrl || !videoUrl.trim() || !activeProjectId ? '#7a808a' : '#1f6f4a',
                    color: '#ffffff',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.45rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: isImportingUrl || !videoUrl.trim() || !activeProjectId ? 'not-allowed' : 'pointer',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  {isImportingUrl ? (
                    <>
                      <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                      <span>Downloading Video…</span>
                    </>
                  ) : (
                    <>
                      <Link2 size={14} />
                      <span>Import & Set Up Video</span>
                    </>
                  )}
                </button>
                <div style={{ fontSize: '0.7rem', color: '#7a808a', textAlign: 'center', marginTop: '2px' }}>
                  YouTube • Instagram • TikTok • Facebook
                </div>
                {importUrlError && (
                  <div style={{ fontSize: '0.78rem', color: '#b91c1c', lineHeight: 1.4, marginTop: '2px' }}>
                    {importUrlError}
                  </div>
                )}
              </form>
            )}
          </div>

          {/* Footage Search & Header (Pinned) */}
          <div style={{ padding: '0.65rem 0.85rem 0.5rem', borderBottom: '1px solid #f0f0ec', flexShrink: 0, backgroundColor: '#ffffff' }}>
            <div
              style={{
                fontSize: '0.72rem',
                fontWeight: 650,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#7a808a',
                marginBottom: '0.45rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>Project Footage ({filteredVideos.length}{videoSearchQuery.trim() ? ` / ${videos.length}` : ''})</span>
              {videoSearchQuery.trim() && (
                <button
                  type="button"
                  onClick={() => setVideoSearchQuery('')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#1f6f4a',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Search Input Box */}
            <div style={{ position: 'relative' }}>
              <Search
                size={13}
                style={{
                  position: 'absolute',
                  left: '0.65rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#9ca3af',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                value={videoSearchQuery}
                onChange={(e) => setVideoSearchQuery(e.target.value)}
                placeholder="Search footage by name or status…"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '0.42rem 1.6rem 0.42rem 1.85rem',
                  fontSize: '0.78rem',
                  borderRadius: '6px',
                  border: '1px solid #e6e6e1',
                  backgroundColor: '#fafaf8',
                  color: '#16181d',
                  outline: 'none',
                  transition: 'all 0.15s ease',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#1f6f4a';
                  e.target.style.backgroundColor = '#ffffff';
                  e.target.style.boxShadow = '0 0 0 2px rgba(31, 111, 74, 0.12)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#e6e6e1';
                  e.target.style.backgroundColor = '#fafaf8';
                  e.target.style.boxShadow = 'none';
                }}
              />
              {videoSearchQuery && (
                <button
                  type="button"
                  onClick={() => setVideoSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '0.55rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    color: '#9ca3af',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Clear search"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Videos List */}
          <div className="studio-sidebar-scroll" style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '0.65rem 0.75rem' }}>
            {videos.length === 0 ? (
              <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#5b616b', fontSize: '0.875rem' }}>
                {activeProjectId ? <>No videos in this project yet.<br />Upload one to get started.</> : <>Create a project before uploading videos.</>}
              </div>
            ) : filteredVideos.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#7a808a', fontSize: '0.82rem' }}>
                <p style={{ margin: '0 0 0.5rem', fontWeight: 500 }}>No videos match "{videoSearchQuery}"</p>
                <button
                  type="button"
                  onClick={() => setVideoSearchQuery('')}
                  style={{
                    background: 'none',
                    border: '1px solid #e6e6e1',
                    borderRadius: '5px',
                    padding: '0.3rem 0.65rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#1f6f4a',
                    cursor: 'pointer',
                  }}
                >
                  Reset search
                </button>
              </div>
            ) : (
              filteredVideos.map((vid) => {
                const isSelected = selectedVideo?.id === vid.id;
                const isProcessingThis = vid.status === 'processing' || vid.status === 'pending';
                const statusColor =
                  vid.status === 'failed' ? '#c0392b' : isProcessingThis ? '#b45309' : (vid.status === 'completed' ? '#1f6f4a' : '#7a808a');
                return (
                  <div
                    key={vid.id}
                    onClick={() => {
                      if (selectedVideo?.id !== vid.id) {
                        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
                        setIsAnalyzing(false);
                        setClips([]);
                        setClipsVideoId(null);
                        setSelectedClip(null);
                        setSelectedMomentId(null);
                        setClipMediaUrl('');
                        setClipMediaClipId(null);
                        setClipPlaybackError(false);
                        setMomentWorkflowStep('moments');
                      }
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
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const currentName = vid.original_filename || `Video #${vid.id}`;
                        const nextName = window.prompt('Name this video', currentName)?.trim();
                        if (!nextName || nextName === currentName) return;
                        try {
                          const renamed = await api.renameVideo(vid.id, nextName);
                          setVideos((items) => items.map((item) => item.id === vid.id ? renamed : item));
                          setSelectedVideo((item) => item?.id === vid.id ? renamed : item);
                        } catch (error) {
                          setActionMessage(error.response?.data?.detail || 'Could not rename video.');
                        }
                      }}
                      title="Rename this video"
                      aria-label={`Rename ${vid.original_filename || `video ${vid.id}`}`}
                      style={{ padding: '0.3rem', border: 0, background: 'transparent', color: '#7a808a', cursor: 'pointer' }}
                    >
                      <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>Rename</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDialog({ type: 'video', id: vid.id, label: vid.original_filename || `Video #${vid.id}` });
                      }}
                      title="Delete this video"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '0.3rem',
                        borderRadius: '4px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        color: '#aaa',
                        cursor: 'pointer',
                        flexShrink: 0,
                        transition: 'color 0.15s ease',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.color = '#c0392b'}
                      onMouseLeave={(e) => e.currentTarget.style.color = '#aaa'}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Center & Right Column: Pipeline Stage & Clip Player */}
        <main className="studio-main studio-main-scroll" style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#fafaf8', height: '100%', maxHeight: '100%', overflowY: 'auto', minHeight: 0, minWidth: 0 }}>
          {selectedVideo ? (
            visibleSelectedClip && ['pending', 'rendering'].includes(visibleSelectedClip.status) ? (
              <div
                role="status"
                aria-live="polite"
                style={{
                  flex: 1,
                  minHeight: '100%',
                  width: '100%',
                  boxSizing: 'border-box',
                  position: 'relative',
                  backgroundColor: '#fafaf8',
                  color: '#16181d',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.7rem',
                }}
              >
                <button
                  onClick={handleBackToProject}
                  style={{ position: 'absolute', top: '1rem', left: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.55rem 0.8rem', border: '1px solid #e6e6e1', borderRadius: '6px', background: '#fff', color: '#16181d', fontWeight: 600, cursor: 'pointer' }}
                >
                  <ArrowLeft size={15} /> Back to project
                </button>
                <Loader size={30} className="render-loading-spinner" color="#1f6f4a" />
                <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Rendering your short…</div>
                <div style={{ fontSize: '0.9rem', color: '#5b616b' }}>Your video will appear when it’s ready.</div>
              </div>
            ) : (
              <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1200px', width: '100%', boxSizing: 'border-box', margin: '0 auto' }}>
                <button
                  onClick={handleBackToProject}
                  style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.55rem 0.8rem', border: '1px solid #e6e6e1', borderRadius: '6px', background: '#fff', color: '#16181d', fontWeight: 600, cursor: 'pointer' }}
                >
                  <ArrowLeft size={15} /> Back to project
                </button>
                {isAnalyzing ? (
                  <div style={{ background: '#fff', border: '1px solid #e6e6e1', borderRadius: '8px', padding: '1.25rem 1.5rem' }}>
                    <div style={{ color: '#7a808a', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Step 2 of 3 · Analyze</div>
                    <h2 style={{ margin: '0 0 0.3rem', fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif', color: '#16181d' }}>{selectedVideo.original_filename || `Video #${selectedVideo.id}`}</h2>
                    <p style={{ margin: 0, color: '#5b616b', fontSize: '0.9rem' }}>{pipelineStatus?.stage_label || 'Analyzing your video and finding five moments…'}</p>
                  </div>
                ) : hasAnalyzedMoments ? (
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
                      <div style={{ color: '#7a808a', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                        {momentWorkflowStep === 'moments' ? 'Step 1 of 2 · Choose a Viral Moment' : momentWorkflowStep === 'customize' ? 'Step 2 of 2 · Audio & Creator Outro' : 'Generated Shorts Workspace'}
                      </div>
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
                        {momentWorkflowStep === 'moments'
                          ? 'Select one of the five detected moments below, then click Next.'
                          : momentWorkflowStep === 'customize'
                          ? 'Customize your audio soundtrack and outro template, then render your 9:16 short.'
                          : 'Preview, download, and publish your generated 9:16 vertical shorts.'}
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                      {visibleClips.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.35rem', backgroundColor: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
                          <button
                            type="button"
                            onClick={() => setMomentWorkflowStep('moments')}
                            style={{
                              padding: '0.4rem 0.85rem',
                              fontSize: '0.82rem',
                              fontWeight: momentWorkflowStep !== 'clips' ? 700 : 500,
                              borderRadius: '6px',
                              border: 'none',
                              backgroundColor: momentWorkflowStep !== 'clips' ? '#ffffff' : 'transparent',
                              color: momentWorkflowStep !== 'clips' ? '#1f6f4a' : '#64748b',
                              boxShadow: momentWorkflowStep !== 'clips' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                            }}
                          >
                            <Film size={14} />
                            Moments (5)
                          </button>
                          <button
                            type="button"
                            onClick={() => setMomentWorkflowStep('clips')}
                            style={{
                              padding: '0.4rem 0.85rem',
                              fontSize: '0.82rem',
                              fontWeight: momentWorkflowStep === 'clips' ? 700 : 500,
                              borderRadius: '6px',
                              border: 'none',
                              backgroundColor: momentWorkflowStep === 'clips' ? '#ffffff' : 'transparent',
                              color: momentWorkflowStep === 'clips' ? '#1f6f4a' : '#64748b',
                              boxShadow: momentWorkflowStep === 'clips' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                            }}
                          >
                            <Sparkles size={14} />
                            Generated Clips ({visibleClips.length})
                          </button>
                        </div>
                      )}

                      {dubVoice && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: '#5b616b' }}>
                          Dub voice
                          <select value={speakerGender} onChange={(event) => setSpeakerGender(event.target.value)} disabled={actionLoading} style={{ padding: '0.55rem', border: '1px solid #e6e6e1', borderRadius: '6px', background: '#fff', color: '#16181d' }}>
                            <option value="female">Female</option><option value="male">Male</option>
                          </select>
                        </label>
                      )}
                    </div>
                  </div>
                ) : (
                  <section style={{ background: '#fff', border: '1px solid #e6e6e1', borderRadius: '10px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
                    <div style={{ color: '#7a808a', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Step 1 of 3 · Set up your short</div>
                    <h2 style={{ margin: '0 0 0.3rem', fontSize: '1.3rem', fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif', color: '#16181d' }}>{selectedVideo.original_filename || `Video #${selectedVideo.id}`}</h2>
                    <p style={{ margin: '0 0 1.25rem', color: '#5b616b', fontSize: '0.875rem' }}>Choose your video length and language options. We’ll analyze the source and find five moments to turn into a short.</p>
                    {actionMessage && <p style={{ margin: '-0.7rem 0 1rem', color: '#b91c1c', fontSize: '0.85rem' }}>{actionMessage}</p>}

                    <div className="studio-output-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, 0.9fr)', gap: '1.25rem', alignItems: 'start' }}>
                      <div style={{ background: '#111318', borderRadius: '8px', overflow: 'hidden', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {sourceVideoUrl ? <video key={selectedVideo.id} src={sourceVideoUrl} controls playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <div style={{ color: '#fff', fontSize: '0.9rem' }}><Loader size={18} className="render-loading-spinner" /> Loading source video…</div>}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', color: '#5b616b', fontSize: '0.83rem', fontWeight: 600 }}>
                          Maximum clip length
                          <select value={clipLength} onChange={(event) => setClipLength(Number(event.target.value))} disabled={actionLoading} style={{ padding: '0.65rem', border: '1px solid #e6e6e1', borderRadius: '6px', background: '#fff', color: '#16181d' }}>
                            <option value={15}>15 seconds</option><option value={30}>30 seconds</option><option value={45}>45 seconds</option><option value={60}>60 seconds</option>
                          </select>
                          <small style={{ color: '#7a808a', fontSize: '0.75rem', lineHeight: 1.45 }}>
                            {clipLength > 15
                              ? `A clear speech ending may shorten the clip to longer than ${clipLength - 15} and up to ${clipLength} seconds. Without a usable speech ending, it uses the full selected length.`
                              : 'The clip can be up to 15 seconds. Without a usable speech ending, it uses the full selected length.'}
                          </small>
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', color: '#5b616b', fontSize: '0.83rem', fontWeight: 600 }}>
                          Caption style
                          <select value={captionStyle} onChange={(event) => setCaptionStyle(event.target.value)} disabled={actionLoading} style={{ padding: '0.65rem', border: '1px solid #e6e6e1', borderRadius: '6px', background: '#fff', color: '#16181d' }}>
                            <option value="pop">Viral Pop</option><option value="karaoke">Karaoke</option><option value="minimalist">Minimal</option><option value="boxed">Boxed</option><option value="neon">Neon</option>
                          </select>
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', color: '#5b616b', fontSize: '0.83rem', fontWeight: 600 }}>
                          Caption translation
                          <select value={outputLanguage === 'original' ? 'original' : 'translated'} onChange={(event) => setOutputLanguage(event.target.value === 'original' ? 'original' : (outputLanguage === 'original' ? 'English' : outputLanguage))} disabled={actionLoading} style={{ padding: '0.65rem', border: '1px solid #e6e6e1', borderRadius: '6px', background: '#fff', color: '#16181d' }}>
                            <option value="original">Keep original language</option><option value="translated">Translate to…</option>
                          </select>
                          {outputLanguage !== 'original' && <>
                            <input list="translation-language-options" value={outputLanguage} onChange={(event) => setOutputLanguage(event.target.value)} disabled={actionLoading} placeholder="Type any language or ISO code" aria-label="Translation language" style={{ padding: '0.65rem', border: '1px solid #e6e6e1', borderRadius: '6px', background: '#fff', color: '#16181d' }} />
                            <datalist id="translation-language-options">
                              {['English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Bengali', 'Marathi', 'Gujarati', 'Punjabi', 'Urdu', 'Arabic', 'Chinese', 'Japanese', 'Korean', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Russian', 'Ukrainian', 'Dutch', 'Swedish', 'Norwegian', 'Danish', 'Finnish', 'Polish', 'Turkish', 'Greek', 'Hebrew', 'Thai', 'Vietnamese', 'Indonesian', 'Malay', 'Filipino', 'Swahili', 'Persian', 'Nepali', 'Sinhala'].map((language) => <option key={language} value={language} />)}
                            </datalist>
                          </>}
                        </label>
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.75rem', border: '1px solid #e6e6e1', borderRadius: '6px', color: '#16181d', cursor: outputLanguage === 'original' ? 'not-allowed' : 'pointer', opacity: outputLanguage === 'original' ? 0.6 : 1 }}>
                          <input type="checkbox" checked={dubVoice} disabled={actionLoading || outputLanguage === 'original'} onChange={(event) => setDubVoice(event.target.checked)} style={{ marginTop: '0.2rem' }} />
                          <span><strong style={{ display: 'block', fontSize: '0.85rem' }}>Dub the voice</strong><small style={{ color: '#5b616b', lineHeight: 1.4 }}>Create translated speech in the selected caption language.</small></span>
                        </label>
                        {dubVoice && <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', color: '#5b616b', fontSize: '0.83rem', fontWeight: 600 }}>
                          Dub voice
                          <select value={speakerGender} onChange={(event) => setSpeakerGender(event.target.value)} disabled={actionLoading} style={{ padding: '0.65rem', border: '1px solid #e6e6e1', borderRadius: '6px', background: '#fff', color: '#16181d' }}>
                            <option value="female">Female voice</option><option value="male">Male voice</option>
                          </select>
                        </label>}
                        <button
                          disabled={actionLoading || isAnalyzing}
                          onClick={handleAnalyzeMoments}
                          style={{ display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.8rem 1rem', border: 0, borderRadius: '6px', background: actionLoading ? '#7a808a' : '#1f6f4a', color: '#fff', fontSize: '0.9rem', fontWeight: 700, cursor: actionLoading ? 'wait' : 'pointer' }}
                        >
                          <Wand2 size={16} /> Analyze and Find 5 Moments
                        </button>
                      </div>
                    </div>
                  </section>
                )}

                {actionMessage && !isAnalyzing && hasAnalyzedMoments && (
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

                {hasAnalyzedMoments && !isAnalyzing && (
                  <section style={{ background: '#fff', border: '1px solid #e6e6e1', borderRadius: '10px', padding: '1.25rem' }}>
                    {/* Moments Section Header */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid #ecece7',
                      paddingBottom: '0.85rem',
                      marginBottom: '1.25rem',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                        <div style={{
                          width: 28,
                          height: 28,
                          borderRadius: '6px',
                          backgroundColor: '#ecfdf5',
                          border: '1px solid #a7f3d0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#1f6f4a',
                        }}>
                          <Film size={15} />
                        </div>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#16181d', lineHeight: 1.2 }}>
                            Detected Viral Moments ({selectedVideo?.highlights?.clips?.length || 5})
                          </h3>
                          <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                            Choose a moment below, then click Create Video to configure audio &amp; render.
                          </p>
                        </div>
                      </div>

                      {selectedMomentId != null && (
                        <div style={{ fontSize: '0.78rem', color: '#5b616b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span>Selected:</span>
                          <strong style={{ color: '#16181d', background: '#ecfdf5', padding: '2px 8px', borderRadius: '4px', border: '1px solid #a7f3d0' }}>
                            {selectedVideo.highlights.clips[selectedMomentId]?.title || `Moment ${selectedMomentId + 1}`}
                          </strong>
                        </div>
                      )}
                    </div>

                    {/* ════════ MOMENTS LIST ════════ */}
                    <div>
                      <div style={{ marginBottom: '1rem' }}>
                        <h3 style={{ margin: '0 0 0.25rem', color: '#16181d', fontSize: '1.05rem' }}>Top Moments from This Video</h3>
                        <p style={{ margin: 0, color: '#5b616b', fontSize: '0.825rem' }}>
                          Preview the source audio for each exact timestamp, select one moment, then click <strong>Create Video</strong> to customize soundtrack, outro &amp; render.
                        </p>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                        {selectedVideo.highlights.clips.slice(0, 5).map((moment, index) => (
                          <div
                            key={`${selectedVideo.id}-moment-${index}`}
                            onClick={() => {
                              setSelectedMomentId(index);
                              const existingMomentClip = visibleClips.find((clip) => clip.edit_options?.workflow === 'selected_moment_v1'
                                && clip.edit_options?.selected_moment_id === index);
                              setSelectedClip(existingMomentClip || null);
                            }}
                            style={{
                              border: selectedMomentId === index ? '2px solid #1f6f4a' : '1px solid #e6e6e1',
                              borderRadius: '8px',
                              padding: '0.85rem',
                              background: selectedMomentId === index ? '#f2faf5' : '#ffffff',
                              cursor: 'pointer',
                              boxShadow: selectedMomentId === index ? '0 2px 8px rgba(31, 111, 74, 0.08)' : 'none',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name={`moment-${selectedVideo.id}`}
                                checked={selectedMomentId === index}
                                onChange={() => {
                                  setSelectedMomentId(index);
                                  const existingMomentClip = visibleClips.find((clip) => clip.edit_options?.workflow === 'selected_moment_v1'
                                    && clip.edit_options?.selected_moment_id === index);
                                  setSelectedClip(existingMomentClip || null);
                                }}
                                style={{ marginTop: '0.2rem' }}
                              />
                              <span style={{ flex: 1 }}>
                                <strong style={{ display: 'block', color: '#16181d', fontSize: '0.9rem' }}>{moment.title || `Moment ${index + 1}`}</strong>
                                <small style={{ color: '#5b616b', fontSize: '0.75rem' }}>{Number(moment.start_time).toFixed(1)}s–{Number(moment.end_time).toFixed(1)}s · {moment.duration}s</small>
                              </span>
                            </label>
                            {moment.reason && <p style={{ fontSize: '0.76rem', color: '#5b616b', margin: '0.45rem 0' }}>{moment.reason}</p>}
                            <div style={{ marginTop: '0.45rem' }} onClick={(e) => e.stopPropagation()}>
                              {momentAudioUrls[index] ? (
                                <audio controls preload="none" src={momentAudioUrls[index]} style={{ width: '100%', height: 32 }} />
                              ) : (
                                <small style={{ color: '#7a808a', fontSize: '0.72rem' }}>Original audio preview unavailable</small>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Step 1 Bottom Action Bar */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                        paddingTop: '1rem',
                        borderTop: '1px solid #ecece7',
                      }}>
                        <div style={{ fontSize: '0.825rem', color: '#5b616b' }}>
                          {selectedMomentId != null ? (
                            <span>Selected: <strong style={{ color: '#16181d' }}>{selectedVideo.highlights.clips[selectedMomentId]?.title || `Moment ${selectedMomentId + 1}`}</strong></span>
                          ) : (
                            <span style={{ color: '#d97706' }}>Choose one moment above, then click Create Video</span>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={selectedMomentId == null}
                          onClick={() => setShowAudioModal(true)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.7rem 1.6rem',
                            borderRadius: '6px',
                            backgroundColor: selectedMomentId == null ? '#7a808a' : '#1f6f4a',
                            color: '#ffffff',
                            border: 'none',
                            fontSize: '0.92rem',
                            fontWeight: 700,
                            cursor: selectedMomentId == null ? 'not-allowed' : 'pointer',
                            boxShadow: selectedMomentId != null ? '0 2px 8px rgba(31, 111, 74, 0.25)' : 'none',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <Wand2 size={16} />
                          <span>Create Video</span>
                        </button>
                      </div>
                    </div>


                    {/* ════════ AUDIO & OUTRO CUSTOMIZATION MODAL (SHOWN AFTER CREATE BUTTON CLICK) ════════ */}
                    {showAudioModal && selectedMomentId != null && selectedVideo && (
                      <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="audio-customization-modal-title"
                        style={{
                          position: 'fixed',
                          inset: 0,
                          backgroundColor: 'rgba(15, 23, 42, 0.65)',
                          backdropFilter: 'blur(5px)',
                          zIndex: 9998,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '1.25rem',
                        }}
                        onClick={(e) => {
                          if (e.target === e.currentTarget) setShowAudioModal(false);
                        }}
                      >
                        <div
                          style={{
                            backgroundColor: '#ffffff',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.28)',
                            maxWidth: '920px',
                            width: '100%',
                            maxHeight: '90vh',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Modal Header */}
                          <div style={{
                            padding: '0.9rem 1.25rem',
                            borderBottom: '1px solid #e2e8f0',
                            backgroundColor: '#fafaf9',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                              <div style={{ width: 34, height: 34, borderRadius: '8px', backgroundColor: '#ecfdf5', color: '#1f6f4a', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #a7f3d0' }}>
                                <Music size={18} />
                              </div>
                              <div>
                                <h3 id="audio-customization-modal-title" style={{ margin: 0, fontSize: '1.02rem', fontWeight: 700, color: '#0f172a' }}>
                                  Audio Track &amp; Creator Outro Settings
                                </h3>
                                <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                                  Moment: <strong>{selectedVideo.highlights.clips[selectedMomentId]?.title || `Moment ${selectedMomentId + 1}`}</strong> ({Number(selectedVideo.highlights.clips[selectedMomentId]?.start_time).toFixed(1)}s – {Number(selectedVideo.highlights.clips[selectedMomentId]?.end_time).toFixed(1)}s · {selectedVideo.highlights.clips[selectedMomentId]?.duration}s)
                                </p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => setShowAudioModal(false)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#64748b',
                                cursor: 'pointer',
                                padding: '6px',
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                              title="Close"
                            >
                              <X size={20} />
                            </button>
                          </div>

                          {/* Modal Body (Scrollable) */}
                          <div style={{
                            flex: 1,
                            overflowY: 'auto',
                            padding: '1.25rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1.25rem',
                          }}>

                            {/* ── CARD 1: AUDIO & SOUNDTRACK ── */}
                            <div style={{
                              backgroundColor: '#ffffff',
                              border: '1px solid #e6e6e1',
                              borderRadius: '10px',
                              padding: '1.15rem',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.85rem',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <div style={{ width: 32, height: 32, borderRadius: '6px', background: '#ecfdf5', color: '#1f6f4a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <Music size={17} />
                                </div>
                                <div>
                                  <strong style={{ fontSize: '0.95rem', color: '#16181d', display: 'block' }}>Audio Track &amp; Soundtrack</strong>
                                  <span style={{ fontSize: '0.78rem', color: '#5b616b' }}>Keep original audio, add background music with ducking, or replace with custom audio</span>
                                </div>
                              </div>

                              {/* Mode Tabs */}
                              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  onClick={() => setAudioMode('original')}
                                  style={{
                                    padding: '0.5rem 0.85rem',
                                    borderRadius: '6px',
                                    border: audioMode === 'original' ? '1.5px solid #1f6f4a' : '1px solid #e6e6e1',
                                    background: audioMode === 'original' ? '#f2faf5' : '#fff',
                                    color: audioMode === 'original' ? '#1f6f4a' : '#16181d',
                                    fontWeight: audioMode === 'original' ? 650 : 500,
                                    fontSize: '0.825rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    transition: 'all 0.15s ease'
                                  }}
                                >
                                  <Volume2 size={14} />
                                  Original Audio Only
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setAudioMode('mix')}
                                  style={{
                                    padding: '0.5rem 0.85rem',
                                    borderRadius: '6px',
                                    border: audioMode === 'mix' ? '1.5px solid #1f6f4a' : '1px solid #e6e6e1',
                                    background: audioMode === 'mix' ? '#f2faf5' : '#fff',
                                    color: audioMode === 'mix' ? '#1f6f4a' : '#16181d',
                                    fontWeight: audioMode === 'mix' ? 650 : 500,
                                    fontSize: '0.825rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    transition: 'all 0.15s ease'
                                  }}
                                >
                                  <Music size={14} />
                                  Background Music (Mix)
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setAudioMode('replace')}
                                  style={{
                                    padding: '0.5rem 0.85rem',
                                    borderRadius: '6px',
                                    border: audioMode === 'replace' ? '1.5px solid #1f6f4a' : '1px solid #e6e6e1',
                                    background: audioMode === 'replace' ? '#f2faf5' : '#fff',
                                    color: audioMode === 'replace' ? '#1f6f4a' : '#16181d',
                                    fontWeight: audioMode === 'replace' ? 650 : 500,
                                    fontSize: '0.825rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    transition: 'all 0.15s ease'
                                  }}
                                >
                                  <Film size={14} />
                                  Replace Video Audio
                                </button>
                              </div>

                              {/* Controls when Mix or Replace is selected */}
                              {audioMode !== 'original' && (
                                <div style={{ background: '#fafaf8', border: '1px solid #e6e6e1', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                  {/* Audio Source Picker (Preset vs Upload) */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.825rem', fontWeight: 600, color: '#16181d' }}>Soundtrack Source:</span>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.825rem', cursor: 'pointer', color: '#16181d' }}>
                                      <input
                                        type="radio"
                                        name="audioSourceType"
                                        value="preset"
                                        checked={audioSourceType === 'preset'}
                                        onChange={() => {
                                          setAudioSourceType('preset');
                                          setShowPresetModal(true);
                                        }}
                                      />
                                      Preset Music Style
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.825rem', cursor: 'pointer', color: '#16181d' }}>
                                      <input
                                        type="radio"
                                        name="audioSourceType"
                                        value="upload"
                                        checked={audioSourceType === 'upload'}
                                        onChange={() => setAudioSourceType('upload')}
                                      />
                                      Upload Custom Audio (MP3/WAV)
                                    </label>
                                  </div>

                                  {/* Audio element for preset streaming */}
                                  <audio
                                    ref={previewAudioRef}
                                    onEnded={() => setPlayingPresetId(null)}
                                    onPause={() => setPlayingPresetId(null)}
                                    style={{ display: 'none' }}
                                  />

                                  {/* Compact Preset Selected View */}
                                  {audioSourceType === 'preset' && (() => {
                                    const activePresetObj = MUSIC_PRESETS.find((p) => p.id === musicPreset) || MUSIC_PRESETS[0];
                                    const isCurrentlyPlaying = playingPresetId === musicPreset;
                                    const isCurrentlyLoading = loadingPresetId === musicPreset;

                                    return (
                                      <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        flexWrap: 'wrap',
                                        gap: '0.75rem',
                                        backgroundColor: '#ffffff',
                                        border: '1px solid #d5eadd',
                                        borderRadius: '8px',
                                        padding: '0.75rem 1rem',
                                        boxShadow: '0 1px 3px rgba(31, 111, 74, 0.05)'
                                      }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                          <div style={{
                                            width: 40,
                                            height: 40,
                                            borderRadius: '8px',
                                            backgroundColor: '#ecfdf5',
                                            border: '1px solid #a7f3d0',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '1.25rem'
                                          }}>
                                            {activePresetObj.emoji}
                                          </div>
                                          <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                              <strong style={{ fontSize: '0.9rem', color: '#16181d' }}>{activePresetObj.label}</strong>
                                              <span style={{
                                                fontSize: '0.675rem',
                                                fontWeight: 700,
                                                color: '#1f6f4a',
                                                background: '#ecfdf5',
                                                padding: '1px 6px',
                                                borderRadius: '4px',
                                                border: '1px solid #a7f3d0'
                                              }}>
                                                ACTIVE SOUNDTRACK
                                              </span>
                                            </div>
                                            <span style={{ fontSize: '0.76rem', color: '#5b616b' }}>
                                              {activePresetObj.genre} · {activePresetObj.desc}
                                            </span>
                                          </div>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                          {/* Listen / Pause Button */}
                                          <button
                                            type="button"
                                            onClick={() => togglePlayPreset(musicPreset)}
                                            style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '0.4rem',
                                              padding: '0.45rem 0.85rem',
                                              borderRadius: '6px',
                                              backgroundColor: isCurrentlyPlaying ? '#16181d' : '#1f6f4a',
                                              color: '#ffffff',
                                              border: 'none',
                                              fontSize: '0.825rem',
                                              fontWeight: 650,
                                              cursor: 'pointer',
                                              boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                                              transition: 'all 0.15s ease'
                                            }}
                                          >
                                            {isCurrentlyLoading ? (
                                              <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />
                                            ) : isCurrentlyPlaying ? (
                                              <Pause size={13} />
                                            ) : (
                                              <Play size={13} />
                                            )}
                                            {isCurrentlyLoading ? 'Loading…' : isCurrentlyPlaying ? 'Pause Audio' : 'Play Audio'}
                                          </button>

                                          {/* Pop-up button */}
                                          <button
                                            type="button"
                                            onClick={() => setShowPresetModal(true)}
                                            style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '0.4rem',
                                              padding: '0.45rem 0.85rem',
                                              borderRadius: '6px',
                                              backgroundColor: '#ffffff',
                                              color: '#16181d',
                                              border: '1px solid #d7d7d1',
                                              fontSize: '0.825rem',
                                              fontWeight: 600,
                                              cursor: 'pointer',
                                              transition: 'all 0.15s ease'
                                            }}
                                          >
                                            <Music size={13} color="#1f6f4a" />
                                            Change Style
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })()}

                                  {/* Compact Preset Pop-Up Modal */}
                                  {showPresetModal && (
                                    <div
                                      role="dialog"
                                      aria-modal="true"
                                      aria-labelledby="preset-modal-title"
                                      style={{
                                        position: 'fixed',
                                        inset: 0,
                                        backgroundColor: 'rgba(22, 24, 29, 0.5)',
                                        backdropFilter: 'blur(3px)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '1rem',
                                        zIndex: 9999,
                                      }}
                                      onClick={(e) => {
                                        if (e.target === e.currentTarget) setShowPresetModal(false);
                                      }}
                                    >
                                      <div
                                        style={{
                                          backgroundColor: '#ffffff',
                                          borderRadius: '10px',
                                          border: '1px solid #e6e6e1',
                                          boxShadow: '0 12px 35px rgba(0, 0, 0, 0.18)',
                                          maxWidth: '440px',
                                          width: '100%',
                                          maxHeight: '72vh',
                                          display: 'flex',
                                          flexDirection: 'column',
                                          overflow: 'hidden',
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {/* Modal Header */}
                                        <div
                                          style={{
                                            padding: '0.65rem 0.9rem',
                                            borderBottom: '1px solid #ecece7',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            backgroundColor: '#fafaf8',
                                          }}
                                        >
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <div
                                              style={{
                                                width: 28,
                                                height: 28,
                                                borderRadius: '6px',
                                                backgroundColor: '#ecfdf5',
                                                color: '#1f6f4a',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                border: '1px solid #a7f3d0',
                                              }}
                                            >
                                              <Music size={14} />
                                            </div>
                                            <div>
                                              <h3
                                                id="preset-modal-title"
                                                style={{
                                                  margin: 0,
                                                  fontSize: '0.925rem',
                                                  fontWeight: 700,
                                                  color: '#16181d',
                                                  lineHeight: 1.2,
                                                }}
                                              >
                                                Preset Music Styles
                                              </h3>
                                              <p style={{ margin: '0.1rem 0 0', fontSize: '0.72rem', color: '#6e7480' }}>
                                                Preview sample audio before choosing
                                              </p>
                                            </div>
                                          </div>

                                          <button
                                            type="button"
                                            onClick={() => setShowPresetModal(false)}
                                            style={{
                                              background: 'transparent',
                                              border: 'none',
                                              color: '#7a808a',
                                              cursor: 'pointer',
                                              padding: '4px',
                                              borderRadius: '5px',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                            }}
                                            title="Close"
                                          >
                                            <X size={17} />
                                          </button>
                                        </div>

                                        {/* Modal Body: Track List */}
                                        <div
                                          style={{
                                            padding: '0.6rem 0.75rem',
                                            overflowY: 'auto',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.35rem',
                                            maxHeight: 'calc(72vh - 95px)',
                                          }}
                                        >
                                          {MUSIC_PRESETS.map((preset) => {
                                            const isSelected = musicPreset === preset.id;
                                            const isPlaying = playingPresetId === preset.id;
                                            const isLoading = loadingPresetId === preset.id;

                                            return (
                                              <div
                                                key={preset.id}
                                                style={{
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  justifyContent: 'space-between',
                                                  gap: '0.55rem',
                                                  padding: '0.4rem 0.6rem',
                                                  borderRadius: '7px',
                                                  border: isSelected ? '1.5px solid #1f6f4a' : '1px solid #e9ebe6',
                                                  backgroundColor: isSelected ? '#f2faf5' : '#ffffff',
                                                  transition: 'background-color 0.12s ease',
                                                }}
                                              >
                                                {/* Left: Play / Pause Button */}
                                                <button
                                                  type="button"
                                                  onClick={() => togglePlayPreset(preset.id)}
                                                  title={isPlaying ? 'Pause' : `Play ${preset.label}`}
                                                  style={{
                                                    width: 30,
                                                    height: 30,
                                                    borderRadius: '50%',
                                                    backgroundColor: isPlaying ? '#16181d' : '#1f6f4a',
                                                    color: '#ffffff',
                                                    border: 'none',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    cursor: 'pointer',
                                                    flexShrink: 0,
                                                    transition: 'background-color 0.15s ease',
                                                  }}
                                                >
                                                  {isLoading ? (
                                                    <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />
                                                  ) : isPlaying ? (
                                                    <Pause size={13} />
                                                  ) : (
                                                    <Play size={13} style={{ marginLeft: 1 }} />
                                                  )}
                                                </button>

                                                {/* Middle: Details */}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                    <span style={{ fontSize: '0.95rem', lineHeight: 1 }}>{preset.emoji}</span>
                                                    <span
                                                      style={{
                                                        fontSize: '0.82rem',
                                                        fontWeight: 650,
                                                        color: isSelected ? '#1f6f4a' : '#16181d',
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                      }}
                                                    >
                                                      {preset.label}
                                                    </span>
                                                    {isPlaying && (
                                                      <span
                                                        style={{
                                                          fontSize: '0.62rem',
                                                          fontWeight: 700,
                                                          color: '#1f6f4a',
                                                          background: '#ecfdf5',
                                                          padding: '1px 5px',
                                                          borderRadius: '3px',
                                                          border: '1px solid #a7f3d0',
                                                        }}
                                                      >
                                                        PLAYING
                                                      </span>
                                                    )}
                                                    {isSelected && !isPlaying && (
                                                      <span
                                                        style={{
                                                          fontSize: '0.62rem',
                                                          fontWeight: 700,
                                                          color: '#1f6f4a',
                                                          background: '#ffffff',
                                                          padding: '1px 5px',
                                                          borderRadius: '3px',
                                                          border: '1px solid #1f6f4a',
                                                        }}
                                                      >
                                                        CHOSEN
                                                      </span>
                                                    )}
                                                  </div>
                                                  <div
                                                    style={{
                                                      fontSize: '0.71rem',
                                                      color: '#6e7480',
                                                      whiteSpace: 'nowrap',
                                                      overflow: 'hidden',
                                                      textOverflow: 'ellipsis',
                                                      marginTop: '0.1rem',
                                                    }}
                                                    title={`${preset.genre} · ${preset.desc}`}
                                                  >
                                                    <span style={{ color: '#2d3139', fontWeight: 600 }}>{preset.genre}</span> · {preset.desc}
                                                  </div>
                                                </div>

                                                {/* Right: Select Button */}
                                                <button
                                                  type="button"
                                                  onClick={() => handleSelectAndClosePreset(preset.id)}
                                                  style={{
                                                    padding: '0.28rem 0.55rem',
                                                    borderRadius: '5px',
                                                    border: isSelected ? '1px solid #1f6f4a' : '1px solid #d7d7d1',
                                                    backgroundColor: isSelected ? '#1f6f4a' : '#ffffff',
                                                    color: isSelected ? '#ffffff' : '#16181d',
                                                    fontSize: '0.74rem',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.25rem',
                                                    flexShrink: 0,
                                                  }}
                                                >
                                                  {isSelected ? <Check size={12} /> : null}
                                                  {isSelected ? 'Done' : 'Select'}
                                                </button>
                                              </div>
                                            );
                                          })}
                                        </div>

                                        {/* Modal Footer */}
                                        <div
                                          style={{
                                            padding: '0.55rem 0.85rem',
                                            borderTop: '1px solid #ecece7',
                                            backgroundColor: '#fafaf8',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '0.5rem',
                                          }}
                                        >
                                          <div style={{ fontSize: '0.74rem', color: '#6e7480' }}>
                                            Active: <strong style={{ color: '#16181d' }}>{MUSIC_PRESETS.find((p) => p.id === musicPreset)?.label}</strong>
                                          </div>

                                          <button
                                            type="button"
                                            onClick={() => setShowPresetModal(false)}
                                            style={{
                                              padding: '0.35rem 0.85rem',
                                              borderRadius: '5px',
                                              backgroundColor: '#1f6f4a',
                                              color: '#ffffff',
                                              border: 'none',
                                              fontSize: '0.78rem',
                                              fontWeight: 650,
                                              cursor: 'pointer',
                                            }}
                                          >
                                            Close
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Upload custom audio */}
                                  {audioSourceType === 'upload' && (
                                    <div>
                                      <input
                                        type="file"
                                        ref={audioFileInputRef}
                                        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
                                        onChange={handleAudioUpload}
                                        style={{ display: 'none' }}
                                      />
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                        <button
                                          type="button"
                                          disabled={isUploadingAudio}
                                          onClick={() => audioFileInputRef.current?.click()}
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.4rem',
                                            padding: '0.5rem 0.9rem',
                                            borderRadius: '6px',
                                            border: '1px solid #1f6f4a',
                                            background: '#fff',
                                            color: '#1f6f4a',
                                            fontSize: '0.825rem',
                                            fontWeight: 600,
                                            cursor: isUploadingAudio ? 'wait' : 'pointer'
                                          }}
                                        >
                                          {isUploadingAudio ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <UploadCloud size={14} />}
                                          {isUploadingAudio ? 'Uploading audio…' : (customAudioName ? 'Change Audio File' : 'Choose Audio File (MP3, WAV, M4A)')}
                                        </button>

                                        {customAudioName && (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ fontSize: '0.825rem', color: '#16181d', fontWeight: 650, padding: '0.3rem 0.65rem', background: '#ecfdf5', borderRadius: '4px', border: '1px solid #a7f3d0' }}>
                                              🎵 {customAudioName}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setCustomAudioPath('');
                                                setCustomAudioName('');
                                                setCustomAudioPreviewUrl('');
                                              }}
                                              style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', padding: 2 }}
                                              title="Remove audio track"
                                            >
                                              <Trash2 size={14} />
                                            </button>
                                          </div>
                                        )}
                                      </div>

                                      {customAudioPreviewUrl && (
                                        <div style={{ marginTop: '0.65rem' }}>
                                          <div style={{ fontSize: '0.75rem', color: '#5b616b', marginBottom: '0.25rem' }}>Uploaded audio preview:</div>
                                          <audio controls src={customAudioPreviewUrl} style={{ width: '100%', height: 32 }} />
                                        </div>
                                      )}

                                      {audioUploadError && (
                                        <div style={{ marginTop: '0.45rem', color: '#b91c1c', fontSize: '0.8rem' }}>
                                          {audioUploadError}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Volume Ducking Slider (if Mix mode) */}
                                  {audioMode === 'mix' && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', paddingTop: '0.25rem' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.825rem', fontWeight: 600, color: '#16181d' }}>
                                        <Volume2 size={15} color="#1f6f4a" />
                                        BGM Volume Ducking:
                                      </div>
                                      <input
                                        type="range"
                                        min="0.05"
                                        max="0.50"
                                        step="0.01"
                                        value={musicVolume}
                                        onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                                        style={{ width: '150px', cursor: 'pointer', accentColor: '#1f6f4a' }}
                                      />
                                      <span style={{ fontSize: '0.825rem', color: '#5b616b', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                                        {Math.round(musicVolume * 100)}% {musicVolume <= 0.12 ? '(Subtle)' : musicVolume <= 0.25 ? '(Balanced)' : '(Prominent)'}
                                      </span>
                                      <span style={{ fontSize: '0.75rem', color: '#7a808a' }}>Original speech stays loud &amp; clear above the music</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* ── CARD 2: 9:16 CREATOR OUTRO SCREEN (LAST FEW SECONDS) ── */}
                            <div style={{
                              backgroundColor: '#ffffff',
                              border: '1px solid #e2e8f0',
                              borderRadius: '10px',
                              padding: '1.15rem',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '1rem',
                              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
                            }}>
                              {/* Header & Toggle */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                  <div style={{ width: 36, height: 36, borderRadius: '8px', backgroundColor: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #fecaca' }}>
                                    <Sparkles size={18} />
                                  </div>
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                      <strong style={{ fontSize: '0.96rem', color: '#16181d' }}>9:16 Creator Outro Screen (Ending Seconds)</strong>
                                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#ef4444', backgroundColor: '#fee2e2', padding: '1px 7px', borderRadius: '4px', border: '1px solid #fca5a5' }}>
                                        9:16 OUTRO
                                      </span>
                                    </div>
                                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                      Appended after video &amp; audio finish (plays for the last few seconds, even if video is &gt;60s)
                                    </span>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                                  <button
                                    type="button"
                                    onClick={() => setOutroMode('template')}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.4rem',
                                      padding: '0.42rem 0.85rem',
                                      borderRadius: '6px',
                                      border: outroMode === 'template' ? '1.5px solid #1f6f4a' : '1px solid #cbd5e1',
                                      backgroundColor: outroMode === 'template' ? '#ecfdf5' : '#ffffff',
                                      color: outroMode === 'template' ? '#1f6f4a' : '#475569',
                                      fontSize: '0.82rem',
                                      fontWeight: outroMode === 'template' ? 700 : 500,
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease',
                                    }}
                                  >
                                    <Film size={14} />
                                    Cloudflare R2 Templates
                                    <span style={{
                                      fontSize: '0.66rem',
                                      fontWeight: 700,
                                      backgroundColor: outroMode === 'template' ? '#1f6f4a' : '#f1f5f9',
                                      color: outroMode === 'template' ? '#ffffff' : '#475569',
                                      padding: '1px 6px',
                                      borderRadius: '8px'
                                    }}>
                                      10 Ready
                                    </span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setOutroMode('custom')}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.4rem',
                                      padding: '0.42rem 0.85rem',
                                      borderRadius: '6px',
                                      border: outroMode === 'custom' ? '1.5px solid #1f6f4a' : '1px solid #cbd5e1',
                                      backgroundColor: outroMode === 'custom' ? '#ecfdf5' : '#ffffff',
                                      color: outroMode === 'custom' ? '#1f6f4a' : '#475569',
                                      fontSize: '0.82rem',
                                      fontWeight: outroMode === 'custom' ? 700 : 500,
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease',
                                    }}
                                  >
                                    <Wand2 size={14} />
                                    Custom 9:16 Builder
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setOutroMode('none')}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.35rem',
                                      padding: '0.42rem 0.75rem',
                                      borderRadius: '6px',
                                      border: outroMode === 'none' ? '1.5px solid #94a3b8' : '1px solid #cbd5e1',
                                      backgroundColor: outroMode === 'none' ? '#f1f5f9' : '#ffffff',
                                      color: outroMode === 'none' ? '#334155' : '#64748b',
                                      fontSize: '0.82rem',
                                      fontWeight: outroMode === 'none' ? 700 : 500,
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease',
                                    }}
                                  >
                                    <X size={14} />
                                    No Outro
                                  </button>
                                </div>
                              </div>

                              {/* MODE 1: CLOUDFLARE R2 VIDEO TEMPLATES */}
                              {outroMode === 'template' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
                                  {/* Category filter pills & R2 Cloud note */}
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem' }}>
                                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                      {[
                                        { id: 'all', label: 'All Templates' },
                                        { id: 'Outro', label: 'Outros' },
                                        { id: 'Subscribe', label: 'Subscribe CTAs' },
                                        { id: 'Profile Outro', label: 'Profile Outros' },
                                        { id: 'All-in-One', label: 'All-in-One' },
                                        { id: 'Social Story', label: 'Social Story' },
                                      ].map((cat) => {
                                        const count = cat.id === 'all'
                                          ? templates.length
                                          : templates.filter((t) => t.category === cat.id).length;
                                        return (
                                          <button
                                            key={cat.id}
                                            type="button"
                                            onClick={() => setTemplateFilterCategory(cat.id)}
                                            style={{
                                              fontSize: '0.75rem',
                                              fontWeight: templateFilterCategory === cat.id ? 700 : 500,
                                              padding: '0.3rem 0.65rem',
                                              borderRadius: '6px',
                                              border: templateFilterCategory === cat.id ? '1px solid #1f6f4a' : '1px solid #e2e8f0',
                                              backgroundColor: templateFilterCategory === cat.id ? '#ecfdf5' : '#ffffff',
                                              color: templateFilterCategory === cat.id ? '#1f6f4a' : '#475569',
                                              cursor: 'pointer',
                                              transition: 'all 0.15s ease',
                                            }}
                                          >
                                            {cat.label} ({count})
                                          </button>
                                        );
                                      })}
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.74rem', color: '#64748b' }}>
                                      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#22c55e', display: 'inline-block' }} />
                                      <span>Served from <strong>Cloudflare R2</strong> (High-Speed CDN)</span>
                                    </div>
                                  </div>

                                  {/* 2-Column layout: Left Templates Grid, Right 9:16 Video Player Mockup */}
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '1.25rem', alignItems: 'start' }}>
                                    {/* Left: Templates Cards Grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', maxHeight: '540px', overflowY: 'auto', paddingRight: '4px' }}>
                                      {templates
                                        .filter((t) => templateFilterCategory === 'all' || t.category === templateFilterCategory)
                                        .map((tmpl) => {
                                          const isSelected = selectedTemplateId === tmpl.id;
                                          const isPlaying = playingTemplateCardId === tmpl.id;
                                          return (
                                            <div
                                              key={tmpl.id}
                                              className={`template-card ${isSelected ? 'selected' : ''}`}
                                              onClick={() => setSelectedTemplateId(tmpl.id)}
                                              style={{
                                                border: isSelected ? '2px solid #1f6f4a' : '1.5px solid #e2e8f0',
                                                boxShadow: isSelected ? '0 4px 14px rgba(31, 111, 74, 0.15)' : 'none',
                                              }}
                                            >
                                              {/* Preview Box */}
                                              <div className="template-preview-box" style={{ maxHeight: '180px' }}>
                                                {tmpl.video_url ? (
                                                  <video
                                                    src={tmpl.video_url}
                                                    muted
                                                    loop
                                                    playsInline
                                                    autoPlay={isSelected || isPlaying}
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    onMouseEnter={(e) => e.target.play().catch(() => { })}
                                                    onMouseLeave={(e) => { if (!isSelected) e.target.pause(); }}
                                                  />
                                                ) : tmpl.thumb_url ? (
                                                  <img src={tmpl.thumb_url} alt={tmpl.title} />
                                                ) : (
                                                  <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>9:16 Video</div>
                                                )}

                                                <span className="template-category-badge">{tmpl.category}</span>
                                                <span className="template-duration-badge">{tmpl.duration}s</span>

                                                {isSelected && (
                                                  <div style={{
                                                    position: 'absolute',
                                                    bottom: '6px',
                                                    right: '6px',
                                                    backgroundColor: '#1f6f4a',
                                                    color: '#ffffff',
                                                    borderRadius: '50%',
                                                    width: 22,
                                                    height: 22,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                                                  }}>
                                                    <Check size={13} strokeWidth={3} />
                                                  </div>
                                                )}
                                              </div>

                                              {/* Details */}
                                              <div style={{ padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, justifyContent: 'space-between' }}>
                                                <div>
                                                  <strong style={{ fontSize: '0.78rem', color: '#0f172a', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.25 }}>
                                                    {tmpl.title}
                                                  </strong>
                                                  <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: '#64748b', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                    {tmpl.description}
                                                  </p>
                                                </div>

                                                <div style={{ marginTop: '0.4rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                  <span style={{ fontSize: '0.65rem', color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1px 5px', borderRadius: '4px', fontWeight: 650 }}>
                                                    {tmpl.badge || '9:16 Outro'}
                                                  </span>
                                                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: isSelected ? '#1f6f4a' : '#64748b' }}>
                                                    {isSelected ? '✓ Selected' : 'Choose'}
                                                  </span>
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                    </div>

                                    {/* Right: Live 9:16 Mobile Mockup Frame previewing selected template */}
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                      {(() => {
                                        const currentTmpl = templates.find((t) => t.id === selectedTemplateId) || templates[0];
                                        return (
                                          <>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: '230px', marginBottom: '0.5rem' }}>
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block', boxShadow: '0 0 6px #10b981' }} />
                                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>Live R2 Video Preview</span>
                                              </div>
                                              <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                                                {currentTmpl?.duration}s Ending
                                              </span>
                                            </div>

                                            {/* Smartphone Frame */}
                                            <div
                                              className="outro-phone-frame"
                                              style={{
                                                width: '225px',
                                                aspectRatio: '9 / 16',
                                                borderRadius: '24px',
                                                border: '4px solid #334155',
                                                position: 'relative',
                                                overflow: 'hidden',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                backgroundColor: '#000000',
                                                boxShadow: '0 16px 36px rgba(0, 0, 0, 0.25)',
                                              }}
                                            >
                                              {/* Dynamic Island Notch */}
                                              <div style={{
                                                position: 'absolute',
                                                top: '8px',
                                                left: '50%',
                                                transform: 'translateX(-50%)',
                                                width: '60px',
                                                height: '14px',
                                                borderRadius: '10px',
                                                backgroundColor: '#000000',
                                                zIndex: 10,
                                                border: '1px solid #1e293b',
                                              }} />

                                              {/* Video Playback from Cloudflare R2 */}
                                              {currentTmpl?.video_url ? (
                                                <video
                                                  key={currentTmpl.id}
                                                  src={currentTmpl.video_url}
                                                  autoPlay
                                                  loop
                                                  playsInline
                                                  controls
                                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                />
                                              ) : (
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: '0.8rem' }}>
                                                  Loading preview…
                                                </div>
                                              )}

                                              {/* Bottom Overlay Pill */}
                                              <div style={{
                                                position: 'absolute',
                                                bottom: '10px',
                                                left: '10px',
                                                right: '10px',
                                                backgroundColor: 'rgba(15, 23, 42, 0.85)',
                                                backdropFilter: 'blur(6px)',
                                                borderRadius: '8px',
                                                padding: '6px 8px',
                                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                                zIndex: 5,
                                                pointerEvents: 'none',
                                              }}>
                                                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                  {currentTmpl?.title}
                                                </div>
                                                <div style={{ fontSize: '0.62rem', color: '#94a3b8', display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                                                  <span>1080x1920 (9:16)</span>
                                                  <span style={{ color: '#38bdf8' }}>Cloudflare R2</span>
                                                </div>
                                              </div>
                                            </div>
                                          </>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* MODE 2: CUSTOM 9:16 CREATOR OUTRO BUILDER */}
                              {outroMode === 'custom' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
                                  {/* Duration selector */}
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem', padding: '0.65rem 0.85rem', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                    <div>
                                      <span style={{ fontSize: '0.82rem', fontWeight: 650, color: '#0f172a' }}>Outro Screen Duration:</span>
                                      <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '0.5rem' }}>Added right after speech/audio ends</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                                      {[
                                        { sec: 2.0, label: '2 Seconds' },
                                        { sec: 3.0, label: '3 Seconds (Default)' },
                                        { sec: 4.0, label: '4 Seconds' },
                                      ].map((d) => (
                                        <button
                                          key={d.sec}
                                          type="button"
                                          onClick={() => setOutroDuration(d.sec)}
                                          style={{
                                            padding: '0.35rem 0.7rem',
                                            fontSize: '0.78rem',
                                            fontWeight: outroDuration === d.sec ? 700 : 500,
                                            borderRadius: '6px',
                                            border: outroDuration === d.sec ? '1px solid #1f6f4a' : '1px solid #cbd5e1',
                                            backgroundColor: outroDuration === d.sec ? '#ecfdf5' : '#ffffff',
                                            color: outroDuration === d.sec ? '#1f6f4a' : '#475569',
                                            cursor: 'pointer',
                                          }}
                                        >
                                          {d.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Outro Audio Controls for Custom Builder */}
                                  {audioMode === 'original' ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', padding: '0.75rem 0.9rem', backgroundColor: '#f0fdf4', borderRadius: '10px', border: '1px solid #bbf7d0' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                          <span style={{ fontSize: '1.15rem' }}>🎵</span>
                                          <div>
                                            <strong style={{ fontSize: '0.82rem', color: '#166534' }}>Outro Groove Active (Original Audio Mode)</strong>
                                            <span style={{ fontSize: '0.74rem', color: '#15803d', display: 'block', marginTop: '1px' }}>
                                              Speech stays original during the video, then the outro screen plays this energetic track with smooth fade-in &amp; fade-out.
                                            </span>
                                          </div>
                                        </div>
                                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#166534', background: '#dcfce7', padding: '2px 8px', borderRadius: '4px', border: '1px solid #86efac' }}>
                                          ✓ Outro Audio Active
                                        </span>
                                      </div>

                                      {/* Outro Groove Style Chips + Preview */}
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.15rem', paddingTop: '0.5rem', borderTop: '1px dashed #bbf7d0' }}>
                                        <span style={{ fontSize: '0.74rem', fontWeight: 650, color: '#166534', marginRight: '0.2rem' }}>Groove Style:</span>
                                        {[
                                          { id: 'upbeat', label: '⚡ Upbeat' },
                                          { id: 'lofi', label: '☕ Lo-Fi' },
                                          { id: 'hiphop', label: '🎤 Hip-Hop' },
                                          { id: 'electronic', label: '🎹 Electronic' },
                                          { id: 'ambient', label: '🌌 Ambient' },
                                        ].map((style) => (
                                          <button
                                            key={style.id}
                                            type="button"
                                            onClick={() => setOutroMusicStyle(style.id)}
                                            style={{
                                              padding: '0.28rem 0.65rem',
                                              fontSize: '0.74rem',
                                              fontWeight: outroMusicStyle === style.id ? 700 : 500,
                                              borderRadius: '6px',
                                              border: outroMusicStyle === style.id ? '1px solid #16a34a' : '1px solid #86efac',
                                              backgroundColor: outroMusicStyle === style.id ? '#15803d' : '#ffffff',
                                              color: outroMusicStyle === style.id ? '#ffffff' : '#166534',
                                              cursor: 'pointer',
                                              transition: 'all 0.15s ease',
                                            }}
                                          >
                                            {style.label}
                                          </button>
                                        ))}

                                        {/* Preview Button */}
                                        <button
                                          type="button"
                                          onClick={() => togglePlayPreset(outroMusicStyle)}
                                          style={{
                                            marginLeft: 'auto',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.3rem',
                                            padding: '0.28rem 0.7rem',
                                            fontSize: '0.74rem',
                                            fontWeight: 650,
                                            borderRadius: '6px',
                                            border: '1px solid #16a34a',
                                            backgroundColor: playingPresetId === outroMusicStyle ? '#dcfce7' : '#ffffff',
                                            color: '#15803d',
                                            cursor: 'pointer',
                                          }}
                                        >
                                          {playingPresetId === outroMusicStyle ? (
                                            <>
                                              <Volume2 size={13} className="outro-bell-animated" /> ⏸ Stop Preview
                                            </>
                                          ) : (
                                            <>
                                              <Play size={12} fill="#15803d" /> ▶ Preview Groove
                                            </>
                                          )}
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.85rem', backgroundColor: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', fontSize: '0.78rem' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{ fontSize: '1.15rem' }}>🎧</span>
                                        <div>
                                          <strong style={{ color: '#1e40af' }}>Background Soundtrack Extended:</strong>
                                          <span style={{ color: '#2563eb', marginLeft: '0.35rem' }}>
                                            Your {audioSourceType === 'upload' ? 'uploaded soundtrack' : `${musicPreset} soundtrack`} flows continuously through the video and across this entire {outroDuration}s custom outro!
                                          </span>
                                        </div>
                                      </div>
                                      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#1e40af', background: '#dbeafe', padding: '2px 8px', borderRadius: '4px', border: '1px solid #93c5fd' }}>
                                        ✓ BG Soundtrack Extended
                                      </span>
                                    </div>
                                  )}

                                  {/* Two-column layout: Left Controls, Right 9:16 Mockup */}
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '1.25rem', alignItems: 'start' }}>

                                    {/* LEFT COLUMN: ACTION BUTTONS & CUSTOM LONG TEXT */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                      <div>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.25rem' }}>
                                          Engagement Action Buttons:
                                        </div>
                                        <div style={{ fontSize: '0.74rem', color: '#64748b', marginBottom: '0.65rem' }}>
                                          Toggle on/off and edit the text for each action. You can uncheck them all if you only want long text!
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                          {/* Like Button Card */}
                                          <div className="outro-control-card" style={{
                                            padding: '0.55rem 0.75rem',
                                            borderRadius: '8px',
                                            border: showLikeAction ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                                            backgroundColor: showLikeAction ? '#f8faff' : '#fcfcfc',
                                            opacity: showLikeAction ? 1 : 0.65,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.4rem',
                                          }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                              <input
                                                type="checkbox"
                                                checked={showLikeAction}
                                                onChange={(e) => setShowLikeAction(e.target.checked)}
                                                style={{ width: 17, height: 17, cursor: 'pointer', accentColor: '#2563eb' }}
                                                title="Toggle Like Button"
                                              />
                                              <div style={{
                                                width: 30,
                                                height: 30,
                                                borderRadius: '6px',
                                                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                                                color: '#ffffff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0,
                                                boxShadow: '0 2px 6px rgba(59, 130, 246, 0.3)',
                                              }}>
                                                <ThumbsUp size={15} fill="currentColor" />
                                              </div>
                                              <input
                                                type="text"
                                                disabled={!showLikeAction}
                                                value={outroLikeText}
                                                onChange={(e) => setOutroLikeText(e.target.value)}
                                                placeholder="Like"
                                                maxLength={25}
                                                style={{
                                                  flex: 1,
                                                  padding: '0.35rem 0.6rem',
                                                  fontSize: '0.82rem',
                                                  borderRadius: '6px',
                                                  border: '1px solid #cbd5e1',
                                                  backgroundColor: showLikeAction ? '#ffffff' : '#f1f5f9',
                                                  color: '#0f172a',
                                                  outline: 'none',
                                                }}
                                              />
                                            </div>
                                            {showLikeAction && (
                                              <div style={{ display: 'flex', gap: '0.35rem', paddingLeft: '2.5rem', flexWrap: 'wrap' }}>
                                                {['Like', 'Smash Like!', 'Drop a Like'].map((preset) => (
                                                  <button
                                                    key={preset}
                                                    type="button"
                                                    onClick={() => setOutroLikeText(preset)}
                                                    style={{ fontSize: '0.67rem', padding: '1px 6px', borderRadius: '4px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer' }}
                                                  >
                                                    {preset}
                                                  </button>
                                                ))}
                                              </div>
                                            )}
                                          </div>

                                          {/* Comment Button Card */}
                                          <div className="outro-control-card" style={{
                                            padding: '0.55rem 0.75rem',
                                            borderRadius: '8px',
                                            border: showCommentAction ? '1px solid #6ee7b7' : '1px solid #e2e8f0',
                                            backgroundColor: showCommentAction ? '#f6fdf9' : '#fcfcfc',
                                            opacity: showCommentAction ? 1 : 0.65,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.4rem',
                                          }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                              <input
                                                type="checkbox"
                                                checked={showCommentAction}
                                                onChange={(e) => setShowCommentAction(e.target.checked)}
                                                style={{ width: 17, height: 17, cursor: 'pointer', accentColor: '#059669' }}
                                                title="Toggle Comment Button"
                                              />
                                              <div style={{
                                                width: 30,
                                                height: 30,
                                                borderRadius: '6px',
                                                background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
                                                color: '#ffffff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0,
                                                boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)',
                                              }}>
                                                <MessageSquare size={15} fill="currentColor" />
                                              </div>
                                              <input
                                                type="text"
                                                disabled={!showCommentAction}
                                                value={outroCommentText}
                                                onChange={(e) => setOutroCommentText(e.target.value)}
                                                placeholder="Comment"
                                                maxLength={25}
                                                style={{
                                                  flex: 1,
                                                  padding: '0.35rem 0.6rem',
                                                  fontSize: '0.82rem',
                                                  borderRadius: '6px',
                                                  border: '1px solid #cbd5e1',
                                                  backgroundColor: showCommentAction ? '#ffffff' : '#f1f5f9',
                                                  color: '#0f172a',
                                                  outline: 'none',
                                                }}
                                              />
                                            </div>
                                            {showCommentAction && (
                                              <div style={{ display: 'flex', gap: '0.35rem', paddingLeft: '2.5rem', flexWrap: 'wrap' }}>
                                                {['Comment', 'Thoughts below?', 'Drop a reply'].map((preset) => (
                                                  <button
                                                    key={preset}
                                                    type="button"
                                                    onClick={() => setOutroCommentText(preset)}
                                                    style={{ fontSize: '0.67rem', padding: '1px 6px', borderRadius: '4px', border: '1px solid #a7f3d0', background: '#ecfdf5', color: '#047857', cursor: 'pointer' }}
                                                  >
                                                    {preset}
                                                  </button>
                                                ))}
                                              </div>
                                            )}
                                          </div>

                                          {/* Subscribe Button Card */}
                                          <div className="outro-control-card" style={{
                                            padding: '0.55rem 0.75rem',
                                            borderRadius: '8px',
                                            border: showSubscribeAction ? '1px solid #fca5a5' : '1px solid #e2e8f0',
                                            backgroundColor: showSubscribeAction ? '#fff8f8' : '#fcfcfc',
                                            opacity: showSubscribeAction ? 1 : 0.65,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.4rem',
                                          }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                              <input
                                                type="checkbox"
                                                checked={showSubscribeAction}
                                                onChange={(e) => setShowSubscribeAction(e.target.checked)}
                                                style={{ width: 17, height: 17, cursor: 'pointer', accentColor: '#dc2626' }}
                                                title="Toggle Subscribe Button"
                                              />
                                              <div style={{
                                                width: 30,
                                                height: 30,
                                                borderRadius: '6px',
                                                background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
                                                color: '#ffffff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0,
                                                boxShadow: '0 2px 6px rgba(239, 68, 68, 0.35)',
                                              }}>
                                                <Bell size={15} fill="currentColor" className="outro-bell-animated" />
                                              </div>
                                              <input
                                                type="text"
                                                disabled={!showSubscribeAction}
                                                value={outroSubscribeText}
                                                onChange={(e) => setOutroSubscribeText(e.target.value)}
                                                placeholder="Subscribe"
                                                maxLength={25}
                                                style={{
                                                  flex: 1,
                                                  padding: '0.35rem 0.6rem',
                                                  fontSize: '0.82rem',
                                                  borderRadius: '6px',
                                                  border: '1px solid #cbd5e1',
                                                  backgroundColor: showSubscribeAction ? '#ffffff' : '#f1f5f9',
                                                  color: '#0f172a',
                                                  outline: 'none',
                                                }}
                                              />
                                            </div>
                                            {showSubscribeAction && (
                                              <div style={{ display: 'flex', gap: '0.35rem', paddingLeft: '2.5rem', flexWrap: 'wrap' }}>
                                                {['Subscribe', 'Subscribe for More', 'Join the Fam!'].map((preset) => (
                                                  <button
                                                    key={preset}
                                                    type="button"
                                                    onClick={() => setOutroSubscribeText(preset)}
                                                    style={{ fontSize: '0.67rem', padding: '1px 6px', borderRadius: '4px', border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', cursor: 'pointer' }}
                                                  >
                                                    {preset}
                                                  </button>
                                                ))}
                                              </div>
                                            )}
                                          </div>

                                          {/* Follow Button Card */}
                                          <div className="outro-control-card" style={{
                                            padding: '0.55rem 0.75rem',
                                            borderRadius: '8px',
                                            border: showFollowAction ? '1px solid #f472b6' : '1px solid #e2e8f0',
                                            backgroundColor: showFollowAction ? '#fdf8fa' : '#fcfcfc',
                                            opacity: showFollowAction ? 1 : 0.65,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.4rem',
                                          }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                              <input
                                                type="checkbox"
                                                checked={showFollowAction}
                                                onChange={(e) => setShowFollowAction(e.target.checked)}
                                                style={{ width: 17, height: 17, cursor: 'pointer', accentColor: '#db2777' }}
                                                title="Toggle Follow Button"
                                              />
                                              <div style={{
                                                width: 30,
                                                height: 30,
                                                borderRadius: '6px',
                                                background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
                                                color: '#ffffff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0,
                                                boxShadow: '0 2px 6px rgba(236, 72, 153, 0.35)',
                                              }}>
                                                <Heart size={15} fill="currentColor" className="outro-heart-animated" />
                                              </div>
                                              <input
                                                type="text"
                                                disabled={!showFollowAction}
                                                value={outroFollowText}
                                                onChange={(e) => setOutroFollowText(e.target.value)}
                                                placeholder="Follow"
                                                maxLength={25}
                                                style={{
                                                  flex: 1,
                                                  padding: '0.35rem 0.6rem',
                                                  fontSize: '0.82rem',
                                                  borderRadius: '6px',
                                                  border: '1px solid #cbd5e1',
                                                  backgroundColor: showFollowAction ? '#ffffff' : '#f1f5f9',
                                                  color: '#0f172a',
                                                  outline: 'none',
                                                }}
                                              />
                                            </div>
                                            {showFollowAction && (
                                              <div style={{ display: 'flex', gap: '0.35rem', paddingLeft: '2.5rem', flexWrap: 'wrap' }}>
                                                {['Follow', 'Follow @channel', 'Follow for Part 2'].map((preset) => (
                                                  <button
                                                    key={preset}
                                                    type="button"
                                                    onClick={() => setOutroFollowText(preset)}
                                                    style={{ fontSize: '0.67rem', padding: '1px 6px', borderRadius: '4px', border: '1px solid #fbcfe8', background: '#fdf2f8', color: '#be185d', cursor: 'pointer' }}
                                                  >
                                                    {preset}
                                                  </button>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Custom Long Text Input */}
                                      <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '0.75rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <div style={{ width: 22, height: 22, borderRadius: '5px', background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                              <Link2 size={13} />
                                            </div>
                                            <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>
                                              Custom Long Text / Link / Bio:
                                            </label>
                                          </div>
                                          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                            Optional • User customizable
                                          </span>
                                        </div>
                                        <div style={{ fontSize: '0.73rem', color: '#64748b', marginBottom: '0.45rem', lineHeight: 1.35 }}>
                                          Add your channel link, website, bio note, or discount code. If you uncheck the buttons above, the outro will only showcase this long text!
                                        </div>
                                        <textarea
                                          value={outroLongText}
                                          onChange={(e) => setOutroLongText(e.target.value)}
                                          placeholder="e.g. Follow @mychannel for daily videos! Link in bio for 20% off merch: harvestai.com | Check description for full details."
                                          rows={3}
                                          maxLength={240}
                                          style={{
                                            width: '100%',
                                            padding: '0.55rem 0.65rem',
                                            fontSize: '0.82rem',
                                            borderRadius: '6px',
                                            border: '1px solid #cbd5e1',
                                            color: '#0f172a',
                                            resize: 'vertical',
                                            boxSizing: 'border-box',
                                            outline: 'none',
                                            lineHeight: 1.4,
                                          }}
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                                          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                            <button
                                              type="button"
                                              onClick={() => setOutroLongText('Follow @channel for daily content! Link in bio.')}
                                              style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', cursor: 'pointer' }}
                                            >
                                              + Follow note
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setOutroLongText('Full tutorial link in description & bio: mywebsite.com')}
                                              style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', cursor: 'pointer' }}
                                            >
                                              + Website link
                                            </button>
                                            {outroLongText && (
                                              <button
                                                type="button"
                                                onClick={() => setOutroLongText('')}
                                                style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}
                                              >
                                                Clear text
                                              </button>
                                            )}
                                          </div>
                                          <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                            {outroLongText.length}/240
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* RIGHT COLUMN: LIVE ANIMATED 9:16 MOBILE OUTRO MOCKUP */}
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: '230px', marginBottom: '0.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                          <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block', boxShadow: '0 0 6px #10b981' }} />
                                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>9:16 Motion Outro</span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => setOutroPreviewKey((k) => k + 1)}
                                          title="Replay animated entrance"
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.25rem',
                                            fontSize: '0.68rem',
                                            padding: '2px 7px',
                                            borderRadius: '4px',
                                            border: '1px solid #cbd5e1',
                                            backgroundColor: '#ffffff',
                                            color: '#475569',
                                            cursor: 'pointer',
                                          }}
                                        >
                                          <RotateCcw size={11} /> Replay
                                        </button>
                                      </div>

                                      {/* Smartphone Mockup Frame */}
                                      <div
                                        key={outroPreviewKey}
                                        className="outro-phone-frame"
                                        style={{
                                          width: '225px',
                                          aspectRatio: '9 / 16',
                                          borderRadius: '24px',
                                          border: '4px solid #334155',
                                          position: 'relative',
                                          display: 'flex',
                                          flexDirection: 'column',
                                          justifyContent: 'space-between',
                                          padding: '16px 12px 10px 12px',
                                          boxSizing: 'border-box',
                                        }}
                                      >
                                        {/* Camera Dynamic Island */}
                                        <div style={{
                                          width: '46px',
                                          height: '5px',
                                          backgroundColor: '#1e293b',
                                          borderRadius: '10px',
                                          margin: '0 auto 8px auto',
                                        }} />

                                        {/* Top branding text with animated glow */}
                                        <div style={{ textAlign: 'center', marginBottom: 'auto' }}>
                                          <div className="outro-title-animated" style={{ fontSize: '0.64rem', fontWeight: 800, color: '#38bdf8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                                            THANKS FOR WATCHING
                                          </div>
                                          <div style={{ width: '32px', height: '2px', backgroundColor: '#38bdf8', margin: '4px auto 0 auto', borderRadius: '2px', boxShadow: '0 0 8px #38bdf8' }} />
                                          <span style={{ fontSize: '0.52rem', color: '#94a3b8', display: 'block', marginTop: '3px' }}>
                                            Support &amp; Stay Connected
                                          </span>
                                        </div>

                                        {/* Middle Elements: Stacked Buttons or Long Text */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', margin: 'auto 0', width: '100%' }}>
                                          {showLikeAction && (
                                            <div style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '7px',
                                              background: 'linear-gradient(90deg, rgba(30, 58, 138, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)',
                                              border: '1px solid #3b82f6',
                                              borderRadius: '8px',
                                              padding: '5px 8px',
                                              color: '#ffffff',
                                              fontSize: '0.68rem',
                                              fontWeight: 700,
                                              boxShadow: '0 2px 8px rgba(59, 130, 246, 0.25)',
                                            }}>
                                              <div style={{ width: 18, height: 18, borderRadius: '4px', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <ThumbsUp size={11} fill="#ffffff" className="outro-thumb-animated" />
                                              </div>
                                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {(outroLikeText || 'Like').trim()}
                                              </span>
                                            </div>
                                          )}

                                          {showCommentAction && (
                                            <div style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '7px',
                                              background: 'linear-gradient(90deg, rgba(6, 78, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)',
                                              border: '1px solid #10b981',
                                              borderRadius: '8px',
                                              padding: '5px 8px',
                                              color: '#ffffff',
                                              fontSize: '0.68rem',
                                              fontWeight: 700,
                                              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)',
                                            }}>
                                              <div style={{ width: 18, height: 18, borderRadius: '4px', background: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <MessageSquare size={11} fill="#ffffff" className="outro-comment-animated" />
                                              </div>
                                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {(outroCommentText || 'Comment').trim()}
                                              </span>
                                            </div>
                                          )}

                                          {showSubscribeAction && (
                                            <div className="outro-shimmer-btn" style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '7px',
                                              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                              border: '1px solid #f87171',
                                              borderRadius: '8px',
                                              padding: '5px 8px',
                                              color: '#ffffff',
                                              fontSize: '0.7rem',
                                              fontWeight: 800,
                                              letterSpacing: '0.02em',
                                              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.45)',
                                            }}>
                                              <div style={{ width: 18, height: 18, borderRadius: '4px', background: 'rgba(255, 255, 255, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <Bell size={11} fill="#ffffff" className="outro-bell-animated" />
                                              </div>
                                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {(outroSubscribeText || 'Subscribe').trim()}
                                              </span>
                                            </div>
                                          )}

                                          {showFollowAction && (
                                            <div style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '7px',
                                              background: 'linear-gradient(135deg, #ec4899 0%, #a855f7 100%)',
                                              border: '1px solid #f472b6',
                                              borderRadius: '8px',
                                              padding: '5px 8px',
                                              color: '#ffffff',
                                              fontSize: '0.68rem',
                                              fontWeight: 700,
                                              boxShadow: '0 4px 12px rgba(236, 72, 153, 0.4)',
                                            }}>
                                              <div style={{ width: 18, height: 18, borderRadius: '4px', background: 'rgba(255, 255, 255, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <Heart size={11} fill="#ffffff" className="outro-heart-animated" />
                                              </div>
                                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {(outroFollowText || 'Follow').trim()}
                                              </span>
                                            </div>
                                          )}

                                          {/* Custom Long Text Card */}
                                          {outroLongText.trim() && (
                                            <div style={{
                                              marginTop: (!showLikeAction && !showCommentAction && !showSubscribeAction && !showFollowAction) ? '0' : '4px',
                                              backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                              border: '1px solid rgba(56, 189, 248, 0.4)',
                                              borderRadius: '8px',
                                              padding: '7px 9px',
                                              color: '#f8fafc',
                                              fontSize: (!showLikeAction && !showCommentAction && !showSubscribeAction && !showFollowAction) ? '0.74rem' : '0.62rem',
                                              lineHeight: 1.35,
                                              wordBreak: 'break-word',
                                              textAlign: 'center',
                                              backdropFilter: 'blur(6px)',
                                              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)',
                                            }}>
                                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', fontSize: '0.52rem', fontWeight: 800, color: '#38bdf8', letterSpacing: '0.06em', marginBottom: '3px' }}>
                                                <ExternalLink size={9} /> CREATOR NOTE
                                              </div>
                                              {outroLongText.trim()}
                                            </div>
                                          )}

                                          {/* Empty state if user unchecked everything and wrote no text */}
                                          {!showLikeAction && !showCommentAction && !showSubscribeAction && !showFollowAction && !outroLongText.trim() && (
                                            <div style={{
                                              textAlign: 'center',
                                              color: '#64748b',
                                              fontSize: '0.62rem',
                                              padding: '14px 6px',
                                              border: '1px dashed #334155',
                                              borderRadius: '6px',
                                            }}>
                                              Check actions or type custom long text to display on outro
                                            </div>
                                          )}
                                        </div>

                                        {/* Bottom timeline scrubber & indicator */}
                                        <div style={{ marginTop: 'auto', paddingTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                          {/* Moving animated progress bar */}
                                          <div style={{ width: '100%', height: '3px', backgroundColor: 'rgba(255, 255, 255, 0.15)', borderRadius: '2px', overflow: 'hidden' }}>
                                            <div style={{
                                              height: '100%',
                                              background: 'linear-gradient(90deg, #38bdf8, #ec4899)',
                                              animation: `outro-timeline-fill ${outroDuration}s linear infinite`,
                                              borderRadius: '2px',
                                            }} />
                                          </div>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.52rem', color: '#94a3b8' }}>
                                            <span>0:00</span>
                                            <span style={{ fontWeight: 600, color: '#e2e8f0' }}>🎵 {outroDuration}s Outro ({audioMode === 'original' ? 'Outro Audio' : 'BG Audio Extended'})</span>
                                            <span>0:0{Math.round(outroDuration)}</span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* MODE 3: NO OUTRO */}
                              {outroMode === 'none' && (
                                <div style={{
                                  padding: '1.25rem',
                                  borderRadius: '8px',
                                  backgroundColor: '#f8fafc',
                                  border: '1px dashed #cbd5e1',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.75rem',
                                  color: '#475569',
                                  fontSize: '0.85rem'
                                }}>
                                  <CheckCircle2 size={18} color="#10b981" />
                                  <span>
                                    <strong>No Outro Selected:</strong> The vertical short will finish immediately once the video moment ends without appending any outro screen.
                                  </span>
                                </div>
                              )}
                            </div>

                          </div>

                          {/* ── MODAL FOOTER ── */}
                          <div style={{
                            padding: '0.85rem 1.25rem',
                            borderTop: '1px solid #e2e8f0',
                            backgroundColor: '#fafaf9',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '0.75rem',
                          }}>
                            <button
                              type="button"
                              onClick={() => setShowAudioModal(false)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                padding: '0.55rem 1rem',
                                borderRadius: '6px',
                                backgroundColor: '#ffffff',
                                color: '#475569',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Cancel
                            </button>

                            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                              <span>Soundtrack: <strong style={{ color: '#0f172a' }}>{audioMode === 'original' ? 'Original Audio' : audioMode === 'mix' ? `Mixed (${audioSourceType === 'upload' ? (customAudioName || 'Custom') : musicPreset})` : `Replaced (${audioSourceType === 'upload' ? (customAudioName || 'Custom') : musicPreset})`}</strong></span>
                              {outroMode === 'template' && (
                                <span style={{ marginLeft: '0.5rem' }}>· R2 Outro: <strong style={{ color: '#1f6f4a' }}>{templates.find((t) => t.id === selectedTemplateId)?.title || 'Template Selected'}</strong></span>
                              )}
                              {outroMode === 'custom' && (
                                <span style={{ marginLeft: '0.5rem' }}>· 9:16 Outro: <strong style={{ color: '#1f6f4a' }}>{outroDuration}s Screen</strong></span>
                              )}
                              {outroMode === 'none' && (
                                <span style={{ marginLeft: '0.5rem' }}>· Outro: <strong style={{ color: '#64748b' }}>None</strong></span>
                              )}
                            </div>

                            <button
                              type="button"
                              disabled={
                                actionLoading ||
                                selectedMomentId == null ||
                                ((audioMode === 'mix' || audioMode === 'replace') && audioSourceType === 'upload' && !customAudioPath) ||
                                visibleClips.some((clip) => clip.edit_options?.workflow === 'selected_moment_v1' && clip.edit_options?.selected_moment_id === selectedMomentId && ['pending', 'rendering'].includes(clip.status))
                              }
                              onClick={handleRenderSelectedMoment}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.65rem 1.4rem',
                                borderRadius: '6px',
                                backgroundColor: (actionLoading || selectedMomentId == null || ((audioMode === 'mix' || audioMode === 'replace') && audioSourceType === 'upload' && !customAudioPath)) ? '#94a3b8' : '#1f6f4a',
                                color: '#ffffff',
                                border: 'none',
                                fontSize: '0.9rem',
                                fontWeight: 700,
                                cursor: (actionLoading || selectedMomentId == null || ((audioMode === 'mix' || audioMode === 'replace') && audioSourceType === 'upload' && !customAudioPath)) ? 'not-allowed' : 'pointer',
                                boxShadow: '0 2px 6px rgba(31, 111, 74, 0.25)',
                                transition: 'background-color 0.15s ease',
                              }}
                            >
                              <Wand2 size={16} />
                              {actionLoading ? 'Creating Video…' : 'Confirm & Render 9:16 Short'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </section>
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
                                      Selected Moment Render ({readyCount > 0 ? 'ready' : 'waiting'})
                                    </h4>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#5b616b', lineHeight: 1.5 }}>
                                      Rendering one selected time range with the original source audio
                                    </p>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        ) : null}

                        {/* ── Main Content: Clips Showcase & Player ── */}
                        {hasAnalyzedMoments && !isAnalyzing && visibleClips.length > 0 && (
                          <div className="studio-output-grid" ref={generatedOutputRef} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(300px, 360px)', gap: '1.5rem', alignItems: 'start', scrollMarginTop: '1rem' }}>
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
                                  Generated Clips ({visibleClips.length})
                                </h3>
                                <button
                                  onClick={loadClips}
                                  title="Refresh Clips"
                                  style={{ background: 'transparent', border: 'none', color: '#5b616b', cursor: 'pointer', padding: 4 }}
                                >
                                  <RefreshCw size={15} />
                                </button>
                              </div>

                              {visibleClips.length === 0 ? (
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
                                    Analyze the source to preview five timestamped moments, then choose one moment to render as a single short.
                                  </p>
                                </div>
                              ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
                                  {visibleClips.map((clip) => {
                                    const isSelected = visibleSelectedClip?.id === clip.id;
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
                                          position: 'relative',
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                          <span
                                            style={{
                                              fontSize: '0.725rem',
                                              fontWeight: 700,
                                              padding: '2px 6px',
                                              borderRadius: '4px',
                                              backgroundColor: clip.file_exists === false ? '#fef2f2' : '#ecfdf5',
                                              color: clip.file_exists === false ? '#c0392b' : '#1f6f4a',
                                              border: `1px solid ${clip.file_exists === false ? '#fca5a5' : '#a7f3d0'}`,
                                            }}
                                          >
                                            {clip.file_exists === false ? 'File Missing' : `${clip.viral_score || 95}/100 Score`}
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
                                          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                            <Play size={14} color="#16181d" />
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setConfirmDialog({ type: 'clip', id: clip.id, label: clip.title || `Short #${clip.id}` });
                                              }}
                                              title="Delete this clip"
                                              style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                padding: '2px',
                                                background: 'transparent',
                                                border: 'none',
                                                color: '#aaa',
                                                cursor: 'pointer',
                                                transition: 'color 0.15s ease',
                                              }}
                                              onMouseEnter={(e) => e.currentTarget.style.color = '#c0392b'}
                                              onMouseLeave={(e) => e.currentTarget.style.color = '#aaa'}
                                            >
                                              <Trash2 size={13} />
                                            </button>
                                          </div>
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

                              {visibleSelectedClip?.status === 'completed' && visibleSelectedClip.storage_path ? (
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
                                      key={visibleSelectedClip.storage_path}
                                      src={clipMediaClipId === visibleSelectedClip.id && clipMediaUrl ? clipMediaUrl : null}
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
                                      <strong>Media file is unavailable:</strong> The source file may have been removed from this server. Re-upload the source video and render the selected moment again.
                                    </div>
                                  )}

                                  {/* Download */}
                                  <a
                                    href={clipMediaUrl || undefined}
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

                                  {/* Open the dedicated publishing workspace */}
                                  <div style={{ borderTop: '1px solid #e6e6e1', paddingTop: '1rem' }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#7a808a', marginBottom: '0.6rem' }}>
                                      Share your video
                                    </div>
                                    <button
                                      type="button"
                                      onClick={openPublishPage}
                                      disabled={!visibleSelectedClip}
                                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem', padding: '0.75rem', borderRadius: '6px', backgroundColor: '#1f6f4a', color: '#fff', border: '1px solid #1f6f4a', fontSize: '0.9rem', fontWeight: 650, cursor: visibleSelectedClip ? 'pointer' : 'not-allowed' }}
                                    >
                                      Publish
                                    </button>
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
                        )}
                      </div>
                    )
          ) : !activeProjectId ? (
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
                          width: 64,
                          height: 64,
                          borderRadius: '12px',
                          backgroundColor: '#f2faf5',
                          border: '1px solid #d5eadd',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#1f6f4a',
                          marginBottom: '1.1rem',
                        }}
                      >
                        <Plus size={30} />
                      </div>
                      <h3
                        style={{
                          fontSize: '1.55rem',
                          fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
                          fontWeight: 700,
                          color: '#16181d',
                          margin: '0 0 0.5rem',
                        }}
                      >
                        Create a project first
                      </h3>
                      <p style={{ maxWidth: '470px', fontSize: '0.95rem', margin: '0 0 1.35rem', color: '#5b616b', lineHeight: 1.65 }}>
                        Projects keep your source videos and generated shorts organized. Create a project first, then upload a video into it to begin.
                      </p>
                      <button
                        onClick={() => setShowNewProjectModal(true)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.15rem', border: 0, borderRadius: '6px', background: '#1f6f4a', color: '#fff', fontSize: '0.9rem', fontWeight: 650, cursor: 'pointer' }}
                      >
                        <Plus size={17} /> Create Your First Project
                      </button>
                    </div>
                    ) : (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: 1,
                        minHeight: '100%',
                        boxSizing: 'border-box',
                        padding: '2rem',
                        textAlign: 'center',
                        color: '#5b616b',
                      }}
                    >
                      {/* 2-Way Input Switcher */}
                      <div
                        style={{
                          display: 'inline-flex',
                          gap: '0.4rem',
                          marginBottom: '1.5rem',
                          backgroundColor: '#eaeae6',
                          padding: '4px',
                          borderRadius: '8px',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setVideoInputMode('upload')}
                          style={{
                            padding: '0.5rem 1rem',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            borderRadius: '6px',
                            border: 'none',
                            backgroundColor: videoInputMode === 'upload' ? '#ffffff' : 'transparent',
                            color: videoInputMode === 'upload' ? '#16181d' : '#5b616b',
                            boxShadow: videoInputMode === 'upload' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <UploadCloud size={16} />
                          Upload Video File
                        </button>
                        <button
                          type="button"
                          onClick={() => setVideoInputMode('link')}
                          style={{
                            padding: '0.5rem 1rem',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            borderRadius: '6px',
                            border: 'none',
                            backgroundColor: videoInputMode === 'link' ? '#ffffff' : 'transparent',
                            color: videoInputMode === 'link' ? '#16181d' : '#5b616b',
                            boxShadow: videoInputMode === 'link' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <Link2 size={16} />
                          Import from Link (YouTube, Insta, TikTok…)
                        </button>
                      </div>

                      {videoInputMode === 'upload' ? (
                        <div
                          onClick={() => !isUploading && fileInputRef.current?.click()}
                          onKeyDown={(event) => {
                            if ((event.key === 'Enter' || event.key === ' ') && !isUploading) {
                              event.preventDefault();
                              fileInputRef.current?.click();
                            }
                          }}
                          role="button"
                          tabIndex={isUploading ? -1 : 0}
                          aria-label="Choose a source video to upload"
                          style={{
                            width: 'min(100%, 620px)',
                            boxSizing: 'border-box',
                            padding: '3.5rem 2rem',
                            borderRadius: '14px',
                            border: '2px dashed #c8d8ce',
                            backgroundColor: '#ffffff',
                            cursor: isUploading ? 'wait' : 'pointer',
                            boxShadow: '0 4px 20px rgba(22, 24, 29, 0.04)',
                          }}
                        >
                          <UploadCloud size={42} color="#1f6f4a" style={{ marginBottom: '0.8rem' }} />
                          <h3 style={{ margin: '0 0 0.55rem', fontSize: '1.45rem', fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif', color: '#16181d' }}>
                            {isUploading ? `Uploading video${uploadProgress ? ` · ${uploadProgress}%` : '…'}` : videos.length ? 'Upload another video' : 'Upload your first video'}
                          </h3>
                          <p style={{ maxWidth: '430px', margin: '0 auto 1.2rem', fontSize: '0.925rem', lineHeight: 1.6 }}>
                            {videos.length
                              ? 'Add a source video to this project. It will appear in the footage list on the left.'
                              : 'Choose a source video for this project. It will appear in the footage list on the left, where you can select it for analysis.'}
                          </p>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.7rem 1.05rem', borderRadius: '6px', background: isUploading ? '#7a808a' : '#1f6f4a', color: '#fff', fontSize: '0.9rem', fontWeight: 650 }}>
                            {isUploading ? <Loader size={16} /> : <UploadCloud size={16} />}
                            {isUploading ? `Uploading ${uploadProgress}%…` : 'Choose Video File'}
                          </span>
                          <div style={{ marginTop: '0.9rem', fontSize: '0.78rem', color: '#7a808a' }}>MP4, MOV, MKV, or WebM</div>
                          {uploadError && <div style={{ marginTop: '0.85rem', color: '#b91c1c', fontSize: '0.85rem' }}>{uploadError}</div>}
                        </div>
                      ) : (
                        <div
                          style={{
                            width: 'min(100%, 620px)',
                            boxSizing: 'border-box',
                            padding: '3rem 2.2rem',
                            borderRadius: '14px',
                            border: '1px solid #e6e6e1',
                            backgroundColor: '#ffffff',
                            boxShadow: '0 4px 20px rgba(22, 24, 29, 0.04)',
                            textAlign: 'left',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.8rem' }}>
                            <div
                              style={{
                                width: 44,
                                height: 44,
                                borderRadius: '10px',
                                backgroundColor: '#f2faf5',
                                border: '1px solid #d5eadd',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#1f6f4a',
                              }}
                            >
                              <Globe size={22} />
                            </div>
                            <div>
                              <h3 style={{ margin: '0 0 0.2rem', fontSize: '1.35rem', fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif', color: '#16181d' }}>
                                Import from Video Link
                              </h3>
                              <p style={{ margin: 0, fontSize: '0.85rem', color: '#5b616b' }}>
                                Paste any public video link. We will download it so you can verify the preview and customize your length, captions, and dubbing options before generating shorts.
                              </p>
                            </div>
                          </div>

                          <form onSubmit={handleImportUrl} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', marginTop: '1.25rem' }}>
                            <div style={{ position: 'relative' }}>
                              <input
                                type="url"
                                value={videoUrl}
                                onChange={(e) => {
                                  setVideoUrl(e.target.value);
                                  if (importUrlError) setImportUrlError('');
                                }}
                                placeholder="https://www.youtube.com/watch?v=... or Instagram Reel / TikTok URL"
                                disabled={isImportingUrl || isUploading}
                                required
                                style={{
                                  width: '100%',
                                  padding: '0.8rem 1rem 0.8rem 2.4rem',
                                  borderRadius: '8px',
                                  border: '1px solid #d7d7d1',
                                  fontSize: '0.9rem',
                                  outline: 'none',
                                  boxSizing: 'border-box',
                                  backgroundColor: '#fafaf8',
                                  color: '#16181d',
                                  transition: 'border-color 0.15s ease',
                                }}
                                onFocus={(e) => e.target.style.borderColor = '#1f6f4a'}
                                onBlur={(e) => e.target.style.borderColor = '#d7d7d1'}
                              />
                              <Link2
                                size={17}
                                style={{
                                  position: 'absolute',
                                  left: '0.85rem',
                                  top: '50%',
                                  transform: 'translateY(-50%)',
                                  color: '#7a808a',
                                  pointerEvents: 'none',
                                }}
                              />
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.75rem', color: '#7a808a', marginRight: '0.2rem' }}>Supported:</span>
                              {['YouTube', 'Instagram Reels', 'TikTok', 'Facebook', 'X / Twitter'].map((platform) => (
                                <span
                                  key={platform}
                                  style={{
                                    fontSize: '0.725rem',
                                    fontWeight: 600,
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    backgroundColor: '#f1f1ee',
                                    color: '#474d57',
                                  }}
                                >
                                  {platform}
                                </span>
                              ))}
                            </div>

                            {importUrlError && (
                              <div
                                style={{
                                  padding: '0.65rem 0.85rem',
                                  borderRadius: '6px',
                                  backgroundColor: '#fef2f2',
                                  border: '1px solid #fecaca',
                                  color: '#b91c1c',
                                  fontSize: '0.825rem',
                                  lineHeight: 1.45,
                                }}
                              >
                                {importUrlError}
                              </div>
                            )}

                            <button
                              type="submit"
                              disabled={isImportingUrl || isUploading || !videoUrl.trim() || !activeProjectId}
                              style={{
                                marginTop: '0.4rem',
                                padding: '0.85rem 1.25rem',
                                borderRadius: '8px',
                                backgroundColor: isImportingUrl || !videoUrl.trim() || !activeProjectId ? '#7a808a' : '#1f6f4a',
                                color: '#ffffff',
                                border: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem',
                                fontSize: '0.925rem',
                                fontWeight: 650,
                                cursor: isImportingUrl || !videoUrl.trim() || !activeProjectId ? 'not-allowed' : 'pointer',
                                transition: 'background-color 0.15s ease',
                              }}
                            >
                              {isImportingUrl ? (
                                <>
                                  <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} />
                                  <span>Downloading Video from Link…</span>
                                </>
                              ) : (
                                <>
                                  <Link2 size={18} />
                                  <span>Import & Set Up Video</span>
                                </>
                              )}
                            </button>
                          </form>
                        </div>
                      )}

                      {videos.length > 0 && <p style={{ marginTop: '1.25rem', fontSize: '0.85rem' }}>Or choose an existing video from the left sidebar.</p>}
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
          {/* ── Confirmation Dialog ── */}
          {confirmDialog && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(22, 24, 29, 0.55)',
                backdropFilter: 'blur(3px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
              }}
              onClick={() => !deleteLoading && setConfirmDialog(null)}
            >
              <div
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '10px',
                  padding: '2rem',
                  maxWidth: '400px',
                  width: '90%',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
                  border: '1px solid #e6e6e1',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%',
                    backgroundColor: '#fef2f2', border: '1px solid #fca5a5',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <AlertTriangle size={18} color="#c0392b" />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#16181d' }}>
                      Delete {confirmDialog.type === 'clip' ? 'Clip' : confirmDialog.type === 'video' ? 'Video' : 'Project'}
                    </h3>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#5b616b' }}>
                      This action cannot be undone.
                    </p>
                  </div>
                </div>

                <p style={{ margin: '0 0 1.5rem', fontSize: '0.875rem', color: '#5b616b', lineHeight: 1.5 }}>
                  {confirmDialog.type === 'project'
                    ? <>Are you sure you want to delete the project <strong style={{ color: '#16181d' }}>"{confirmDialog.label}"</strong>? All videos and generated clips within this project will be permanently deleted from the server.</>
                    : confirmDialog.type === 'video'
                      ? <>Are you sure you want to delete <strong style={{ color: '#16181d' }}>"{confirmDialog.label}"</strong>? All clips generated from this video will also be removed.</>
                      : <>Are you sure you want to delete clip <strong style={{ color: '#16181d' }}>"{confirmDialog.label}"</strong>? The video file will be removed from the server.</>
                  }
                </p>

                <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setConfirmDialog(null)}
                    disabled={deleteLoading}
                    style={{
                      padding: '0.55rem 1.1rem',
                      borderRadius: '6px',
                      backgroundColor: '#ffffff',
                      border: '1px solid #e6e6e1',
                      color: '#5b616b',
                      fontWeight: 500,
                      fontSize: '0.875rem',
                      cursor: deleteLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    disabled={deleteLoading}
                    style={{
                      padding: '0.55rem 1.1rem',
                      borderRadius: '6px',
                      backgroundColor: deleteLoading ? '#e0958e' : '#c0392b',
                      border: 'none',
                      color: '#ffffff',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                      cursor: deleteLoading ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    {deleteLoading ? (
                      <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Deleting…</>
                    ) : (
                      <><Trash2 size={14} /> Delete</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Cloudflare R2 Templates Modal ── */}
          {showTemplatesModal && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.75)',
                backdropFilter: 'blur(6px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
                padding: '1.25rem',
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget) setShowTemplatesModal(false);
              }}
            >
              <div
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '16px',
                  width: '100%',
                  maxWidth: '960px',
                  maxHeight: '90vh',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                  overflow: 'hidden',
                }}
              >
                {/* Modal Header */}
                <div style={{
                  padding: '1.25rem 1.5rem',
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: '#f8fafc',
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <div style={{ width: 34, height: 34, borderRadius: '8px', backgroundColor: '#ecfdf5', color: '#1f6f4a', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #a7f3d0' }}>
                        <Film size={18} />
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: 700 }}>
                          Cloudflare R2 Video Templates
                        </h3>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                          High quality motion outros stored and streamed directly from <strong>Cloudflare R2</strong> (9:16 Vertical • 1080x1920)
                        </p>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="template-r2-pill">
                      ⚡ {templates.length} R2 Templates Active
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowTemplatesModal(false)}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        color: '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {/* Modal Body */}
                <div style={{
                  display: 'flex',
                  flex: 1,
                  minHeight: 0,
                  overflow: 'hidden',
                  flexDirection: 'row',
                }}>
                  {/* Left / Center Grid */}
                  <div style={{
                    flex: 1,
                    padding: '1.25rem',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                  }}>
                    {/* Category filter pills */}
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {[
                        { id: 'all', label: 'All Templates' },
                        { id: 'Outro', label: 'Outros' },
                        { id: 'Subscribe', label: 'Subscribe CTAs' },
                        { id: 'Profile Outro', label: 'Profile Outros' },
                        { id: 'All-in-One', label: 'All-in-One' },
                        { id: 'Social Story', label: 'Social Story' },
                      ].map((cat) => {
                        const count = cat.id === 'all'
                          ? templates.length
                          : templates.filter((t) => t.category === cat.id).length;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setTemplateFilterCategory(cat.id)}
                            style={{
                              fontSize: '0.78rem',
                              fontWeight: templateFilterCategory === cat.id ? 700 : 500,
                              padding: '0.35rem 0.75rem',
                              borderRadius: '6px',
                              border: templateFilterCategory === cat.id ? '1.5px solid #1f6f4a' : '1px solid #e2e8f0',
                              backgroundColor: templateFilterCategory === cat.id ? '#ecfdf5' : '#ffffff',
                              color: templateFilterCategory === cat.id ? '#1f6f4a' : '#475569',
                              cursor: 'pointer',
                            }}
                          >
                            {cat.label} ({count})
                          </button>
                        );
                      })}
                    </div>

                    {/* Templates Grid */}
                    <div className="template-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
                      {templates
                        .filter((t) => templateFilterCategory === 'all' || t.category === templateFilterCategory)
                        .map((tmpl) => {
                          const isSelected = selectedTemplateId === tmpl.id;
                          return (
                            <div
                              key={tmpl.id}
                              className={`template-card ${isSelected ? 'selected' : ''}`}
                              onClick={() => {
                                setSelectedTemplateId(tmpl.id);
                                setPreviewingModalTemplate(tmpl);
                              }}
                            >
                              <div className="template-preview-box" style={{ maxHeight: '190px' }}>
                                {tmpl.video_url ? (
                                  <video
                                    src={tmpl.video_url}
                                    muted
                                    loop
                                    playsInline
                                    autoPlay={isSelected}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    onMouseEnter={(e) => e.target.play().catch(() => { })}
                                    onMouseLeave={(e) => { if (!isSelected) e.target.pause(); }}
                                  />
                                ) : tmpl.thumb_url ? (
                                  <img src={tmpl.thumb_url} alt={tmpl.title} />
                                ) : null}

                                <span className="template-category-badge">{tmpl.category}</span>
                                <span className="template-duration-badge">{tmpl.duration}s</span>

                                {isSelected && (
                                  <div style={{
                                    position: 'absolute',
                                    bottom: '8px',
                                    right: '8px',
                                    backgroundColor: '#1f6f4a',
                                    color: '#ffffff',
                                    borderRadius: '50%',
                                    width: 24,
                                    height: 24,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                  }}>
                                    <Check size={14} strokeWidth={3} />
                                  </div>
                                )}
                              </div>

                              <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', flex: 1, justifyContent: 'space-between' }}>
                                <div>
                                  <strong style={{ fontSize: '0.82rem', color: '#0f172a', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {tmpl.title}
                                  </strong>
                                  <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: '#64748b', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {tmpl.description}
                                  </p>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem', paddingTop: '0.4rem', borderTop: '1px solid #f1f5f9' }}>
                                  <span style={{ fontSize: '0.67rem', color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1px 6px', borderRadius: '4px', fontWeight: 650 }}>
                                    {tmpl.badge || '9:16 Outro'}
                                  </span>
                                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isSelected ? '#1f6f4a' : '#64748b' }}>
                                    {isSelected ? '✓ Selected' : 'Preview'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* Right Sidebar: Selected Template Player & Apply Action */}
                  <div style={{
                    width: '320px',
                    borderLeft: '1px solid #e2e8f0',
                    backgroundColor: '#f8fafc',
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    flexShrink: 0,
                    alignItems: 'center',
                    overflowY: 'auto',
                  }}>
                    {(() => {
                      const activeTmpl = previewingModalTemplate || templates.find((t) => t.id === selectedTemplateId) || templates[0];
                      if (!activeTmpl) return <div style={{ color: '#94a3b8' }}>No templates found</div>;
                      return (
                        <>
                          <div style={{ width: '100%', textAlign: 'center' }}>
                            <strong style={{ fontSize: '0.95rem', color: '#0f172a', display: 'block' }}>
                              {activeTmpl.title}
                            </strong>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              {activeTmpl.category} · {activeTmpl.duration} Seconds
                            </span>
                          </div>

                          {/* Phone Player Preview */}
                          <div
                            style={{
                              width: '190px',
                              aspectRatio: '9 / 16',
                              borderRadius: '20px',
                              border: '4px solid #1e293b',
                              overflow: 'hidden',
                              backgroundColor: '#000000',
                              boxShadow: '0 12px 28px rgba(0, 0, 0, 0.25)',
                              position: 'relative',
                            }}
                          >
                            {activeTmpl.video_url ? (
                              <video
                                key={activeTmpl.id}
                                src={activeTmpl.video_url}
                                autoPlay
                                loop
                                playsInline
                                controls
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: '0.8rem' }}>
                                Loading video…
                              </div>
                            )}
                          </div>

                          {/* Specs */}
                          <div style={{
                            width: '100%',
                            backgroundColor: '#ffffff',
                            borderRadius: '8px',
                            padding: '0.75rem',
                            border: '1px solid #e2e8f0',
                            fontSize: '0.74rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.4rem',
                            color: '#475569',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>Resolution:</span>
                              <strong style={{ color: '#0f172a' }}>1080 x 1920 (9:16)</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>Duration:</span>
                              <strong style={{ color: '#0f172a' }}>{activeTmpl.duration}s</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>Storage:</span>
                              <strong style={{ color: '#1f6f4a' }}>Cloudflare R2</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>Encoding:</span>
                              <strong style={{ color: '#0f172a' }}>H.264 / AAC 30fps</strong>
                            </div>
                          </div>

                          {/* Apply button */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTemplateId(activeTmpl.id);
                              setOutroMode('template');
                              setShowTemplatesModal(false);
                              setActionMessage(`Template "${activeTmpl.title}" selected as your outro!`);
                              setTimeout(() => setActionMessage(''), 4000);
                            }}
                            style={{
                              width: '100%',
                              padding: '0.75rem 1rem',
                              borderRadius: '8px',
                              backgroundColor: '#1f6f4a',
                              color: '#ffffff',
                              border: 'none',
                              fontSize: '0.88rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.5rem',
                              boxShadow: '0 4px 12px rgba(31, 111, 74, 0.25)',
                              transition: 'background-color 0.15s ease',
                            }}
                          >
                            <Check size={16} strokeWidth={2.5} />
                            Use This Outro Template
                          </button>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Action Message Toast ── */}
          {actionMessage && (
            <div
              style={{
                position: 'fixed',
                bottom: '1.5rem',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: '#16181d',
                color: '#fafaf8',
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 500,
                boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
                zIndex: 9998,
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                maxWidth: '90vw',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {actionMessage}
            </div>
          )}
      </div>
      );
}
