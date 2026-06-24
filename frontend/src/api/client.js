import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api/v1';

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const api = {
  // Get all projects
  getProjects: async () => {
    const response = await client.get('/projects/');
    return response.data;
  },

  // Create a new project
  createProject: async (title, description) => {
    const response = await client.post('/projects/', {
      title,
      description,
      owner_id: 1 // Default hardcoded owner until auth is implemented
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
  getUserConnections: async (userId = 1) => {
    const response = await client.get(`/users/${userId}/connections`);
    return response.data;
  },

  // Get details of a single clip
  getClip: async (clipId) => {
    const response = await client.get(`/videos/clips/${clipId}`);
    return response.data;
  },

  // Create or update a social connection
  saveUserConnection: async (userId = 1, connectionData) => {
    const response = await client.post(`/users/${userId}/connections`, connectionData);
    return response.data;
  },

  // Delete/disconnect a social connection
  deleteUserConnection: async (userId = 1, platform) => {
    const response = await client.delete(`/users/${userId}/connections/${platform}`);
    return response.data;
  }
};
