import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, RefreshCw, Film, ArrowLeft } from 'lucide-react';
import { api } from '../api/client';
import SocialPublishingPanel from './SocialPublishingPanel';

const API_BASE = 'http://localhost:8000/api/v1';

const PIPELINE_STEPS = [
  { key: 'processing',   icon: '📦', label: 'Extracting Metadata'   },
  { key: 'transcribing', icon: '🎙️', label: 'Transcribing Audio'    },
  { key: 'analyzing',    icon: '🧠', label: 'AI Content Analysis'   },
  { key: 'generating',   icon: '🎬', label: 'Master AI Agent'       },
  { key: 'rendering',    icon: '✂️', label: 'Rendering Variations'  },
  { key: 'done',         icon: '✅', label: 'Complete!'              },
];

const STAGE_ORDER = PIPELINE_STEPS.map(s => s.key);

function StepIndicator({ stage }) {
  const currentIdx = STAGE_ORDER.indexOf(stage);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0', marginBottom: '2rem', flexWrap: 'wrap' }}>
      {PIPELINE_STEPS.map((step, i) => {
        const done    = i < currentIdx;
        const active  = i === currentIdx;
        return (
          <React.Fragment key={step.key}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.2rem',
                background: done   ? 'rgba(16,185,129,0.25)'
                          : active ? 'rgba(139,92,246,0.35)'
                          : 'rgba(255,255,255,0.05)',
                border: `2px solid ${done ? '#10b981' : active ? '#8b5cf6' : 'rgba(255,255,255,0.1)'}`,
                boxShadow: active ? '0 0 16px rgba(139,92,246,0.6)' : 'none',
                transition: 'all 0.4s ease',
              }}>
                {done ? '✓' : step.icon}
              </div>
              <span style={{ fontSize: '0.65rem', color: done ? '#10b981' : active ? '#a78bfa' : '#475569', fontWeight: active ? 700 : 400, textAlign: 'center', maxWidth: 70 }}>
                {step.label}
              </span>
            </div>
            {i < PIPELINE_STEPS.length - 1 && (
              <div style={{ flex: '1', minWidth: 16, maxWidth: 40, height: 2, background: done ? '#10b981' : 'rgba(255,255,255,0.08)', marginBottom: '1.6rem', transition: 'background 0.5s ease' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function VariationCard({ clip, index, onPublishClick, cacheBust }) {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef(null);

  const storagePath = (clip.storage_path || '').replace(/\\/g, '/');
  const relPath = storagePath.includes('uploads/') ? storagePath.substring(storagePath.indexOf('uploads/')) : storagePath;
  const url = `http://localhost:8000/${relPath}?t=${cacheBust}`;

  const personas = [
    { name: 'Viral Hook',   color: '#f43f5e', emoji: '🔥' },
    { name: 'Storyteller',  color: '#8b5cf6', emoji: '📖' },
    { name: 'Minimalist',   color: '#06b6d4', emoji: '🎯' },
    { name: 'Intense',      color: '#f97316', emoji: '⚡' },
    { name: 'AI Custom',    color: '#10b981', emoji: '🤖' },
  ];
  const persona = personas[index] || personas[4];

  return (
    <div className="glass-panel video-card" style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', top: 12, left: 12, zIndex: 10,
        background: `${persona.color}22`, border: `1px solid ${persona.color}66`,
        borderRadius: 20, padding: '4px 12px', fontSize: '0.75rem', fontWeight: 700, color: persona.color,
        backdropFilter: 'blur(8px)',
      }}>
        {persona.emoji} {persona.name}
      </div>

      <video
        ref={videoRef}
        src={url}
        controls
        loop
        playsInline
        style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover', background: '#000', display: 'block' }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />

      <div className="video-card-info" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <span className="video-card-title">{clip.title || `Variation ${index + 1}`}</span>
          <span style={{ fontSize: '0.75rem', color: '#aaa' }}>{clip.duration ? `${clip.duration.toFixed(1)}s` : ''}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
          <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
            <button
              onClick={() => onPublishClick(clip)}
              style={{
                flex: 1, color: '#c084fc', fontSize: '0.8rem', background: 'transparent',
                border: '1px solid rgba(167,139,250,0.4)', borderRadius: 6, padding: '6px 0',
                cursor: 'pointer', transition: 'all 0.2s', fontWeight: 'bold'
              }}
            >
              🚀 Publish
            </button>
          </div>
          <a
            href={url}
            download={`variation_${index + 1}.mp4`}
            style={{ display: 'block', width: '100%', color: '#fff', fontSize: '0.8rem', textDecoration: 'none', padding: '6px 0', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, transition: 'all 0.2s', textAlign: 'center' }}
          >
            ⬇ Download Video
          </a>
        </div>
      </div>
    </div>
  );
}

export default function MasterGeneratorPage() {
  const { videoId } = useParams();
  const navigate = useNavigate();

  const [page, setPage]           = useState('setup'); // 'setup' | 'generating' | 'rendering' | 'results'
  const [video, setVideo]         = useState(null);
  const [variations, setVariations] = useState([]);
  const [cacheBust, setCacheBust] = useState(Date.now());
  const [prompt, setPrompt]       = useState('');
  const [length, setLength]       = useState(60);
  
  // Translation & Dubbing states
  const [translateLanguage, setTranslateLanguage] = useState('none');
  const [dubVoice, setDubVoice] = useState(false);
  const [captionLanguage, setCaptionLanguage] = useState('translated');
  const [dubMixMode, setDubMixMode] = useState('replace');

  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [activePublishClip, setActivePublishClip] = useState(null);




  const intervalRef   = useRef(null);
  const timerRef      = useRef(null);
  const startTimeRef  = useRef(null);

  const MAX_POLLS = 720; // 60 min

  const loadVideoDetails = async () => {
    try {
      const allVideos = await api.getVideos();
      const currentVideo = allVideos.find(v => v.id === parseInt(videoId));
      if (!currentVideo) {
        navigate('/dashboard');
        return;
      }
      setVideo(currentVideo);

      // Fetch variations
      const varRes = await fetch(`${API_BASE}/videos/${videoId}/variations`);
      if (varRes.ok) {
        const varData = await varRes.json();
        setVariations(varData);
        if (varData?.length > 0 && currentVideo.status === 'completed') {
          setPage('results');
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadVideoDetails();
  }, [videoId]);

  useEffect(() => {
    if (page === 'generating') {
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsedSecs(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } else {
      clearInterval(timerRef.current);
      setElapsedSecs(0);
    }
    return () => clearInterval(timerRef.current);
  }, [page]);

  const formatElapsed = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}m ${sec.toString().padStart(2,'0')}s`;
  };

  const stopPolling = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  const startPolling = useCallback((vidId) => {
    let attempts = 0;
    intervalRef.current = setInterval(async () => {
      attempts++;
      if (attempts >= MAX_POLLS) {
        stopPolling();
        setPage('setup');
        alert('Generation exceeded 60 minutes. Check Celery log for errors.');
        return;
      }
      try {
        const statusRes = await fetch(`${API_BASE}/videos/${vidId}/status`);
        if (statusRes.ok) {
          const status = await statusRes.json();
          setPipelineStatus(status);
          if (status.is_done) {
            const varRes  = await fetch(`${API_BASE}/videos/${vidId}/variations`);
            const varData = await varRes.json();
            setVariations(varData);
            setCacheBust(Date.now());
            stopPolling();
            setPage('results');
            return;
          }
        }
        const varRes  = await fetch(`${API_BASE}/videos/${vidId}/variations`);
        const varData = await varRes.json();
        if (varData?.length > 0) {
          setVariations(varData);
          setCacheBust(Date.now());
        }
      } catch (e) { console.error('Polling error:', e); }
    }, 5000);
  }, [stopPolling]);

  const generate = async () => {
    if (!video) return;
    setVariations([]);
    setPipelineStatus(null);
    setPage('generating');
    try {
      await fetch(`${API_BASE}/videos/${video.id}/master-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          length: Number(length), 
          platform: 'youtube', 
          optional_prompt: prompt,
          translate_language: translateLanguage,
          dub_voice: dubVoice,
          caption_language: captionLanguage,
          dub_mix_mode: dubMixMode
        }),
      });
      startPolling(video.id);
    } catch (e) {
      console.error(e);
      alert('Failed to trigger generation');
      setPage('setup');
    }
  };

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  if (!video) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-dark)' }}>
        <p style={{ color: 'var(--text-muted)' }}>Loading AI agent details...</p>
      </div>
    );
  }

  // ─── Setup Mode ───
  if (page === 'setup') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{ minHeight: '100vh', color: '#fff', position: 'relative' }}
      >
        <div className="bg-glow" />
        <div className="container" style={{ maxWidth: 600, padding: '3rem 2rem' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button 
                onClick={() => navigate(`/project/${video.project_id}`)}
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
              >
                <ArrowLeft size={18} />
              </button>
              <div>
                <h1 style={{ margin: 0, fontSize: '1.8rem' }}>Master AI Generator</h1>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Trigger AI shorts generation for {video.original_filename}</p>
              </div>
            </div>

          </div>

          <div className="glass-panel" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            <h2>Configure AI Agent</h2>
            
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '1rem', 
              marginBottom: '1.5rem', 
              padding: '1rem', 
              background: 'rgba(16,185,129,0.08)', 
              border: '1px solid rgba(16,185,129,0.3)', 
              borderRadius: 10 
            }}>
              <span style={{ fontSize: '1.5rem' }}>🎬</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{video.original_filename}</div>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Ready for generation</div>
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#94a3b8' }}>Target Video Duration (Seconds)</label>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                {[15, 30, 60].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setLength(preset)}
                    style={{
                      flex: 1,
                      padding: '0.6rem',
                      background: length === preset ? 'rgba(139, 92, 246, 0.25)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${length === preset ? '#8b5cf6' : 'rgba(255,255,255,0.1)'}`,
                      borderRadius: '8px',
                      color: length === preset ? '#c084fc' : '#fff',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: length === preset ? 600 : 400,
                      transition: 'all 0.2s',
                    }}
                  >
                    {preset}s {preset === 60 ? ' (Recommended)' : ''}
                  </button>
                ))}
                <button
                  onClick={() => setLength(45)}
                  style={{
                    flex: 1,
                    padding: '0.6rem',
                    background: ![15, 30, 60].includes(length) ? 'rgba(139, 92, 246, 0.25)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${![15, 30, 60].includes(length) ? '#8b5cf6' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: '8px',
                    color: ![15, 30, 60].includes(length) ? '#c084fc' : '#fff',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: ![15, 30, 60].includes(length) ? 600 : 400,
                    transition: 'all 0.2s',
                  }}
                >
                  Custom
                </button>
              </div>
              {![15, 30, 60].includes(length) && (
                <input
                  type="number"
                  className="input-field"
                  min="5"
                  max="300"
                  value={length}
                  onChange={(e) => setLength(Math.max(5, Number(e.target.value)))}
                  placeholder="Enter duration in seconds"
                  style={{ marginTop: '0.5rem' }}
                />
              )}
            </div>

            <label htmlFor="prompt-input" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#94a3b8' }}>Optional AI Prompt</label>
            <input 
              id="prompt-input" 
              className="input-field" 
              type="text" 
              placeholder='e.g. "Make it extra energetic with dramatic music"' 
              value={prompt} 
              onChange={e => setPrompt(e.target.value)} 
            />

            {/* Translation & Dubbing section */}
            <div style={{ marginTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.5rem', paddingBottom: '0.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', marginBottom: '1rem' }}>🌐 Translation & AI Voice Dubbing</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Target Language</label>
                  <select 
                    className="input-field" 
                    value={translateLanguage} 
                    onChange={e => {
                      setTranslateLanguage(e.target.value);
                      if (e.target.value !== 'none' && captionLanguage === 'original') {
                        setCaptionLanguage('translated');
                      }
                    }}
                  >
                    <option value="none">None (No translation)</option>
                    <option value="en">English (en)</option>
                    <option value="ta">Tamil (ta)</option>
                    <option value="es">Spanish (es)</option>
                    <option value="fr">French (fr)</option>
                    <option value="de">German (de)</option>
                    <option value="it">Italian (it)</option>
                    <option value="pt">Portuguese (pt)</option>
                    <option value="hi">Hindi (hi)</option>
                    <option value="zh-cn">Chinese (zh-cn)</option>
                    <option value="ja">Japanese (ja)</option>
                    <option value="ko">Korean (ko)</option>
                    <option value="ru">Russian (ru)</option>
                    <option value="ar">Arabic (ar)</option>
                    <option value="tr">Turkish (tr)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Caption Language</label>
                  <select className="input-field" value={captionLanguage} onChange={e => setCaptionLanguage(e.target.value)}>
                    <option value="translated">Translated Target Language</option>
                    <option value="english">Common Language (English)</option>
                    <option value="original">Original Spoken Language</option>
                    <option value="none">No Captions</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.8rem 1rem', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)', marginBottom: dubVoice ? '1rem' : '0' }}>
                <div>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', display: 'block' }}>Dub Voice with AI Cloning</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Clone original voice to speak translated language.</span>
                </div>
                <input 
                  type="checkbox" 
                  checked={dubVoice} 
                  onChange={e => setDubVoice(e.target.checked)} 
                  disabled={translateLanguage === 'none'}
                  style={{ width: 18, height: 18, accentColor: '#8b5cf6', cursor: translateLanguage === 'none' ? 'not-allowed' : 'pointer' }}
                />
              </div>

              {dubVoice && (
                <div style={{ marginTop: '0.8rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Dubbing Mix Mode</label>
                  <select className="input-field" value={dubMixMode} onChange={e => setDubMixMode(e.target.value)}>
                    <option value="replace">Replace Original Voice</option>
                    <option value="mix">Mix & Duck Original</option>
                  </select>
                </div>
              )}
            </div>

            <button className="btn-neon" onClick={generate} style={{ width: '100%', marginTop: '1rem' }}>
              🚀 Generate AI Variation
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // ─── Manual Rendering Mode ───
  if (page === 'rendering') {
    const statusColor = {
      pending: '#f59e0b',
      rendering: '#8b5cf6',
      completed: '#10b981',
      failed: '#ef4444',
    }[renderingClip?.status] || '#94a3b8';

    const statusLabel = {
      pending: 'Queued — waiting for Celery worker...',
      rendering: 'Rendering your custom clip with FFmpeg...',
      completed: 'Render complete! Loading results...',
      failed: 'Render failed. Check Celery logs.',
    }[renderingClip?.status] || 'Processing...';

    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{ minHeight: '100vh', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <div className="bg-glow" />
        <div className="glass-panel" style={{ maxWidth: 480, width: '100%', margin: '2rem', textAlign: 'center', padding: '3rem 2rem', border: '1px solid rgba(139,92,246,0.25)' }}>
          
          {/* Animated ring */}
          <div style={{ position: 'relative', width: 96, height: 96, margin: '0 auto 1.5rem' }}>
            <svg width="96" height="96" viewBox="0 0 96 96" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="48" cy="48" r="40" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
              <circle
                cx="48" cy="48" r="40" fill="none"
                stroke={statusColor} strokeWidth="8"
                strokeDasharray={`${2 * Math.PI * 40}`}
                strokeDashoffset={renderingClip?.status === 'completed' ? 0 : renderingClip?.status === 'failed' ? 2 * Math.PI * 40 : 2 * Math.PI * 40 * 0.35}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.4s ease' }}
              />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>
              {renderingClip?.status === 'completed' ? '✓' : renderingClip?.status === 'failed' ? '✕' : '🎬'}
            </div>
          </div>

          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.4rem' }}>Rendering Custom Edit</h2>
          <div style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '1rem' }}>
            {renderingClip?.title}
          </div>

          <div style={{
            display: 'inline-block', padding: '0.4rem 1.2rem', borderRadius: 20,
            background: `${statusColor}18`, border: `1px solid ${statusColor}44`,
            color: statusColor, fontSize: '0.85rem', fontWeight: 600, marginBottom: '2rem'
          }}>
            {statusLabel}
          </div>

          {renderingClip?.status === 'failed' && (
            <div style={{ marginBottom: '1.5rem', padding: '0.75rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: '0.8rem', color: '#f87171' }}>
              Check the Celery worker log for details. You can retry from the editor.
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              onClick={() => { clearInterval(renderPollRef.current); setPage('results'); }}
              style={{ padding: '0.6rem 1.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600 }}
            >
              {renderingClip?.status === 'completed' || renderingClip?.status === 'failed' ? 'Back to Results' : 'Run in Background'}
            </button>

          </div>
        </div>
      </motion.div>
    );
  }

  // ─── Generating Mode ───
  if (page === 'generating') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{ minHeight: '100vh', color: '#fff', position: 'relative' }}
      >
        <div className="bg-glow" />
        <div className="container" style={{ maxWidth: 700, padding: '3rem 2rem' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2.5rem' }}>
            <button 
              onClick={() => { stopPolling(); setPage('setup'); }}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'white',
                cursor: 'pointer',
                padding: '0.6rem',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.8rem' }}>Processing Pipeline</h1>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Running master agent edits...</p>
            </div>
          </div>

          <div className="glass-panel" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            <StepIndicator stage={pipelineStatus?.stage || 'processing'} />

            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <div style={{ fontSize: '1.3rem', color: '#a78bfa', fontWeight: 700, marginBottom: '0.5rem' }} className="processing-pulse">
                {pipelineStatus?.stage_label || '⏳ Starting pipeline...'}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                Elapsed: {formatElapsed(elapsedSecs)} &nbsp;·&nbsp; Polling every 5s
              </div>
            </div>

            {variations.length > 0 && (
              <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10 }}>
                <div style={{ color: '#10b981', fontWeight: 600, marginBottom: '0.5rem' }}>
                  ✅ {variations.length} variation(s) ready so far
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Still processing the remaining ones…</div>
              </div>
            )}

            {/* Stage breakdown */}
            <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: '1rem', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justify: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: '#94a3b8' }}>Video processing</span>
                <span style={{ 
                  color: pipelineStatus?.video_status === 'completed' ? '#10b981' : 
                         pipelineStatus?.video_status === 'failed' ? '#ef4444' : 
                         pipelineStatus?.video_status === 'pending' ? '#a78bfa' : '#f59e0b' 
                }}>
                  {pipelineStatus?.video_status === 'completed' ? '✓ Done' : 
                   pipelineStatus?.video_status === 'failed' ? '✕ Failed' : 
                   pipelineStatus?.video_status === 'pending' ? '⏳ Pending' : '⟳ Running'}
                </span>
              </div>
              <div style={{ display: 'flex', justify: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: '#94a3b8' }}>Transcription (Whisper)</span>
                <span style={{ 
                  color: pipelineStatus?.transcription_status === 'completed' ? '#10b981' : 
                         pipelineStatus?.transcription_status === 'failed' ? '#ef4444' : 
                         pipelineStatus?.transcription_status === 'pending' ? '#a78bfa' : 
                         pipelineStatus?.transcription_status === 'processing' ? '#f59e0b' : '#475569' 
                }}>
                  {pipelineStatus?.transcription_status === 'completed' ? '✓ Done' : 
                   pipelineStatus?.transcription_status === 'failed' ? '✕ Failed' : 
                   pipelineStatus?.transcription_status === 'pending' ? '⏳ Pending' : 
                   pipelineStatus?.transcription_status === 'processing' ? '⟳ Running' : '— Pending'}
                </span>
              </div>
              <div style={{ display: 'flex', justify: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: '#94a3b8' }}>Content Analysis (Ollama)</span>
                <span style={{ 
                  color: pipelineStatus?.analysis_status === 'completed' ? '#10b981' : 
                         pipelineStatus?.analysis_status === 'failed' ? '#ef4444' : 
                         pipelineStatus?.analysis_status === 'pending' ? '#a78bfa' : 
                         pipelineStatus?.analysis_status === 'processing' ? '#f59e0b' : '#475569' 
                }}>
                  {pipelineStatus?.analysis_status === 'completed' ? '✓ Done' : 
                   pipelineStatus?.analysis_status === 'failed' ? '✕ Failed' : 
                   pipelineStatus?.analysis_status === 'pending' ? '⏳ Pending' : 
                   pipelineStatus?.analysis_status === 'processing' ? '⟳ Running' : '— Pending'}
                </span>
              </div>
              <div style={{ display: 'flex', justify: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Variations rendered</span>
                <span style={{ color: '#a78bfa' }}>{pipelineStatus?.variations_ready || 0} / 1</span>
              </div>
            </div>

            <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#fbbf24', marginBottom: '1.5rem' }}>
              ⏱ This pipeline can take <strong>a few minutes</strong> depending on video length.<br />
              Ollama AI analysis is the slowest step. <strong>Do not close this tab.</strong>
            </div>

            <button 
              onClick={() => { stopPolling(); setPage('setup'); }} 
              style={{ width: '100%', padding: '0.75rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, color: '#f87171', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem' }}
            >
              ✕ Cancel Generation
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // ─── Results Mode ───
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
        <div style={{ display: 'flex', justify: 'space-between', alignItems: 'center', marginBottom: '3rem', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button 
              onClick={() => navigate(`/project/${video.project_id}`)}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'white',
                cursor: 'pointer',
                padding: '0.6rem',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 style={{ margin: 0, fontSize: '2rem' }}>AI Variation Results</h1>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                {variations.length} short-form clip parts generated from <em>{video.original_filename}</em>
              </p>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button className="btn-neon" onClick={() => setPage('setup')} style={{ fontSize: '0.9rem', padding: '0.7rem 1.5rem' }}>
              ＋ New Generation
            </button>
          </div>
        </div>

        {/* Video grid */}
        {variations.length > 0 ? (
          <div className="variations-grid">
            {variations.map((v, i) => (
              <VariationCard 
                key={v.id} 
                clip={v} 
                index={i} 
                cacheBust={cacheBust}
                onPublishClick={(clip) => {
                  setActivePublishClip(clip);
                }}
              />
            ))}
          </div>
        ) : (
          <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎬</div>
            <p>No variations found yet. The pipeline may still be running.</p>
            <button onClick={() => setPage('generating')} style={{ marginTop: '1rem' }} className="btn-neon">
              Check Progress
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {activePublishClip && (
          <div style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 100, padding: '2rem', backdropFilter: 'blur(4px)'
          }}>
            <div style={{ maxWidth: 800, width: '100%' }}>
              <SocialPublishingPanel 
                clip={activePublishClip} 
                onClose={() => setActivePublishClip(null)} 
              />
            </div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
