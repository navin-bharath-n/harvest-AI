import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Folder, Plus, X, ArrowLeft, BarChart2, Video, Trash2 } from 'lucide-react';
import { api } from '../api/client';

export default function DashboardPage() {
  const [projects, setProjects] = useState([]);
  const [videos, setVideos] = useState([]);
  const [videosCount, setVideosCount] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();

  const loadData = async () => {
    try {
      const projData = await api.getProjects();
      setProjects(projData || []);

      const vidData = await api.getVideos();
      setVideos(vidData || []);
      setVideosCount(vidData?.length || 0);
    } catch (err) {
      console.error("Failed to load dashboard data", err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const hasActivePipelines = videos.some(v => 
    v.status === 'processing' || v.status === 'pending' ||
    v.transcription_status === 'processing' || v.transcription_status === 'pending' ||
    v.analysis_status === 'processing' || v.analysis_status === 'pending' ||
    v.highlight_status === 'processing' || v.highlight_status === 'pending' ||
    v.crop_status === 'processing' || v.crop_status === 'pending' ||
    v.clips?.some(c => c.status === 'pending' || c.status === 'rendering')
  );

  useEffect(() => {
    let interval = null;
    if (hasActivePipelines) {
      interval = setInterval(() => {
        loadData();
      }, 4000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [hasActivePipelines]);

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setIsCreating(true);
    try {
      await api.createProject(newTitle, newDescription);
      setNewTitle('');
      setNewDescription('');
      setShowCreateModal(false);
      await loadData();
    } catch (err) {
      console.error("Failed to create project", err);
      alert("Failed to create project");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      style={{ minHeight: '100vh', color: '#fff', position: 'relative' }}
    >
      <div className="bg-glow" />
      <div className="container" style={{ padding: '3rem 2rem' }}>

        {/* Navigation / Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              onClick={() => navigate('/')}
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
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 style={{ margin: 0, fontSize: '2rem' }}>Workspace Dashboard</h1>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>Manage your neural video processing projects</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-neon"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.8rem 1.6rem', fontSize: '0.95rem' }}
          >
            <Plus size={18} /> New Project
          </button>
        </div>

        {/* Stats Summary Card */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
          {[
            { label: 'Active Projects', value: projects.length, icon: <Folder size={24} color="#8b5cf6" />, bg: 'rgba(139,92,246,0.08)' },
            { label: 'Total Source Videos', value: videosCount, icon: <Video size={24} color="#06b6d4" />, bg: 'rgba(6,182,212,0.08)' },
            { label: 'Neural Pipelines Running', value: 'Celery Active', icon: <BarChart2 size={24} color="#10b981" />, bg: 'rgba(16,185,129,0.08)' },
          ].map((stat, idx) => (
            <div
              key={idx}
              className="glass-panel"
              style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '1.5rem', background: stat.bg }}
            >
              <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(0,0,0,0.2)' }}>
                {stat.icon}
              </div>
              <div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{stat.value}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Neural Processing Pipelines Section */}
        {videos.length > 0 && (
          <div style={{ marginBottom: '3rem' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Video size={20} color="var(--accent-color)" /> Neural Processing Pipelines
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
              {[...videos].sort((a, b) => {
                const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
                const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
                if (dateA !== dateB) return dateB - dateA;
                return b.id - a.id;
              }).map(video => {
                const proj = projects.find(p => p.id === video.project_id);
                const completedVariations = video.clips?.filter(c => c.title && c.title.includes("Master Variation") && c.status === "completed") || [];
                const totalVariations = video.clips?.filter(c => c.title && c.title.includes("Master Variation")) || [];
                const variationsText = `${completedVariations.length} / ${Math.max(1, totalVariations.length)}`;

                const getStatusLabel = (status) => {
                  if (status === 'completed' || status === 'done' || status === 'success') {
                    return <span style={{ color: '#10b981', fontWeight: 600 }}>✓ Done</span>;
                  }
                  if (status === 'processing' || status === 'rendering') {
                    return <span style={{ color: '#fbbf24', fontWeight: 600 }} className="processing-pulse">⟳ Running</span>;
                  }
                  if (status === 'pending') {
                    return <span style={{ color: '#a78bfa', fontWeight: 600 }}>⏳ Pending</span>;
                  }
                  if (status === 'failed') {
                    return <span style={{ color: '#ef4444', fontWeight: 600 }}>✕ Failed</span>;
                  }
                  return <span style={{ color: 'var(--text-muted)' }}>— Pending</span>;
                };

                return (
                  <motion.div
                    key={video.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-panel"
                    style={{
                      border: '1px solid rgba(255,255,255,0.08)',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      padding: '1.5rem',
                      minHeight: '260px'
                    }}
                  >
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#fff', paddingRight: '2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={video.original_filename}>
                        {video.original_filename}
                      </h3>
                      <div style={{ fontSize: '0.75rem', color: 'var(--accent-color)', textTransform: 'uppercase', fontWeight: 600, marginTop: '0.2rem' }}>
                        {proj ? proj.title : 'No Project'}
                      </div>

                      <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', background: 'rgba(0,0,0,0.2)', padding: '0.8rem 1rem', borderRadius: '8px', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#94a3b8' }}>Video processing</span>
                          <span>{getStatusLabel(video.status)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#94a3b8' }}>Transcription (Whisper)</span>
                          <span>{getStatusLabel(video.transcription_status)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#94a3b8' }}>Content Analysis (Ollama)</span>
                          <span>{getStatusLabel(video.analysis_status)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#94a3b8' }}>Variations rendered</span>
                          <span style={{ color: '#a78bfa', fontWeight: 600 }}>{variationsText}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.75rem' }}>
                      <button
                        onClick={() => navigate(`/master-generator/${video.id}`)}
                        className="btn-neon"
                        style={{
                          width: '100%',
                          padding: '0.4rem 0',
                          fontSize: '0.8rem',
                          textAlign: 'center'
                        }}
                      >
                        ⚡ AI Shorts
                      </button>
                    </div>

                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
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
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#f87171',
                        borderRadius: '50%',
                        width: '28px',
                        height: '28px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        zIndex: 10
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)';
                        e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.6)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                        e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* Projects Grid */}
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>
          Your Projects
        </h2>

        {projects.length === 0 ? (
          <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <Folder size={48} color="rgba(255,255,255,0.2)" style={{ marginBottom: '1rem', marginLeft: 'auto', marginRight: 'auto' }} />
            <h3>No projects found</h3>
            <p style={{ marginTop: '0.5rem', marginBottom: '1.5rem' }}>Get started by creating your first neural video workspace.</p>
            <button onClick={() => setShowCreateModal(true)} className="btn-neon">Create Project</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {projects.map((project, index) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => navigate(`/project/${project.id}`)}
                className="glass-panel"
                style={{
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '180px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  position: 'relative'
                }}
                whileHover={{ scale: 1.02, borderColor: 'var(--accent-color)', boxShadow: '0 8px 30px rgba(139,92,246,0.15)' }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#fff', paddingRight: '2rem' }}>{project.title}</h3>
                  <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {project.description || "Manage your video processing pipeline for this project."}
                  </p>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <span>Folder Node</span>
                  <span style={{ color: 'var(--accent-color)', fontWeight: 600 }}>Open Project →</span>
                </div>

                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (window.confirm(`Are you sure you want to delete project "${project.title}" and all its videos?`)) {
                      try {
                        await api.deleteProject(project.id);
                        await loadData();
                      } catch (err) {
                        console.error(err);
                        alert("Failed to delete project");
                      }
                    }
                  }}
                  style={{
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#f87171',
                    borderRadius: '50%',
                    width: '28px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    zIndex: 10
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)';
                    e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.6)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </motion.div>
            ))}
          </div>
        )}

      </div>

      {/* Create Project Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
              background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 100, backdropFilter: 'blur(4px)'
            }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="glass-panel"
              style={{
                width: '450px', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem',
                border: '1px solid rgba(255,255,255,0.15)', background: '#12121a'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Create Workspace</h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <label htmlFor="modal-title" style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Project Title</label>
                  <input
                    id="modal-title"
                    type="text"
                    placeholder="Enter project name..."
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    style={{ padding: '0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.4)', color: 'white', width: '100%', outline: 'none' }}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="modal-desc" style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Description</label>
                  <textarea
                    id="modal-desc"
                    placeholder="Describe this workspace (optional)..."
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    rows={4}
                    style={{ padding: '0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.4)', color: 'white', resize: 'none', width: '100%', outline: 'none', fontFamily: 'inherit' }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="btn-neon"
                  style={{
                    padding: '0.8rem',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    width: '100%'
                  }}
                >
                  {isCreating ? 'Creating Workspace...' : 'Create Project'}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
