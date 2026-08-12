import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Film, Video, Zap, CheckCircle, Loader, Clock, Globe, Mic, Download, RefreshCw, X, Share2, Music, Sparkles, Maximize2 } from 'lucide-react';
import { api } from '../api/client';
import { useGeneration } from '../context/GenerationContext';
import SocialPublishingPanel from './SocialPublishingPanel';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'https://localhost:8000';
const API_BASE = `${SERVER_URL}/api/v1`;

const PIPELINE_STEPS = [
  { key: 'processing', label: 'Extracting Metadata' },
  { key: 'transcribing', label: 'Transcribing Audio' },
  { key: 'analyzing', label: 'AI Content Analysis' },
  { key: 'highlighting', label: 'Highlight & Framing' },
  { key: 'rendering', label: 'Rendering Variations' },
  { key: 'done', label: 'Complete' },
];
const STAGE_ORDER = PIPELINE_STEPS.map(s => s.key);

const LANGUAGES = [
  { code: 'en', name: 'English' }, { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' }, { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' }, { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' }, { code: 'zh-cn', name: 'Chinese (Simplified)' },
  { code: 'ja', name: 'Japanese' }, { code: 'ko', name: 'Korean' },
  { code: 'ar', name: 'Arabic' }, { code: 'tr', name: 'Turkish' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ta', name: 'Tamil (Colloquial)' },
  { code: 'ta-tanglish', name: 'Tamil (Tanglish)' },
  { code: 'te', name: 'Telugu' }, { code: 'ml', name: 'Malayalam' },
  { code: 'kn', name: 'Kannada' }, { code: 'mr', name: 'Marathi' },
  { code: 'gu', name: 'Gujarati' }, { code: 'bn', name: 'Bengali' },
  { code: 'pa', name: 'Punjabi' }, { code: 'ur', name: 'Urdu' },
  { code: 'vi', name: 'Vietnamese' }, { code: 'th', name: 'Thai' },
  { code: 'id', name: 'Indonesian' }, { code: 'fil', name: 'Filipino' },
  { code: 'nl', name: 'Dutch' }, { code: 'pl', name: 'Polish' },
  { code: 'uk', name: 'Ukrainian' }, { code: 'sv', name: 'Swedish' },
  { code: 'no', name: 'Norwegian' }, { code: 'da', name: 'Danish' },
  { code: 'fi', name: 'Finnish' }, { code: 'el', name: 'Greek' },
  { code: 'he', name: 'Hebrew' }, { code: 'ro', name: 'Romanian' },
  { code: 'cs', name: 'Czech' }, { code: 'hu', name: 'Hungarian' },
];

/* ---- Step indicator ---- */
function StepIndicator({ stage }) {
  let mappedStage = stage;
  if (stage === 'cropping' || stage === 'generating') mappedStage = 'highlighting';
  const currentIdx = Math.max(0, STAGE_ORDER.indexOf(mappedStage));
  const isFinished = stage === 'done' || stage === 'completed';
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: '2rem', flexWrap: 'wrap' }}>
      {PIPELINE_STEPS.map((step, i) => {
        const done = i < currentIdx || (isFinished && i <= currentIdx);
        const active = i === currentIdx && !isFinished;
        return (
          <React.Fragment key={step.key}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.8rem', fontWeight: 800,
                background: done ? 'var(--status-done-bg)' : active ? 'var(--indigo-50)' : 'var(--bg-inset)',
                border: `2px solid ${done ? 'var(--status-done-text)' : active ? 'var(--indigo-600)' : 'var(--border-medium)'}`,
                boxShadow: active ? '0 0 0 4px rgba(79,70,229,0.12)' : 'none',
                color: done ? 'var(--status-done-text)' : active ? 'var(--indigo-600)' : 'var(--text-faint)',
                transition: 'all 0.4s ease',
              }}>
                {done ? <CheckCircle size={16} /> : active ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}>
                    <Loader size={16} />
                  </motion.div>
                ) : i + 1}
              </div>
              <span style={{ fontSize: '0.6rem', fontWeight: active || done ? 700 : 400, color: done ? 'var(--status-done-text)' : active ? 'var(--indigo-600)' : 'var(--text-faint)', textAlign: 'center', maxWidth: 64, lineHeight: 1.3 }}>
                {step.label}
              </span>
            </div>
            {i < PIPELINE_STEPS.length - 1 && (
              <div style={{ flex: '1', minWidth: 12, maxWidth: 36, height: 2, background: done ? 'var(--status-done-text)' : 'var(--border-subtle)', marginBottom: '1.4rem', transition: 'background 0.5s ease' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ---- Variation card ---- */
function VariationCard({ clip, index, onPublishClick, cacheBust }) {
  const storagePath = (clip.storage_path || '').replace(/\\/g, '/');
  const relPath = storagePath.includes('uploads/') ? storagePath.substring(storagePath.indexOf('uploads/')) : storagePath;
  const url = `${SERVER_URL}/${relPath}?t=${cacheBust}`;

  const personas = [
    { name: 'Viral Pop Bounce', color: '#f43f5e', bg: '#fff1f2', icon: '🔥' },
    { name: 'Karaoke Flow Sweep', color: '#6366f1', bg: '#eef2ff', icon: '🎤' },
    { name: 'Cinematic Smooth Fade', color: '#0284c7', bg: '#f0f9ff', icon: '🎬' },
    { name: 'Boxed Pill Highlight', color: '#ea580c', bg: '#fff7ed', icon: '🏷️' },
    { name: 'Neon Pulse Glow', color: '#10b981', bg: '#ecfdf5', icon: '✨' },
  ];
  
  let persona = personas[index % personas.length];
  if (clip.title) {
    const titleLower = clip.title.toLowerCase();
    if (titleLower.includes('pop') || titleLower.includes('bounce') || titleLower.includes('viral')) persona = personas[0];
    else if (titleLower.includes('karaoke') || titleLower.includes('sweep') || titleLower.includes('flow')) persona = personas[1];
    else if (titleLower.includes('cinematic') || titleLower.includes('fade') || titleLower.includes('minimalist')) persona = personas[2];
    else if (titleLower.includes('boxed') || titleLower.includes('pill') || titleLower.includes('tag')) persona = personas[3];
    else if (titleLower.includes('neon') || titleLower.includes('pulse') || titleLower.includes('glow')) persona = personas[4];
  }

  return (
    <div className="video-card" style={{ position: 'relative' }}>
      {/* Persona badge */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, background: persona.bg, border: `1px solid ${persona.color}44`, borderRadius: 'var(--radius-full)', padding: '4px 10px', fontSize: '0.72rem', fontWeight: 800, color: persona.color, backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
        <span>{persona.icon}</span> {persona.name}
      </div>

      <video src={url} controls loop playsInline style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover', background: '#000', display: 'block' }} />

      <div className="video-card-info" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="video-card-title">{clip.title || `Variation ${index + 1}`}</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{clip.duration ? `${clip.duration.toFixed(1)}s` : ''}</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <a
            href={url}
            download={`variation_${index + 1}.mp4`}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', color: 'var(--text-heading)', fontSize: '0.8rem', textDecoration: 'none', padding: '0.5rem', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-sm)', transition: 'all 0.2s', background: 'var(--bg-surface)', fontWeight: 600 }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-dark)'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'var(--accent-dark)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.color = 'var(--text-heading)'; e.currentTarget.style.borderColor = 'var(--border-medium)'; }}
          >
            <Download size={13} /> Download
          </a>
          <button
            onClick={() => onPublishClick(clip)}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', color: '#fff', fontSize: '0.8rem', padding: '0.5rem', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'all 0.2s', background: 'var(--indigo-600)', fontWeight: 600 }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--indigo-700)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--indigo-600)'; }}
          >
            <Share2 size={13} /> Upload
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   MAIN PAGE
   ============================================================ */
export default function MasterGeneratorPage() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const { startTracking, stopTracking, cancelGeneration: cancelGenContext, activeTasks } = useGeneration();

  const [page, setPage] = useState('setup');
  const [video, setVideo] = useState(null);
  const [variations, setVariations] = useState([]);
  const [cacheBust, setCacheBust] = useState(Date.now());
  const [prompt, setPrompt] = useState('');
  const [length, setLength] = useState(60);
  const [audioTheme, setAudioTheme] = useState('auto');
  const [translateLanguage, setTranslateLang] = useState('none');
  const [dubVoice, setDubVoice] = useState(false);
  const [speakerGender, setSpeakerGender] = useState('female');
  const [captionLanguage, setCaptionLang] = useState('original');
  const [dubMixMode, setDubMixMode] = useState('replace');
  const [framingMode, setFramingMode] = useState('fit_blur');
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [activePublishClip, setActivePublishClip] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const intervalRef = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const MAX_POLLS = 720;

  const loadVideoDetails = async () => {
    try {
      const allVideos = await api.getVideos();
      const current = allVideos.find(v => v.id === parseInt(videoId));
      if (!current) { navigate('/dashboard'); return; }
      setVideo(current);
      
      const varRes = await fetch(`${API_BASE}/videos/${videoId}/variations`);
      if (varRes.ok) {
        const varData = await varRes.json();
        setVariations(varData);
        if (varData?.length >= 5) {
          setPage('results');
          return;
        }
      }

      // Check if this video is actively generating shorts (explicitly tracked or running AI steps)
      const isShortsGenerating =
        activeTasks.some(t => t.videoId === parseInt(videoId)) ||
        current.transcription_status === 'processing' ||
        current.analysis_status === 'processing' ||
        current.highlight_status === 'processing' ||
        current.crop_status === 'processing';

      if (isShortsGenerating) {
        setPage('generating');
        startPolling(videoId);
      } else {
        setPage('setup');
      }
    } catch (e) { console.error(e); }
  };

  // When on setup page and raw video is still extracting metadata, poll until ready
  useEffect(() => {
    if (page === 'setup' && video?.status === 'processing') {
      const interval = setInterval(async () => {
        try {
          const allVideos = await api.getVideos();
          const current = allVideos.find(v => v.id === parseInt(videoId));
          if (current) {
            setVideo(current);
            if (current.status !== 'processing') {
              clearInterval(interval);
            }
          }
        } catch (e) {
          console.error(e);
        }
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [page, video?.status, videoId]);

  useEffect(() => { loadVideoDetails(); }, [videoId]);

  useEffect(() => {
    if (page === 'generating') {
      const activeTask = activeTasks.find(t => t.videoId === parseInt(videoId));
      const baseStart = activeTask?.startedAt || startTimeRef.current || Date.now();
      startTimeRef.current = baseStart;
      setElapsedSecs(Math.max(0, Math.floor((Date.now() - baseStart) / 1000)));

      timerRef.current = setInterval(() => {
        setElapsedSecs(Math.max(0, Math.floor((Date.now() - startTimeRef.current) / 1000)));
      }, 1000);
    } else {
      clearInterval(timerRef.current);
      setElapsedSecs(0);
      setIsGenerating(false);
    }
    return () => clearInterval(timerRef.current);
  }, [page, videoId, activeTasks]);

  const formatElapsed = s => `${Math.floor(s / 60)}m ${(s % 60).toString().padStart(2, '0')}s`;

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startPolling = useCallback((targetVideoId) => {
    stopPolling();
    let pollCount = 0;

    const doPoll = async () => {
      pollCount++;
      if (pollCount > MAX_POLLS) { stopPolling(); return; }
      try {
        const res = await fetch(`${API_BASE}/videos/${targetVideoId}/status`);
        if (res.ok) {
          const data = await res.json();
          setPipelineStatus(data);
          if (data.is_done || data.is_complete || data.stage === 'done' || data.stage === 'completed' || (data.variations_ready >= 5 && data.variations_ready === data.variations_total)) {
            stopPolling();
            stopTracking(targetVideoId);
            const varRes = await fetch(`${API_BASE}/videos/${targetVideoId}/variations`);
            if (varRes.ok) {
              const vd = await varRes.json();
              if (vd?.length) setVariations(vd);
              setCacheBust(Date.now());
              setPage('results');
            }
            return;
          }
        }
        const varRes = await fetch(`${API_BASE}/videos/${targetVideoId}/variations`);
        if (varRes.ok) {
          const vd = await varRes.json();
          if (vd?.length) {
            setVariations(vd);
            setCacheBust(Date.now());
            if (vd.length >= 5) {
              stopPolling();
              stopTracking(targetVideoId);
              setPage('results');
              return;
            }
          }
        }
      } catch (e) {
        console.error('Poll error', e);
      }
    };

    doPoll();
    intervalRef.current = setInterval(doPoll, 2500);
  }, [stopPolling, stopTracking]);

  const generate = async () => {
    if (!video || isGenerating) return;
    setIsGenerating(true);
    setVariations([]); setPipelineStatus(null); setPage('generating');
    try {
      // Register with global background tracking context so it continues even if user changes page
      startTracking(video.id, video.original_filename);

      const res = await fetch(`${API_BASE}/videos/${video.id}/master-generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          length: Number(length),
          platform: 'youtube',
          optional_prompt: prompt,
          audio_theme: audioTheme,
          translate_language: translateLanguage,
          dub_voice: Boolean(dubVoice && translateLanguage !== 'none'),
          speaker_gender: speakerGender,
          caption_language: translateLanguage === 'none' ? 'original' : captionLanguage,
          dub_mix_mode: dubMixMode,
          framing_mode: framingMode
        }),
      });
      if (!res.ok) {
        throw new Error('Generation failed');
      }
      startPolling(video.id);
    } catch (e) {
      console.error(e);
      alert('Failed to trigger generation');
      stopTracking(video.id);
      setPage('setup');
      setIsGenerating(false);
    }
  };

  const handleCancelGeneration = async () => {
    setIsCancelling(true);
    stopPolling();
    setPipelineStatus(null);
    setIsGenerating(false);
    setPage('setup');
    try {
      await cancelGenContext(video.id);
    } catch (e) {
      console.error('Error cancelling generation:', e);
    } finally {
      setIsCancelling(false);
    }
  };

  useEffect(() => () => stopPolling(), [stopPolling]);

  if (!video) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-surface)' }}>
      <p style={{ color: 'var(--text-muted)' }}>Loading AI agent…</p>
    </div>
  );

  /* shared status rows for generating page */
  const statusRow = (label, status) => {
    const colors = { completed: 'var(--status-done-text)', failed: 'var(--status-fail-text)', pending: 'var(--status-pend-text)', processing: 'var(--status-run-text)' };
    const texts = { completed: 'Done', failed: 'Failed', pending: 'Pending', processing: 'Running' };
    return (
      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: colors[status] || 'var(--text-faint)' }}>{texts[status] || 'Pending'}</span>
      </div>
    );
  };

  /* ── SHARED NAV ──────────────────────────────────────── */
  const AppNav = ({ extra } = {}) => (
    <nav className="app-nav">
      <button className="app-nav-brand" onClick={() => navigate('/')}>
        <span className="app-nav-logo"><Video size={16} /></span>
        Harvest AI
      </button>
      <div className="app-nav-sep" />
      <div className="app-nav-breadcrumb">
        <button onClick={() => navigate(`/project/${video.project_id}`)} style={{ background: 'none', border: 'none', color: 'var(--indigo-600)', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer', padding: 0 }}>
          Project
        </button>
        <span style={{ color: 'var(--border-strong)' }}>/</span>
        <strong>AI Shorts Generator</strong>
      </div>
      {extra && <div className="app-nav-actions">{extra}</div>}
    </nav>
  );

  /* ══════════════════════════════════════════════════════
     SETUP PAGE
     ══════════════════════════════════════════════════════ */
  if (page === 'setup') {
    return (
      <div className="page-shell">
        <AppNav />
        <motion.div
          className="page-content"
          style={{ maxWidth: 640 }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="page-header">
            <button className="btn-icon" onClick={() => navigate(`/project/${video.project_id}`)}>
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 className="page-title">Master AI Generator</h1>
              <p className="page-subtitle">Generate 5 distinct animated caption short-form variations from <em>{video.original_filename}</em></p>
            </div>
          </div>

          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Source file info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.9rem 1.1rem', background: video.status === 'processing' ? 'var(--indigo-50)' : 'var(--status-done-bg)', border: `1px solid ${video.status === 'processing' ? 'var(--indigo-100)' : 'var(--status-done-border)'}`, borderRadius: 'var(--radius-md)' }}>
              <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-subtle)' }}>
                <Film size={20} color={video.status === 'processing' ? 'var(--indigo-600)' : 'var(--status-done-text)'} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-heading)' }}>{video.original_filename}</div>
                <div style={{ fontSize: '0.75rem', color: video.status === 'processing' ? 'var(--indigo-600)' : 'var(--status-done-text)', fontWeight: 600 }}>
                  {video.status === 'processing'
                    ? 'Extracting video metadata… Ready in moments'
                    : `Ready to generate 5 animated caption variations with live Music API ${video.duration ? `(${Math.round(video.duration)}s)` : ''}`}
                </div>
              </div>
            </div>

            {/* Feature Highlights Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
              <div style={{ padding: '0.6rem 0.8rem', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <strong style={{ color: 'var(--indigo-600)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.2rem' }}>
                  <Sparkles size={13} /> 5 Animated Caption Styles
                </strong>
                Viral Pop, Karaoke Flow, Cinematic Fade, Boxed Pill & Neon Pulse.
              </div>
              <div style={{ padding: '0.6rem 0.8rem', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <strong style={{ color: 'var(--indigo-600)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.2rem' }}>
                  <Music size={13} /> Live Music API
                </strong>
                Streams songs matching your chosen theme from open Music API.
              </div>
            </div>

            {/* Audio & Music Theme Selection */}
            <div>
              <label htmlFor="audio-theme-select" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-heading)' }}>
                <Music size={15} color="var(--indigo-600)" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.35rem' }} />
                Audio & Music Theme
              </label>
              <select
                id="audio-theme-select"
                className="input-field"
                value={audioTheme}
                onChange={e => setAudioTheme(e.target.value)}
                style={{ fontWeight: 600 }}
              >
                <option value="auto">✨ Auto (AI Matches Video Content)</option>
                <option value="upbeat">🔥 Upbeat & Energetic (Dance / Pop / Party)</option>
                <option value="cinematic">🎬 Cinematic & Epic (Orchestral / Film / Drama)</option>
                <option value="lofi">☕ Lofi & Chill (Study / Relax / Cozy)</option>
                <option value="gaming">🎮 Gaming & Electronic (Future Bass / Synth / Action)</option>
                <option value="hiphop">🎤 Hip-Hop Beats (Groove / Trap / Urban)</option>
                <option value="suspenseful">⚡ Suspense & Dramatic (Dark / Mystery / Thriller)</option>
                <option value="ambient">🌿 Ambient & Peaceful (Atmospheric / Nature)</option>
                <option value="rock">🎸 Rock & High Energy (Guitar / Driving)</option>
                <option value="none">❌ None (No Music / Clean Original Audio)</option>
              </select>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                {audioTheme === 'auto'
                  ? 'AI will automatically detect the video topic and select matching songs from the Music API.'
                  : audioTheme === 'none'
                  ? 'No music will be added. Original audio is preserved cleanly.'
                  : `Music API will search and download ${audioTheme} songs for all variations.`}
              </div>
            </div>

            {/* Duration presets */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                Target Video Duration
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
                {[15, 30, 60].map(preset => (
                  <button
                    key={preset}
                    onClick={() => setLength(preset)}
                    style={{ flex: 1, padding: '0.6rem', borderRadius: 'var(--radius-md)', border: `1.5px solid ${length === preset ? 'var(--indigo-600)' : 'var(--border-medium)'}`, background: length === preset ? 'var(--indigo-50)' : 'var(--bg-elevated)', color: length === preset ? 'var(--indigo-600)' : 'var(--text-heading)', fontWeight: length === preset ? 800 : 500, fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s' }}
                  >
                    {preset}s {preset === 60 ? '★' : ''}
                  </button>
                ))}
                <button
                  onClick={() => setLength(45)}
                  style={{ flex: 1, padding: '0.6rem', borderRadius: 'var(--radius-md)', border: `1.5px solid ${![15, 30, 60].includes(length) ? 'var(--indigo-600)' : 'var(--border-medium)'}`, background: ![15, 30, 60].includes(length) ? 'var(--indigo-50)' : 'var(--bg-elevated)', color: ![15, 30, 60].includes(length) ? 'var(--indigo-600)' : 'var(--text-heading)', fontWeight: ![15, 30, 60].includes(length) ? 800 : 500, fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  Custom
                </button>
              </div>
              {![15, 30, 60].includes(length) && (
                <input type="number" className="input-field" min="5" max="300" value={length} onChange={e => setLength(Math.max(5, Number(e.target.value)))} placeholder="Duration in seconds" />
              )}
            </div>

            {/* Video Framing & Aspect Ratio Mode */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-heading)' }}>
                <Maximize2 size={15} color="var(--indigo-600)" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.35rem' }} />
                Framing & Aspect Ratio (16:9 to 9:16 Shorts)
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setFramingMode('fit_blur')}
                  style={{
                    padding: '0.75rem 0.5rem', borderRadius: 'var(--radius-md)',
                    border: `1.5px solid ${framingMode === 'fit_blur' ? 'var(--indigo-600)' : 'var(--border-medium)'}`,
                    background: framingMode === 'fit_blur' ? 'var(--indigo-50)' : 'var(--bg-elevated)',
                    color: framingMode === 'fit_blur' ? 'var(--indigo-600)' : 'var(--text-heading)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem',
                    cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center'
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: '0.82rem' }}>🖼️ Fit Full Video</div>
                  <div style={{ fontSize: '0.68rem', color: framingMode === 'fit_blur' ? 'var(--indigo-600)' : 'var(--text-muted)' }}>Blurred Canvas (No Crop)</div>
                </button>

                <button
                  type="button"
                  onClick={() => setFramingMode('fit_black')}
                  style={{
                    padding: '0.75rem 0.5rem', borderRadius: 'var(--radius-md)',
                    border: `1.5px solid ${framingMode === 'fit_black' ? 'var(--indigo-600)' : 'var(--border-medium)'}`,
                    background: framingMode === 'fit_black' ? 'var(--indigo-50)' : 'var(--bg-elevated)',
                    color: framingMode === 'fit_black' ? 'var(--indigo-600)' : 'var(--text-heading)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem',
                    cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center'
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: '0.82rem' }}>⬛ Black Letterbox</div>
                  <div style={{ fontSize: '0.68rem', color: framingMode === 'fit_black' ? 'var(--indigo-600)' : 'var(--text-muted)' }}>Fit Full (Black Bars)</div>
                </button>

                <button
                  type="button"
                  onClick={() => setFramingMode('smart_crop')}
                  style={{
                    padding: '0.75rem 0.5rem', borderRadius: 'var(--radius-md)',
                    border: `1.5px solid ${framingMode === 'smart_crop' ? 'var(--indigo-600)' : 'var(--border-medium)'}`,
                    background: framingMode === 'smart_crop' ? 'var(--indigo-50)' : 'var(--bg-elevated)',
                    color: framingMode === 'smart_crop' ? 'var(--indigo-600)' : 'var(--text-heading)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem',
                    cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center'
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: '0.82rem' }}>🔍 Smart Crop</div>
                  <div style={{ fontSize: '0.68rem', color: framingMode === 'smart_crop' ? 'var(--indigo-600)' : 'var(--text-muted)' }}>AI Subject Tracking</div>
                </button>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {framingMode === 'fit_blur'
                  ? '✨ Complete 16:9 frame is scaled and centered inside 9:16 portrait with a stylish frosted blurred background. Zero visual cropping.'
                  : framingMode === 'fit_black'
                  ? '⬛ Complete 16:9 frame is centered on a clean black canvas without cropping.'
                  : '🔍 9:16 crop window dynamically follows the primary subject/speaker across the 16:9 frame.'}
              </div>
            </div>

            {/* Prompt */}
            <div>
              <label htmlFor="prompt-input" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                Optional AI Prompt
              </label>
              <input id="prompt-input" className="input-field" type="text" placeholder='e.g. "Focus on the funniest moment with bold captions"' value={prompt} onChange={e => setPrompt(e.target.value)} />
            </div>

            {/* Translation & AI Neural Voice Dubbing Studio */}
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', background: 'var(--indigo-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Mic size={16} color="var(--indigo-600)" />
                  </div>
                  <div>
                    <span style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-heading)' }}>AI Voice Dubbing & Translation</span>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Studio-grade Neural AI voices across 40+ languages</div>
                  </div>
                </div>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--indigo-600)', background: 'var(--indigo-50)', border: '1px solid var(--indigo-100)', padding: '3px 8px', borderRadius: 'var(--radius-full)' }}>
                  Edge-TTS Neural
                </span>
              </div>

              {/* Target Language Selection */}
              <div style={{ marginBottom: '0.9rem' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-heading)', marginBottom: '0.4rem' }}>
                  Target Language
                </label>
                
                {/* Quick select language pills */}
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                  {[
                    { code: 'none', label: 'Original' },
                    { code: 'en', label: '🇬🇧 English' },
                    { code: 'ta', label: '🇮🇳 Tamil' },
                    { code: 'hi', label: '🇮🇳 Hindi' },
                    { code: 'te', label: '🇮🇳 Telugu' },
                    { code: 'es', label: '🇪🇸 Spanish' },
                    { code: 'fr', label: '🇫🇷 French' },
                    { code: 'ja', label: '🇯🇵 Japanese' },
                  ].map(item => (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => {
                        if (item.code === 'none') {
                          setTranslateLang('none');
                          setCaptionLang('original');
                          setDubVoice(false);
                        } else {
                          setTranslateLang(item.code);
                          setCaptionLang('translated');
                          setDubVoice(true);
                        }
                      }}
                      style={{
                        padding: '4px 9px',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.72rem',
                        fontWeight: translateLanguage === item.code ? 700 : 500,
                        border: `1px solid ${translateLanguage === item.code ? 'var(--indigo-600)' : 'var(--border-medium)'}`,
                        background: translateLanguage === item.code ? 'var(--indigo-50)' : 'var(--bg-surface)',
                        color: translateLanguage === item.code ? 'var(--indigo-600)' : 'var(--text-heading)',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <select
                  className="input-field"
                  value={translateLanguage}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === 'none') {
                      setTranslateLang('none');
                      setCaptionLang('original');
                      setDubVoice(false);
                    } else {
                      setTranslateLang(val);
                      setCaptionLang('translated');
                      setDubVoice(true);
                    }
                  }}
                  style={{ fontWeight: 600 }}
                >
                  <option value="none">🌐 None (Keep Original Language & Voice)</option>
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                </select>
              </div>

              {/* Dubbing Activation Toggle */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.85rem 1rem',
                background: (dubVoice && translateLanguage !== 'none') ? 'var(--indigo-50)' : 'var(--bg-surface)',
                borderRadius: 'var(--radius-md)',
                border: `1.5px solid ${(dubVoice && translateLanguage !== 'none') ? 'var(--indigo-600)' : 'var(--border-subtle)'}`,
                marginBottom: '0.9rem',
                transition: 'all 0.25s'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: (dubVoice && translateLanguage !== 'none') ? 'var(--indigo-600)' : 'var(--bg-inset)',
                    color: (dubVoice && translateLanguage !== 'none') ? '#fff' : 'var(--text-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <Mic size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.86rem', fontWeight: 800, color: (dubVoice && translateLanguage !== 'none') ? 'var(--indigo-900)' : 'var(--text-heading)' }}>
                      Dub Audio with Neural Voice
                    </div>
                    <div style={{ fontSize: '0.72rem', color: (dubVoice && translateLanguage !== 'none') ? 'var(--indigo-600)' : 'var(--text-muted)' }}>
                      {(dubVoice && translateLanguage !== 'none') ? 'Replaces or blends speaker audio with human-like AI dubbing' : 'Keep original voice or select a language to dub'}
                    </div>
                  </div>
                </div>

                <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={dubVoice && translateLanguage !== 'none'}
                    onChange={e => {
                      const enabled = e.target.checked;
                      setDubVoice(enabled);
                      if (enabled && translateLanguage === 'none') {
                        setTranslateLang('en');
                        setCaptionLang('translated');
                      } else if (!enabled) {
                        setTranslateLang('none');
                        setCaptionLang('original');
                      }
                    }}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span style={{
                    position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                    background: (dubVoice && translateLanguage !== 'none') ? 'var(--indigo-600)' : 'var(--border-medium)',
                    borderRadius: 24, transition: '0.2s',
                    boxShadow: (dubVoice && translateLanguage !== 'none') ? '0 0 8px rgba(79,70,229,0.35)' : 'none'
                  }}>
                    <span style={{
                      position: 'absolute', height: 18, width: 18, left: (dubVoice && translateLanguage !== 'none') ? 23 : 3, bottom: 3,
                      background: '#fff', borderRadius: '50%', transition: '0.2s'
                    }} />
                  </span>
                </label>
              </div>

              {/* Extended Dubbing Controls */}
              {dubVoice && translateLanguage !== 'none' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', padding: '1rem', background: 'var(--bg-inset)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', marginBottom: '1rem' }}>
                  {/* Voice Actor Selection */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-heading)', marginBottom: '0.35rem' }}>
                      🎙️ Neural Voice Actor Selection (Generates 5 Unique Voices)
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => setSpeakerGender('male')}
                        style={{
                          padding: '0.65rem 0.5rem', borderRadius: 'var(--radius-sm)',
                          border: `1.5px solid ${speakerGender === 'male' ? 'var(--indigo-600)' : 'var(--border-medium)'}`,
                          background: speakerGender === 'male' ? 'var(--indigo-50)' : 'var(--bg-surface)',
                          color: speakerGender === 'male' ? 'var(--indigo-600)' : 'var(--text-heading)',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
                          cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center'
                        }}
                      >
                        <div style={{ fontWeight: 800, fontSize: '0.82rem' }}>👨 5 Distinct Male Voices</div>
                        <div style={{ fontSize: '0.66rem', color: speakerGender === 'male' ? 'var(--indigo-600)' : 'var(--text-muted)' }}>
                          5 Unique Men Voices
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSpeakerGender('female')}
                        style={{
                          padding: '0.65rem 0.5rem', borderRadius: 'var(--radius-sm)',
                          border: `1.5px solid ${speakerGender === 'female' ? 'var(--indigo-600)' : 'var(--border-medium)'}`,
                          background: speakerGender === 'female' ? 'var(--indigo-50)' : 'var(--bg-surface)',
                          color: speakerGender === 'female' ? 'var(--indigo-600)' : 'var(--text-heading)',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
                          cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center'
                        }}
                      >
                        <div style={{ fontWeight: 800, fontSize: '0.82rem' }}>👩 5 Distinct Female Voices</div>
                        <div style={{ fontSize: '0.66rem', color: speakerGender === 'female' ? 'var(--indigo-600)' : 'var(--text-muted)' }}>
                          5 Unique Women Voices
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSpeakerGender('mixed')}
                        style={{
                          padding: '0.65rem 0.5rem', borderRadius: 'var(--radius-sm)',
                          border: `1.5px solid ${speakerGender === 'mixed' ? 'var(--indigo-600)' : 'var(--border-medium)'}`,
                          background: speakerGender === 'mixed' ? 'var(--indigo-50)' : 'var(--bg-surface)',
                          color: speakerGender === 'mixed' ? 'var(--indigo-600)' : 'var(--text-heading)',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
                          cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center'
                        }}
                      >
                        <div style={{ fontWeight: 800, fontSize: '0.82rem' }}>🎭 Diverse Blend</div>
                        <div style={{ fontSize: '0.66rem', color: speakerGender === 'mixed' ? 'var(--indigo-600)' : 'var(--text-muted)' }}>
                          Male & Female Mix
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Audio Replacement Mode */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-heading)', marginBottom: '0.35rem' }}>
                      🔊 Audio Output Mode
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => setDubMixMode('replace')}
                        style={{
                          padding: '0.65rem 0.8rem', borderRadius: 'var(--radius-sm)',
                          border: `1.5px solid ${dubMixMode === 'replace' ? 'var(--indigo-600)' : 'var(--border-medium)'}`,
                          background: dubMixMode === 'replace' ? 'var(--indigo-50)' : 'var(--bg-surface)',
                          color: dubMixMode === 'replace' ? 'var(--indigo-600)' : 'var(--text-heading)',
                          display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                          cursor: 'pointer', transition: 'all 0.15s'
                        }}
                      >
                        <div style={{ fontWeight: 800, fontSize: '0.82rem' }}>🔇 Clean Dubbed Audio</div>
                        <div style={{ fontSize: '0.68rem', color: dubMixMode === 'replace' ? 'var(--indigo-600)' : 'var(--text-muted)', marginTop: '0.15rem' }}>
                          Completely removes original voice
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDubMixMode('mix')}
                        style={{
                          padding: '0.65rem 0.8rem', borderRadius: 'var(--radius-sm)',
                          border: `1.5px solid ${dubMixMode === 'mix' ? 'var(--indigo-600)' : 'var(--border-medium)'}`,
                          background: dubMixMode === 'mix' ? 'var(--indigo-50)' : 'var(--bg-surface)',
                          color: dubMixMode === 'mix' ? 'var(--indigo-600)' : 'var(--text-heading)',
                          display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                          cursor: 'pointer', transition: 'all 0.15s'
                        }}
                      >
                        <div style={{ fontWeight: 800, fontSize: '0.82rem' }}>🎚️ Voiceover Ducking</div>
                        <div style={{ fontSize: '0.68rem', color: dubMixMode === 'mix' ? 'var(--indigo-600)' : 'var(--text-muted)', marginTop: '0.15rem' }}>
                          Blends over original audio
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Summary Callout */}
                  <div style={{ padding: '0.6rem 0.8rem', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 'var(--radius-sm)', fontSize: '0.74rem', color: '#065f46', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <CheckCircle size={14} color="#059669" />
                    <span>
                      <strong>Dubbed Output:</strong> {dubMixMode === 'replace' ? 'Clean Neural Voiceover (Original voice removed)' : 'Blended Voiceover (Ducked original audio)'} in <strong>{LANGUAGES.find(l => l.code === translateLanguage)?.name || translateLanguage}</strong> with <strong>{speakerGender === 'male' ? '5 Distinct Male Voices (1 per variation)' : speakerGender === 'female' ? '5 Distinct Female Voices (1 per variation)' : 'Diverse Blend of Voices'}</strong>.
                    </span>
                  </div>
                </div>
              )}
            </div>

            <button
              className="btn-primary"
              onClick={generate}
              disabled={isGenerating}
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '0.9rem',
                fontSize: '1rem',
                gap: '0.5rem',
                opacity: isGenerating ? 0.7 : 1,
                cursor: isGenerating ? 'not-allowed' : 'pointer'
              }}
            >
              <Zap size={18} />
              {isGenerating ? 'Starting Generation…' : 'Generate 5 Variations'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════
     GENERATING PAGE
     ══════════════════════════════════════════════════════ */
  if (page === 'generating') {
    return (
      <div className="page-shell">
        <AppNav />
        <motion.div
          className="page-content"
          style={{ maxWidth: 680 }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="page-header">
            <button className="btn-icon" onClick={() => { stopPolling(); setPage('setup'); }}>
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 className="page-title">Processing Pipeline</h1>
              <p className="page-subtitle">Rendering 5 animated caption variations with live Music API — please keep this tab open</p>
            </div>
          </div>

          <div className="glass-panel">
            <StepIndicator stage={pipelineStatus?.stage || 'processing'} />

            {/* Status label */}
            <div style={{ textAlign: 'center', marginBottom: '2rem', padding: '1.25rem', background: 'var(--indigo-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--indigo-100)' }}>
              <div className="processing-pulse" style={{ fontSize: '1.05rem', color: 'var(--indigo-600)', fontWeight: 800, marginBottom: '0.4rem' }}>
                {pipelineStatus?.stage_label || 'Starting pipeline…'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                <Clock size={13} /> Elapsed: {formatElapsed(elapsedSecs)} — polling every 5s
              </div>
            </div>

            {/* Progress ready */}
            {variations.length > 0 && (
              <div style={{ marginBottom: '1.5rem', padding: '0.9rem 1.1rem', background: 'var(--status-done-bg)', border: '1px solid var(--status-done-border)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <CheckCircle size={18} color="var(--status-done-text)" />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--status-done-text)' }}>{variations.length} variation{variations.length !== 1 ? 's' : ''} ready so far</div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Still processing remaining variations…</div>
                </div>
              </div>
            )}

            {/* Stage breakdown */}
            <div className="glass-panel-sm" style={{ marginBottom: '1.5rem', padding: '0.85rem 1rem' }}>
              {statusRow('Video Probe & Assets', 'completed')}
              {statusRow('Audio Transcription', (pipelineStatus?.variations_ready > 0 || variations.length > 0) ? 'completed' : pipelineStatus?.transcription_status)}
              {statusRow('AI Content Analysis', (pipelineStatus?.variations_ready > 0 || variations.length > 0) ? 'completed' : pipelineStatus?.analysis_status)}
              {statusRow('Highlight Detection & 9:16 Framing', (pipelineStatus?.variations_ready > 0 || variations.length > 0) ? 'completed' : (pipelineStatus?.highlight_status || pipelineStatus?.crop_status))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Variations Rendered</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--indigo-600)' }}>{pipelineStatus?.variations_ready || variations.length || 0} / {pipelineStatus?.variations_total || 5}</span>
              </div>
            </div>

            {/* Background generation status info */}
            <div style={{ padding: '0.85rem 1rem', background: '#f8fafc', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.6, display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
              <Sparkles size={16} color="var(--indigo-600)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ color: 'var(--text-heading)' }}>Background Processing Active:</strong> You can safely navigate to other pages or projects. A floating progress widget in the bottom-right corner will continue tracking and notify you the moment your 5 Shorts are ready!
              </div>
            </div>

            <button
              onClick={handleCancelGeneration}
              disabled={isCancelling}
              style={{ width: '100%', padding: '0.75rem', background: 'var(--status-fail-bg)', border: '1px solid var(--status-fail-border)', borderRadius: 'var(--radius-md)', color: 'var(--status-fail-text)', cursor: isCancelling ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', transition: 'all 0.2s' }}
            >
              <X size={15} /> {isCancelling ? 'Cancelling Generation…' : 'Cancel Generation'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════
     RESULTS PAGE
     ══════════════════════════════════════════════════════ */
  return (
    <div className="page-shell">
      <AppNav extra={
        <button className="btn-primary" onClick={() => setPage('setup')} style={{ gap: '0.4rem', padding: '0.5rem 1rem', fontSize: '0.82rem' }}>
          <RefreshCw size={13} /> New Generation
        </button>
      } />

      <motion.div
        className="page-content"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="page-header">
          <button className="btn-icon" onClick={() => navigate(`/project/${video.project_id}`)}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="page-title">AI Variation Results</h1>
            <p className="page-subtitle">
              {variations.length} short-form clip{variations.length !== 1 ? 's' : ''} generated from <em>{video.original_filename}</em>
            </p>
          </div>
        </div>

        {variations.length > 0 ? (
          <div className="variations-grid">
            {variations.map((v, i) => (
              <VariationCard
                key={v.id}
                clip={v}
                index={i}
                cacheBust={cacheBust}
                onPublishClick={clip => setActivePublishClip(clip)}
              />
            ))}
          </div>
        ) : (
          <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem' }}>
            <Film size={48} color="var(--text-faint)" style={{ margin: '0 auto 1rem' }} />
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>No variations found yet. The pipeline may still be running.</p>
            <button className="btn-primary" onClick={() => setPage('generating')}>
              Check Progress
            </button>
          </div>
        )}
      </motion.div>

      {/* Publish panel */}
      <AnimatePresence>
        {activePublishClip && (
          <div className="modal-backdrop">
            <div style={{ maxWidth: 800, width: '100%' }}>
              <SocialPublishingPanel clip={activePublishClip} onClose={() => setActivePublishClip(null)} />
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
