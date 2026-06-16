import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UploadCloud, Video, ChevronLeft, Film, Wand2, Trash2 } from 'lucide-react';
import { api } from '../api/client';

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [videos, setVideos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const loadData = async () => {
    try {
      const allProjects = await api.getProjects();
      const currentProj = allProjects.find(p => p.id === parseInt(projectId));
      if (!currentProj) {
        navigate('/dashboard');
        return;
      }
      setProject(currentProj);

      const allVideos = await api.getVideos();
      const filtered = allVideos.filter(v => v.project_id === parseInt(projectId)) || [];
      filtered.sort((a, b) => {
        const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
        const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
        if (timeA !== timeB) return timeB - timeA;
        return b.id - a.id;
      });
      setVideos(filtered);
    } catch (err) {
      console.error("Failed to load project details", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [projectId]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setProgress(0);

    try {
      const response = await api.uploadVideo(parseInt(projectId), file, (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        setProgress(percentCompleted);
      });
      await loadData();
      if (response) {
        // Go straight to the master generator of the uploaded video!
        navigate(`/master-generator/${response.id}`);
      }
    } catch (err) {
      console.error("Upload failed", err);
      alert("Failed to upload video");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-dark)' }}>
        <p style={{ color: 'var(--text-muted)' }}>Loading project workspace...</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      style={{ minHeight: '100vh', color: '#fff', position: 'relative' }}
    >
      <div className="bg-glow" />
      <div className="container" style={{ padding: '3rem 2rem' }}>
        
        {/* Header / Back */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2.5rem' }}>
          <button 
            onClick={() => navigate('/dashboard')}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'white',
              cursor: 'pointer',
              padding: '0.6rem',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: '2rem' }}>{project.title}</h1>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              {project.description || "Manage your video processing pipeline for this project."}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          {/* Left Column: Videos List */}
          <div style={{ flex: '2', minWidth: '320px' }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Video size={20} /> Uploaded Source Videos
            </h2>

            {videos.length === 0 ? (
              <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem 2rem', border: '1px dashed rgba(255,255,255,0.08)' }}>
                <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No videos uploaded to this workspace yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {videos.map((video) => (
                  <div 
                    key={video.id} 
                    className="glass-panel"
                    style={{
                      padding: '1.5rem',
                      border: '1px solid rgba(255,255,255,0.08)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '1rem'
                    }}
                  >
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#fff' }}>{video.original_filename}</h3>
                      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.8rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Status: 
                          <strong style={{ 
                            color: video.status === 'completed' ? '#10b981' : (video.status === 'failed' ? '#ef4444' : '#f59e0b'),
                            marginLeft: '0.25rem',
                            textTransform: 'uppercase'
                          }}>
                            {video.status}
                          </strong>
                        </span>
                        {video.duration && (
                          <span style={{ color: 'var(--text-muted)' }}>Duration: <strong>{video.duration.toFixed(1)}s</strong></span>
                        )}
                      </div>
                    </div>
                    
                    {/* Action routes */}
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button 
                        onClick={() => navigate(`/master-generator/${video.id}`)}
                        className="btn-neon"
                        style={{
                          padding: '0.5rem 1rem',
                          fontSize: '0.85rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem'
                        }}
                      >
                        <Wand2 size={15} /> AI Shorts
                      </button>
                      <button 
                        onClick={async () => {
                          if (window.confirm(`Are you sure you want to delete video "${video.original_filename}"?`)) {
                            try {
                              await api.deleteVideo(video.id);
                              await loadData();
                            } catch (err) {
                              console.error(err);
                              alert("Failed to delete video");
                            }
                          }
                        }}
                        style={{
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#f87171',
                          padding: '0.5rem',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                          e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                          e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                        }}
                        title="Delete video"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Upload Box */}
          <div style={{ flex: '1', minWidth: '280px' }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '1.5rem' }}>Upload Media</h2>
            
            <div className="glass-panel" style={{ padding: '1.5rem', border: '1px solid rgba(255,255,255,0.08)' }}>
              <label 
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '3rem 1.5rem',
                  border: '2px dashed rgba(255,255,255,0.15)',
                  borderRadius: '12px',
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  background: 'rgba(0,0,0,0.25)',
                  textAlign: 'center',
                  transition: 'border-color 0.2s'
                }}
                onMouseEnter={e => { if(!uploading) e.currentTarget.style.borderColor = 'var(--accent-color)'; }}
                onMouseLeave={e => { if(!uploading) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
              >
                <UploadCloud size={40} color="var(--accent-color)" style={{ marginBottom: '1rem' }} />
                <span style={{ fontWeight: 500, fontSize: '0.95rem' }}>Select MP4 or MOV</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>File will be processed automatically</span>
                <input 
                  type="file" 
                  accept="video/mp4,video/quicktime" 
                  style={{ display: 'none' }} 
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
              </label>

              {uploading && (
                <div style={{ marginTop: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                    <span>Uploading source video...</span>
                    <span style={{ fontWeight: 600, color: 'var(--accent-color)' }}>{progress}%</span>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: 'rgba(0,0,0,0.3)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div 
                      style={{ 
                        width: `${progress}%`, 
                        height: '100%', 
                        background: 'linear-gradient(90deg, var(--accent-color), #6366f1)', 
                        transition: 'width 0.2s ease' 
                      }} 
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </motion.div>
  );
}
