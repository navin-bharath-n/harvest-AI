import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Plus, UploadCloud, Video, Sparkles, Play, Pause, ArrowLeft,
  Download, LogOut, RefreshCw, Wand2, Loader,
  CheckCircle2, Film, Clock, XCircle, Trash2, AlertTriangle,
  Link2, Globe, Music, Volume2, VolumeX, X, Check, ArrowRight,
  ThumbsUp, MessageSquare, Bell, Heart, RotateCcw, ExternalLink,
  Search, Image as ImageIcon, Layers, LoaderCircle
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

  // Projects State (with localStorage cache for instant 0ms restoration)
  const [projects, setProjects] = useState(() => {
    try {
      const cached = localStorage.getItem('harvest_cached_projects');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [activeProjectId, setActiveProjectId] = useState(() => {
    try {
      const cached = localStorage.getItem('harvest_active_project_id');
      return cached ? Number(cached) : null;
    } catch {
      return null;
    }
  });
  const [isInitialLoadingProjects, setIsInitialLoadingProjects] = useState(() => {
    try {
      return !localStorage.getItem('harvest_cached_projects');
    } catch {
      return true;
    }
  });
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [projectModalError, setProjectModalError] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  // Videos & Active Pipeline State (with localStorage cache for instant 0ms restoration)
  const [videos, setVideos] = useState(() => {
    try {
      const cachedProjId = localStorage.getItem('harvest_active_project_id');
      if (cachedProjId) {
        const cachedVids = localStorage.getItem(`harvest_cached_videos_${cachedProjId}`);
        return cachedVids ? JSON.parse(cachedVids) : [];
      }
      return [];
    } catch {
      return [];
    }
  });
  const [videoSearchQuery, setVideoSearchQuery] = useState('');
  const [selectedVideo, setSelectedVideo] = useState(() => {
    try {
      const cachedProjId = localStorage.getItem('harvest_active_project_id');
      const cachedVidId = localStorage.getItem('harvest_active_video_id');
      if (cachedProjId && cachedVidId) {
        const cachedVids = localStorage.getItem(`harvest_cached_videos_${cachedProjId}`);
        if (cachedVids) {
          const list = JSON.parse(cachedVids);
          return list.find((v) => v.id === Number(cachedVidId)) || null;
        }
      }
      return null;
    } catch {
      return null;
    }
  });
  const [mobileTab, setMobileTab] = useState('editor'); // 'editor' | 'footage'

  // On mobile view: auto-switch to 'editor' tab when a video is selected
  useEffect(() => {
    if (selectedVideo) {
      setMobileTab('editor');
    }
  }, [selectedVideo?.id]);

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
  const [useCustomCaptionColors, setUseCustomCaptionColors] = useState(false);
  const [captionTextColor, setCaptionTextColor] = useState('#FFFFFF');
  const [captionHighlightColor, setCaptionHighlightColor] = useState('#FFD700');
  const [sourceLanguage, setSourceLanguage] = useState('auto');
  const [forceRetranscribe, setForceRetranscribe] = useState(false);
  const [outputLanguage, setOutputLanguage] = useState('original');
  const [dubVoice, setDubVoice] = useState(false);
  const [speakerGender, setSpeakerGender] = useState('female');

  const sourceVideoRef = useRef(null);
  // Custom Audio & Background Music State
  const [audioMode, setAudioMode] = useState('original'); // 'original' | 'mix' | 'replace' | 'mute'
  const [audioSourceType, setAudioSourceType] = useState('preset'); // 'preset' | 'upload'
  const [musicPreset, setMusicPreset] = useState('lofi');
  const [musicVolume, setMusicVolume] = useState(0.18);
  const [customAudioPath, setCustomAudioPath] = useState('');
  const [customAudioName, setCustomAudioName] = useState('');
  const [customAudioPreviewUrl, setCustomAudioPreviewUrl] = useState('');
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [audioUploadError, setAudioUploadError] = useState('');
  const audioFileInputRef = useRef(null);

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
  const [outroMode, setOutroMode] = useState('none');

  // 9:16 Creator Outro Screen State (Custom builder)
  const [enableOutro, setEnableOutro] = useState(false);
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

  // Custom Thumbnail State for Modal
  const [modalThumbnailPath, setModalThumbnailPath] = useState(null);
  const [modalThumbnailPreview, setModalThumbnailPreview] = useState(null);
  const [isUploadingModalThumb, setIsUploadingModalThumb] = useState(false);
  const modalThumbInputRef = useRef(null);

  // Watermark & Branding Studio State for Modal
  const [modalBrandingTab, setModalBrandingTab] = useState('watermark'); // 'watermark' | 'header' | 'footer'
  const [modalWatermarkPath, setModalWatermarkPath] = useState(null);
  const [modalWatermarkPreview, setModalWatermarkPreview] = useState(null);
  const [modalWatermarkPos, setModalWatermarkPos] = useState('top-right');
  const [modalWatermarkScale, setModalWatermarkScale] = useState(16);
  const [modalWatermarkOpacity, setModalWatermarkOpacity] = useState(85);
  const [modalWatermarkMode, setModalWatermarkMode] = useState('always'); // 'always'
  const [isUploadingModalWatermark, setIsUploadingModalWatermark] = useState(false);

  const [modalHeaderPath, setModalHeaderPath] = useState(null);
  const [modalHeaderPreview, setModalHeaderPreview] = useState(null);
  const [modalHeaderHeight, setModalHeaderHeight] = useState(160);
  const [isUploadingModalHeader, setIsUploadingModalHeader] = useState(false);

  const [modalFooterPath, setModalFooterPath] = useState(null);
  const [modalFooterPreview, setModalFooterPreview] = useState(null);
  const [modalFooterHeight, setModalFooterHeight] = useState(180);
  const [isUploadingModalFooter, setIsUploadingModalFooter] = useState(false);

  const modalWatermarkInputRef = useRef(null);
  const modalHeaderInputRef = useRef(null);
  const modalFooterInputRef = useRef(null);

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
    const editOptions = selectedClip?.edit_options || {};
    setUseCustomCaptionColors(Boolean(editOptions.primary_color || editOptions.highlight_color));
    setCaptionTextColor(editOptions.primary_color || '#FFFFFF');
    setCaptionHighlightColor(editOptions.highlight_color || '#FFD700');
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
    setClipPlaybackError(false);
    if (!selectedClip?.id || selectedClip.status !== 'completed' || !selectedClip.storage_path) return undefined;
    api.getClipMedia(selectedClip.id).then((url) => {
      if (!active) {
        if (url && typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
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
      if (currentUrl && typeof currentUrl === 'string' && currentUrl.startsWith('blob:')) URL.revokeObjectURL(currentUrl);
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

  // Workflow Mode for source video: 'shorts' (9:16 Viral Shorts) | 'full_caption' (Full Video Captions)
  const [workflowMode, setWorkflowMode] = useState('shorts');
  const visibleClips = clipsVideoId === selectedVideo?.id ? clips : [];
  const visibleSelectedClip = visibleClips.find((clip) => clip.id === selectedClip?.id) || null;

  const isFullVideoClip = useCallback((clip) => {
    if (!clip) return false;
    return Boolean(
      clip.workflow_type === 'full_caption' ||
      clip.aspect_ratio === '16:9' ||
      clip.edit_options?.is_full_video ||
      clip.edit_options?.captioned_full_video ||
      clip.edit_options?.framing_mode === 'original' ||
      (clip.title && clip.title.toLowerCase().includes('(full captions)'))
    );
  }, []);

  const hasAnalyzedMoments = selectedVideo?.highlight_status === 'completed'
    && (selectedVideo?.highlights?.clips || []).length >= 5;

  // In-Web Notification state: inform user they can download by clicking 3 dots on all devices
  const [showDownloadTipNotification, setShowDownloadTipNotification] = useState(false);

  useEffect(() => {
    if (selectedVideo && sourceVideoUrl && !hasAnalyzedMoments) {
      setShowDownloadTipNotification(true);

      // Native browser notification if user has granted permission
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('Download Source Video', {
            body: 'You can download this video by clicking the 3 dots (⋮) on the player controls.',
            icon: harvestLogo,
          });
        } catch (_) {}
      }

      const timer = setTimeout(() => {
        setShowDownloadTipNotification(false);
      }, 9000);
      return () => clearTimeout(timer);
    } else {
      setShowDownloadTipNotification(false);
    }
  }, [selectedVideo?.id, sourceVideoUrl, hasAnalyzedMoments]);


  // 1. Load Projects on Mount
  const loadProjects = useCallback(async () => {
    try {
      const data = await api.getProjects();
      const projList = data || [];
      setProjects(projList);
      try {
        localStorage.setItem('harvest_cached_projects', JSON.stringify(projList));
      } catch {}

      setActiveProjectId((prev) => {
        if (prev && projList.some((p) => p.id === prev)) {
          return prev;
        }
        const cached = (() => {
          try {
            const raw = localStorage.getItem('harvest_active_project_id');
            return raw ? Number(raw) : null;
          } catch { return null; }
        })();
        if (cached && projList.some((p) => p.id === cached)) {
          return cached;
        }
        if (projList.length > 0) {
          const firstId = projList[0].id;
          try { localStorage.setItem('harvest_active_project_id', String(firstId)); } catch {}
          return firstId;
        }
        try { localStorage.removeItem('harvest_active_project_id'); } catch {}
        return null;
      });
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setIsInitialLoadingProjects(false);
    }
  }, []);

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
      const vids = allVideos || [];
      setVideos(vids);
      try {
        localStorage.setItem(`harvest_cached_videos_${activeProjectId}`, JSON.stringify(vids));
      } catch {}

      // Keep current selection or restore cached selection
      const cachedVidId = (() => {
        try { return localStorage.getItem('harvest_active_video_id'); } catch { return null; }
      })();
      const targetId = preferredVideoId != null ? preferredVideoId : (cachedVidId ? Number(cachedVidId) : null);
      const preferred = targetId == null ? null : vids?.find((v) => v.id === targetId);

      setSelectedVideo((previous) => preferred || (previous && vids?.find((v) => v.id === previous.id)) || (vids.length > 0 ? vids[0] : null));
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
        const fullVideoClip = uniqueClips.find((c) => isFullVideoClip(c));
        const selectedMomentClip = uniqueClips.find((clip) => clip.edit_options?.workflow === 'selected_moment_v1');
        setSelectedClip((prev) => {
          if (prev) {
            const found = uniqueClips.find((c) => c.id === prev.id);
            if (found) return found;
          }
          if (workflowMode === 'full_caption' && fullVideoClip) return fullVideoClip;
          if (selectedMomentClip) return selectedMomentClip;
          if (fullVideoClip) return fullVideoClip;
          return uniqueClips[0];
        });
      } else {
        setSelectedClip(null);
      }
    } catch (err) {
      console.error('Failed to load clips:', err);
    }
  }, [selectedVideo, isFullVideoClip, workflowMode]);

  useEffect(() => {
    loadClips();
  }, [loadClips]);

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
            setTimeout(() => setActionMessage(''), 5000);
          } else if (updated.status === 'failed') {
            setActionLoading(false);
            setActionMessage('Rendering failed. Your selected moment and transcript are saved; retry after checking the worker logs.');
            setTimeout(() => setActionMessage(''), 6000);
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

  const workflowModeRef = useRef(workflowMode);
  useEffect(() => {
    workflowModeRef.current = workflowMode;
  }, [workflowMode]);

  const loadVideosRef = useRef(loadVideos);
  useEffect(() => {
    loadVideosRef.current = loadVideos;
  }, [loadVideos]);

  const loadClipsRef = useRef(loadClips);
  useEffect(() => {
    loadClipsRef.current = loadClips;
  }, [loadClips]);

  const isCheckingStatusRef = useRef(false);

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
      if (isCheckingStatusRef.current) return;
      isCheckingStatusRef.current = true;
      try {
        const statusData = await api.getVideoStatus(videoId);
        setPipelineStatus(statusData);

        const isFailed = statusData?.stage === 'failed' || statusData?.video_status === 'failed';
        const momentsReady = statusData?.video_status === 'completed' &&
          statusData?.highlight_status === 'completed' && (statusData?.moments_ready || 0) >= 5;
        const isDone = !isFailed && (
          statusData?.stage === 'done' ||
          statusData?.is_done === true ||
          statusData?.is_complete === true ||
          momentsReady ||
          (statusData?.video_status === 'completed' && (
            statusData?.is_done ||
            statusData?.is_complete ||
            statusData?.variations_ready >= 5 ||
            (statusData?.stage_label && statusData.stage_label.toLowerCase().includes('success'))
          ))
        );

        if (isDone) {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          pollIntervalRef.current = null;
          timerIntervalRef.current = null;

          setIsAnalyzing(false);
          setActionLoading(false);

          const curMode = workflowModeRef.current;
          if (curMode === 'full_caption' || (statusData?.stage_label && statusData.stage_label.toLowerCase().includes('caption'))) {
            setMomentWorkflowStep('clips');
            setActionMessage('Full video captioned successfully!');
          } else if (momentsReady) {
            setMomentWorkflowStep('moments');
            setSelectedMomentId(null);
            setActionMessage('Five moments are ready to preview.');
          } else {
            setMomentWorkflowStep('clips');
            setActionMessage('Generation completed successfully!');
          }

          if (loadVideosRef.current) await loadVideosRef.current();
          if (loadClipsRef.current) await loadClipsRef.current();
          setTimeout(() => setActionMessage(''), 5000);
          return;
        }

        if (isFailed) {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          pollIntervalRef.current = null;
          timerIntervalRef.current = null;
          setIsAnalyzing(false);
          setActionLoading(false);
          setActionMessage(statusData?.stage_label || 'Generation failed. Please try again.');
          if (loadVideosRef.current) await loadVideosRef.current();
          return;
        }

        // Fetch any ready clips while in progress
        if (loadClipsRef.current) await loadClipsRef.current();
      } catch (err) {
        console.error('Status check error:', err);
      } finally {
        isCheckingStatusRef.current = false;
      }
    };

    // Run first check immediately, then every 1500ms
    pollIntervalRef.current = setInterval(checkStatus, 1500);
    checkStatus();
  }, []);

  // If user selects a video that is currently processing in the background, attach polling automatically
  useEffect(() => {
    if (selectedVideo && (selectedVideo.status === 'processing' || selectedVideo.status === 'pending')) {
      startStatusPolling(selectedVideo.id);
    }
  }, [selectedVideo?.id, selectedVideo?.status, startStatusPolling]);

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
        setMobileTab('editor');
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
      setMobileTab('editor');
      await loadVideos(importedVideo.id);

      setActionLoading(false);
      setActionMessage('Video downloaded. Customize clip length & captions, then click Analyze.');
      setTimeout(() => setActionMessage(''), 3500);
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
        primary_color: useCustomCaptionColors ? captionTextColor : null,
        highlight_color: useCustomCaptionColors ? captionHighlightColor : null,
        translate_language: outputLanguage === 'original' ? 'none' : outputLanguage,
        caption_language: outputLanguage === 'original' ? 'original' : 'translated',
        dub_voice: dubVoice,
        length: 60,
        platform: 'youtube',
        source_language: sourceLanguage === 'auto' ? null : sourceLanguage,
        retranscribe: forceRetranscribe,
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

  const handleCaptionFullVideo = async () => {
    if (!selectedVideo) return;
    setWorkflowMode('full_caption');
    setActionLoading(true);
    setIsAnalyzing(true);
    setElapsedSeconds(0);
    const captionsEnabled = captionStyle !== 'none';
    setPipelineStatus({ stage: 'queued', stage_label: captionsEnabled ? 'Transcribing & adding animated captions to full video…' : 'Preparing the full video without captions…' });
    setActionMessage(captionsEnabled ? 'Analyzing full video and applying animated captions…' : 'Preparing the full video without captions…');
    try {
      await api.captionFullVideo(selectedVideo.id, {
        caption_style: captionStyle,
        primary_color: useCustomCaptionColors ? captionTextColor : null,
        highlight_color: useCustomCaptionColors ? captionHighlightColor : null,
        translate_language: outputLanguage === 'original' ? 'none' : outputLanguage,
        caption_language: outputLanguage === 'original' ? 'original' : 'translated',
        source_language: sourceLanguage === 'auto' ? null : sourceLanguage,
        retranscribe: forceRetranscribe,
      });
      startStatusPolling(selectedVideo.id);
      await loadClips();
    } catch (error) {
      setActionLoading(false);
      setIsAnalyzing(false);
      setActionMessage(error.response?.data?.detail || error.message || 'Could not queue full video captioning.');
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

  const handleModalThumbnailUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const localUrl = URL.createObjectURL(file);
    setModalThumbnailPreview(localUrl);
    setIsUploadingModalThumb(true);
    try {
      const res = await api.uploadThumbnail(file);
      setModalThumbnailPath(res.thumbnail_path || res.storage_path);
    } catch (err) {
      console.error('Thumbnail upload failed:', err);
      setActionMessage(`Thumbnail upload failed: ${err.response?.data?.detail || err.message}`);
    } finally {
      setIsUploadingModalThumb(false);
    }
  };

  const handleModalBrandingUpload = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const localUrl = URL.createObjectURL(file);
    if (type === 'watermark') {
      setModalWatermarkPreview(localUrl);
      setIsUploadingModalWatermark(true);
    } else if (type === 'header') {
      setModalHeaderPreview(localUrl);
      setIsUploadingModalHeader(true);
    } else if (type === 'footer') {
      setModalFooterPreview(localUrl);
      setIsUploadingModalFooter(true);
    }

    try {
      const res = await api.uploadBrandingImageGeneral(file, type);
      const sPath = res.storage_path;
      if (type === 'watermark') setModalWatermarkPath(sPath);
      else if (type === 'header') setModalHeaderPath(sPath);
      else if (type === 'footer') setModalFooterPath(sPath);
    } catch (err) {
      console.error(`Upload branding ${type} failed:`, err);
      setActionMessage(`Upload branding ${type} failed: ${err.response?.data?.detail || err.message}`);
    } finally {
      if (type === 'watermark') setIsUploadingModalWatermark(false);
      else if (type === 'header') setIsUploadingModalHeader(false);
      else if (type === 'footer') setIsUploadingModalFooter(false);
    }
  };

  const clearModalThumbnail = () => {
    setModalThumbnailPath(null);
    setModalThumbnailPreview(null);
    if (modalThumbInputRef.current) modalThumbInputRef.current.value = '';
  };

  const clearModalBrandingAsset = (type) => {
    if (type === 'watermark') {
      setModalWatermarkPath(null);
      setModalWatermarkPreview(null);
      if (modalWatermarkInputRef.current) modalWatermarkInputRef.current.value = '';
    } else if (type === 'header') {
      setModalHeaderPath(null);
      setModalHeaderPreview(null);
      if (modalHeaderInputRef.current) modalHeaderInputRef.current.value = '';
    } else if (type === 'footer') {
      setModalFooterPath(null);
      setModalFooterPreview(null);
      if (modalFooterInputRef.current) modalFooterInputRef.current.value = '';
    }
  };

  const handleRenderSelectedMoment = async () => {
    if (!selectedVideo || selectedMomentId == null) return;
    setActionLoading(true);
    setShowAudioModal(false);
    setActionMessage('Queueing a new vertical short with your chosen soundtrack and captions…');
    try {
      const clip = await api.selectMoment(selectedVideo.id, selectedMomentId, captionStyle, {
        translateLanguage: outputLanguage === 'original' ? 'none' : outputLanguage,
        captionLanguage: outputLanguage === 'original' ? 'original' : 'translated',
        primaryColor: useCustomCaptionColors ? captionTextColor : null,
        highlightColor: useCustomCaptionColors ? captionHighlightColor : null,
        dubVoice,
        speakerGender,
        audioMode,
        customAudioPath: (audioMode === 'mix' || audioMode === 'replace') && audioSourceType === 'upload' ? customAudioPath : null,
        musicPreset: (audioMode === 'mix' || audioMode === 'replace') && audioSourceType === 'preset' ? musicPreset : 'none',
        musicVolume: audioMode === 'mute' ? 0 : musicVolume,
        enableOutro: false,
        templateId: null,
        templateStoragePath: null,
        thumbnailPath: null,
        watermarkPath: null,
        headerImagePath: null,
        footerImagePath: null,
      });
      setSelectedClip(clip);
      setClips((items) => [clip, ...items.filter((item) => item.id !== clip.id)]);
      setClipsVideoId(selectedVideo.id);
      setMomentWorkflowStep('clips');
      setActionMessage('This short is rendering. Your chosen soundtrack and captions are being applied.');
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
    setMobileTab('editor');
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
            <img className="studio-brand-logo" src={harvestLogo} alt="Harvest AI logo" style={{ width: 42, height: 42, objectFit: 'contain', borderRadius: '6px' }} />
            <span
              className="studio-brand-title"
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
              onChange={(e) => {
                const val = e.target.value ? Number(e.target.value) : null;
                setActiveProjectId(val);
                try {
                  if (val) localStorage.setItem('harvest_active_project_id', String(val));
                  else localStorage.removeItem('harvest_active_project_id');
                } catch {}
              }}
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
              {isInitialLoadingProjects && projects.length === 0 && <option value="">Loading projects…</option>}
              {!isInitialLoadingProjects && projects.length === 0 && <option value="">No projects yet</option>}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title || p.name || `Project #${p.id}`}
                </option>
              ))}
            </select>

            <button
              className="studio-new-project-btn"
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
              <Plus size={14} /> <span className="studio-new-project-label">New Project</span>
            </button>


            {activeProjectId && (
              <button
                className="studio-delete-project-btn"
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
          <span className="studio-user-email" style={{ fontSize: '0.875rem', color: '#5b616b' }}>{user?.full_name || user?.email}</span>
          <button
            className="studio-logout-btn"
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
            <LogOut size={14} /> <span className="studio-logout-label">Sign Out</span>
          </button>
        </div>
      </header>

      {/* ── Mobile Tab Navigation (Visible ONLY on mobile <= 768px) ── */}
      <div className="studio-mobile-tabs" role="tablist" aria-label="Studio Views">
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'editor'}
          className={`studio-mobile-tab-btn ${mobileTab === 'editor' ? 'active' : ''}`}
          onClick={() => setMobileTab('editor')}
        >
          <Sparkles size={15} />
          <span>Studio &amp; Editor</span>
          {selectedVideo && <span className="studio-mobile-active-dot" title="Video selected" />}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'footage'}
          className={`studio-mobile-tab-btn ${mobileTab === 'footage' ? 'active' : ''}`}
          onClick={() => setMobileTab('footage')}
        >
          <Film size={15} />
          <span>Footage &amp; Upload</span>
          {videos.length > 0 && <span className="studio-mobile-count">{videos.length}</span>}
        </button>
      </div>

      {/* ── Main Studio Workspace Layout ── */}
      <div className="studio-workspace" style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Left Column: Video List & Upload */}
        <aside
          className={`studio-sidebar ${mobileTab === 'footage' ? 'studio-mobile-tab-active' : 'studio-mobile-tab-inactive'}`}
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
                  disabled={isUploading || isImportingUrl || (!activeProjectId && !isInitialLoadingProjects)}
                  onClick={() => activeProjectId ? fileInputRef.current?.click() : setShowNewProjectModal(true)}
                  style={{
                    width: '100%',
                    padding: '0.7rem',
                    borderRadius: '6px',
                    backgroundColor: isUploading || (!activeProjectId && !isInitialLoadingProjects) ? '#7a808a' : '#1f6f4a',
                    color: '#ffffff',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: isUploading || (!activeProjectId && !isInitialLoadingProjects) ? 'not-allowed' : 'pointer',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  <UploadCloud size={16} />
                  {isUploading ? `Uploading ${uploadProgress}%…` : isInitialLoadingProjects ? 'Loading…' : activeProjectId ? 'Choose Video File' : 'Create Project First'}
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
            {isInitialLoadingProjects && videos.length === 0 ? (
              <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.825rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <Loader size={18} className="render-loading-spinner" />
                <span>Loading footage…</span>
              </div>
            ) : videos.length === 0 ? (
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
                      try {
                        if (vid?.id) localStorage.setItem('harvest_active_video_id', String(vid.id));
                        else localStorage.removeItem('harvest_active_video_id');
                      } catch {}
                      if (window.innerWidth <= 768) {
                        setMobileTab('editor');
                      }
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
        <main className={`studio-main studio-main-scroll ${mobileTab === 'editor' ? 'studio-mobile-tab-active' : 'studio-mobile-tab-inactive'}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#fafaf8', height: '100%', maxHeight: '100%', overflowY: 'auto', minHeight: 0, minWidth: 0 }}>
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
              <div className="studio-content-container" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1200px', width: '100%', boxSizing: 'border-box', margin: '0 auto' }}>
                <button
                  onClick={handleBackToProject}
                  className="studio-back-btn"
                  style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.55rem 0.8rem', border: '1px solid #e6e6e1', borderRadius: '6px', background: '#fff', color: '#16181d', fontWeight: 600, cursor: 'pointer' }}
                >
                  <ArrowLeft size={15} /> Back to project
                </button>
                {isAnalyzing ? (
                  <div className="studio-analyze-header-card" style={{ background: '#fff', border: '1px solid #e6e6e1', borderRadius: '8px', padding: '1.25rem 1.5rem' }}>
                    <div style={{ color: '#7a808a', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                      {workflowMode === 'full_caption' ? 'Full Video Processing' : 'Step 2 of 3 · Analyze'}
                    </div>
                    <h2 style={{ margin: '0 0 0.3rem', fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif', color: '#16181d' }}>{selectedVideo.original_filename || `Video #${selectedVideo.id}`}</h2>
                    <p style={{ margin: 0, color: '#5b616b', fontSize: '0.9rem' }}>{pipelineStatus?.stage_label || (workflowMode === 'full_caption' ? 'Transcribing & adding animated captions to full video…' : 'Analyzing your video and finding five moments…')}</p>
                  </div>
                ) : (hasAnalyzedMoments || visibleClips.length > 0) && momentWorkflowStep !== 'setup' ? (
                  <div
                    className={`studio-workflow-header-card ${momentWorkflowStep === 'customize' ? 'studio-customizing-hide-mobile' : ''}`}
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
                      <div className="studio-workflow-step-badge" style={{ color: '#7a808a', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                        {hasAnalyzedMoments ? (
                          momentWorkflowStep === 'moments'
                            ? 'Step 1 of 2 · Choose a Viral Moment'
                            : momentWorkflowStep === 'customize'
                              ? 'Step 2 of 2 · Audio Track, Creator Outro & Branding Settings'
                              : 'Generated Shorts Workspace'
                        ) : 'Captioned Video Workspace'}
                      </div>
                      <h2
                        className="studio-workflow-title"
                        style={{
                          fontSize: '1.25rem',
                          fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
                          fontWeight: 700,
                          margin: '0 0 0.25rem',
                          color: '#16181d',
                          letterSpacing: '-0.02em',
                        }}
                      >
                        {selectedVideo.original_filename?.replace(/\.[^/.]+$/, '') || `Video #${selectedVideo.id}`}
                      </h2>
                      <p className="studio-workflow-desc" style={{ fontSize: '0.85rem', color: '#5b616b', margin: 0 }}>
                        {hasAnalyzedMoments ? (
                          momentWorkflowStep === 'moments'
                            ? 'Select one of the five detected moments below, then click Next.'
                            : momentWorkflowStep === 'customize'
                              ? 'Customize soundtrack, outro template, custom thumbnail, and branding, then render your 9:16 short.'
                              : 'Preview, download, and publish your generated 9:16 vertical shorts.'
                        ) : 'Preview, download, or publish your captioned full video.'}
                      </p>
                    </div>

                    <div className="studio-workflow-header-tools" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                      {!isAnalyzing && (
                        <div className="studio-workflow-tabs-group" style={{ display: 'flex', gap: '0.35rem', backgroundColor: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
                          <button
                            type="button"
                            onClick={() => setMomentWorkflowStep('setup')}
                            style={{
                              padding: '0.4rem 0.85rem',
                              fontSize: '0.82rem',
                              fontWeight: momentWorkflowStep === 'setup' ? 700 : 500,
                              borderRadius: '6px',
                              border: 'none',
                              backgroundColor: momentWorkflowStep === 'setup' ? '#ffffff' : 'transparent',
                              color: momentWorkflowStep === 'setup' ? '#1f6f4a' : '#64748b',
                              boxShadow: momentWorkflowStep === 'setup' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                            }}
                          >
                            <RotateCcw size={13} />
                            <span>Setup</span>
                          </button>
                          {hasAnalyzedMoments && (
                            <button
                              type="button"
                              onClick={() => setMomentWorkflowStep('moments')}
                              style={{
                                padding: '0.4rem 0.85rem',
                                fontSize: '0.82rem',
                                fontWeight: momentWorkflowStep === 'moments' ? 700 : 500,
                                borderRadius: '6px',
                                border: 'none',
                                backgroundColor: momentWorkflowStep === 'moments' ? '#ffffff' : 'transparent',
                                color: momentWorkflowStep === 'moments' ? '#1f6f4a' : '#64748b',
                                boxShadow: momentWorkflowStep === 'moments' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                              }}
                            >
                              <Film size={14} />
                              Moments (5)
                            </button>
                          )}
                          {hasAnalyzedMoments && selectedMomentId != null && (
                            <button
                              type="button"
                              onClick={() => setMomentWorkflowStep('customize')}
                              style={{
                                padding: '0.4rem 0.85rem',
                                fontSize: '0.82rem',
                                fontWeight: momentWorkflowStep === 'customize' ? 700 : 500,
                                borderRadius: '6px',
                                border: 'none',
                                backgroundColor: momentWorkflowStep === 'customize' ? '#ffffff' : 'transparent',
                                color: momentWorkflowStep === 'customize' ? '#1f6f4a' : '#64748b',
                                boxShadow: momentWorkflowStep === 'customize' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                              }}
                            >
                              <Music size={14} />
                              <span className="studio-tab-label-desktop">Audio &amp; Outro Settings</span>
                              <span className="studio-tab-label-mobile">Customize</span>
                            </button>
                          )}
                          {visibleClips.length > 0 && (
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
                              <span className="studio-tab-label-desktop">{visibleClips.some(isFullVideoClip) ? `Captioned Video (${visibleClips.length})` : `Generated Clips (${visibleClips.length})`}</span>
                              <span className="studio-tab-label-mobile">Clips ({visibleClips.length})</span>
                            </button>
                          )}
                        </div>
                      )}

                      {dubVoice && momentWorkflowStep !== 'clips' && (
                        <label className="studio-dub-voice-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: '#5b616b' }}>
                          Dub voice
                          <select value={speakerGender} onChange={(event) => setSpeakerGender(event.target.value)} disabled={actionLoading} style={{ padding: '0.55rem', border: '1px solid #e6e6e1', borderRadius: '6px', background: '#fff', color: '#16181d' }}>
                            <option value="female">Female</option><option value="male">Male</option>
                          </select>
                        </label>
                      )}
                    </div>
                  </div>
                ) : (
                  <section className="studio-setup-card" style={{ background: '#fff', border: '1px solid #e6e6e1', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    {/* Mode Selector Tabs: 9:16 Shorts vs Full Video Captions */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '0.45rem',
                        padding: '0.25rem',
                        backgroundColor: '#f1f5f9',
                        borderRadius: '10px',
                        marginBottom: '1rem',
                      }}
                    >
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => setWorkflowMode('shorts')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.45rem',
                          padding: '0.65rem 0.85rem',
                          borderRadius: '8px',
                          border: 'none',
                          backgroundColor: workflowMode === 'shorts' ? '#ffffff' : 'transparent',
                          color: workflowMode === 'shorts' ? '#1f6f4a' : '#64748b',
                          fontWeight: workflowMode === 'shorts' ? 750 : 600,
                          fontSize: '0.86rem',
                          cursor: 'pointer',
                          boxShadow: workflowMode === 'shorts' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <Sparkles size={15} color={workflowMode === 'shorts' ? '#1f6f4a' : '#64748b'} />
                        <span>🔥 Viral Shorts (9:16)</span>
                      </button>

                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => setWorkflowMode('full_caption')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.45rem',
                          padding: '0.65rem 0.85rem',
                          borderRadius: '8px',
                          border: 'none',
                          backgroundColor: workflowMode === 'full_caption' ? '#ffffff' : 'transparent',
                          color: workflowMode === 'full_caption' ? '#1f6f4a' : '#64748b',
                          fontWeight: workflowMode === 'full_caption' ? 750 : 600,
                          fontSize: '0.86rem',
                          cursor: 'pointer',
                          boxShadow: workflowMode === 'full_caption' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <Film size={15} color={workflowMode === 'full_caption' ? '#1f6f4a' : '#64748b'} />
                        <span>🎬 Caption Full Video (Full Length)</span>
                      </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                      <span style={{ color: '#1f6f4a', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', backgroundColor: '#ecfdf5', padding: '2px 8px', borderRadius: '999px', border: '1px solid #a7f3d0' }}>
                        {workflowMode === 'shorts' ? 'Step 1 of 3 · Set up short' : 'Full Video Mode · Original Resolution'}
                      </span>
                    </div>

                    <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.15rem', fontFamily: 'inherit', fontWeight: 700, color: '#0f172a', lineHeight: 1.35, wordBreak: 'break-word' }}>
                      {(selectedVideo.original_filename || `Video #${selectedVideo.id}`).replace(/\.(mp4|mov|mkv|webm|avi|m4v)$/i, '')}
                    </h2>
                    <p style={{ margin: '0 0 0.85rem', color: '#64748b', fontSize: '0.825rem', lineHeight: 1.45 }}>
                      {workflowMode === 'shorts'
                        ? 'Choose clip length & caption style, then find viral moments.'
                        : captionStyle === 'none'
                          ? 'Create a clean full-length video without burned-in captions, preserving the original resolution.'
                          : 'Transcribe full audio and burn lower-third animated captions onto the entire video without cropping (16:9 widescreen preserved).'}
                    </p>

                    {actionMessage && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.85rem', padding: '0.4rem 0.75rem', borderRadius: '6px', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', color: '#15803d', fontSize: '0.8rem', fontWeight: 600 }}>
                        <CheckCircle2 size={14} />
                        <span>{actionMessage}</span>
                      </div>
                    )}

                    <div className="studio-output-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(280px, 1fr)', gap: '1.15rem', alignItems: 'start' }}>
                      {/* Video Player & Download Hint */}
                      <div>
                        <div style={{
                          position: 'relative',
                          background: '#090a0f',
                          borderRadius: '10px',
                          overflow: 'hidden',
                          aspectRatio: '16/9',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '1px solid #1e293b'
                        }}>
                          {sourceVideoUrl ? (
                            <video
                              ref={sourceVideoRef}
                              key={selectedVideo.id}
                              src={sourceVideoUrl}
                              controls
                              playsInline
                              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                            />
                          ) : (
                            <div style={{ color: '#94a3b8', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                              <Loader size={16} className="render-loading-spinner" /> Loading source video…
                            </div>
                          )}
                        </div>
                        {sourceVideoUrl && (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.4rem 0.65rem',
                            marginTop: '0.35rem',
                            backgroundColor: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '7px',
                            fontSize: '0.74rem',
                            color: '#475569',
                          }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                              <Download size={12} color="#1f6f4a" />
                              <span>Click <strong>3 dots (⋮)</strong> on the player to download</span>
                            </span>
                            <a
                              href={sourceVideoUrl}
                              download={(selectedVideo.original_filename || `video-${selectedVideo.id}`).replace(/\.[^/.]+$/, '') + '.mp4'}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: '#1f6f4a',
                                fontWeight: 700,
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.2rem',
                                fontSize: '0.74rem',
                              }}
                            >
                              Download <ExternalLink size={11} />
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Simple, Tap-Friendly Controls */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        {workflowMode === 'full_caption' && (
                          <div style={{
                            padding: '0.65rem 0.85rem',
                            borderRadius: '8px',
                            backgroundColor: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            color: '#166534',
                            fontSize: '0.78rem',
                            lineHeight: 1.45,
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '0.45rem',
                          }}>
                            <Sparkles size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                            <div>
                              <strong>{captionStyle === 'none' ? 'Full Video Without Captions:' : 'Full Video Captioning:'}</strong> {captionStyle === 'none' ? 'Creates a clean video without burned-in subtitles while preserving the original widescreen resolution.' : 'Analyzes the complete video audio and adds animated subtitles in the lower third while preserving original widescreen resolution.'}
                            </div>
                          </div>
                        )}

                        {/* 1. Quick Clip Length (1-Tap Pills) - Only shown in Shorts mode */}
                        {workflowMode === 'shorts' && (
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                              <span style={{ color: '#334155', fontSize: '0.825rem', fontWeight: 650 }}>Clip Length</span>
                              <span style={{ color: '#1f6f4a', fontSize: '0.78rem', fontWeight: 700 }}>{clipLength} seconds</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
                              {[15, 30, 45, 60].map((len) => (
                                <button
                                  key={len}
                                  type="button"
                                  disabled={actionLoading}
                                  onClick={() => setClipLength(len)}
                                  style={{
                                    padding: '0.55rem 0.2rem',
                                    borderRadius: '8px',
                                    border: clipLength === len ? '1.5px solid #1f6f4a' : '1px solid #e2e8f0',
                                    backgroundColor: clipLength === len ? '#ecfdf5' : '#f8fafc',
                                    color: clipLength === len ? '#1f6f4a' : '#475569',
                                    fontWeight: clipLength === len ? 750 : 550,
                                    fontSize: '0.825rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    textAlign: 'center',
                                  }}
                                >
                                  {len}s
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 2. Caption appearance: preset style plus optional color overrides */}
                        <div>
                          <div style={{ color: '#334155', fontSize: '0.825rem', fontWeight: 650, marginBottom: '0.35rem' }}>
                            Caption Appearance
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(85px, 1fr))', gap: '0.35rem' }}>
                            {[
                              { id: 'pop', label: 'Viral Pop' },
                              { id: 'karaoke', label: 'Karaoke' },
                              { id: 'minimalist', label: 'Minimal' },
                              { id: 'boxed', label: 'Boxed' },
                              { id: 'neon', label: 'Neon' },
                              { id: 'none', label: 'No Captions' },
                            ].map((style) => (
                              <button
                                key={style.id}
                                type="button"
                                disabled={actionLoading}
                                onClick={() => setCaptionStyle(style.id)}
                                style={{
                                  padding: '0.45rem 0.25rem',
                                  borderRadius: '8px',
                                  border: captionStyle === style.id ? '1.5px solid #1f6f4a' : '1px solid #e2e8f0',
                                  backgroundColor: captionStyle === style.id ? '#ecfdf5' : '#f8fafc',
                                  color: captionStyle === style.id ? '#1f6f4a' : '#475569',
                                  fontWeight: captionStyle === style.id ? 750 : 550,
                                  fontSize: '0.78rem',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                  textAlign: 'center',
                                }}
                              >
                                {style.label}
                              </button>
                            ))}
                          </div>
                          {captionStyle === 'none' && (
                            <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: '0.4rem' }}>
                              The video will be rendered without burned-in captions.
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', padding: '0.6rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#334155', fontSize: '0.8rem', fontWeight: 650 }}>
                            <input
                              type="checkbox"
                              checked={useCustomCaptionColors}
                              disabled={actionLoading}
                              onChange={(event) => setUseCustomCaptionColors(event.target.checked)}
                              style={{ width: '14px', height: '14px', accentColor: '#1f6f4a' }}
                            />
                            Use custom caption colors
                          </label>
                          {useCustomCaptionColors ? (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', color: '#475569', fontSize: '0.75rem' }}>
                                Text
                                <input type="color" value={captionTextColor} disabled={actionLoading} onChange={(event) => setCaptionTextColor(event.target.value)} aria-label="Caption text color" />
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', color: '#475569', fontSize: '0.75rem' }}>
                                Highlight
                                <input type="color" value={captionHighlightColor} disabled={actionLoading} onChange={(event) => setCaptionHighlightColor(event.target.value)} aria-label="Caption highlight color" />
                              </label>
                            </div>
                          ) : (
                            <span style={{ color: '#64748b', fontSize: '0.72rem' }}>Default: white text, black outline; the style sets the highlight color.</span>
                          )}
                        </div>

                        {/* 3. Language & Translation */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', color: '#334155', fontSize: '0.825rem', fontWeight: 650 }}>
                            Spoken Language (Transcription)
                            <select
                              value={sourceLanguage}
                              onChange={(event) => setSourceLanguage(event.target.value)}
                              disabled={actionLoading}
                              style={{ padding: '0.55rem 0.7rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc', color: '#16181d', fontSize: '0.825rem', fontWeight: 550 }}
                            >
                              <option value="auto">✨ Auto-Detect (Default)</option>
                              <option value="ta">Tamil (தமிழ்)</option>
                              <option value="en">English</option>
                              <option value="hi">Hindi (हिन्दी)</option>
                              <option value="te">Telugu (తెలుగు)</option>
                              <option value="ml">Malayalam (മലയാളം)</option>
                              <option value="kn">Kannada (ಕನ್ನಡ)</option>
                              <option value="mr">Marathi (मराठी)</option>
                              <option value="bn">Bengali (বাংলা)</option>
                              <option value="gu">Gujarati (ગુજરાતી)</option>
                              <option value="pa">Punjabi (ਪੰਜਾਬੀ)</option>
                              <option value="es">Spanish (Español)</option>
                              <option value="fr">French (Français)</option>
                              <option value="de">German (Deutsch)</option>
                              <option value="zh">Chinese (中文)</option>
                              <option value="ja">Japanese (日本語)</option>
                              <option value="ko">Korean (한국어)</option>
                              <option value="ar">Arabic (العربية)</option>
                            </select>
                          </label>

                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer', fontSize: '0.78rem', color: '#475569' }}>
                            <input
                              type="checkbox"
                              checked={forceRetranscribe}
                              disabled={actionLoading}
                              onChange={(e) => setForceRetranscribe(e.target.checked)}
                              style={{ width: '14px', height: '14px', accentColor: '#1f6f4a' }}
                            />
                            <span>Force fresh re-transcription (replace old transcript)</span>
                          </label>

                          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', color: '#334155', fontSize: '0.825rem', fontWeight: 650 }}>
                            Caption / Dubbing Output Language
                            <select
                              value={outputLanguage === 'original' ? 'original' : 'translated'}
                              onChange={(event) => setOutputLanguage(event.target.value === 'original' ? 'original' : (outputLanguage === 'original' ? 'English' : outputLanguage))}
                              disabled={actionLoading}
                              style={{ padding: '0.55rem 0.7rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc', color: '#16181d', fontSize: '0.825rem' }}
                            >
                              <option value="original">Keep original audio language</option>
                              <option value="translated">Translate captions to another language…</option>
                            </select>
                          </label>

                          {outputLanguage !== 'original' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', padding: '0.6rem', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                              <input
                                list="translation-language-options"
                                value={outputLanguage}
                                onChange={(event) => setOutputLanguage(event.target.value)}
                                disabled={actionLoading}
                                placeholder="Type target language (e.g. English, Spanish)"
                                aria-label="Translation language"
                                style={{ padding: '0.5rem 0.65rem', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff', color: '#16181d', fontSize: '0.825rem' }}
                              />
                              <datalist id="translation-language-options">
                                {['English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Bengali', 'Marathi', 'Gujarati', 'Punjabi', 'Urdu', 'Arabic', 'Chinese', 'Japanese', 'Korean', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Russian', 'Ukrainian', 'Dutch', 'Swedish', 'Norwegian', 'Danish', 'Finnish', 'Polish', 'Turkish', 'Greek', 'Hebrew', 'Thai', 'Vietnamese', 'Indonesian', 'Malay', 'Filipino', 'Swahili', 'Persian', 'Nepali', 'Sinhala'].map((language) => <option key={language} value={language} />)}
                              </datalist>

                              {workflowMode === 'shorts' && (
                                <>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: '#1e293b' }}>
                                    <input
                                      type="checkbox"
                                      checked={dubVoice}
                                      disabled={actionLoading}
                                      onChange={(event) => setDubVoice(event.target.checked)}
                                      style={{ width: '15px', height: '15px', accentColor: '#1f6f4a' }}
                                    />
                                    <span>AI Voice Dubbing ({outputLanguage})</span>
                                  </label>

                                  {dubVoice && (
                                    <select
                                      value={speakerGender}
                                      onChange={(event) => setSpeakerGender(event.target.value)}
                                      disabled={actionLoading}
                                      style={{ padding: '0.45rem 0.65rem', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff', fontSize: '0.8rem' }}
                                    >
                                      <option value="female">Female Voice</option>
                                      <option value="male">Male Voice</option>
                                    </select>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>

                        {/* 4. Action CTA Button */}
                        {workflowMode === 'shorts' ? (
                          <button
                            disabled={actionLoading || isAnalyzing}
                            onClick={handleAnalyzeMoments}
                            className="studio-analyze-cta-btn"
                            style={{
                              display: 'inline-flex',
                              justifyContent: 'center',
                              alignItems: 'center',
                              gap: '0.5rem',
                              width: '100%',
                              padding: '0.85rem 1.25rem',
                              border: 0,
                              borderRadius: '10px',
                              background: actionLoading ? '#7a808a' : 'linear-gradient(135deg, #1f6f4a, #165b3c)',
                              color: '#ffffff',
                              fontSize: '0.925rem',
                              fontWeight: 700,
                              cursor: actionLoading ? 'wait' : 'pointer',
                              boxShadow: actionLoading ? 'none' : '0 3px 12px rgba(31, 111, 74, 0.28)',
                              transition: 'all 0.15s ease',
                              marginTop: '0.25rem',
                            }}
                          >
                            {actionLoading ? <Loader size={17} className="render-loading-spinner" /> : <Wand2 size={17} />}
                            <span>Analyze &amp; Find 5 Viral Moments</span>
                          </button>
                        ) : (
                          <button
                            disabled={actionLoading || isAnalyzing}
                            onClick={handleCaptionFullVideo}
                            className="studio-analyze-cta-btn"
                            style={{
                              display: 'inline-flex',
                              justifyContent: 'center',
                              alignItems: 'center',
                              gap: '0.5rem',
                              width: '100%',
                              padding: '0.85rem 1.25rem',
                              border: 0,
                              borderRadius: '10px',
                              background: actionLoading ? '#7a808a' : 'linear-gradient(135deg, #1f6f4a, #165b3c)',
                              color: '#ffffff',
                              fontSize: '0.925rem',
                              fontWeight: 700,
                              cursor: actionLoading ? 'wait' : 'pointer',
                              boxShadow: actionLoading ? 'none' : '0 3px 12px rgba(31, 111, 74, 0.28)',
                              transition: 'all 0.15s ease',
                              marginTop: '0.25rem',
                            }}
                          >
                            {actionLoading ? <Loader size={17} className="render-loading-spinner" /> : <Film size={17} />}
                            <span>{captionStyle === 'none' ? 'Create Full Video Without Captions' : 'Add Captions to Full Video'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </section>
                )}

                {actionMessage && !isAnalyzing && hasAnalyzedMoments && (
                  <div
                    className="studio-action-banner"
                    style={{
                      padding: '0.65rem 0.95rem',
                      borderRadius: '8px',
                      backgroundColor: '#ecfdf5',
                      border: '1px solid #a7f3d0',
                      color: '#166534',
                      fontSize: '0.825rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                      <CheckCircle2 size={16} color="#1f6f4a" style={{ flexShrink: 0 }} />
                      <span style={{ lineHeight: 1.4, wordBreak: 'break-word', fontWeight: 550 }}>{actionMessage}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActionMessage('')}
                      style={{ background: 'none', border: 'none', color: '#166534', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', flexShrink: 0 }}
                      title="Dismiss notice"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                {hasAnalyzedMoments && !isAnalyzing && momentWorkflowStep === 'moments' && (
                  <section className="studio-moments-section" style={{ background: '#fff', border: '1px solid #e6e6e1', borderRadius: '10px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
                    {/* Moments Section Header */}
                    <div
                      className="studio-moments-section-header"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: '1px solid #ecece7',
                        paddingBottom: '0.85rem',
                        marginBottom: '1.25rem',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                        <div
                          className="studio-moments-icon-badge"
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: '6px',
                            backgroundColor: '#ecfdf5',
                            border: '1px solid #a7f3d0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#1f6f4a',
                          }}
                        >
                          <Film size={15} />
                        </div>
                        <div>
                          <h3 className="studio-moments-title" style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#16181d', lineHeight: 1.2 }}>
                            Detected Viral Moments ({selectedVideo?.highlights?.clips?.length || 5})
                          </h3>
                          <p className="studio-moments-subtitle" style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                            Choose a moment below, then click Create Video to configure audio &amp; render.
                          </p>
                        </div>
                      </div>

                      {selectedMomentId != null && (
                        <div className="studio-selected-moment-badge" style={{ fontSize: '0.78rem', color: '#5b616b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span>Selected:</span>
                          <strong style={{ color: '#16181d', background: '#ecfdf5', padding: '2px 8px', borderRadius: '4px', border: '1px solid #a7f3d0' }}>
                            {selectedVideo.highlights.clips[selectedMomentId]?.title || `Moment ${selectedMomentId + 1}`}
                          </strong>
                        </div>
                      )}
                    </div>

                    {/* ════════ MOMENTS LIST ════════ */}
                    <div>
                      <div className="studio-moments-intro" style={{ marginBottom: '1rem' }}>
                        <h3 style={{ margin: '0 0 0.25rem', color: '#16181d', fontSize: '1.05rem' }}>Top Moments from This Video</h3>
                        <p style={{ margin: 0, color: '#5b616b', fontSize: '0.825rem' }}>
                          Preview the source audio for each exact timestamp, select one moment, then click <strong>Create Video</strong> to customize soundtrack, outro &amp; render.
                        </p>
                      </div>

                      <div className="studio-moments-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                        {selectedVideo.highlights.clips.slice(0, 5).map((moment, index) => (
                          <div
                            key={`${selectedVideo.id}-moment-${index}`}
                            className={`studio-moment-card ${selectedMomentId === index ? 'selected' : ''}`}
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
                                <small className="studio-moment-time" style={{ color: '#5b616b', fontSize: '0.75rem' }}>{Number(moment.start_time).toFixed(1)}s–{Number(moment.end_time).toFixed(1)}s · {moment.duration}s</small>
                              </span>
                            </label>
                            {moment.reason && <p className="studio-moment-reason" style={{ fontSize: '0.76rem', color: '#5b616b', margin: '0.45rem 0' }}>{moment.reason}</p>}
                            <div className="studio-moment-audio-box" style={{ marginTop: '0.45rem' }} onClick={(e) => e.stopPropagation()}>
                              {momentAudioUrls[index] ? (
                                <audio controls preload="none" src={momentAudioUrls[index]} style={{ width: '100%', height: 32 }} />
                              ) : (
                                <small style={{ color: '#7a808a', fontSize: '0.72rem' }}>Original audio preview unavailable</small>
                              )}
                            </div>
                            {selectedMomentId === index && (
                              <button
                                type="button"
                                className="studio-moment-cta-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedMomentId(index);
                                  setMomentWorkflowStep('customize');
                                }}
                                style={{
                                  marginTop: '0.6rem',
                                  width: '100%',
                                  padding: '0.45rem 0.6rem',
                                  borderRadius: '6px',
                                  backgroundColor: '#1f6f4a',
                                  color: '#ffffff',
                                  border: 'none',
                                  fontSize: '0.78rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '0.35rem',
                                }}
                              >
                                <span>Configure &amp; Render</span>
                                <ArrowRight size={13} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Step 1 Bottom Action Bar */}
                      <div
                        className="studio-moments-bottom-bar"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '0.75rem',
                          paddingTop: '1rem',
                          borderTop: '1px solid #ecece7',
                        }}
                      >
                        <div style={{ fontSize: '0.825rem', color: '#5b616b' }}>
                          {selectedMomentId != null ? (
                            <span>Selected: <strong style={{ color: '#16181d' }}>{selectedVideo.highlights.clips[selectedMomentId]?.title || `Moment ${selectedMomentId + 1}`}</strong></span>
                          ) : (
                            <span style={{ color: '#d97706' }}>Choose one moment above, then click Next</span>
                          )}
                        </div>

                        <button
                          type="button"
                          className="studio-moments-next-btn"
                          disabled={selectedMomentId == null}
                          onClick={() => setMomentWorkflowStep('customize')}
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
                          <span>Next: Audio &amp; Outro Settings</span>
                          <ArrowRight size={16} />
                        </button>
                      </div>
                    </div>
                  </section>
                )}


                {/* ════════ STEP 2: AUDIO, OUTRO, THUMBNAIL & BRANDING CUSTOMIZATION PAGE ════════ */}
                {hasAnalyzedMoments && !isAnalyzing && momentWorkflowStep === 'customize' && selectedMomentId != null && selectedVideo && (
                  <section
                    style={{
                      backgroundColor: '#ffffff',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
                      width: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      marginBottom: '1.75rem',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Page Header */}
                    <div style={{
                      padding: '1.25rem 1.5rem',
                      borderBottom: '1px solid #e2e8f0',
                      backgroundColor: '#fafaf9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '1rem',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => setMomentWorkflowStep('moments')}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            padding: '0.5rem 0.9rem',
                            borderRadius: '7px',
                            border: '1px solid #cbd5e1',
                            backgroundColor: '#ffffff',
                            color: '#334155',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; }}
                        >
                          <ArrowLeft size={16} />
                          <span>Back to Moments</span>
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <div style={{ width: 36, height: 36, borderRadius: '8px', backgroundColor: '#ecfdf5', color: '#1f6f4a', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #a7f3d0' }}>
                            <Music size={18} />
                          </div>
                          <div>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1f6f4a', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                              Step 2 · Background Audio &amp; Soundtrack
                            </div>
                            <h3 style={{ margin: '0.1rem 0 0', fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                              Customize 9:16 Vertical Short
                            </h3>
                            <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                              Moment: <strong style={{ color: '#0f172a' }}>{selectedVideo.highlights.clips[selectedMomentId]?.title || `Moment ${selectedMomentId + 1}`}</strong> ({Number(selectedVideo.highlights.clips[selectedMomentId]?.start_time).toFixed(1)}s – {Number(selectedVideo.highlights.clips[selectedMomentId]?.end_time).toFixed(1)}s · {selectedVideo.highlights.clips[selectedMomentId]?.duration}s)
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Page Content Body (4 Cards) */}
                    <div className="studio-customize-body" style={{
                      padding: '1.5rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1.5rem',
                      backgroundColor: '#ffffff',
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
                            <span style={{ fontSize: '0.78rem', color: '#5b616b' }}>Keep original audio, add background music with ducking, replace with custom audio, or mute completely</span>
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

                          <button
                            type="button"
                            onClick={() => setAudioMode('mute')}
                            style={{
                              padding: '0.5rem 0.85rem',
                              borderRadius: '6px',
                              border: audioMode === 'mute' ? '1.5px solid #1f6f4a' : '1px solid #e6e6e1',
                              background: audioMode === 'mute' ? '#f2faf5' : '#fff',
                              color: audioMode === 'mute' ? '#1f6f4a' : '#16181d',
                              fontWeight: audioMode === 'mute' ? 650 : 500,
                              fontSize: '0.825rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <VolumeX size={14} />
                            Mute Video Audio
                          </button>
                        </div>

                        {/* Info note when Mute is selected */}
                        {audioMode === 'mute' && (
                          <div style={{
                            background: '#fafaf8',
                            border: '1px solid #e6e6e1',
                            borderRadius: '8px',
                            padding: '0.85rem 1rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                          }}>
                            <div style={{
                              width: 32,
                              height: 32,
                              borderRadius: '6px',
                              backgroundColor: '#f1f5f9',
                              color: '#475569',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              <VolumeX size={16} />
                            </div>
                            <div>
                              <strong style={{ fontSize: '0.85rem', color: '#16181d', display: 'block' }}>Video Sound Muted</strong>
                              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                The rendered 9:16 short will be completely silent, perfect for adding trending sounds and music later on TikTok, Instagram Reels, or YouTube Shorts.
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Controls when Mix or Replace is selected */}
                        {(audioMode === 'mix' || audioMode === 'replace') && (
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

                      {/* Watermark, Branding, Outro & Thumbnail Notice */}
                      <div style={{
                        padding: '1rem 1.15rem',
                        backgroundColor: '#fbfbf9',
                        border: '1px dashed #d9dcd8',
                        borderRadius: '9px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        fontSize: '0.84rem',
                        color: '#5b616b'
                      }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#eef6f0', color: '#1f6f4a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Sparkles size={15} />
                        </div>
                        <span>
                          <strong>Clean &amp; Fast Initial Render:</strong> This short will render with speech, smart cropping &amp; background audio. Custom thumbnail, logo watermark, footer banner, and outro are configured on the <strong>Publish</strong> page.
                        </span>
                      </div>

                    </div>

                    {/* Page Bottom Sticky Action Bar */}
                    <div className="studio-customize-sticky-bar" style={{
                      position: 'sticky',
                      bottom: 0,
                      zIndex: 10,
                      padding: '1rem 1.5rem',
                      borderTop: '1px solid #e2e8f0',
                      backgroundColor: '#fafaf9',
                      boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.85rem',
                    }}>
                      <button
                        type="button"
                        onClick={() => setMomentWorkflowStep('moments')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          padding: '0.6rem 1.1rem',
                          borderRadius: '6px',
                          backgroundColor: '#ffffff',
                          color: '#475569',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <ArrowLeft size={16} />
                        <span>Back to Moments</span>
                      </button>

                      <div style={{ fontSize: '0.82rem', color: '#64748b', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <span>Soundtrack: <strong style={{ color: '#0f172a' }}>{audioMode === 'original' ? 'Original Audio' : audioMode === 'mute' ? 'Muted (Silent Video)' : audioMode === 'mix' ? `Mixed (${audioSourceType === 'upload' ? (customAudioName || 'Custom') : musicPreset})` : `Replaced (${audioSourceType === 'upload' ? (customAudioName || 'Custom') : musicPreset})`}</strong></span>
                        {outroMode === 'template' && (
                          <span>· Outro: <strong style={{ color: '#1f6f4a' }}>{templates.find((t) => t.id === selectedTemplateId)?.title || 'Template Selected'}</strong></span>
                        )}
                        {outroMode === 'custom' && (
                          <span>· Outro: <strong style={{ color: '#1f6f4a' }}>{outroDuration}s Screen</strong></span>
                        )}
                        {outroMode === 'none' && (
                          <span>· Outro: <strong style={{ color: '#64748b' }}>None</strong></span>
                        )}
                        <span>· Thumbnail: <strong style={{ color: modalThumbnailPath ? '#1f6f4a' : '#64748b' }}>{modalThumbnailPath ? 'Custom' : 'Auto-Frame'}</strong></span>
                        {(modalWatermarkPath || modalHeaderPath || modalFooterPath) && (
                          <span>· Branding: <strong style={{ color: '#1f6f4a' }}>Active</strong></span>
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
                          padding: '0.7rem 1.6rem',
                          borderRadius: '6px',
                          backgroundColor: (actionLoading || selectedMomentId == null || ((audioMode === 'mix' || audioMode === 'replace') && audioSourceType === 'upload' && !customAudioPath)) ? '#94a3b8' : '#1f6f4a',
                          color: '#ffffff',
                          border: 'none',
                          fontSize: '0.92rem',
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
                  </section>
                )}

                {hasAnalyzedMoments && !isAnalyzing && momentWorkflowStep === 'customize' && (selectedMomentId == null || !selectedVideo) && (
                  <section
                    style={{
                      backgroundColor: '#ffffff',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      padding: '3rem 1.5rem',
                      textAlign: 'center',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                      marginBottom: '1.5rem',
                    }}
                  >
                    <Music size={32} color="#1f6f4a" style={{ marginBottom: '0.75rem' }} />
                    <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: '#0f172a' }}>No Moment Selected</h3>
                    <p style={{ margin: '0 0 1.25rem', fontSize: '0.85rem', color: '#64748b' }}>Please select one of the 5 detected viral moments first.</p>
                    <button
                      type="button"
                      onClick={() => setMomentWorkflowStep('moments')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        padding: '0.65rem 1.25rem',
                        borderRadius: '6px',
                        backgroundColor: '#1f6f4a',
                        color: '#ffffff',
                        border: 'none',
                        fontSize: '0.88rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <ArrowLeft size={16} />
                      <span>Choose a Moment</span>
                    </button>
                  </section>
                )}

                {/* ── REAL-TIME ANALYSIS & GENERATION REPORT ── */}
                {isAnalyzing ? (
                  <div
                    className="studio-pipeline-card"
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
                    {(() => {
                      const isFinishedStage = pipelineStatus?.stage === 'done' ||
                        pipelineStatus?.is_done === true ||
                        pipelineStatus?.is_complete === true ||
                        (pipelineStatus?.stage_label && pipelineStatus.stage_label.toLowerCase().includes('success')) ||
                        getProgressPercentage() >= 100;

                      return (
                        <div className="studio-pipeline-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid #e6e6e1', paddingBottom: '1.25rem' }}>
                          <div className="studio-pipeline-brand" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div
                              className="studio-pipeline-icon-box"
                              style={{
                                width: 38,
                                height: 38,
                                borderRadius: '8px',
                                backgroundColor: isFinishedStage ? '#ecfdf5' : '#ecfdf5',
                                border: '1px solid #a7f3d0',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#1f6f4a',
                                flexShrink: 0,
                              }}
                            >
                              {isFinishedStage ? (
                                <CheckCircle2 size={20} color="#1f6f4a" />
                              ) : (
                                <Loader size={20} style={{ animation: 'spin 1.2s linear infinite' }} />
                              )}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#1f6f4a' }}>
                                  {isFinishedStage ? 'Pipeline Completed' : 'AI Pipeline Active'}
                                </span>
                                {!isFinishedStage && (
                                  <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#1f6f4a', animation: 'pulse 1.5s infinite', flexShrink: 0 }} />
                                )}
                              </div>
                              <h3
                                className="studio-pipeline-title"
                                style={{
                                  fontSize: '1.2rem',
                                  fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
                                  fontWeight: 700,
                                  margin: '0.2rem 0 0',
                                  color: '#16181d',
                                }}
                              >
                                {pipelineStatus?.stage_label || (isFinishedStage ? 'Generation completed successfully.' : 'Analyzing video and generating 9:16 vertical shorts…')}
                              </h3>
                              {selectedVideo && (
                                <div className="studio-pipeline-video-chip">
                                  <Film size={11} />
                                  <span>{selectedVideo.original_filename?.replace(/\.[^/.]+$/, '') || `Video #${selectedVideo.id}`}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="studio-pipeline-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div className="studio-pipeline-timer" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem', color: '#5b616b' }}>
                              <Clock size={16} />
                              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#16181d' }}>
                                {formatTimer(elapsedSeconds)}
                              </span>
                            </div>
                            {isFinishedStage ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                                  if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
                                  pollIntervalRef.current = null;
                                  timerIntervalRef.current = null;
                                  setIsAnalyzing(false);
                                  setActionLoading(false);
                                  setMomentWorkflowStep('clips');
                                  if (loadVideosRef.current) await loadVideosRef.current();
                                  if (loadClipsRef.current) await loadClipsRef.current();
                                }}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.4rem',
                                  padding: '0.5rem 0.95rem',
                                  borderRadius: '6px',
                                  backgroundColor: '#1f6f4a',
                                  color: '#ffffff',
                                  border: 'none',
                                  fontSize: '0.825rem',
                                  fontWeight: 650,
                                  cursor: 'pointer',
                                  boxShadow: '0 1px 3px rgba(31, 111, 74, 0.25)',
                                }}
                              >
                                <CheckCircle2 size={15} /> View Completed Video
                              </button>
                            ) : (
                              <button
                                onClick={handleCancelGeneration}
                                className="studio-pipeline-cancel-btn"
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
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Progress Bar */}
                    <div className="studio-pipeline-progress">
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
                    <div className="studio-pipeline-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                      {/* Step 1: Transcription */}
                      {(() => {
                        const isComplete = pipelineStatus?.transcription_status === 'completed' || pipelineStatus?.variations_ready > 0;
                        const isRunning = pipelineStatus?.stage === 'transcribing';
                        return (
                          <div
                            className={`studio-step-card ${isRunning ? 'active' : ''} ${isComplete ? 'completed' : ''}`}
                            style={{
                              padding: '1rem',
                              borderRadius: '8px',
                              backgroundColor: isRunning ? '#fafaf8' : '#ffffff',
                              border: isRunning ? '1px solid #16181d' : '1px solid #e6e6e1',
                            }}
                          >
                            <div className="studio-step-card-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                              <span className="studio-step-badge" style={{ fontSize: '0.725rem', fontWeight: 700, color: '#7a808a' }}>STEP 01</span>
                              <div className="studio-step-status-icon">
                                {isComplete ? (
                                  <CheckCircle2 size={16} color="#1f6f4a" />
                                ) : isRunning ? (
                                  <Loader size={16} color="#1f6f4a" style={{ animation: 'spin 1s linear infinite' }} />
                                ) : (
                                  <Clock size={15} color="#7a808a" />
                                )}
                              </div>
                            </div>
                            <div className="studio-step-card-body">
                              <h4 className="studio-step-title" style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', fontWeight: 650, color: '#16181d' }}>
                                Audio Transcription
                              </h4>
                              <p className="studio-step-desc" style={{ margin: 0, fontSize: '0.8rem', color: '#5b616b', lineHeight: 1.5 }}>
                                Whisper STT model converting spoken speech to timestamps
                              </p>
                            </div>
                            <div className="studio-step-mobile-pill">
                              {isComplete ? (
                                <span className="pill-done">✓ Done</span>
                              ) : isRunning ? (
                                <span className="pill-running">Active</span>
                              ) : (
                                <span className="pill-waiting">Queued</span>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Step 2: Highlight Detection */}
                      {(() => {
                        const isComplete = pipelineStatus?.highlight_status === 'completed' || pipelineStatus?.variations_ready > 0;
                        const isRunning = pipelineStatus?.stage === 'analyzing' || pipelineStatus?.stage === 'highlighting';
                        return (
                          <div
                            className={`studio-step-card ${isRunning ? 'active' : ''} ${isComplete ? 'completed' : ''}`}
                            style={{
                              padding: '1rem',
                              borderRadius: '8px',
                              backgroundColor: isRunning ? '#fafaf8' : '#ffffff',
                              border: isRunning ? '1px solid #16181d' : '1px solid #e6e6e1',
                            }}
                          >
                            <div className="studio-step-card-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                              <span className="studio-step-badge" style={{ fontSize: '0.725rem', fontWeight: 700, color: '#7a808a' }}>STEP 02</span>
                              <div className="studio-step-status-icon">
                                {isComplete ? (
                                  <CheckCircle2 size={16} color="#1f6f4a" />
                                ) : isRunning ? (
                                  <Loader size={16} color="#1f6f4a" style={{ animation: 'spin 1s linear infinite' }} />
                                ) : (
                                  <Clock size={15} color="#7a808a" />
                                )}
                              </div>
                            </div>
                            <div className="studio-step-card-body">
                              <h4 className="studio-step-title" style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', fontWeight: 650, color: '#16181d' }}>
                                Hook &amp; Highlight Detection
                              </h4>
                              <p className="studio-step-desc" style={{ margin: 0, fontSize: '0.8rem', color: '#5b616b', lineHeight: 1.5 }}>
                                Identifying conversational focal points and viral moments
                              </p>
                            </div>
                            <div className="studio-step-mobile-pill">
                              {isComplete ? (
                                <span className="pill-done">✓ Done</span>
                              ) : isRunning ? (
                                <span className="pill-running">Active</span>
                              ) : (
                                <span className="pill-waiting">Queued</span>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Step 3: 9:16 Reframe */}
                      {(() => {
                        const isComplete = pipelineStatus?.crop_status === 'completed' || pipelineStatus?.variations_ready > 0;
                        const isRunning = pipelineStatus?.stage === 'cropping';
                        return (
                          <div
                            className={`studio-step-card ${isRunning ? 'active' : ''} ${isComplete ? 'completed' : ''}`}
                            style={{
                              padding: '1rem',
                              borderRadius: '8px',
                              backgroundColor: isRunning ? '#fafaf8' : '#ffffff',
                              border: isRunning ? '1px solid #16181d' : '1px solid #e6e6e1',
                            }}
                          >
                            <div className="studio-step-card-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                              <span className="studio-step-badge" style={{ fontSize: '0.725rem', fontWeight: 700, color: '#7a808a' }}>STEP 03</span>
                              <div className="studio-step-status-icon">
                                {isComplete ? (
                                  <CheckCircle2 size={16} color="#1f6f4a" />
                                ) : isRunning ? (
                                  <Loader size={16} color="#1f6f4a" style={{ animation: 'spin 1s linear infinite' }} />
                                ) : (
                                  <Clock size={15} color="#7a808a" />
                                )}
                              </div>
                            </div>
                            <div className="studio-step-card-body">
                              <h4 className="studio-step-title" style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', fontWeight: 650, color: '#16181d' }}>
                                Speaker Tracking &amp; Reframe
                              </h4>
                              <p className="studio-step-desc" style={{ margin: 0, fontSize: '0.8rem', color: '#5b616b', lineHeight: 1.5 }}>
                                Centering active speakers dynamically for vertical screens
                              </p>
                            </div>
                            <div className="studio-step-mobile-pill">
                              {isComplete ? (
                                <span className="pill-done">✓ Done</span>
                              ) : isRunning ? (
                                <span className="pill-running">Active</span>
                              ) : (
                                <span className="pill-waiting">Queued</span>
                              )}
                            </div>
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
                            className={`studio-step-card ${isRunning ? 'active' : ''} ${isComplete ? 'completed' : ''}`}
                            style={{
                              padding: '1rem',
                              borderRadius: '8px',
                              backgroundColor: isRunning ? '#fafaf8' : '#ffffff',
                              border: isRunning ? '1px solid #16181d' : '1px solid #e6e6e1',
                            }}
                          >
                            <div className="studio-step-card-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                              <span className="studio-step-badge" style={{ fontSize: '0.725rem', fontWeight: 700, color: '#7a808a' }}>STEP 04</span>
                              <div className="studio-step-status-icon">
                                {isComplete ? (
                                  <CheckCircle2 size={16} color="#1f6f4a" />
                                ) : isRunning ? (
                                  <Loader size={16} color="#1f6f4a" style={{ animation: 'spin 1s linear infinite' }} />
                                ) : (
                                  <Clock size={15} color="#7a808a" />
                                )}
                              </div>
                            </div>
                            <div className="studio-step-card-body">
                              <h4 className="studio-step-title" style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', fontWeight: 650, color: '#16181d' }}>
                                Selected Moment Render <span className="studio-desktop-only">({readyCount > 0 ? 'ready' : 'waiting'})</span>
                              </h4>
                              <p className="studio-step-desc" style={{ margin: 0, fontSize: '0.8rem', color: '#5b616b', lineHeight: 1.5 }}>
                                Rendering one selected time range with the original source audio
                              </p>
                            </div>
                            <div className="studio-step-mobile-pill">
                              {isComplete ? (
                                <span className="pill-done">✓ Done</span>
                              ) : isRunning ? (
                                <span className="pill-running">Active</span>
                              ) : (
                                <span className="pill-waiting">Queued</span>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ) : null}

                {/* ── Main Content: Clips Showcase & Player ── */}
                {(hasAnalyzedMoments || visibleClips.length > 0) && !isAnalyzing && momentWorkflowStep !== 'customize' && visibleClips.length > 0 && (
                  <div
                    className="studio-output-grid"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isFullVideoClip(visibleSelectedClip)
                        ? 'minmax(0, 1fr) minmax(420px, 1.4fr)'
                        : 'minmax(0, 1.35fr) minmax(300px, 360px)',
                      gap: '1.5rem',
                      alignItems: 'start',
                      scrollMarginTop: '1rem',
                    }}
                  >
                    {/* Generated Clips Grid */}
                    <div
                      className="studio-clips-card"
                      style={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e6e6e1',
                        borderRadius: '10px',
                        padding: '1.25rem 1.5rem',
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
                          {visibleClips.some(isFullVideoClip) ? `Full Videos (${visibleClips.length})` : `Generated Clips (${visibleClips.length})`}
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
                          <p style={{ margin: 0, fontWeight: 600, color: '#16181d' }}>No clips generated yet.</p>
                          <p style={{ fontSize: '0.825rem', color: '#5b616b', marginTop: '0.35rem' }}>
                            Choose Viral Shorts or Caption Full Video mode above to start.
                          </p>
                        </div>
                      ) : (
                        <div className="studio-clips-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.85rem' }}>
                          {visibleClips.map((clip) => {
                            const isSelected = visibleSelectedClip?.id === clip.id;
                            const isFullVideo = isFullVideoClip(clip);
                            return (
                              <div
                                key={clip.id}
                                onClick={() => setSelectedClip(clip)}
                                className={`studio-clip-item ${isSelected ? 'selected' : ''}`}
                                style={{
                                  backgroundColor: isSelected ? '#f0fdf4' : '#ffffff',
                                  border: isSelected ? '1.5px solid #1f6f4a' : '1px solid #e6e6e1',
                                  borderRadius: '8px',
                                  padding: '0.85rem 1rem',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.55rem',
                                  transition: 'all 0.15s ease',
                                  position: 'relative',
                                  boxShadow: isSelected ? '0 2px 8px rgba(31, 111, 74, 0.10)' : 'none',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
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
                                      {clip.file_exists === false ? 'File Missing' : (isFullVideo ? 'Full Video (16:9)' : `${clip.viral_score || 95}/100 Score`)}
                                    </span>
                                    {isSelected && (
                                      <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#1f6f4a', background: '#ecfdf5', padding: '1px 5px', borderRadius: '4px', border: '1px solid #a7f3d0' }}>
                                        ACTIVE
                                      </span>
                                    )}
                                  </div>
                                  <span style={{ fontSize: '0.75rem', color: '#5b616b' }}>
                                    {Math.round(clip.duration || 30)}s
                                  </span>
                                </div>

                                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#16181d', minHeight: '38px', lineHeight: 1.4 }}>
                                  {clip.title || `Clip #${clip.id}`}
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#5b616b' }}>
                                  <span>Status: {clip.status || 'ready'}</span>
                                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                    <Play size={14} color="#16181d" />
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setConfirmDialog({ type: 'clip', id: clip.id, label: clip.title || `Clip #${clip.id}` });
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

                    {/* Right: Vertical / Widescreen Player & Publisher */}
                    <div
                      className="studio-preview-card"
                      style={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e6e6e1',
                        borderRadius: '10px',
                        padding: '1.25rem 1.5rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1rem',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
                        <h3
                          style={{
                            fontSize: '1.15rem',
                            fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
                            fontWeight: 700,
                            margin: 0,
                            color: '#16181d',
                          }}
                        >
                          {isFullVideoClip(visibleSelectedClip) ? 'Full Video Player & Preview (16:9)' : '9:16 Short Preview'}
                        </h3>
                        {visibleSelectedClip && (
                          <span style={{ fontSize: '0.75rem', color: '#1f6f4a', fontWeight: 650, background: '#ecfdf5', padding: '2px 8px', borderRadius: '4px', border: '1px solid #a7f3d0' }}>
                            {isFullVideoClip(visibleSelectedClip)
                              ? `${Math.round(visibleSelectedClip.duration || 0)}s Full Video`
                              : `${Math.round(visibleSelectedClip.duration || 30)}s Short`}
                          </span>
                        )}
                      </div>

                      {visibleSelectedClip?.status === 'completed' && visibleSelectedClip.storage_path ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          <div
                            className="studio-preview-video-box"
                            style={{
                              width: '100%',
                              aspectRatio: isFullVideoClip(visibleSelectedClip) ? '16 / 9' : '9 / 16',
                              maxHeight: isFullVideoClip(visibleSelectedClip) ? '540px' : '420px',
                              backgroundColor: '#090a0f',
                              borderRadius: '10px',
                              overflow: 'hidden',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
                            }}
                          >
                            {clipMediaClipId === visibleSelectedClip.id && clipMediaUrl ? (
                              <video
                                key={visibleSelectedClip.storage_path}
                                src={clipMediaUrl}
                                controls
                                playsInline
                                onError={() => setClipPlaybackError(true)}
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                              />
                            ) : (
                              <div style={{ color: '#94a3b8', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                <Loader size={16} className="render-loading-spinner" /> Loading video preview…
                              </div>
                            )}
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
                            download={(visibleSelectedClip.title || `clip-${visibleSelectedClip.id}`).replace(/\.[^/.]+$/, '') + '.mp4'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="studio-preview-download-btn"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.45rem',
                              padding: '0.75rem',
                              borderRadius: '8px',
                              backgroundColor: '#1f6f4a',
                              color: '#ffffff',
                              textDecoration: 'none',
                              fontSize: '0.9rem',
                              fontWeight: 700,
                              transition: 'background-color 0.15s ease',
                              boxShadow: '0 2px 6px rgba(31, 111, 74, 0.22)',
                            }}
                          >
                            <Download size={16} /> {isFullVideoClip(visibleSelectedClip) ? 'Download Full Video (16:9)' : 'Download 9:16 Video'}
                          </a>

                          {/* Open the dedicated publishing workspace */}
                          <div style={{ borderTop: '1px solid #e6e6e1', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748b' }}>
                              Share your video
                            </div>
                            <button
                              type="button"
                              onClick={openPublishPage}
                              disabled={!visibleSelectedClip}
                              className="studio-preview-publish-btn"
                              style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.45rem',
                                padding: '0.75rem',
                                borderRadius: '8px',
                                backgroundColor: '#ffffff',
                                color: '#1f6f4a',
                                border: '1.5px solid #1f6f4a',
                                fontSize: '0.9rem',
                                fontWeight: 700,
                                cursor: visibleSelectedClip ? 'pointer' : 'not-allowed',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              <ExternalLink size={15} />
                              Publish to Social Media
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
          ) : isInitialLoadingProjects ? (
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
                  width: 56,
                  height: 56,
                  borderRadius: '12px',
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#1f6f4a',
                  marginBottom: '1rem',
                }}
              >
                <Loader size={26} className="render-loading-spinner" />
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#16181d', margin: '0 0 0.35rem' }}>
                Loading your studio…
              </h3>
              <p style={{ maxWidth: '400px', fontSize: '0.85rem', margin: 0, color: '#64748b', lineHeight: 1.5 }}>
                Syncing your projects and footage from the cloud…
              </p>
            </div>
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
              className="studio-main-empty-container"
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
                className="studio-input-mode-toggle"
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
                  className={`studio-input-mode-btn ${videoInputMode === 'upload' ? 'active' : ''}`}
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
                  Upload File
                </button>
                <button
                  type="button"
                  className={`studio-input-mode-btn ${videoInputMode === 'link' ? 'active' : ''}`}
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
                  Import from Link
                </button>
              </div>

              {videoInputMode === 'upload' ? (
                <div
                  className="studio-upload-card"
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
                    width: 'min(100%, 580px)',
                    boxSizing: 'border-box',
                    padding: '2.75rem 2rem',
                    borderRadius: '16px',
                    border: '2px dashed #bbf7d0',
                    backgroundColor: '#ffffff',
                    cursor: isUploading ? 'wait' : 'pointer',
                    boxShadow: '0 4px 20px rgba(22, 24, 29, 0.04)',
                  }}
                >
                  <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: '12px',
                    backgroundColor: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#1f6f4a',
                    margin: '0 auto 0.85rem',
                  }}>
                    <UploadCloud size={24} />
                  </div>
                  <h3 style={{ margin: '0 0 0.35rem', fontSize: '1.3rem', fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif', color: '#16181d', fontWeight: 700 }}>
                    {isUploading ? `Uploading video${uploadProgress ? ` · ${uploadProgress}%` : '…'}` : videos.length ? 'Upload another video' : 'Upload your first video'}
                  </h3>
                  <p style={{ maxWidth: '420px', margin: '0 auto 1.25rem', fontSize: '0.875rem', lineHeight: 1.55, color: '#64748b' }}>
                    {videos.length
                      ? 'Add a source video to this project to detect moments and generate shorts.'
                      : 'Choose a source video for this project to detect moments and create viral 9:16 shorts.'}
                  </p>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.65rem 1.15rem', borderRadius: '8px', background: isUploading ? '#7a808a' : '#1f6f4a', color: '#fff', fontSize: '0.875rem', fontWeight: 650, boxShadow: '0 2px 6px rgba(31, 111, 74, 0.2)' }}>
                    {isUploading ? <Loader size={16} /> : <UploadCloud size={16} />}
                    {isUploading ? `Uploading ${uploadProgress}%…` : 'Choose Video File'}
                  </span>
                  <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#94a3b8' }}>MP4, MOV, MKV, or WebM</div>
                  {uploadError && <div style={{ marginTop: '0.85rem', color: '#b91c1c', fontSize: '0.85rem' }}>{uploadError}</div>}
                </div>
              ) : (
                <div
                  className="studio-upload-card"
                  style={{
                    width: 'min(100%, 580px)',
                    boxSizing: 'border-box',
                    padding: '2.25rem 2rem',
                    borderRadius: '16px',
                    border: '1px solid #e5e8e1',
                    backgroundColor: '#ffffff',
                    boxShadow: '0 4px 20px rgba(22, 24, 29, 0.04)',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: '10px',
                        backgroundColor: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#1f6f4a',
                        flexShrink: 0,
                      }}
                    >
                      <Link2 size={19} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.25rem', fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif', color: '#16181d', fontWeight: 700 }}>
                        Import from Video Link
                      </h3>
                      <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                        Paste any public video link to import and generate shorts.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleImportUrl} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '1.1rem' }}>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="url"
                        value={videoUrl}
                        onChange={(e) => {
                          setVideoUrl(e.target.value);
                          if (importUrlError) setImportUrlError('');
                        }}
                        placeholder="Paste YouTube, Reels or TikTok URL..."
                        disabled={isImportingUrl || isUploading}
                        required
                        style={{
                          width: '100%',
                          padding: '0.75rem 0.85rem 0.75rem 2.4rem',
                          borderRadius: '8px',
                          border: '1.5px solid #d7d7d1',
                          fontSize: '0.875rem',
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
                        size={16}
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

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.73rem', color: '#7a808a', marginRight: '0.2rem' }}>Supported:</span>
                      {['YouTube', 'Instagram Reels', 'TikTok', 'X / Twitter'].map((platform) => (
                        <span
                          key={platform}
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            padding: '2px 7px',
                            borderRadius: '6px',
                            backgroundColor: '#f1f2ed',
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
                        marginTop: '0.35rem',
                        padding: '0.8rem 1.25rem',
                        borderRadius: '8px',
                        backgroundColor: isImportingUrl ? '#1f6f4a' : (!videoUrl.trim() || !activeProjectId ? '#e2e8f0' : '#1f6f4a'),
                        color: isImportingUrl || (videoUrl.trim() && activeProjectId) ? '#ffffff' : '#94a3b8',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        fontSize: '0.875rem',
                        fontWeight: 650,
                        cursor: isImportingUrl || !videoUrl.trim() || !activeProjectId ? 'not-allowed' : 'pointer',
                        boxShadow: videoUrl.trim() && activeProjectId ? '0 2px 6px rgba(31, 111, 74, 0.25)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {isImportingUrl ? (
                        <>
                          <Loader size={17} style={{ animation: 'spin 1s linear infinite' }} />
                          <span>Downloading Video from Link…</span>
                        </>
                      ) : (
                        <>
                          <Link2 size={17} />
                          <span>Import &amp; Set Up Video</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>
              )}

              {videos.length > 0 && (
                <div style={{ marginTop: '1.25rem', fontSize: '0.85rem', color: '#64748b' }}>
                  <span className="studio-desktop-hint">Or choose an existing video from the left sidebar.</span>
                  <span className="studio-mobile-hint">
                    Or select from your{' '}
                    <button
                      type="button"
                      onClick={() => setMobileTab('footage')}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        color: '#1f6f4a',
                        fontWeight: 700,
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        fontSize: 'inherit',
                      }}
                    >
                      Footage ({videos.length})
                    </button>
                  </span>
                </div>
              )}
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
            <div className="template-modal-body" style={{
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
              <div className="template-modal-sidebar" style={{
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
          className="studio-action-toast"
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#16181d',
            color: '#fafaf8',
            padding: '0.65rem 1.25rem',
            borderRadius: '8px',
            fontSize: '0.825rem',
            fontWeight: 500,
            boxShadow: '0 4px 24px rgba(0,0,0,0.22)',
            zIndex: 9998,
            pointerEvents: 'none',
            maxWidth: 'calc(100vw - 2rem)',
            textAlign: 'center',
            boxSizing: 'border-box',
          }}
        >
          {actionMessage}
        </div>
      )}

      {/* ── In-Web Notification: Download Video Tip (All Devices) ── */}
      {showDownloadTipNotification && (
        <div
          className="studio-in-web-notification"
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: '1.15rem',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            width: 'calc(100% - 2rem)',
            maxWidth: '430px',
            backgroundColor: '#ffffff',
            border: '1.5px solid #a7f3d0',
            borderRadius: '12px',
            padding: '0.75rem 0.9rem',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(31, 111, 74, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.65rem',
            animation: 'fadeInDown 0.25s ease-out',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0, flex: 1 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '8px',
                backgroundColor: '#ecfdf5',
                border: '1px solid #a7f3d0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#1f6f4a',
                flexShrink: 0,
              }}
            >
              <Download size={17} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.825rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.25 }}>
                Download Source Video
              </div>
              <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '2px', lineHeight: 1.35 }}>
                Click the <strong>3 dots (⋮)</strong> on the player controls to download.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
            {sourceVideoUrl && (
              <a
                href={sourceVideoUrl}
                download={(selectedVideo?.original_filename || 'source-video').replace(/\.[^/.]+$/, '') + '.mp4'}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '0.35rem 0.65rem',
                  backgroundColor: '#1f6f4a',
                  color: '#ffffff',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  whiteSpace: 'nowrap',
                }}
              >
                <Download size={12} /> Save
              </a>
            )}
            <button
              type="button"
              onClick={() => setShowDownloadTipNotification(false)}
              aria-label="Dismiss notification"
              style={{
                border: 'none',
                background: 'transparent',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '0.35rem',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
