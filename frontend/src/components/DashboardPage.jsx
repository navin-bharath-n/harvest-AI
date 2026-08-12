import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Folder, Plus, X, ChevronRight, BarChart2, Video, Trash2, Zap } from 'lucide-react';
import { api } from '../api/client';

/* ---- helpers ---- */
function statusChipClass(status) {
  if (status === 'completed' || status === 'done' || status === 'success') return 'done';
  if (status === 'processing' || status === 'rendering') return 'running';
  if (status === 'pending') return 'pending';
  if (status === 'failed') return 'failed';
  return 'idle';
}

function StatusChip({ status }) {
  const cls = statusChipClass(status);
  const labels = { done: '✓ Done', running: '⟳ Running', pending: '⏳ Pending', failed: '✕ Failed', idle: '— Pending' };
  return <span className={`status-chip ${cls}`}>{labels[cls]}</span>;
}

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
      console.error('Failed to load dashboard data', err);
    }
  };

  useEffect(() => { loadData(); }, []);

  const hasActivePipelines = videos.some(v =>
    v.status === 'processing' || v.status === 'pending' ||
    v.transcription_status === 'processing' || v.transcription_status === 'pending' ||
    v.analysis_status === 'processing' || v.analysis_status === 'pending' ||
    v.highlight_status === 'processing' || v.highlight_status === 'pending' ||
    v.crop_status === 'processing' || v.crop_status === 'pending' ||
    v.clips?.some(c => c.status === 'pending' || c.status === 'rendering')
  );

  useEffect(() => {
    if (!hasActivePipelines) return;
    const id = setInterval(loadData, 4000);
    return () => clearInterval(id);
  }, [hasActivePipelines]);

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setIsCreating(true);
    try {
      await api.createProject(newTitle, newDescription);
      setNewTitle(''); setNewDescription('');
      setShowCreateModal(false);
      await loadData();
    } catch (err) {
      console.error('Failed to create project', err);
      alert('Failed to create project');
    } finally { setIsCreating(false); }
  };

  const stats = [
    {
      label: 'Active Projects',
      value: projects.length,
      icon: <Folder size={22} />,
      iconBg: '#eef2ff',
      iconColor: '#4f46e5',
      accent: '#4f46e5',
    },
    {
      label: 'Source Videos',
      value: videosCount,
      icon: <Video size={22} />,
      iconBg: '#eff6ff',
      iconColor: '#2563eb',
      accent: '#2563eb',
    },
    {
      label: 'Pipelines',
      value: hasActivePipelines ? 'Active' : 'Idle',
      icon: <BarChart2 size={22} />,
      iconBg: '#ecfdf5',
      iconColor: '#059669',
      accent: '#059669',
    },
  ];

  return (
    <div className="page-shell">
      {/* ── APP NAV ──────────────────────────────────────────── */}
      <nav className="app-nav">
        <button className="app-nav-brand" onClick={() => navigate('/')}>
          <span className="app-nav-logo"><Video size={16} /></span>
          Harvest AI
        </button>
        <div className="app-nav-sep" />
        <div className="app-nav-breadcrumb">
          <strong>Dashboard</strong>
        </div>
        <div className="app-nav-actions">
          <button
            id="create-project-btn"
            className="btn-primary"
            onClick={() => setShowCreateModal(true)}
            style={{ gap: '0.4rem' }}
          >
            <Plus size={16} />
            New Project
          </button>
        </div>
      </nav>

      <motion.div
        className="page-content"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* ── PAGE HEADING ─────────────────────────────────── */}
        <div className="page-header" style={{ marginBottom: '2rem' }}>
          <div>
            <h1 className="page-title">Workspace Dashboard</h1>
            <p className="page-subtitle">Manage your neural video processing projects</p>
          </div>
        </div>

        {/* ── STATS ────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
          {stats.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
              className="stat-card"
              style={{ borderLeft: `3px solid ${s.accent}` }}
            >
              <div className="stat-card-icon" style={{ background: s.iconBg, color: s.iconColor }}>
                {s.icon}
              </div>
              <div>
                <div className="stat-card-value">{s.value}</div>
                <div className="stat-card-label">{s.label}</div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ── NEURAL PIPELINES ─────────────────────────────── */}
        {videos.length > 0 && (
          <div style={{ marginBottom: '2.5rem' }}>
            <div className="section-heading">
              <Video size={18} color="var(--indigo-600)" />
              Neural Processing Pipelines
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px,1fr))', gap: '1.25rem' }}>
              {[...videos].sort((a, b) => {
                const da = new Date(a.updated_at || a.created_at || 0).getTime();
                const db = new Date(b.updated_at || b.created_at || 0).getTime();
                return da !== db ? db - da : b.id - a.id;
              }).map((video, vi) => {
                const proj = projects.find(p => p.id === video.project_id);
                const completedVar = video.clips?.filter(c => c.title?.includes('Master Variation') && c.status === 'completed') || [];
                const totalVar = video.clips?.filter(c => c.title?.includes('Master Variation')) || [];
                const varText = `${completedVar.length} / ${Math.max(5, totalVar.length)}`;

                return (
                  <motion.div
                    key={video.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: vi * 0.05 }}
                    className="glass-panel"
                    style={{ padding: '1.5rem', position: 'relative', display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 240 }}
                  >
                    {/* Delete button */}
                    <button
                      className="btn-danger"
                      title="Delete video"
                      style={{ position: 'absolute', top: 14, right: 14, width: 28, height: 28 }}
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (window.confirm(`Delete "${video.original_filename}"?`)) {
                          try { await api.deleteVideo(video.id); await loadData(); }
                          catch (err) { console.error(err); alert('Failed to delete video'); }
                        }
                      }}
                    >
                      <Trash2 size={12} />
                    </button>

                    <div>
                      <h3 style={{ fontSize: '0.97rem', fontWeight: 700, color: 'var(--text-heading)', paddingRight: '2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '0.2rem' }}
                        title={video.original_filename}>
                        {video.original_filename}
                      </h3>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--indigo-600)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {proj ? proj.title : 'No Project'}
                      </span>
                    </div>

                    {/* Pipeline rows */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: '0.85rem 1rem' }}>
                      {[
                        ['Video processing', video.status],
                        ['Transcription', video.transcription_status],
                        ['Analysis', video.analysis_status],
                      ].map(([label, status]) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                          <StatusChip status={status} />
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Variations rendered</span>
                        <span style={{ color: 'var(--indigo-600)', fontWeight: 700, fontSize: '0.8rem' }}>{varText}</span>
                      </div>
                    </div>

                    <button
                      className="btn-indigo"
                      onClick={() => navigate(`/master-generator/${video.id}`)}
                      style={{ width: '100%', marginTop: 'auto', justifyContent: 'center', gap: '0.4rem', fontSize: '0.85rem', padding: '0.6rem' }}
                    >
                      <Zap size={15} />
                      AI Shorts
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── PROJECTS GRID ─────────────────────────────────── */}
        <div className="section-heading">
          <Folder size={18} color="var(--indigo-600)" />
          Your Projects
        </div>

        {projects.length === 0 ? (
          <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <div style={{ width: 64, height: 64, borderRadius: 'var(--radius-lg)', background: 'var(--indigo-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
              <Folder size={30} color="var(--indigo-600)" />
            </div>
            <h3 style={{ marginBottom: '0.5rem', fontSize: '1.1rem' }}>No projects yet</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.75rem', fontSize: '0.9rem', maxWidth: 340, margin: '0 auto 1.75rem' }}>
              Create your first workspace to start repurposing videos into short-form content.
            </p>
            <button id="create-first-project-btn" className="btn-primary" onClick={() => setShowCreateModal(true)} style={{ margin: '0 auto', padding: '0.75rem 1.75rem', fontSize: '0.95rem' }}>
              <Plus size={16} /> Create First Project
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px,1fr))', gap: '1.25rem' }}>
            {projects.map((project, index) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="glass-panel"
                style={{ cursor: 'pointer', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 170, padding: '1.5rem' }}
                onClick={() => navigate(`/project/${project.id}`)}
                whileHover={{ boxShadow: '0 12px 40px rgba(79,70,229,0.12)', borderColor: 'var(--indigo-600)' }}
              >
                {/* Delete */}
                <button
                  className="btn-danger"
                  title="Delete project"
                  style={{ position: 'absolute', top: 14, right: 14, width: 28, height: 28 }}
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (window.confirm(`Delete project "${project.title}" and all its videos?`)) {
                      try { await api.deleteProject(project.id); await loadData(); }
                      catch (err) { console.error(err); alert('Failed to delete project'); }
                    }
                  }}
                >
                  <Trash2 size={12} />
                </button>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--indigo-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Folder size={18} color="var(--indigo-600)" />
                    </div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-heading)', paddingRight: '2rem', margin: 0 }}>
                      {project.title}
                    </h3>
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {project.description || 'Manage your video processing pipeline for this project.'}
                  </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Workspace
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem', color: 'var(--indigo-600)', fontWeight: 700 }}>
                    Open <ChevronRight size={13} />
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* ── CREATE PROJECT MODAL ───────────────────────────── */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            id="create-project-modal"
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="modal-card"
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              transition={{ ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="modal-header">
                <h2 className="modal-title">Create Workspace</h2>
                <button className="btn-icon" onClick={() => setShowCreateModal(false)} aria-label="Close modal">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                <div>
                  <label htmlFor="modal-title" style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    Project Title
                  </label>
                  <input
                    id="modal-title"
                    type="text"
                    className="input-field"
                    placeholder="Enter project name..."
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="modal-desc" style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    Description <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>(optional)</span>
                  </label>
                  <textarea
                    id="modal-desc"
                    className="input-field"
                    placeholder="Describe this workspace..."
                    value={newDescription}
                    onChange={e => setNewDescription(e.target.value)}
                    rows={3}
                  />
                </div>

                <button type="submit" className="btn-primary" disabled={isCreating} style={{ width: '100%', justifyContent: 'center', padding: '0.8rem' }}>
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
