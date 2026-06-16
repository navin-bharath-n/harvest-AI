import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UploadCloud, Video, ChevronLeft, ArrowRight } from 'lucide-react';
import { api } from '../api/client';
import VideoProcessingPage from './VideoProcessingPage';

export default function HtmlOverlay({ activeProject, setActiveProject, refreshProjects }) {
  const [videos, setVideos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const [activeVideo, setActiveVideo] = useState(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (activeProject) {
      loadVideos();
      setActiveVideo(null);
    }
  }, [activeProject]);

  const loadVideos = async () => {
    // Ideally we'd fetch videos by project ID here, e.g. api.getVideosByProject(activeProject.id)
    const allVideos = await api.getVideos();
    // filtering locally for mock/demo purposes
    setVideos(allVideos.filter(v => v.project_id === activeProject.id) || []);
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setIsCreating(true);
    try {
      await api.createProject(newTitle, newDescription);
      setNewTitle('');
      setNewDescription('');
      setShowCreateModal(false);
      if (refreshProjects) refreshProjects();
    } catch (err) {
      console.error("Failed to create project", err);
      alert("Failed to create project");
    } finally {
      setIsCreating(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setProgress(0);

    try {
      const response = await api.uploadVideo(activeProject.id, file, (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        setProgress(percentCompleted);
      });
      // Refresh video list
      await loadVideos();
      // Set the newly uploaded video as active so it transitions to the processing page
      if (response) {
        setActiveVideo(response);
      }
    } catch (err) {
      console.error("Upload failed", err);
      alert("Failed to upload video");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none', // Allow clicks to pass through to the 3D canvas
      zIndex: 10
    }}>
      
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: "easeOut" }}
        style={{
          position: 'absolute',
          top: '2rem',
          left: '2rem',
          pointerEvents: 'auto'
        }}
      >
        <h1 style={{ margin: 0, fontSize: '2rem', textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>harvest_AI</h1>
        <p style={{ margin: 0, color: 'var(--accent-color)' }}>Neural Video Processing Engine</p>
      </motion.div>

      {/* Project Detail Panel */}
      <AnimatePresence>
        {activeProject && !activeVideo && (
          <motion.div
            initial={{ x: '100%', opacity: 0, filter: 'blur(10px)' }}
            animate={{ x: 0, opacity: 1, filter: 'blur(0px)' }}
            exit={{ x: '100%', opacity: 0, filter: 'blur(10px)' }}
            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
            className="glass-panel"
            style={{
              position: 'absolute',
              top: '2rem',
              right: '2rem',
              bottom: '2rem',
              width: '400px',
              padding: '2rem',
              pointerEvents: 'auto',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}
            >
              <h2 style={{ margin: 0 }}>{activeProject.title}</h2>
              <button 
                onClick={() => setActiveProject(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  padding: '0.5rem'
                }}
              >
                <X size={24} />
              </button>
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              {activeProject.description || "Manage your video processing pipeline for this project."}
            </motion.p>

            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              style={{ marginTop: '2rem', flex: 1, overflowY: 'auto' }}
            >
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Video size={20} /> Videos
              </h3>
              
              {videos.length === 0 ? (
                <p style={{ color: '#888', fontStyle: 'italic' }}>No videos uploaded yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {videos.map((video, idx) => (
                    <motion.div 
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 + (idx * 0.1) }}
                      key={video.id} 
                      onClick={() => setActiveVideo(video)}
                      style={{
                        background: 'rgba(255,255,255,0.05)',
                        padding: '1rem',
                        borderRadius: '8px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        cursor: 'pointer'
                      }}
                      whileHover={{ scale: 1.02, background: 'rgba(255,255,255,0.1)' }}
                    >
                      <div style={{ fontWeight: 'bold' }}>{video.original_filename}</div>
                      <div style={{ 
                        fontSize: '0.8rem', 
                        color: video.status === 'completed' ? '#4cf58d' : '#f5a623',
                        marginTop: '0.5rem',
                        textTransform: 'uppercase',
                        letterSpacing: '1px'
                      }}>
                        {video.status}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>

            {/* Upload Area */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              style={{ marginTop: 'auto', paddingTop: '2rem' }}
            >
              <motion.label 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2rem',
                  border: '2px dashed rgba(255,255,255,0.2)',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  background: 'rgba(0,0,0,0.2)'
                }}
              >
                <UploadCloud size={32} color="var(--accent-color)" style={{ marginBottom: '1rem' }} />
                <span>Drop video or click to browse</span>
                <input 
                  type="file" 
                  accept="video/*" 
                  style={{ display: 'none' }} 
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
              </motion.label>

              {uploading && (
                <div style={{ marginTop: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                    <span>Uploading...</span>
                    <span>{progress}%</span>
                  </div>
                  <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent-color)', transition: 'width 0.3s ease' }} />
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeVideo && (
          <VideoProcessingPage 
            video={activeVideo} 
            onBack={() => setActiveVideo(null)} 
          />
        )}
      </AnimatePresence>
      
      {/* Create Project Button */}
      {!activeProject && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ position: 'absolute', bottom: '4rem', width: '100%', display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}
        >
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: '1rem 2rem',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--accent-color)',
              color: 'white',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              pointerEvents: 'auto',
              boxShadow: '0 4px 15px rgba(155, 76, 245, 0.4)'
            }}
          >
            + Create New Project
          </button>
        </motion.div>
      )}

      {/* Footer hint */}
      {!activeProject && (
        <div style={{
          position: 'absolute',
          bottom: '2rem',
          width: '100%',
          textAlign: 'center',
          color: 'rgba(255,255,255,0.5)',
          pointerEvents: 'none'
        }}>
          Click on a project to manage videos
        </div>
      )}

      {/* Create Project Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
              background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'auto', zIndex: 50
            }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="glass-panel"
              style={{
                width: '400px', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>Create Project</h2>
                <button onClick={() => setShowCreateModal(false)} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}>
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <input
                  type="text"
                  placeholder="Project Title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  style={{ padding: '0.8rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.5)', color: 'white' }}
                  required
                />
                <textarea
                  placeholder="Project Description (optional)"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={4}
                  style={{ padding: '0.8rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.5)', color: 'white', resize: 'none' }}
                />
                <button
                  type="submit"
                  disabled={isCreating}
                  style={{
                    padding: '0.8rem',
                    borderRadius: '4px',
                    border: 'none',
                    background: isCreating ? 'rgba(255,255,255,0.2)' : 'var(--accent-color)',
                    color: 'white',
                    fontWeight: 'bold',
                    cursor: isCreating ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isCreating ? 'Creating...' : 'Create Project'}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
