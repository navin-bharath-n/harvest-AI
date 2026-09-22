import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://localhost:8000/api/v1';

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
  },

  getCurrentUser: async () => {
    const response = await client.get('/users/me');
    return response.data;
  },

  // Get all projects
  getProjects: async () => {
    const response = await client.get('/projects/');
    return response.data;
  },

  // Create a new project
  createProject: async (title, description) => {
    let ownerId = 1;
    try {
      const storedUser = JSON.parse(localStorage.getItem('harvest_user') || '{}');
      if (storedUser?.id) {
        ownerId = storedUser.id;
      }
    } catch {
      // fallback to 1
    }

    const response = await client.post('/projects/', {
      title,
      description,
      owner_id: ownerId
    });
    return response.data;
  },

  // Get all videos
  getVideos: async () => {
    try {
      const response = await client.get('/videos/');
      return response.data;
    } catch (e) {
      console.warn("Failed to fetch videos, using mock data", e);
      return [
        { id: 1, original_filename: 'demo.mp4', status: 'completed', project_id: 1 }
      ];
    }
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

  // Delete a project
  deleteProject: async (projectId) => {
    const response = await client.delete(`/projects/${projectId}`);
    return response.data;
  },

  // Delete a video
  deleteVideo: async (videoId) => {
    const response = await client.delete(`/videos/${videoId}`);
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

  // Get details of a single clip
  getClip: async (clipId) => {
    const response = await client.get(`/videos/clips/${clipId}`);
    return response.data;
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
