import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UploadCloud, Video, ChevronLeft, Wand, Trash2, Clock, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { api } from '../api/client';

function statusChipClass(status) {
  if (status === 'completed' || status === 'done' || status === 'success') return 'done';
  if (status === 'processing' || status === 'rendering') return 'running';
  if (status === 'pending') return 'pending';
  if (status === 'failed') return 'failed';
  return 'idle';
}

function StatusChip({ status }) {
  const cls = statusChipClass(status);
  const labels = { done: '✓ Completed', running: '⟳ Running', pending: '⏳ Pending', failed: '✕ Failed', idle: '— Pending' };
  return <span className={`status-chip ${cls}`}>{labels[cls]}</span>;
}

function StatusIcon({ status }) {
  const s = statusChipClass(status);
  if (s === 'done')    return <CheckCircle  size={16} color="var(--status-done-text)" />;
  if (s === 'running') return <Loader       size={16} color="var(--status-run-text)"  style={{ animation: 'spin 1.5s linear infinite' }} />;
  if (s === 'failed')  return <AlertCircle  size={16} color="var(--status-fail-text)" />;
  return <Clock size={16} color="var(--text-faint)" />;
}

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const [project,   setProject]   = useState(null);
  const [videos,    setVideos]    = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [loading,   setLoading]   = useState(true);
  const navigate = useNavigate();

  const loadData = async () => {
    try {
      const allProjects = await api.getProjects();
      const currentProj = allProjects.find(p => p.id === parseInt(projectId));
      if (!currentProj) { navigate('/dashboard'); return; }
      setProject(currentProj);

      const allVideos = await api.getVideos();
      const filtered = (allVideos.filter(v => v.project_id === parseInt(projectId)) || [])
        .sort((a, b) => {
          const tA = new Date(a.updated_at || a.created_at || 0).getTime();
          const tB = new Date(b.updated_at || b.created_at || 0).getTime();
          return tA !== tB ? tB - tA : b.id - a.id;
        });
      setVideos(filtered);
    } catch (err) {
      console.error('Failed to load project details', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [projectId]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setProgress(0);
    try {
      const response = await api.uploadVideo(parseInt(projectId), file, (ev) => {
        setProgress(Math.round((ev.loaded * 100) / ev.total));
      });
      await loadData();
      if (response) navigate(`/master-generator/${response.id}`);
    } catch (err) {
      console.error('Upload failed', err);
      alert('Failed to upload video');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  if (loading) {
    return (
      <div className="page-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading project workspace…</p>
      </div>
    );
  }

  return (
    <div className="page-shell">
      {/* ── NAV ────────────────────────────────────────────── */}
      <nav className="app-nav">
        <button className="app-nav-brand" onClick={() => navigate('/')}>
          <span className="app-nav-logo"><Video size={16} /></span>
          Harvest AI
        </button>
        <div className="app-nav-sep" />
        <div className="app-nav-breadcrumb">
          <button
            onClick={() => navigate('/dashboard')}
            style={{ background: 'none', border: 'none', color: 'var(--indigo-600)', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer', padding: 0 }}
          >
            Dashboard
          </button>
          <span style={{ color: 'var(--border-strong)' }}>/</span>
          <strong>{project?.title}</strong>
        </div>
      </nav>

      <motion.div
        className="page-content"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* ── PAGE HEADER ──────────────────────────────────── */}
        <div className="page-header">
          <button className="btn-icon" onClick={() => navigate('/dashboard')} aria-label="Back to dashboard">
            <ChevronLeft size={17} />
          </button>
          <div>
            <h1 className="page-title">{project?.title}</h1>
            <p className="page-subtitle">{project?.description || 'Manage your video processing pipeline for this project.'}</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(280px,1fr)', gap: '2rem', alignItems: 'start', flexWrap: 'wrap' }}>

          {/* ── LEFT: Videos list ──────────────────────────── */}
          <div>
            <div className="section-heading">
              <Video size={17} color="var(--indigo-600)" />
              Uploaded Source Videos
              <span className="status-chip idle" style={{ marginLeft: 'auto' }}>
                {videos.length} file{videos.length !== 1 ? 's' : ''}
              </span>
            </div>

            {videos.length === 0 ? (
              <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem 2rem', border: '1.5px dashed var(--border-medium)' }}>
                <Video size={40} color="var(--text-faint)" style={{ margin: '0 auto 0.75rem' }} />
                <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.9rem' }}>
                  No videos uploaded yet. Upload a file to begin.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {videos.map((video, i) => (
                  <motion.div
                    key={video.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="glass-panel"
                    style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}
                  >
                    {/* Icon */}
                    <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: 'var(--bg-inset)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <StatusIcon status={video.status} />
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {video.original_filename}
                      </div>
                      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
                        <StatusChip status={video.status} />
                        {video.duration && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Clock size={11} />{video.duration.toFixed(1)}s
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '0.6rem', flexShrink: 0 }}>
                      <button
                        className="btn-primary"
                        onClick={() => navigate(`/master-generator/${video.id}`)}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.82rem', gap: '0.35rem' }}
                      >
                        <Wand size={13} /> AI Shorts
                      </button>
                      <button
                        className="btn-danger"
                        title="Delete video"
                        style={{ width: 34, height: 34 }}
                        onClick={async () => {
                          if (window.confirm(`Delete "${video.original_filename}"?`)) {
                            try { await api.deleteVideo(video.id); await loadData(); }
                            catch (err) { console.error(err); alert('Failed to delete video'); }
                          }
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* ── RIGHT: Upload ─────────────────────────────── */}
          <div>
            <div className="section-heading">
              <UploadCloud size={17} color="var(--indigo-600)" />
              Upload Media
            </div>

            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <label className={`upload-zone ${uploading ? '' : ''}`} style={{ cursor: uploading ? 'not-allowed' : 'pointer' }}>
                <UploadCloud size={38} color="var(--indigo-600)" style={{ opacity: uploading ? 0.4 : 1 }} />
                <div>
                  <p style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-heading)', margin: 0 }}>
                    {uploading ? 'Uploading…' : 'Select MP4 or MOV'}
                  </p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.3rem 0 0' }}>
                    File will be processed automatically
                  </p>
                </div>
                <input
                  type="file"
                  accept="video/mp4,video/quicktime"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
              </label>

              {uploading && (
                <div style={{ marginTop: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Uploading source video…</span>
                    <span style={{ fontWeight: 700, color: 'var(--indigo-600)' }}>{progress}%</span>
                  </div>
                  <div className="progress-bar-track">
                    <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}
            </div>

            {/* Tips card */}
            <div className="glass-panel-sm" style={{ marginTop: '1rem', background: 'var(--indigo-50)', border: '1px solid var(--indigo-100)' }}>
              <p style={{ fontSize: '0.78rem', color: 'var(--indigo-600)', fontWeight: 600, marginBottom: '0.4rem' }}>
                Tips for best results
              </p>
              <ul style={{ paddingLeft: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.8, margin: 0 }}>
                <li>Use landscape 16:9 videos (1080p recommended)</li>
                <li>Clear audio improves transcription accuracy</li>
                <li>Minimum 30s recommended for highlight detection</li>
              </ul>
            </div>
          </div>
        </div>
      </motion.div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
