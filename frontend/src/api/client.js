import axios from 'axios';

const SERVER_URL = (import.meta.env.VITE_SERVER_URL || '').replace(/\/$/, '');
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || (SERVER_URL ? `${SERVER_URL}/api/v1` : '/api/v1');

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Automatically attach Bearer token if present in localStorage
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('harvest_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => Promise.reject(error));

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('harvest_token');
      localStorage.removeItem('harvest_user');
      window.dispatchEvent(new CustomEvent('harvest:unauthorized'));
    }
    return Promise.reject(error);
  }
);

export async function authFetch(url, options = {}) {
  const token = localStorage.getItem('harvest_token');
  const headers = { ...(options.headers || {}) };
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
  const response = await fetch(fullUrl, {
    ...options,
    headers
  });
  if (response.status === 401) {
    localStorage.removeItem('harvest_token');
    localStorage.removeItem('harvest_user');
    window.dispatchEvent(new CustomEvent('harvest:unauthorized'));
  }
  return response;
}

export const api = {
  // Auth methods
  login: async (email, password) => {
    const response = await client.post('/users/login', { email, password });
    if (response.data?.access_token) {
      localStorage.setItem('harvest_token', response.data.access_token);
      if (response.data.user) {
        localStorage.setItem('harvest_user', JSON.stringify(response.data.user));
      }
    }
    return response.data;
  },

  register: async (email, password, fullName) => {
    const response = await client.post('/users/register', {
      email,
      password,
      full_name: fullName
    });
    if (response.data?.access_token) {
      localStorage.setItem('harvest_token', response.data.access_token);
      if (response.data.user) {
        localStorage.setItem('harvest_user', JSON.stringify(response.data.user));
      }
    }
    return response.data;
  },

  logout: () => {
    localStorage.removeItem('harvest_token');
    localStorage.removeItem('harvest_user');
    window.dispatchEvent(new CustomEvent('harvest:unauthorized'));
  },

  getCurrentUser: async () => {
    const response = await client.get('/users/me');
    return response.data;
  },

  // Get all projects
  getProjects: async () => {
    const response = await client.get('/projects/');
    return response.data || [];
  },

  // Create a new project (supports both ({ title, name, description }) and (title, description))
  createProject: async (titleOrData, maybeDescription) => {
    const isObj = typeof titleOrData === 'object' && titleOrData !== null;
    const title = (isObj ? (titleOrData.title || titleOrData.name || '') : (titleOrData || '')).toString().trim();
    const description = isObj ? titleOrData.description : maybeDescription;

    const response = await client.post('/projects/', {
      title,
      description: description || undefined
    });
    return response.data;
  },

  // Get all videos
  getVideos: async (projectId = null) => {
    const url = projectId ? `/videos/?project_id=${projectId}` : '/videos/';
    const response = await client.get(url);
    return response.data || [];
  },

  // Get a single video by ID
  getVideo: async (videoId) => {
    const response = await client.get(`/videos/${videoId}`);
    return response.data;
  },

  renameVideo: async (videoId, name) => {
    const body = new FormData();
    body.append('name', name);
    const response = await client.patch(`/videos/${videoId}/name`, body);
    return response.data;
  },

  getClipMedia: async (clipId) => {
    const response = await authFetch(`/videos/clip-media/${clipId}`);
    if (!response.ok) throw new Error(`Unable to load clip (${response.status})`);
    return URL.createObjectURL(await response.blob());
  },

  getVideoMedia: async (videoId) => {
    const metadata = await client.get(`/videos/${videoId}/media-url`);
    if (metadata.data?.direct && metadata.data.url) {
      return { url: metadata.data.url, objectUrl: false };
    }
    const response = await authFetch(`/videos/${videoId}/media`);
    if (!response.ok) throw new Error(`Unable to load source video (${response.status})`);
    return { url: URL.createObjectURL(await response.blob()), objectUrl: true };
  },

  // Upload a video
  uploadVideo: async (projectId, file, onUploadProgress) => {
    const formData = new FormData();
    formData.append('project_id', projectId);
    formData.append('file', file);

    const response = await client.post('/videos/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress
    });
    return response.data;
  },

  // Import and process a video directly from a URL (YouTube, Instagram, Facebook, TikTok, etc.)
  importVideoUrl: async (projectId, url, autoAnalyze = false, length = 30.0) => {
    const response = await client.post('/videos/import-url', {
      project_id: projectId,
      url,
      auto_analyze: autoAnalyze,
      length,
    });
    return response.data;
  },

  // Trigger 1-Click Master Generation (full AI pipeline: transcribe -> hooks -> crop -> render variations)
  masterGenerate: async (videoId, config = {}) => {
    const payload = {
      length: config.length || 60.0,
      platform: config.platform || 'youtube',
      optional_prompt: config.optional_prompt || '',
      audio_theme: config.audio_theme || 'auto',
      translate_language: config.translate_language || 'none',
      dub_voice: config.dub_voice || false,
      caption_language: config.caption_language || 'translated',
      dub_mix_mode: config.dub_mix_mode || 'replace',
      speaker_gender: config.speaker_gender || 'female',
      framing_mode: config.framing_mode || 'fit_blur',
      caption_style: config.caption_style || 'pop',
    };
    const response = await client.post(`/videos/${videoId}/master-generate`, payload);
    return response.data;
  },

  extractHighlights: async (videoId, length = 30) => {
    const response = await client.post(`/videos/${videoId}/extract-highlights`, { length });
    return response.data;
  },

  // Upload custom audio file (MP3, WAV, M4A, etc.) for mixing or replacing
  uploadAudio: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await client.post('/videos/upload-audio', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Upload custom thumbnail before clip creation
  uploadThumbnail: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await client.post('/videos/upload-thumbnail', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Upload branding asset (watermark logo, header banner, footer banner) before clip creation
  uploadBrandingImageGeneral: async (file, assetType = 'watermark') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('asset_type', assetType);
    const response = await client.post('/videos/upload-branding-image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  selectMoment: async (videoId, momentId, captionStyle, options = {}) => {
    const response = await client.post(`/videos/${videoId}/select-moment`, {
      moment_id: momentId,
      caption_style: captionStyle,
      translate_language: options.translateLanguage || 'none',
      caption_language: options.captionLanguage || 'original',
      dub_voice: Boolean(options.dubVoice),
      speaker_gender: options.speakerGender || 'female',
      audio_mode: options.audioMode || 'original',
      custom_audio_path: options.customAudioPath || null,
      music_preset: options.musicPreset || 'none',
      music_volume: typeof options.musicVolume === 'number' ? options.musicVolume : 0.18,
      cta_template: options.ctaTemplate || 'none',
      cta_text: options.ctaText || '',
      cta_placement: options.ctaPlacement || 'outro',
      enable_outro: Boolean(options.enableOutro),
      outro_like_text: options.outroLikeText ?? 'Like',
      outro_comment_text: options.outroCommentText ?? 'Comment',
      outro_subscribe_text: options.outroSubscribeText ?? 'Subscribe',
      outro_follow_text: options.outroFollowText ?? '',
      outro_custom_text: options.outroCustomText ?? '',
      outro_duration: typeof options.outroDuration === 'number' ? options.outroDuration : 3.0,
      outro_music_style: options.outroMusicStyle || 'upbeat',
      template_id: options.templateId || null,
      template_storage_path: options.templateStoragePath || null,
      watermark_path: options.watermarkPath || null,
      watermark_position: options.watermarkPosition || 'header',
      watermark_scale: typeof options.watermarkScale === 'number' ? options.watermarkScale : 0.20,
      watermark_opacity: typeof options.watermarkOpacity === 'number' ? options.watermarkOpacity : 0.90,
      watermark_mode: options.watermarkMode || 'interval_2s',
      header_image_path: options.headerImagePath || null,
      header_height: typeof options.headerHeight === 'number' ? options.headerHeight : 160,
      footer_image_path: options.footerImagePath || null,
      footer_height: typeof options.footerHeight === 'number' ? options.footerHeight : 180,
      thumbnail_path: options.thumbnailPath || null,
    });
    return response.data;
  },

  // Cloudflare R2 Video Templates
  getTemplates: async () => {
    const response = await client.get('/templates/');
    return response.data || [];
  },

  getTemplate: async (templateId) => {
    const response = await client.get(`/templates/${templateId}`);
    return response.data;
  },

  syncTemplates: async (force = false) => {
    const response = await client.post('/templates/sync', null, { params: { force } });
    return response.data;
  },

  rerenderCaption: async (clipId, captionStyle) => {
    const response = await client.patch(`/videos/clips/${clipId}/caption`, {
      caption_style: captionStyle,
    });
    return response.data;
  },

  getMomentAudio: async (videoId, momentId) => {
    const response = await authFetch(`/videos/${videoId}/moments/${momentId}/audio`);
    if (!response.ok) throw new Error(`Unable to load moment preview (${response.status})`);
    return URL.createObjectURL(await response.blob());
  },

  getMusicPresetAudio: async (preset) => {
    const response = await authFetch(`/videos/music-presets/${encodeURIComponent(preset)}/audio`);
    if (!response.ok) throw new Error(`Unable to load music preset preview (${response.status})`);
    return URL.createObjectURL(await response.blob());
  },

  // Transcribe audio
  transcribeVideo: async (videoId) => {
    const response = await client.post(`/videos/${videoId}/transcribe`);
    return response.data;
  },

  // Detect viral highlights / hooks
  detectHighlights: async (videoId) => {
    const response = await client.post(`/videos/${videoId}/detect-highlights`);
    return response.data;
  },

  // Smart crop to 9:16 vertical orientation
  smartCrop: async (videoId, config = {}) => {
    const response = await client.post(`/videos/${videoId}/smart-crop`, config);
    return response.data;
  },

  // Get all clips for a video
  getClips: async (videoId) => {
    const response = await client.get(`/videos/${videoId}/clips`);
    return response.data || [];
  },

  // Get master variations
  getVariations: async (videoId) => {
    const response = await client.get(`/videos/${videoId}/variations`);
    return response.data || [];
  },

  // Delete a project
  deleteProject: async (projectId) => {
    const response = await client.delete(`/projects/${projectId}`);
    return response.data;
  },

  // Delete a video (and all its clips/media)
  deleteVideo: async (videoId) => {
    const response = await client.delete(`/videos/${videoId}`);
    return response.data;
  },

  // Delete a single generated clip / variation
  deleteClip: async (clipId) => {
    const response = await client.delete(`/videos/clips/${clipId}`);
    return response.data;
  },

  // Publish a clip/variation to social media (YouTube, Facebook, Instagram)
  publishClip: async (clipId, platforms, title, description, privacy, platformConfigs = null) => {
    const response = await client.post(`/videos/clips/${clipId}/publish`, {
      platforms,
      title,
      description,
      privacy,
      platform_configs: platformConfigs
    });
    return response.data;
  },

  // Get social connections for a user
  getUserConnections: async (userId = null) => {
    let targetUserId = userId;
    if (!targetUserId) {
      try {
        const storedUser = JSON.parse(localStorage.getItem('harvest_user') || '{}');
        targetUserId = storedUser?.id || 1;
      } catch {
        targetUserId = 1;
      }
    }
    const response = await client.get(`/users/${targetUserId}/connections`);
    return response.data;
  },

  // Build the backend OAuth URL for a social account connection.
  getSocialLoginUrl: (platform, userId) => {
    const baseUrl = API_BASE_URL.startsWith('http')
      ? API_BASE_URL
      : `${window.location.origin}${API_BASE_URL.startsWith('/') ? '' : '/'}${API_BASE_URL}`;
    return `${baseUrl}/users/auth/${encodeURIComponent(platform)}/login?user_id=${encodeURIComponent(userId)}`;
  },
  getGoogleLoginUrl: () => {
    const baseUrl = API_BASE_URL.startsWith('http')
      ? API_BASE_URL
      : `${window.location.origin}${API_BASE_URL.startsWith('/') ? '' : '/'}${API_BASE_URL}`;
    return `${baseUrl}/users/auth/google/login`;
  },
  getSocialOAuthOrigin: () => {
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return window.location.protocol === 'https:' ? 'https://localhost:8000' : 'http://localhost:8000';
    }
    const baseUrl = API_BASE_URL.startsWith('http')
      ? API_BASE_URL
      : (SERVER_URL || window.location.origin);
    try {
      return new URL(baseUrl).origin;
    } catch {
      return window.location.origin;
    }
  },
  isAllowedOAuthOrigin: (origin) => {
    if (!origin) return false;
    const allowed = new Set([
      window.location.origin,
      'https://localhost:8000',
      'http://localhost:8000',
      'https://127.0.0.1:8000',
      'http://127.0.0.1:8000',
      'https://localhost:5173',
      'http://localhost:5173',
      'https://harvest-ai-soql.onrender.com'
    ]);
    if (SERVER_URL) {
      try { allowed.add(new URL(SERVER_URL).origin); } catch {}
    }
    if (API_BASE_URL.startsWith('http')) {
      try { allowed.add(new URL(API_BASE_URL).origin); } catch {}
    }
    return allowed.has(origin);
  },

  // Get details of a single clip
  getClip: async (clipId) => {
    const response = await client.get(`/videos/clips/${clipId}`);
    return response.data;
  },

  // Publish clip to social media platforms
  publishClip: async (clipId, platforms, title, description, privacy = 'public', platformConfigs = {}, thumbnailPath = null, brandingConfig = null) => {
    const response = await client.post(`/videos/clips/${clipId}/publish`, {
      platforms,
      title,
      description,
      privacy,
      platform_configs: platformConfigs,
      thumbnail_path: thumbnailPath,
      branding_config: brandingConfig,
    });
    return response.data;
  },

  // Upload custom thumbnail for a clip
  uploadClipThumbnail: async (clipId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await client.post(`/videos/clips/${clipId}/thumbnail`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Upload branding image (watermark logo, header banner, or footer banner)
  uploadBrandingImage: async (clipId, file, assetType = 'watermark') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('asset_type', assetType);
    const response = await client.post(`/videos/clips/${clipId}/branding-image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Apply and burn branding (watermark, header, footer) into video
  applyClipBranding: async (clipId, brandingConfig) => {
    const response = await client.post(`/videos/clips/${clipId}/apply-branding`, brandingConfig);
    return response.data;
  },

  // Get custom thumbnail blob URL
  getClipThumbnailMedia: async (clipId) => {
    const response = await authFetch(`/videos/clips/${clipId}/thumbnail-media`);
    if (!response.ok) throw new Error(`Unable to load thumbnail (${response.status})`);
    return URL.createObjectURL(await response.blob());
  },


  // Create or update a social connection
  saveUserConnection: async (userId = null, connectionData) => {
    let targetUserId = userId;
    if (!targetUserId) {
      try {
        const storedUser = JSON.parse(localStorage.getItem('harvest_user') || '{}');
        targetUserId = storedUser?.id || 1;
      } catch {
        targetUserId = 1;
      }
    }
    const response = await client.post(`/users/${targetUserId}/connections`, connectionData);
    return response.data;
  },

  // Delete/disconnect a social connection
  deleteUserConnection: async (userId = null, platform) => {
    let targetUserId = userId;
    if (!targetUserId) {
      try {
        const storedUser = JSON.parse(localStorage.getItem('harvest_user') || '{}');
        targetUserId = storedUser?.id || 1;
      } catch {
        targetUserId = 1;
      }
    }
    const response = await client.delete(`/users/${targetUserId}/connections/${platform}`);
    return response.data;
  },

  // Get video processing & rendering status
  getVideoStatus: async (videoId) => {
    const response = await client.get(`/videos/${videoId}/status`);
    return response.data;
  },

  // Cancel active video generation
  cancelGeneration: async (videoId) => {
    const response = await client.post(`/videos/${videoId}/cancel-generation`);
    return response.data;
  },

  // Cancel all active video generation tasks across the system
  cancelAllGenerations: async () => {
    const response = await client.post('/videos/cancel-all');
    return response.data;
  }
};
