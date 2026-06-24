import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Film, Video, Zap, CheckCircle, Loader, Clock, Globe, Mic, Download, RefreshCw, X, Wand, Share2 } from 'lucide-react';
import { api } from '../api/client';
import SocialPublishingPanel from './SocialPublishingPanel';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:8000';
const API_BASE = `${SERVER_URL}/api/v1`;

const PIPELINE_STEPS = [
  { key: 'processing', label: 'Extracting Metadata' },
  { key: 'transcribing', label: 'Transcribing Audio' },
  { key: 'analyzing', label: 'AI Content Analysis' },
  { key: 'generating', label: 'Master AI Agent' },
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
  const currentIdx = STAGE_ORDER.indexOf(stage);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: '2rem', flexWrap: 'wrap' }}>
      {PIPELINE_STEPS.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
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
    { name: 'Viral Hook', color: '#f43f5e', bg: '#fff1f2' },
    { name: 'Storyteller', color: '#7c3aed', bg: '#faf5ff' },
    { name: 'Minimalist', color: '#0891b2', bg: '#ecfeff' },
    { name: 'Intense', color: '#ea580c', bg: '#fff7ed' },
    { name: 'AI Custom', color: '#059669', bg: '#ecfdf5' },
  ];
  const persona = personas[index] || personas[4];

  return (
    <div className="video-card" style={{ position: 'relative' }}>
      {/* Persona badge */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, background: persona.bg, border: `1px solid ${persona.color}44`, borderRadius: 'var(--radius-full)', padding: '3px 10px', fontSize: '0.7rem', fontWeight: 800, color: persona.color, backdropFilter: 'blur(8px)' }}>
        {persona.name}
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

  const [page, setPage] = useState('setup');
  const [video, setVideo] = useState(null);
  const [variations, setVariations] = useState([]);
  const [cacheBust, setCacheBust] = useState(Date.now());
  const [prompt, setPrompt] = useState('');
  const [length, setLength] = useState(60);
  const [translateLanguage, setTranslateLang] = useState('none');
  const [dubVoice, setDubVoice] = useState(false);
  const [speakerGender, setSpeakerGender] = useState('female');
  const [captionLanguage, setCaptionLang] = useState('original');
  const [dubMixMode, setDubMixMode] = useState('replace');
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [activePublishClip, setActivePublishClip] = useState(null);

  // Variation Editor State
  const [editingClip, setEditingClip] = useState(null);
  const [keepSameVideo, setKeepSameVideo] = useState(true);
  const [editStart, setEditStart] = useState(0);
  const [editEnd, setEditEnd] = useState(0);
  const [editCaptionStyle, setEditCaptionStyle] = useState('standard');
  const [editFontName, setEditFontName] = useState('Outfit');
  const [editFontSize, setEditFontSize] = useState(24);
  const [editPrimaryColor, setEditPrimaryColor] = useState('#ffffff');
  const [editHighlightColor, setEditHighlightColor] = useState('#f59e0b');
  const [editAlignment, setEditAlignment] = useState(2);
  const [editMarginV, setEditMarginV] = useState(280);
  const [editDubVoice, setEditDubVoice] = useState(false);
  const [editSpeakerGender, setEditSpeakerGender] = useState('female');
  const [editDubMixMode, setEditDubMixMode] = useState('replace');
  const [editMusicPreset, setEditMusicPreset] = useState('none');
  const [editMusicVolume, setEditMusicVolume] = useState(0.15);

  const originalVideoRef = useRef(null);
  const editedVideoRef = useRef(null);

  const handleStartEdit = (clip) => {
    setEditingClip(clip);
    setEditStart(clip.start_time || 0);
    setEditEnd(clip.end_time || 0);
    setKeepSameVideo(true);

    const opts = clip.edit_options || {};
    setEditCaptionStyle(opts.caption_style || 'standard');
    setEditFontName(opts.font_name || 'Outfit');
    setEditFontSize(opts.font_size || 72);
    setEditPrimaryColor(opts.primary_color || '#ffffff');
    setEditHighlightColor(opts.highlight_color || '#00FF00');
    setEditAlignment(opts.alignment || 2);
    setEditMarginV(opts.margin_v || 280);
    setEditDubVoice(opts.dub_voice || false);
    setEditSpeakerGender(opts.speaker_gender || 'female');
    setEditDubMixMode(opts.dub_mix_mode || 'replace');
    setEditMusicPreset(opts.music_preset || 'none');
    setEditMusicVolume(opts.music_volume || 0.15);

    setPage('edit');
  };

  const handleSaveEdit = async () => {
    if (!editingClip) return;
    setPage('generating');
    setPipelineStatus(null);
    try {
      const res = await fetch(`${API_BASE}/videos/clips/${editingClip.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editingClip.title,
          start_time: Number(keepSameVideo ? (editingClip.start_time || 0) : editStart),
          end_time: Number(keepSameVideo ? (editingClip.end_time || 0) : editEnd),
          edit_options: {
            ...(editingClip.edit_options || {}),
            translate_language: translateLanguage,
            dub_voice: editDubVoice,
            speaker_gender: editSpeakerGender,
            dub_mix_mode: editDubMixMode,
            caption_style: editCaptionStyle,
            font_name: editFontName,
            font_size: Number(editFontSize),
            primary_color: editPrimaryColor,
            highlight_color: editHighlightColor,
            alignment: Number(editAlignment),
            margin_v: Number(editMarginV),
            music_preset: editMusicPreset,
            music_volume: Number(editMusicVolume),
            subtitles: video.transcript || []
          }
        })
      });
      if (res.ok) {
        startPolling(video.id);
      } else {
        alert('Failed to save edits');
        setPage('edit');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to trigger re-render');
      setPage('edit');
    }
  };

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
        if (varData?.length > 0) setPage('results');
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => { loadVideoDetails(); }, [videoId]);

  useEffect(() => {
    if (page === 'generating') {
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => setElapsedSecs(Math.floor((Date.now() - startTimeRef.current) / 1000)), 1000);
    } else {
      clearInterval(timerRef.current);
      setElapsedSecs(0);
    }
    return () => clearInterval(timerRef.current);
  }, [page]);

  const formatElapsed = s => `${Math.floor(s / 60)}m ${(s % 60).toString().padStart(2, '0')}s`;

  const stopPolling = useCallback(() => { clearInterval(intervalRef.current); intervalRef.current = null; }, []);

  const startPolling = useCallback((vidId) => {
    stopPolling();
    let attempts = 0;
    intervalRef.current = setInterval(async () => {
      if (++attempts >= MAX_POLLS) { stopPolling(); setPage('setup'); alert('Generation timed out (60 min).'); return; }
      try {
        const statusRes = await fetch(`${API_BASE}/videos/${vidId}/status`);
        if (statusRes.ok) {
          const status = await statusRes.json();
          setPipelineStatus(status);
          if (status.is_done) {
            const varRes = await fetch(`${API_BASE}/videos/${vidId}/variations`);
            if (varRes.ok) {
              setVariations(await varRes.json());
              setCacheBust(Date.now());
              stopPolling();
              setPage('results');
              return;
            }
          }
        }
        const varRes = await fetch(`${API_BASE}/videos/${vidId}/variations`);
        if (varRes.ok) {
          const vd = await varRes.json();
          if (vd?.length) { setVariations(vd); setCacheBust(Date.now()); }
        }
      } catch (e) { console.error(e); }
    }, 5000);
  }, [stopPolling]);

  const generate = async () => {
    if (!video) return;
    setVariations([]); setPipelineStatus(null); setPage('generating');
    try {
      const res = await fetch(`${API_BASE}/videos/${video.id}/master-generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ length: Number(length), platform: 'youtube', optional_prompt: prompt, translate_language: translateLanguage, dub_voice: dubVoice, speaker_gender: speakerGender, caption_language: captionLanguage, dub_mix_mode: dubMixMode }),
      });
      if (!res.ok) {
        throw new Error('Generation failed');
      }
      startPolling(video.id);
    } catch (e) { console.error(e); alert('Failed to trigger generation'); setPage('setup'); }
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
        <strong>AI Generator</strong>
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
          style={{ maxWidth: 620 }}
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
              <p className="page-subtitle">Configure and generate short-form variations from <em>{video.original_filename}</em></p>
            </div>
          </div>

          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Source file info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.9rem 1.1rem', background: 'var(--status-done-bg)', border: '1px solid var(--status-done-border)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--status-done-border)' }}>
                <Film size={20} color="var(--status-done-text)" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-heading)' }}>{video.original_filename}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--status-done-text)', fontWeight: 600 }}>Ready for generation</div>
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

            {/* Prompt */}
            <div>
              <label htmlFor="prompt-input" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                Optional AI Prompt
              </label>
              <input id="prompt-input" className="input-field" type="text" placeholder='e.g. "Make it extra energetic with dramatic music"' value={prompt} onChange={e => setPrompt(e.target.value)} />
            </div>

            {/* Translation & Dubbing */}
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <Globe size={16} color="var(--indigo-600)" />
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-heading)' }}>Translation & AI Voice Dubbing</span>
              </div>

              <div style={{ marginBottom: '0.85rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Target Language</label>
                <select className="input-field" value={translateLanguage} onChange={e => { const val = e.target.value; setTranslateLang(val); setCaptionLang(val === 'none' ? 'original' : 'translated'); }}>
                  <option value="none">None</option>
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 0.9rem', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', marginBottom: dubVoice ? '0.75rem' : 0 }}>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-heading)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Mic size={14} color="var(--indigo-600)" />
                    Dub Voice with AI Cloning
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Clone original voice to speak translated language.</div>
                </div>
                <input type="checkbox" checked={dubVoice} onChange={e => setDubVoice(e.target.checked)} disabled={translateLanguage === 'none'} style={{ width: 18, height: 18, accentColor: 'var(--indigo-600)', cursor: translateLanguage === 'none' ? 'not-allowed' : 'pointer' }} />
              </div>

              {dubVoice && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Speaker Gender</label>
                    <select className="input-field" value={speakerGender} onChange={e => setSpeakerGender(e.target.value)}>
                      <option value="female">Female (Standard)</option>
                      <option value="male">Male</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Dub Mix Mode</label>
                    <select className="input-field" value={dubMixMode} onChange={e => setDubMixMode(e.target.value)}>
                      <option value="replace">Replace Original Voice</option>
                      <option value="mix">Mix & Duck Original</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            <button className="btn-primary" onClick={generate} style={{ width: '100%', justifyContent: 'center', padding: '0.9rem', fontSize: '1rem', gap: '0.5rem' }}>
              <Zap size={18} />
              Generate AI Variations
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
              <p className="page-subtitle">Running master agent edits — please keep this tab open</p>
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
              {statusRow('Video Processing', pipelineStatus?.video_status)}
              {statusRow('Transcription', pipelineStatus?.transcription_status)}
              {statusRow('AI Analysis', pipelineStatus?.analysis_status)}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Variations rendered</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--indigo-600)' }}>{pipelineStatus?.variations_ready || 0} / 1</span>
              </div>
            </div>

            {/* Warning */}
            <div style={{ padding: '0.75rem 1rem', background: 'var(--gold-50)', border: '1px solid #fde68a', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', color: 'var(--gold-600)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              This pipeline can take <strong>a few minutes</strong> depending on video length.<br /><strong>Do not close this tab.</strong>
            </div>

            <button
              onClick={() => { stopPolling(); setPage('setup'); }}
              style={{ width: '100%', padding: '0.75rem', background: 'var(--status-fail-bg)', border: '1px solid var(--status-fail-border)', borderRadius: 'var(--radius-md)', color: 'var(--status-fail-text)', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
            >
              <X size={15} /> Cancel Generation
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════
     EDITOR PAGE
     ══════════════════════════════════════════════════════ */
  if (page === 'edit' && editingClip) {
    const storagePath = (editingClip.storage_path || '').replace(/\\/g, '/');
    const relPath = storagePath.includes('uploads/') ? storagePath.substring(storagePath.indexOf('uploads/')) : storagePath;
    const editedUrl = `${SERVER_URL}/${relPath}?t=${cacheBust}`;
    const origStoragePath = (video.storage_path || '').replace(/\\/g, '/');
    const origRelPath = origStoragePath.includes('uploads/') ? origStoragePath.substring(origStoragePath.indexOf('uploads/')) : origStoragePath;
    const originalUrl = video.storage_path ? `${SERVER_URL}/${origRelPath}` : '';

    return (
      <div className="page-shell" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <nav className="app-nav">
          <button className="app-nav-brand" onClick={() => { setPage('results'); setEditingClip(null); }}>
            <ArrowLeft size={16} style={{ marginRight: '0.4rem' }} />
            Back to Variations
          </button>
          <div className="app-nav-sep" />
          <div className="app-nav-breadcrumb" style={{ flex: 1 }}>
            Editing: <strong>{editingClip.title || 'Clip Variation'}</strong>
          </div>
          <button className="btn-primary" onClick={handleSaveEdit} style={{ gap: '0.4rem' }}>
            <Zap size={14} /> Save & Re-render
          </button>
        </nav>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* LEFT PANEL: Dual video players & Timeline track */}
          <div style={{ flex: '0 0 60%', overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', borderRight: '1px solid var(--border-subtle)' }}>

            {/* Side-by-side Players */}
            <div className="glass-panel" style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--indigo-600)' }}>🎬 EDITED CLIP PREVIEW (LEFT)</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)' }}>📹 ORIGINAL SOURCE VIDEO (RIGHT)</span>
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'center' }}>
                {/* Left: Rendered clip */}
                <div style={{ width: '40%', aspectRatio: '9/16', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: '#000', border: '2px solid var(--indigo-100)', position: 'relative' }}>
                  <video
                    ref={editedVideoRef}
                    src={editedUrl}
                    controls
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
                {/* Right: Original video */}
                <div style={{ width: '55%', aspectRatio: '16/9', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: '#000', border: '1px solid var(--border-subtle)' }}>
                  <video
                    ref={originalVideoRef}
                    src={originalUrl}
                    controls
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                </div>
              </div>
            </div>

            {/* Video Segment Mode Selection */}
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-heading)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    ⚙️ Video Segment Settings
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                    Decide whether to keep the same video clip or change the trimmed segment completely.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--bg-elevated)', padding: '0.3rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <button
                    type="button"
                    onClick={() => setKeepSameVideo(true)}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      border: 'none',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      background: keepSameVideo ? 'var(--indigo-600)' : 'transparent',
                      color: keepSameVideo ? '#fff' : 'var(--text-muted)'
                    }}
                  >
                    Keep Same Video Clip
                  </button>
                  <button
                    type="button"
                    onClick={() => setKeepSameVideo(false)}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      border: 'none',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      background: !keepSameVideo ? 'var(--indigo-600)' : 'transparent',
                      color: !keepSameVideo ? '#fff' : 'var(--text-muted)'
                    }}
                  >
                    Change Video Completely
                  </button>
                </div>
              </div>
            </div>

            {/* Trim Timeline Track */}
            {!keepSameVideo ? (
              <div className="glass-panel" style={{ padding: '1.25rem' }}>
                <div className="section-heading" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
                  Clip Boundaries & Timeline
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Start Time (seconds)</label>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max={editEnd}
                        className="input-field"
                        value={editStart}
                        onChange={e => setEditStart(Math.max(0, Number(e.target.value)))}
                      />
                      <button
                        className="btn-secondary"
                        style={{ padding: '0.4rem 0.6rem', fontSize: '0.72rem', whiteSpace: 'nowrap' }}
                        onClick={() => { if (originalVideoRef.current) setEditStart(Number(originalVideoRef.current.currentTime.toFixed(1))); }}
                      >
                        Use Current
                      </button>
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>End Time (seconds)</label>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input
                        type="number"
                        step="0.1"
                        min={editStart}
                        max={video.duration || 300}
                        className="input-field"
                        value={editEnd}
                        onChange={e => setEditEnd(Math.max(editStart, Number(e.target.value)))}
                      />
                      <button
                        className="btn-secondary"
                        style={{ padding: '0.4rem 0.6rem', fontSize: '0.72rem', whiteSpace: 'nowrap' }}
                        onClick={() => { if (originalVideoRef.current) setEditEnd(Number(originalVideoRef.current.currentTime.toFixed(1))); }}
                      >
                        Use Current
                      </button>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  <span>Clip Duration: <strong>{(editEnd - editStart).toFixed(1)}s</strong></span>
                  <span>Original Duration: <strong>{video.duration ? `${video.duration.toFixed(1)}s` : 'N/A'}</strong></span>
                </div>
              </div>
            ) : (
              <div className="glass-panel" style={{ padding: '1rem', background: 'var(--status-done-bg)', border: '1px solid var(--status-done-border)' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--status-done-text)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                  ℹ️ Using Locked Video Segment: {(editingClip.start_time || 0).toFixed(1)}s to {(editingClip.end_time || 0).toFixed(1)}s ({(editingClip.end_time - editingClip.start_time).toFixed(1)}s).
                </div>
              </div>
            )}

            {/* Separated Audio Mix Track Controls */}
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <div className="section-heading" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
                🎛️ Separated Audio Mix Channels
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Voice channel */}
                <div style={{ background: 'var(--bg-surface)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-heading)' }}>🗣️ Voice Dubbing Channel</div>
                    <input
                      type="checkbox"
                      checked={editDubVoice}
                      onChange={e => setEditDubVoice(e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: 'var(--indigo-600)', cursor: 'pointer' }}
                    />
                  </div>
                  {editDubVoice && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.5rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>Speaker Gender</label>
                        <select className="input-field" value={editSpeakerGender} onChange={e => setEditSpeakerGender(e.target.value)} style={{ padding: '0.3rem' }}>
                          <option value="female">Female</option>
                          <option value="male">Male</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>Voice Dub Mix Mode</label>
                        <select className="input-field" value={editDubMixMode} onChange={e => setEditDubMixMode(e.target.value)} style={{ padding: '0.3rem' }}>
                          <option value="replace">Replace Original Voice</option>
                          <option value="mix">Mix & Duck Original</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Background music channel */}
                <div style={{ background: 'var(--bg-surface)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-heading)', marginBottom: '0.6rem' }}>🎵 Background Music Preset Channel</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Music Style</label>
                      <select className="input-field" value={editMusicPreset} onChange={e => setEditMusicPreset(e.target.value)} style={{ padding: '0.3rem' }}>
                        <option value="none">None (No music)</option>
                        <option value="upbeat">Upbeat / Energetic</option>
                        <option value="dramatic">Dramatic / Epic</option>
                        <option value="standard">Standard / Chill</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Music Volume ({Math.round(editMusicVolume * 100)}%)</label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={editMusicVolume}
                        onChange={e => setEditMusicVolume(Number(e.target.value))}
                        style={{ width: '100%', accentColor: 'var(--indigo-600)', marginTop: '0.4rem' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: Caption styling & Typography */}
          <div style={{ flex: '0 0 40%', overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', background: 'var(--bg-surface)' }}>
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <div className="section-heading" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
                ✏️ Caption Typography & Styling
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                {/* Preset style */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Caption Style Preset</label>
                  <select className="input-field" value={editCaptionStyle} onChange={e => {
                    const preset = e.target.value;
                    setEditCaptionStyle(preset);
                    if (preset === 'energetic') {
                      setEditFontName('Impact');
                      setEditFontSize(84);
                      setEditHighlightColor('#FFD700');
                    } else if (preset === 'minimalist') {
                      setEditFontName('Arial');
                      setEditFontSize(48);
                      setEditHighlightColor('#FFFFFF');
                    } else if (preset === 'standard') {
                      setEditFontName('Arial Black');
                      setEditFontSize(72);
                      setEditHighlightColor('#00FF00');
                    }
                  }}>
                    <option value="standard">Standard (Bold + Highlight)</option>
                    <option value="energetic">Energetic (Impact + Yellow)</option>
                    <option value="minimalist">Minimalist (Arial Clean)</option>
                    <option value="none">No Captions</option>
                  </select>
                </div>

                {editCaptionStyle !== 'none' && (
                  <>
                    {/* Font Family & Size */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Font Family</label>
                        <select className="input-field" value={editFontName} onChange={e => setEditFontName(e.target.value)}>
                          <option value="Arial Black">Arial Black</option>
                          <option value="Impact">Impact</option>
                          <option value="Outfit">Outfit</option>
                          <option value="Syne">Syne</option>
                          <option value="Arial">Arial</option>
                          <option value="Courier New">Courier</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Font Size (pt)</label>
                        <input
                          type="number"
                          className="input-field"
                          min="12"
                          max="140"
                          value={editFontSize}
                          onChange={e => setEditFontSize(Number(e.target.value))}
                        />
                      </div>
                    </div>

                    {/* Color Pickers */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Primary Color</label>
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          <input
                            type="color"
                            value={editPrimaryColor}
                            onChange={e => setEditPrimaryColor(e.target.value)}
                            style={{ width: 32, height: 32, padding: 0, border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>{editPrimaryColor}</span>
                        </div>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Highlight Color</label>
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          <input
                            type="color"
                            value={editHighlightColor}
                            onChange={e => setEditHighlightColor(e.target.value)}
                            style={{ width: 32, height: 32, padding: 0, border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>{editHighlightColor}</span>
                        </div>
                      </div>
                    </div>

                    {/* Alignment & Margin */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Vertical Align</label>
                        <select className="input-field" value={editAlignment} onChange={e => setEditAlignment(Number(e.target.value))}>
                          <option value={2}>Bottom</option>
                          <option value={10}>Center</option>
                          <option value={6}>Top</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Vertical Margin (px)</label>
                        <input
                          type="number"
                          className="input-field"
                          min="10"
                          max="800"
                          value={editMarginV}
                          onChange={e => setEditMarginV(Number(e.target.value))}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
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
