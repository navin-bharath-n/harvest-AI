import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  UploadCloud, Video, ChevronLeft, Wand, Trash2, Clock, CheckCircle, 
  AlertCircle, Loader, Zap, Sparkles, X
} from 'lucide-react';
import { api } from '../api/client';
import { useGeneration } from '../context/GenerationContext';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://localhost:8000/api/v1';

function statusChipClass(status) {
  if (status === 'completed' || status === 'done' || status === 'success') return 'done';
  if (status === 'processing' || status === 'rendering') return 'running';
  if (status === 'pending') return 'pending';
  if (status === 'failed') return 'failed';
  return 'idle';
}

function StatusChip({ status }) {
  const cls = statusChipClass(status);
  const labels = { done: '✓ Ready', running: '⟳ Processing', pending: '⏳ Pending', failed: '✕ Failed', idle: '— Pending' };
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

  const { activeTasks, startTrackingBatch, cancelGeneration, cancelAllGenerations } = useGeneration();

  const [uploadingStatus, setUploadingStatus] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

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

  // Live polling if any video in the project is actively processing
  const hasProcessingVideos = videos.some(v => 
    v.status === 'processing' || v.status === 'pending' || 
    activeTasks.some(t => t.videoId === v.id)
  );

  useEffect(() => {
    if (!hasProcessingVideos) return;
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, [hasProcessingVideos]);

  const processFilesUpload = async (filesList) => {
    const files = Array.from(filesList).filter(f => f.type.startsWith('video/') || /\.(mp4|mov|mkv|webm|avi|flv)$/i.test(f.name));
    if (files.length === 0) {
      alert('Please select valid video files (MP4, MOV, MKV, WebM, AVI).');
      return;
    }

    setUploading(true);
    setProgress(0);
    setUploadingStatus(files.length === 1 ? `Uploading ${files[0].name}…` : `Uploading ${files.length} videos simultaneously in parallel…`);

    try {
      let completedCount = 0;
      const progressMap = {};

      const uploadPromises = files.map(async (file, idx) => {
        const res = await api.uploadVideo(parseInt(projectId), file, (ev) => {
          progressMap[idx] = (ev.loaded / ev.total);
          const totalProgress = Object.values(progressMap).reduce((a, b) => a + b, 0) / files.length;
          setProgress(Math.round(totalProgress * 100));
        });
        completedCount++;
        if (files.length > 1) {
          setUploadingStatus(`Uploaded ${completedCount} of ${files.length} videos…`);
        }
        return res;
      });

      const responses = await Promise.all(uploadPromises);
      await loadData();

      // Navigate to the Master Generator page to review/make any changes (prompt, dub voice, audio theme, duration)
      if (responses.length > 0 && responses[0] && responses[0].id) {
        navigate(`/master-generator/${responses[0].id}`);
      }
    } catch (err) {
      console.error('Upload failed', err);
      alert('One or more video uploads failed. Please check the backend connection.');
    } finally {
      setUploading(false);
      setProgress(0);
      setUploadingStatus('');
    }
  };

  const handleFileUpload = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processFilesUpload(e.target.files);
      e.target.value = '';
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (uploading) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFilesUpload(e.dataTransfer.files);
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
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button className="btn-icon" onClick={() => navigate('/dashboard')} aria-label="Back to dashboard">
              <ChevronLeft size={17} />
            </button>
            <div>
              <h1 className="page-title">{project?.title}</h1>
              <p className="page-subtitle">{project?.description || 'Manage and generate AI Shorts in parallel for this project.'}</p>
            </div>
          </div>

          {activeTasks.length > 0 && (
            <button 
              className="btn-secondary" 
              onClick={async () => {
                await cancelAllGenerations();
                await loadData();
              }}
              style={{ 
                padding: '0.65rem 1.1rem', 
                fontSize: '0.88rem', 
                gap: '0.4rem', 
                background: 'rgba(239, 68, 68, 0.1)', 
                border: '1px solid rgba(239, 68, 68, 0.3)', 
                color: 'var(--status-fail-text)',
                fontWeight: 700
              }}
            >
              <X size={15} />
              Cancel All Processes ({activeTasks.length})
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(300px,1fr)', gap: '2rem', alignItems: 'start', flexWrap: 'wrap' }}>

          {/* ── LEFT: Videos list ──────────────────────────── */}
          <div>
            <div className="section-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Video size={17} color="var(--indigo-600)" />
                <span>Source Videos</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="status-chip idle">
                  {videos.length} file{videos.length !== 1 ? 's' : ''}
                </span>
                {activeTasks.length > 0 && (
                  <span className="status-chip running">
                    ⚡ {activeTasks.length} generating in parallel
                  </span>
                )}
              </div>
            </div>

            {videos.length === 0 ? (
              <div className="glass-panel" style={{ textAlign: 'center', padding: '3.5rem 2rem', border: '1.5px dashed var(--border-medium)' }}>
                <Video size={42} color="var(--text-faint)" style={{ margin: '0 auto 0.75rem' }} />
                <p style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.95rem', margin: '0 0 0.4rem' }}>
                  No videos uploaded yet
                </p>
                <p style={{ color: 'var(--text-faint)', fontSize: '0.8rem', margin: 0 }}>
                  Select or drag & drop multiple video files to process them in parallel.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {videos.map((video, i) => {
                  const activeTask = activeTasks.find(t => t.videoId === video.id);
                  const isTaskGenerating = Boolean(activeTask);
                  const isReady = video.status === 'completed' && !isTaskGenerating;

                  return (
                    <motion.div
                      key={video.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="glass-panel"
                      style={{ 
                        padding: '1.25rem 1.5rem', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '1.25rem', 
                        flexWrap: 'wrap',
                        border: isTaskGenerating ? '1.5px solid rgba(99, 102, 241, 0.4)' : '1px solid var(--border-subtle)',
                        background: isTaskGenerating ? 'rgba(238, 242, 255, 0.4)' : 'var(--bg-elevated)'
                      }}
                    >
                      {/* Icon */}
                      <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: isTaskGenerating ? 'var(--indigo-50)' : 'var(--bg-inset)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {isTaskGenerating ? (
                          <Loader size={20} color="var(--indigo-600)" style={{ animation: 'spin 1.5s linear infinite' }} />
                        ) : (
                          <StatusIcon status={video.status} />
                        )}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {video.original_filename}
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          {isTaskGenerating ? (
                            <span className="status-chip running" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                              ⚡ {activeTask.stageLabel || 'Generating Shorts in Parallel…'} ({activeTask.variationsReady || 0}/5)
                            </span>
                          ) : (
                            <StatusChip status={video.status} />
                          )}

                          {video.duration && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <Clock size={11} />{video.duration.toFixed(1)}s
                            </span>
                          )}
                        </div>

                        {/* Mini progress bar if active */}
                        {isTaskGenerating && (
                          <div style={{ marginTop: '0.5rem', width: '100%', maxWidth: '240px' }}>
                            <div className="progress-bar-track" style={{ height: '4px' }}>
                              <div 
                                className="progress-bar-fill" 
                                style={{ width: `${Math.max(15, ((activeTask.variationsReady || 0) / 5) * 100)}%`, transition: 'width 0.4s ease' }} 
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, alignItems: 'center' }}>
                        {isTaskGenerating && (
                          <button
                            className="btn-secondary"
                            onClick={async () => {
                              await cancelGeneration(video.id);
                              await loadData();
                            }}
                            title="Cancel Generation"
                            style={{
                              padding: '0.5rem 0.75rem',
                              fontSize: '0.78rem',
                              gap: '0.3rem',
                              background: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              color: 'var(--status-fail-text)',
                              fontWeight: 700
                            }}
                          >
                            <X size={13} />
                            Cancel
                          </button>
                        )}

                        <button
                          className={isTaskGenerating ? "btn-secondary" : "btn-primary"}
                          onClick={() => navigate(`/master-generator/${video.id}`)}
                          style={{ padding: '0.5rem 0.95rem', fontSize: '0.82rem', gap: '0.35rem' }}
                        >
                          {isTaskGenerating ? (
                            <>
                              <Loader size={12} style={{ animation: 'spin 1.5s linear infinite' }} />
                              View Pipeline
                            </>
                          ) : isReady ? (
                            <>
                              <Sparkles size={13} />
                              AI Shorts
                            </>
                          ) : (
                            <>
                              <Wand size={13} />
                              Process
                            </>
                          )}
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
                  );
                })}
              </div>
            )}
          </div>

          {/* ── RIGHT: Upload ─────────────────────────────── */}
          <div>
            <div className="section-heading" style={{ marginBottom: '1rem' }}>
              <UploadCloud size={17} color="var(--indigo-600)" />
              Multi-Video Upload & Parallel Processing
            </div>

            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <label
                className={`upload-zone ${uploading ? 'uploading' : ''} ${isDragOver ? 'drag-over' : ''}`}
                style={{
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  border: isDragOver ? '2px dashed var(--indigo-600)' : '2px dashed var(--border-medium)',
                  background: isDragOver ? 'var(--indigo-50)' : 'var(--bg-elevated)',
                  transition: 'all 0.2s ease',
                  padding: '2rem 1.25rem'
                }}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
              >
                <UploadCloud size={40} color={isDragOver ? 'var(--indigo-600)' : 'var(--indigo-500)'} style={{ opacity: uploading ? 0.4 : 1, margin: '0 auto 0.75rem' }} />
                <div>
                  <p style={{ fontWeight: 800, fontSize: '0.98rem', color: 'var(--text-heading)', margin: '0 0 0.25rem' }}>
                    {uploading ? 'Uploading in Parallel…' : isDragOver ? 'Drop Multiple Videos Here' : 'Select or Drop Multiple Videos'}
                  </p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                    Upload 1, 3, 5+ videos at once (MP4, MOV, MKV, WebM)
                  </p>
                </div>
                <input
                  type="file"
                  multiple
                  accept="video/mp4,video/quicktime,video/x-matroska,video/webm,video/avi,video/*"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
              </label>

              {/* Automatic parallel processing indicator */}
              <div 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.6rem', 
                  marginTop: '1rem', 
                  padding: '0.75rem 0.9rem', 
                  borderRadius: 'var(--radius-sm)', 
                  background: 'var(--indigo-50)', 
                  border: '1px solid var(--indigo-200)'
                }}
              >
                <div style={{ color: 'var(--indigo-600)' }}>
                  <Zap size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--indigo-600)' }}>
                    ⚡ Automatic Parallel Backend Processing
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Videos are queued and processed automatically in the background on Celery
                  </div>
                </div>
              </div>

              {uploading && (
                <div style={{ marginTop: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{uploadingStatus || 'Uploading videos in parallel…'}</span>
                    <span style={{ fontWeight: 700, color: 'var(--indigo-600)' }}>{progress}%</span>
                  </div>
                  <div className="progress-bar-track">
                    <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}
            </div>

            {/* Parallel Features Callout */}
            <div className="glass-panel-sm" style={{ marginTop: '1rem', background: '#f8fafc', border: '1px solid var(--border-subtle)' }}>
              <p style={{ fontSize: '0.78rem', color: 'var(--indigo-600)', fontWeight: 700, marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Zap size={14} /> Parallel Processing Engine
              </p>
              <ul style={{ paddingLeft: '1rem', fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.8, margin: 0 }}>
                <li>Multi-threaded Celery worker runs up to <strong>4 video tasks simultaneously</strong></li>
                <li>Live floating widget tracks all video progress across tabs</li>
                <li>Each video receives 5 unique animated caption variations</li>
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
