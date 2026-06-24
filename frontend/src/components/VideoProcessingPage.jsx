import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Scissors, Mic, Wand, PlayCircle, Film, RefreshCw, Video, Globe, Zap } from 'lucide-react';
import { api } from '../api/client';
import SocialPublishingPanel from './SocialPublishingPanel';

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

function StatusChip({ status }) {
  const cls =
    status === 'completed' || status === 'done' || status === 'success' ? 'done' :
      status === 'processing' || status === 'rendering' ? 'running' :
        status === 'pending' ? 'pending' :
          status === 'failed' ? 'failed' : 'idle';
  const labels = { done: '✓ Done', running: '⟳ Running', pending: '⏳ Pending', failed: '✕ Failed', idle: '— Pending' };
  return <span className={`status-chip ${cls}`}>{labels[cls]}</span>;
}

export default function VideoProcessingPage() {
  const { videoId } = useParams();
  const navigate = useNavigate();

  const [video, setVideo] = useState(null);
  const [clips, setClips] = useState([]);
  const [targetFps, setTargetFps] = useState(5);
  const [activePublishClip, setActivePublishClip] = useState(null);
  const [cacheBust, setCacheBust] = useState(Date.now());
  const [translateLanguage, setTranslateLanguage] = useState('none');
  const [dubVoice, setDubVoice] = useState(false);
  const [captionLanguage, setCaptionLanguage] = useState('original');
  const [dubMixMode, setDubMixMode] = useState('replace');
  const [translatedTranscript, setTranslatedTranscript] = useState(null);
  const [translating, setTranslating] = useState(false);
  const [englishTranscript, setEnglishTranscript] = useState(null);
  const [fetchingEnglish, setFetchingEnglish] = useState(false);
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const [pipelineStatus, setPipelineStatus] = useState(null);

  const videoRef = useRef(null);
  const previewVideoRef = useRef(null);
  const requestRef = useRef();

  /* Translation effect */
  useEffect(() => {
    if (translateLanguage === 'none' || !video?.transcript?.length) { setTranslatedTranscript(null); return; }
    let active = true;
    (async () => {
      setTranslating(true);
      try {
        const res = await fetch('https://localhost:8000/api/v1/videos/translate-transcript', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ words: video.transcript, target_lang: translateLanguage }),
        });
        if (res.ok) { const d = await res.json(); if (active && d?.length) setTranslatedTranscript(d); }
      } catch (e) { console.error(e); }
      finally { if (active) setTranslating(false); }
    })();
    return () => { active = false; };
  }, [translateLanguage, video]);

  useEffect(() => {
    if (captionLanguage !== 'english' || !video?.transcript?.length) { setEnglishTranscript(null); return; }
    if (translateLanguage === 'en') { setEnglishTranscript(translatedTranscript); return; }
    let active = true;
    (async () => {
      setFetchingEnglish(true);
      try {
        const res = await fetch('https://localhost:8000/api/v1/videos/translate-transcript', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ words: video.transcript, target_lang: 'en' }),
        });
        if (res.ok) { const d = await res.json(); if (active) setEnglishTranscript(d); }
      } catch (e) { console.error(e); }
      finally { if (active) setFetchingEnglish(false); }
    })();
    return () => { active = false; };
  }, [captionLanguage, video, translateLanguage, translatedTranscript]);

  /* Load video */
  useEffect(() => {
    (async () => {
      try {
        const allVideos = await api.getVideos();
        const current = allVideos.find(v => v.id === parseInt(videoId));
        if (current) setVideo(current); else navigate('/dashboard');
      } catch (e) { console.error(e); }
    })();
  }, [videoId]);

  /* Smart crop preview loop */
  const updatePreview = () => {
    if (!videoRef.current || !previewVideoRef.current || !video?.crop_metadata?.trajectory) {
      requestRef.current = requestAnimationFrame(updatePreview); return;
    }
    const t = videoRef.current.currentTime;
    const traj = video.crop_metadata.trajectory;
    let cur = traj[0];
    for (let i = 0; i < traj.length; i++) {
      if (traj[i].timestamp <= t) cur = traj[i]; else break;
    }
    const origH = previewVideoRef.current.videoHeight || 1080;
    const prevH = previewVideoRef.current.clientHeight;
    if (origH > 0 && prevH > 0 && cur) {
      previewVideoRef.current.style.transform = `translateX(${-(cur.x * (prevH / origH))}px)`;
    }
    requestRef.current = requestAnimationFrame(updatePreview);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(updatePreview);
    return () => cancelAnimationFrame(requestRef.current);
  }, [video]);

  /* Polling */
  const isPipelineActive = video && (
    video.status === 'pending' || video.status === 'processing' ||
    video.transcription_status === 'pending' || video.transcription_status === 'processing' ||
    video.analysis_status === 'pending' || video.analysis_status === 'processing' ||
    video.highlight_status === 'pending' || video.highlight_status === 'processing' ||
    video.crop_status === 'pending' || video.crop_status === 'processing'
  );

  useEffect(() => {
    if (!video) return;
    let id;
    if (isPipelineActive) {
      id = setInterval(async () => {
        try {
          const all = await api.getVideos();
          const u = all.find(v => v.id === video.id);
          if (u) setVideo(u);

          // Fetch detailed status
          const statusRes = await fetch(`https://localhost:8000/api/v1/videos/${video.id}/status`);
          if (statusRes.ok) {
            setPipelineStatus(await statusRes.json());
          }

          const r = await fetch(`https://localhost:8000/api/v1/videos/${video.id}/clips`);
          if (r.ok) { setClips(await r.json()); setCacheBust(Date.now()); }
        } catch (e) { console.error(e); }
      }, 2000);
    } else {
      fetch(`https://localhost:8000/api/v1/videos/${video.id}/clips`)
        .then(r => r.json()).then(d => { setClips(d); setCacheBust(Date.now()); }).catch(console.error);
    }
    return () => clearInterval(id);
  }, [video, isPipelineActive]);

  if (!video) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <p style={{ color: 'var(--text-muted)' }}>Loading video studio…</p>
    </div>
  );

  /* Subtitle helpers */
  const groupWords = (words) => {
    if (!words?.length) return [];
    const lines = []; let cur = [], start = null;
    words.forEach((w, i) => {
      if (!cur.length) start = w.start;
      cur.push(w);
      const gap = i < words.length - 1 ? words[i + 1].start - w.end : 0;
      if (cur.length >= 6 || gap > 0.8 || (w.end - start) > 2.5 || i === words.length - 1) {
        lines.push({ start, end: w.end, text: cur.map(x => x.text).join(' ') });
        cur = [];
      }
    });
    return lines;
  };

  const getSubtitles = () => {
    if (captionLanguage === 'none') return [];
    if (captionLanguage === 'original' || translateLanguage === 'none') return video.transcript || [];
    if (captionLanguage === 'english') return englishTranscript || [];
    if (captionLanguage === 'translated' && translatedTranscript?.length) return translatedTranscript;
    return video.transcript || [];
  };

  const subLines = groupWords(getSubtitles());
  const activeSub = subLines.find(l => currentVideoTime >= l.start && currentVideoTime <= l.end)?.text || '';
  const captionLoad = captionLanguage !== 'none' && (translating || fetchingEnglish);
  const capLabel = captionLanguage === 'english' ? 'English' : captionLanguage === 'original' ? 'Original' :
    LANGUAGES.find(l => l.code === translateLanguage)?.name || translateLanguage;

  const backendUrl = 'https://localhost:8000';
  const origStoragePath = (video.storage_path || '').replace(/\\/g, '/');
  const origRelPath = origStoragePath.includes('uploads/') ? origStoragePath.substring(origStoragePath.indexOf('uploads/')) : origStoragePath;
  const videoUrl = video.storage_path ? `${backendUrl}/${origRelPath}?t=${cacheBust}` : '';

  const shortStoragePath = (video.short_path || '').replace(/\\/g, '/');
  const shortRelPath = shortStoragePath.includes('uploads/') ? shortStoragePath.substring(shortStoragePath.indexOf('uploads/')) : shortStoragePath;
  const shortUrl = video.short_path ? `${backendUrl}/${shortRelPath}?t=${cacheBust}` : '';

  const steps = [
    { key: 'metadata', title: 'Video Metadata Extraction', description: 'Extract FPS, resolution, bitrate, and audio streams.', status: video.status, canTrigger: false },
    {
      key: 'transcription', title: 'Audio Transcription', description: 'Convert audio track into word-level timestamps using Google STT or local Whisper.', status: video.transcription_status, canTrigger: video.status === 'completed',
      triggerAction: () => fetch(`https://localhost:8000/api/v1/videos/${video.id}/transcribe`, { method: 'POST' })
    },
    {
      key: 'analysis', title: 'AI Content Analysis (Qwen3)', description: 'Understand topic, key scenes, and outline highlights.', status: video.analysis_status, canTrigger: video.transcription_status === 'completed',
      triggerAction: () => fetch(`https://localhost:8000/api/v1/videos/${video.id}/analyze`, { method: 'POST' })
    },
    {
      key: 'highlights', title: 'Highlight Candidates Selection', description: 'Detect top visual sequences and viral appeal.', status: video.highlight_status, canTrigger: video.analysis_status === 'completed',
      triggerAction: () => fetch(`https://localhost:8000/api/v1/videos/${video.id}/detect-highlights`, { method: 'POST' })
    },
    {
      key: 'crop', title: 'Smart Cropping Trajectory (9:16)', description: 'Track primary subjects for vertical formatting.', status: video.crop_status, canTrigger: video.status === 'completed',
      triggerAction: () => fetch(`https://localhost:8000/api/v1/videos/${video.id}/smart-crop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target_fps: parseInt(targetFps) }) })
    },
  ];

  const stepClass = (s) =>
    s === 'completed' || s === 'done' ? 'done' :
      s === 'processing' ? 'running' :
        s === 'pending' ? 'pending' :
          s === 'failed' ? 'failed' : 'idle';

  return (
    <div className="page-shell" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* ── NAV ─────────────────────────────────────────── */}
      <nav className="app-nav">
        <button className="app-nav-brand" onClick={() => navigate('/')}>
          <span className="app-nav-logo"><Video size={16} /></span>
          Harvest AI
        </button>
        <div className="app-nav-sep" />
        <div className="app-nav-breadcrumb" style={{ flex: 1, overflow: 'hidden' }}>
          <button onClick={() => navigate(`/project/${video.project_id}`)} style={{ background: 'none', border: 'none', color: 'var(--indigo-600)', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer', padding: 0 }}>
            Project
          </button>
          <span style={{ color: 'var(--border-strong)' }}>/</span>
          <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>
            {video.original_filename}
          </strong>
        </div>
        <div className="app-nav-actions">
          <StatusChip status={video.status} />
          {(video.status === 'pending' || video.status === 'processing') && (
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}>
              <RefreshCw size={16} color="var(--status-run-text)" />
            </motion.div>
          )}
          <button className="btn-primary" onClick={() => navigate(`/master-generator/${video.id}`)} style={{ gap: '0.4rem', padding: '0.5rem 1rem', fontSize: '0.82rem' }}>
            <Zap size={14} /> AI Shorts
          </button>
        </div>
      </nav>

      {/* ── MAIN LAYOUT ─────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── LEFT COLUMN: Media ───────────────────────── */}
        <div style={{ flex: '0 0 62%', overflowY: 'auto', padding: '1.75rem 1.5rem 1.75rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Video players row */}
          <div style={{ display: 'flex', gap: '1rem' }}>
            {/* Main video */}
            <div style={{ flex: 1, borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: '#000', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-md)', position: 'relative' }}>
              {videoUrl ? (
                <>
                  <video
                    ref={videoRef} src={videoUrl} controls
                    style={{ width: '100%', display: 'block', maxHeight: 460 }}
                    onPlay={() => previewVideoRef.current?.play()}
                    onPause={() => previewVideoRef.current?.pause()}
                    onSeeked={() => { if (previewVideoRef.current && videoRef.current) previewVideoRef.current.currentTime = videoRef.current.currentTime; }}
                    onTimeUpdate={() => {
                      if (previewVideoRef.current && videoRef.current && Math.abs(previewVideoRef.current.currentTime - videoRef.current.currentTime) > 0.2)
                        previewVideoRef.current.currentTime = videoRef.current.currentTime;
                      setCurrentVideoTime(videoRef.current?.currentTime || 0);
                    }}
                  />
                  {(activeSub || captionLoad) && (
                    <div style={{ position: 'absolute', bottom: 56, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: '1rem', fontWeight: 700, textAlign: 'center', pointerEvents: 'none', maxWidth: '85%', zIndex: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {captionLoad ? <span style={{ color: '#c7d2fe', fontStyle: 'italic', fontSize: '0.9rem' }}>Translating…</span> : (
                        <>
                          {captionLanguage !== 'original' && translateLanguage !== 'none' && (
                            <span style={{ background: 'rgba(79,70,229,0.5)', color: '#a5b4fc', padding: '2px 6px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0 }}>
                              {capLabel}
                            </span>
                          )}
                          <span>{activeSub}</span>
                        </>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-faint)', background: 'var(--bg-inset)' }}>No video source</div>
              )}
            </div>

            {/* Smart crop 9:16 preview */}
            {video.crop_metadata?.trajectory && videoUrl && (
              <div style={{ height: videoRef.current ? `${videoRef.current.clientHeight}px` : 460, aspectRatio: '9/16', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: '#000', boxShadow: '0 4px 20px rgba(79,70,229,0.2)', border: '2px solid var(--indigo-600)', position: 'relative', flexShrink: 0 }}>
                <video ref={previewVideoRef} src={videoUrl} muted style={{ height: '100%', maxWidth: 'none', display: 'block', transformOrigin: 'top left', willChange: 'transform' }} />
                <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(255,255,255,0.9)', color: 'var(--indigo-600)', padding: '3px 8px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4, backdropFilter: 'blur(8px)', border: '1px solid var(--indigo-100)' }}>
                  <Wand size={11} /> AI Crop
                </div>
              </div>
            )}
          </div>

          {/* Generated Short */}
          {shortUrl && (
            <div>
              <div className="section-heading" style={{ marginBottom: '1rem' }}>
                <Film size={17} color="var(--status-done-text)" />
                Auto-Generated Short (15s)
              </div>
              <div style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: '#000', border: '1px solid var(--status-done-border)', boxShadow: '0 4px 16px rgba(5,150,105,0.15)' }}>
                <video src={shortUrl} controls style={{ width: '100%', display: 'block', maxHeight: 360 }} />
              </div>
            </div>
          )}

          {/* Highlight candidates */}
          {video.highlights?.clips && (
            <div>
              <div className="section-heading" style={{ marginBottom: '1rem' }}>
                <Scissors size={17} color="var(--status-run-text)" />
                Top Highlight Candidates
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {video.highlights.clips.map((clip, idx) => (
                  <div key={idx} className="glass-panel" style={{ padding: '1.1rem 1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                      <h4 style={{ margin: 0, fontSize: '0.92rem', color: 'var(--text-heading)' }}>{idx + 1}. {clip.title}</h4>
                      <div style={{ display: 'flex', gap: '0.6rem', fontSize: '0.78rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                        <span style={{ background: 'var(--status-run-bg)', color: 'var(--status-run-text)', border: '1px solid var(--status-run-border)', borderRadius: 'var(--radius-full)', padding: '2px 8px', fontWeight: 700 }}>🔥 {clip.viral_score}/100</span>
                        <span style={{ background: 'var(--gold-50)', color: 'var(--gold-600)', border: '1px solid #fde68a', borderRadius: 'var(--radius-full)', padding: '2px 8px', fontWeight: 700 }}>⭐ {clip.importance_score}/100</span>
                      </div>
                    </div>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>{clip.reason}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)', background: 'var(--bg-inset)', padding: '2px 8px', borderRadius: 'var(--radius-full)' }}>
                        {clip.start_time}s – {clip.end_time}s
                      </span>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn-secondary" style={{ padding: '0.3rem 0.8rem', fontSize: '0.76rem', gap: '0.3rem' }}
                          onClick={() => { if (videoRef.current) { videoRef.current.currentTime = clip.start_time; videoRef.current.play(); } }}>
                          <PlayCircle size={12} /> Preview
                        </button>
                        <button
                          style={{ padding: '0.3rem 0.8rem', fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 700, borderRadius: 'var(--radius-md)', cursor: video.crop_status !== 'completed' ? 'not-allowed' : 'pointer', background: video.crop_status !== 'completed' ? 'var(--bg-inset)' : 'var(--accent-dark)', color: video.crop_status !== 'completed' ? 'var(--text-faint)' : '#fff', border: 'none', transition: 'all 0.2s' }}
                          disabled={video.crop_status !== 'completed'}
                          title={video.crop_status !== 'completed' ? 'Generate Smart Crop first' : ''}
                          onClick={async () => {
                            try {
                              await fetch(`https://localhost:8000/api/v1/videos/${video.id}/clips`, {
                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ title: clip.title, start_time: clip.start_time, end_time: clip.end_time, edit_options: { translate_language: translateLanguage, dub_voice: dubVoice, caption_language: captionLanguage, dub_mix_mode: dubMixMode, subtitles: getSubtitles() } }),
                              });
                            } catch (e) { console.error(e); }
                          }}
                        >
                          <Film size={12} /> Render Clip
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Exported Clips */}
          {clips.length > 0 && (
            <div>
              <div className="section-heading" style={{ marginBottom: '1rem' }}>
                <Film size={17} color="var(--status-done-text)" />
                Exported Clips
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {clips.map(c => (
                  <div key={c.id} className="glass-panel" style={{ padding: '1rem', border: `1px solid ${c.status === 'completed' ? 'var(--status-done-border)' : 'var(--border-subtle)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <h4 style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-heading)' }}>{c.title || `Clip ${c.id}`}</h4>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--bg-inset)', padding: '2px 7px', borderRadius: 'var(--radius-full)' }}>{c.duration?.toFixed(1)}s</span>
                      <StatusChip status={c.status} />
                    </div>
                    {c.status === 'completed' && c.storage_path ? (
                      <video src={`https://localhost:8000/${(c.storage_path || '').replace(/\\/g, '/').includes('uploads/') ? (c.storage_path || '').replace(/\\/g, '/').substring((c.storage_path || '').replace(/\\/g, '/').indexOf('uploads/')) : c.storage_path}?t=${cacheBust}`} controls style={{ width: '100%', borderRadius: 'var(--radius-sm)' }} />
                    ) : (
                      <div style={{ height: 130, background: 'var(--bg-inset)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)' }}>
                        {c.status === 'rendering' ? (
                          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}>
                            <RefreshCw size={22} color="var(--indigo-600)" />
                          </motion.div>
                        ) : <span style={{ color: 'var(--text-faint)', fontSize: '0.8rem' }}>{c.status}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN: Controls ────────────────────── */}
        <div style={{ flex: '0 0 38%', overflowY: 'auto', padding: '1.75rem 2rem 1.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', borderLeft: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>

          {/* Metadata */}
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <div className="section-heading" style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
              <Video size={15} color="var(--indigo-600)" /> Metadata
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              {[
                ['Duration', video.duration ? `${video.duration.toFixed(2)}s` : 'N/A'],
                ['Resolution', video.resolution || 'N/A'],
                ['FPS', video.fps || 'N/A'],
                ['Bitrate', video.bitrate ? `${Math.round(video.bitrate / 1000)} kbps` : 'N/A'],
              ].map(([label, val]) => (
                <div key={label} style={{ background: 'var(--bg-inset)', borderRadius: 'var(--radius-sm)', padding: '0.7rem 0.85rem' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>{label}</div>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-heading)', marginTop: '0.2rem' }}>{val}</div>
                </div>
              ))}
            </div>

            {/* Transcript */}
            {(translatedTranscript || video.transcript?.length > 0) && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  Transcript
                  {translateLanguage !== 'none' && <span className="status-chip pending" style={{ fontSize: '0.62rem' }}>{LANGUAGES.find(l => l.code === translateLanguage)?.name}</span>}
                </div>
                <div style={{ background: 'var(--bg-inset)', borderRadius: 'var(--radius-sm)', padding: '0.75rem', maxHeight: 130, overflowY: 'auto', fontSize: '0.82rem', lineHeight: 1.6, color: 'var(--text-body)', opacity: translating ? 0.5 : 1, transition: 'opacity 0.2s' }}>
                  {translating ? <span style={{ color: 'var(--text-faint)', fontStyle: 'italic' }}>Translating…</span> :
                    (translatedTranscript || video.transcript).map((w, i) => (
                      <span key={i} style={{ marginRight: '0.25rem', cursor: 'pointer' }} title={`${w.start?.toFixed(2)}s – ${w.end?.toFixed(2)}s`}>{w.text}</span>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Translation & Dubbing */}
          <div className="glass-panel" style={{ padding: '1.25rem', background: 'var(--indigo-50)', border: '1px solid var(--indigo-100)' }}>
            <div className="section-heading" style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
              <Globe size={15} color="var(--indigo-600)" /> Translation & Voice Dubbing
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>Target Language</label>
                <select className="input-field" value={translateLanguage} onChange={e => { const val = e.target.value; setTranslateLanguage(val); setCaptionLanguage(val === 'none' ? 'original' : 'translated'); }}>
                  <option value="none">None (No translation)</option>
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name} ({l.code})</option>)}
                </select>
              </div>

              {translateLanguage !== 'none' && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 0.9rem', background: '#fff', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-heading)' }}>AI Voice Clone</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Dub translated language with cloned voice</div>
                    </div>
                    <input type="checkbox" checked={dubVoice} onChange={e => setDubVoice(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--indigo-600)', cursor: 'pointer' }} />
                  </div>

                  {dubVoice && (
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>Dub Mix Mode</label>
                      <select className="input-field" value={dubMixMode} onChange={e => setDubMixMode(e.target.value)}>
                        <option value="replace">Replace Original Voice</option>
                        <option value="mix">Mix & Duck Original</option>
                      </select>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* AI Analysis */}
          {video.content_analysis && (
            <div className="glass-panel" style={{ padding: '1.25rem', background: 'var(--status-done-bg)', border: '1px solid var(--status-done-border)' }}>
              <div className="section-heading" style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--status-done-text)', borderBottomColor: 'var(--status-done-border)' }}>
                AI Insights
              </div>
              <p style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-heading)', marginBottom: '0.35rem' }}>Topic: {video.content_analysis.topic}</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{video.content_analysis.summary}</p>
              <ul style={{ paddingLeft: '1.1rem', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.8 }}>
                {video.content_analysis.key_points?.map((pt, i) => <li key={i}>{pt}</li>)}
              </ul>
            </div>
          )}

          {/* Crop metadata */}
          {video.crop_metadata?.trajectory && (
            <div className="glass-panel" style={{ padding: '1.25rem', background: 'var(--indigo-50)', border: '1px solid var(--indigo-100)' }}>
              <div className="section-heading" style={{ marginBottom: '0.6rem', fontSize: '0.9rem', color: 'var(--indigo-600)', borderBottomColor: 'var(--indigo-100)' }}>
                <Wand size={14} color="var(--indigo-600)" /> Smart Crop Trajectory
              </div>
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <span>Frames: <strong style={{ color: 'var(--text-heading)' }}>{video.crop_metadata.trajectory.length}</strong></span>
                <span>Format: <strong style={{ color: 'var(--text-heading)' }}>9:16</strong></span>
              </div>
            </div>
          )}

          {/* Pipeline Steps */}
          <div>
            <div className="section-heading" style={{ marginBottom: '0.85rem', fontSize: '0.9rem' }}>
              Neural Pipeline Steps
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {steps.map((step, idx) => {
                const cls = stepClass(step.status);
                const isActive = step.status === 'processing' || step.status === 'pending';
                return (
                  <div key={step.key} className={`pipeline-step ${cls}`}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: cls === 'done' ? 'var(--status-done-bg)' : cls === 'running' ? 'var(--status-run-bg)' : cls === 'failed' ? 'var(--status-fail-bg)' : 'var(--bg-inset)', border: `1.5px solid ${cls === 'done' ? 'var(--status-done-text)' : cls === 'running' ? 'var(--status-run-text)' : cls === 'failed' ? 'var(--status-fail-text)' : 'var(--border-medium)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.7rem', fontWeight: 800, color: cls === 'done' ? 'var(--status-done-text)' : cls === 'running' ? 'var(--status-run-text)' : cls === 'failed' ? 'var(--status-fail-text)' : 'var(--text-faint)' }}>
                      {cls === 'running' ? (
                        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}>
                          <RefreshCw size={11} />
                        </motion.div>
                      ) : cls === 'done' ? '✓' : cls === 'failed' ? '✕' : idx + 1}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-heading)' }}>{step.title}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                        {step.key === 'transcription' && step.status === 'processing' && pipelineStatus?.stage_label
                          ? <span style={{ color: 'var(--indigo-600)', fontWeight: 600 }}>{pipelineStatus.stage_label}</span>
                          : step.description}
                      </div>

                      {step.key === 'crop' && (
                        <div style={{ marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>FPS:</span>
                          <select value={targetFps} onChange={e => setTargetFps(e.target.value)} disabled={isActive} style={{ fontSize: '0.72rem', padding: '0.1rem 0.35rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-medium)', background: '#fff', color: 'var(--text-heading)' }}>
                            <option value={5}>5 (Fast)</option>
                            <option value={15}>15 (Smooth)</option>
                            <option value={30}>30 (Heavy)</option>
                            <option value={60}>60 (Extreme)</option>
                          </select>
                        </div>
                      )}
                    </div>

                    {step.canTrigger && (
                      <button
                        onClick={async () => {
                          try {
                            await step.triggerAction();
                            const all = await api.getVideos();
                            const u = all.find(v => v.id === video.id);
                            if (u) setVideo(u);
                          } catch (e) { console.error(e); }
                        }}
                        disabled={isActive}
                        style={{ flexShrink: 0, padding: '0.25rem 0.65rem', fontSize: '0.7rem', fontWeight: 700, borderRadius: 'var(--radius-sm)', border: `1px solid ${cls === 'done' ? 'var(--border-medium)' : 'var(--indigo-600)'}`, background: cls === 'done' ? 'var(--bg-inset)' : 'var(--indigo-50)', color: cls === 'done' ? 'var(--text-muted)' : 'var(--indigo-600)', cursor: isActive ? 'not-allowed' : 'pointer', opacity: isActive ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                      >
                        <RefreshCw size={10} />
                        {step.status && step.status !== 'none' && step.status !== 'idle' ? 'Re-run' : 'Run'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── PUBLISH MODAL ──────────────────────────────── */}
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
