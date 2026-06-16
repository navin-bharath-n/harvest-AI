import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Scissors, Mic, Wand2, PlayCircle, Film, RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import SocialPublishingPanel from './SocialPublishingPanel';

export default function VideoProcessingPage() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const [video, setVideo] = useState(null);
  const [clips, setClips] = useState([]);
  const [targetFps, setTargetFps] = useState(5);
  const [activePublishClip, setActivePublishClip] = useState(null);
  const [cacheBust, setCacheBust] = useState(Date.now());
  const videoRef = useRef(null);
  const previewVideoRef = useRef(null);
  const requestRef = useRef();

  useEffect(() => {
    async function loadVideoDetails() {
      try {
        const allVideos = await api.getVideos();
        const currentVideo = allVideos.find(v => v.id === parseInt(videoId));
        if (currentVideo) {
          setVideo(currentVideo);
        } else {
          navigate('/dashboard');
        }
      } catch (err) {
        console.error("Failed to load video details in Studio Page", err);
      }
    }
    loadVideoDetails();
  }, [videoId]);

  // Dynamic Crop Preview Logic
  const updatePreview = () => {
    if (!videoRef.current || !previewVideoRef.current || !video.crop_metadata || !video.crop_metadata.trajectory) {
      requestRef.current = requestAnimationFrame(updatePreview);
      return;
    }

    const currentTime = videoRef.current.currentTime;
    const trajectory = video.crop_metadata.trajectory;
    
    // Find the closest trajectory frame
    let currentCrop = trajectory[0];
    for (let i = 0; i < trajectory.length; i++) {
      if (trajectory[i].timestamp <= currentTime) {
        currentCrop = trajectory[i];
      } else {
        break;
      }
    }

    // Apply CSS transform
    const originalHeight = previewVideoRef.current.videoHeight || 1080;
    const previewHeight = previewVideoRef.current.clientHeight;
    
    if (originalHeight > 0 && previewHeight > 0 && currentCrop) {
      const scale = previewHeight / originalHeight;
      const tx = -(currentCrop.x * scale);
      previewVideoRef.current.style.transform = `translateX(${tx}px)`;
    }

    requestRef.current = requestAnimationFrame(updatePreview);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(updatePreview);
    return () => cancelAnimationFrame(requestRef.current);
  }, [video]);
  
  const isPipelineActive = video && (
    video.status === 'pending' || video.status === 'processing' ||
    video.transcription_status === 'pending' || video.transcription_status === 'processing' ||
    video.analysis_status === 'pending' || video.analysis_status === 'processing' ||
    video.highlight_status === 'pending' || video.highlight_status === 'processing' ||
    video.crop_status === 'pending' || video.crop_status === 'processing'
  );

  // Polling logic
  useEffect(() => {
    let intervalId;
    if (isPipelineActive) {
      intervalId = setInterval(async () => {
        try {
          const allVideos = await api.getVideos();
          const updated = allVideos.find(v => v.id === video.id);
          if (updated) {
            setVideo(updated);
          }
          
          const clipsRes = await fetch(`http://localhost:8000/api/v1/videos/${video.id}/clips`);
          if (clipsRes.ok) {
            const clipsData = await clipsRes.json();
            setClips(clipsData);
            setCacheBust(Date.now());
          }
        } catch (e) {
          console.error("Failed to poll video/clips status", e);
        }
      }, 2000);
    } else {
      // Fetch clips once if pipeline is idle
      fetch(`http://localhost:8000/api/v1/videos/${video.id}/clips`)
        .then(res => res.json())
        .then(data => {
          setClips(data);
          setCacheBust(Date.now());
        })
        .catch(console.error);
    }
    return () => clearInterval(intervalId);
  }, [video, isPipelineActive]);

  if (!video) return null;

  const getStepConfig = (status) => {
    if (status === 'completed' || status === 'done' || status === 'success') {
      return {
        color: '#10b981',
        bg: 'rgba(16, 185, 129, 0.1)',
        border: '#10b981',
        icon: '✓',
        label: 'Completed'
      };
    }
    if (status === 'processing') {
      return {
        color: '#fbbf24',
        bg: 'rgba(251, 191, 36, 0.1)',
        border: '#fbbf24',
        icon: '⟳',
        label: 'Running',
        spin: true
      };
    }
    if (status === 'pending') {
      return {
        color: '#a78bfa',
        bg: 'rgba(167, 139, 250, 0.1)',
        border: '#a78bfa',
        icon: '⏳',
        label: 'Pending'
      };
    }
    if (status === 'failed') {
      return {
        color: '#ef4444',
        bg: 'rgba(239, 68, 68, 0.1)',
        border: '#ef4444',
        icon: '✕',
        label: 'Failed'
      };
    }
    return {
      color: '#64748b',
      bg: 'rgba(255, 255, 255, 0.05)',
      border: 'rgba(255, 255, 255, 0.1)',
      icon: '○',
      label: 'Not Started'
    };
  };

  const steps = [
    {
      key: 'metadata',
      title: 'Video Metadata Extraction',
      description: 'Extract FPS, resolution, bitrate, and audio streams.',
      status: video.status,
      canTrigger: false,
    },
    {
      key: 'transcription',
      title: 'Audio Transcription (Whisper)',
      description: 'Convert audio track into word-level timestamps.',
      status: video.transcription_status,
      canTrigger: video.status === 'completed',
      triggerAction: async () => {
        await fetch(`http://localhost:8000/api/v1/videos/${video.id}/transcribe`, { method: 'POST' });
      }
    },
    {
      key: 'analysis',
      title: 'AI Content Analysis (Qwen3)',
      description: 'Understand topic, key scenes, and outline highlights.',
      status: video.analysis_status,
      canTrigger: video.transcription_status === 'completed',
      triggerAction: async () => {
        await fetch(`http://localhost:8000/api/v1/videos/${video.id}/analyze`, { method: 'POST' });
      }
    },
    {
      key: 'highlights',
      title: 'Highlight Candidates Selection',
      description: 'Detect top visual sequences and viral appeal.',
      status: video.highlight_status,
      canTrigger: video.analysis_status === 'completed',
      triggerAction: async () => {
        await fetch(`http://localhost:8000/api/v1/videos/${video.id}/detect-highlights`, { method: 'POST' });
      }
    },
    {
      key: 'crop',
      title: 'Smart Cropping Trajectory (9:16)',
      description: 'Track primary subjects for vertical formatting.',
      status: video.crop_status,
      canTrigger: video.status === 'completed',
      triggerAction: async () => {
        await fetch(`http://localhost:8000/api/v1/videos/${video.id}/smart-crop`, { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_fps: parseInt(targetFps) })
        });
      }
    }
  ];

  // Resolve media URL (assuming backend is on port 8000)
  const backendUrl = "http://localhost:8000";
  // The video path is stored like 'uploads\filename.mp4'. Convert to web URL:
  const videoUrl = video.storage_path ? `${backendUrl}/${video.storage_path.replace(/\\/g, '/')}?t=${cacheBust}` : '';
  const shortUrl = video.short_path ? `${backendUrl}/${video.short_path.replace(/\\/g, '/')}?t=${cacheBust}` : '';

  return (
    <motion.div
      initial={{ y: '100%', opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 120 }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'var(--bg-color)',
        padding: '2rem 4rem',
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        zIndex: 50
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button 
          onClick={() => navigate(`/project/${video.project_id}`)}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            padding: '0.8rem',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
        >
          <ChevronLeft size={24} />
        </button>
        <h2 style={{ margin: 0, fontSize: '2rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1 }}>
          {video.original_filename}
        </h2>
        

        <button 
          onClick={() => navigate(`/master-generator/${video.id}`)}
          className="btn-neon"
          style={{
            padding: '0.4rem 1.25rem',
            fontSize: '0.85rem',
            marginRight: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}
        >
          ✨ AI Shorts
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {(video.status === 'pending' || video.status === 'processing') && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
            >
              <RefreshCw size={20} color="#f5a623" />
            </motion.div>
          )}
          <span style={{
            background: video.status === 'completed' ? 'rgba(76, 245, 141, 0.2)' : 'rgba(245, 166, 35, 0.2)',
            color: video.status === 'completed' ? '#4cf58d' : '#f5a623',
            padding: '0.4rem 1rem',
            borderRadius: '12px',
            fontSize: '1rem',
            fontWeight: 'bold',
            textTransform: 'uppercase'
          }}>
            {video.status}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '2rem', flex: 1, height: '100%' }}>
        {/* Left Column: Video */}
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Media Player(s) Container */}
          <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
            
            {/* Main Video */}
            <div style={{
              flex: 1,
              borderRadius: '12px',
              overflow: 'hidden',
              background: '#000',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              {videoUrl ? (
                <video 
                  ref={videoRef}
                  src={videoUrl} 
                  controls 
                  style={{ width: '100%', display: 'block', maxHeight: '500px' }} 
                  poster=""
                  onPlay={() => previewVideoRef.current && previewVideoRef.current.play()}
                  onPause={() => previewVideoRef.current && previewVideoRef.current.pause()}
                  onSeeked={() => {
                    if (previewVideoRef.current && videoRef.current) {
                      previewVideoRef.current.currentTime = videoRef.current.currentTime;
                    }
                  }}
                  onTimeUpdate={() => {
                     // Keep preview perfectly in sync just in case
                     if (previewVideoRef.current && videoRef.current) {
                       if (Math.abs(previewVideoRef.current.currentTime - videoRef.current.currentTime) > 0.2) {
                         previewVideoRef.current.currentTime = videoRef.current.currentTime;
                       }
                     }
                  }}
                />
              ) : (
                <div style={{ padding: '4rem', textAlign: 'center', color: '#666' }}>No video source</div>
              )}
            </div>

            {/* Smart Crop Preview Video (Only visible if crop trajectory exists) */}
            {video.crop_metadata && video.crop_metadata.trajectory && videoUrl && (
              <div style={{
                height: videoRef.current ? `${videoRef.current.clientHeight}px` : '500px',
                aspectRatio: '9/16',
                borderRadius: '12px',
                overflow: 'hidden',
                background: '#000',
                boxShadow: '0 8px 32px rgba(59, 130, 246, 0.4)',
                border: '2px solid #3b82f6',
                position: 'relative'
              }}>
                <video 
                  ref={previewVideoRef}
                  src={videoUrl} 
                  muted // Must be muted so it doesn't echo the main video audio
                  style={{ 
                    height: '100%', 
                    maxWidth: 'none',
                    display: 'block',
                    transformOrigin: 'top left',
                    willChange: 'transform' // Optimize for smooth animation
                  }} 
                />
                <div style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  background: 'rgba(0,0,0,0.6)',
                  color: '#3b82f6',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem'
                }}>
                  <Wand2 size={12} /> AI Crop Preview
                </div>
              </div>
            )}
          </div>
          
          {/* Generated Short */}
          {shortUrl && (
            <div>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#4cf58d', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Film size={20} /> Automatically Generated Short (15s)
              </h3>
              <div style={{
                width: '100%',
                borderRadius: '12px',
                overflow: 'hidden',
                background: '#000',
                boxShadow: '0 8px 32px rgba(76, 245, 141, 0.2)',
                border: '1px solid rgba(76, 245, 141, 0.3)'
              }}>
                <video 
                  src={shortUrl} 
                  controls 
                  style={{ width: '100%', display: 'block', maxHeight: '400px' }} 
                />
              </div>
            </div>
          )}

          {/* Highlight Clips */}
          {video.highlights && video.highlights.clips && (
            <div>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#f5a623', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Scissors size={20} /> Top 5 Highlight Candidates
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {video.highlights.clips.map((clip, idx) => (
                  <div key={idx} style={{
                    background: 'rgba(245, 166, 35, 0.1)',
                    border: '1px solid rgba(245, 166, 35, 0.3)',
                    borderRadius: '8px',
                    padding: '1rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <h4 style={{ margin: 0, color: '#f5a623', fontSize: '1.1rem' }}>{idx + 1}. {clip.title}</h4>
                      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.9rem' }}>
                        <span title="Viral Score">🔥 {clip.viral_score}/100</span>
                        <span title="Importance Score">⭐ {clip.importance_score}/100</span>
                      </div>
                    </div>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: '#ddd' }}>{clip.reason}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.85rem', color: '#aaa', background: 'rgba(0,0,0,0.5)', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
                        {clip.start_time}s - {clip.end_time}s
                      </span>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button 
                          onClick={() => {
                            if (videoRef.current) {
                              videoRef.current.currentTime = clip.start_time;
                              videoRef.current.play();
                            }
                          }}
                          style={{
                            background: 'transparent', border: '1px solid #f5a623', color: '#f5a623',
                            padding: '0.3rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem',
                            display: 'flex', alignItems: 'center', gap: '0.3rem'
                          }}
                        >
                          <PlayCircle size={14} /> Preview
                        </button>
                        <button 
                          onClick={async () => {
                            try {
                              await fetch(`http://localhost:8000/api/v1/videos/${video.id}/clips`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  title: clip.title,
                                  start_time: clip.start_time,
                                  end_time: clip.end_time
                                })
                              });
                            } catch (e) {
                              console.error('Failed to trigger render', e);
                            }
                          }}
                          disabled={video.crop_status !== 'completed'}
                          title={video.crop_status !== 'completed' ? 'Generate Smart Crop first' : ''}
                          style={{
                            background: video.crop_status !== 'completed' ? 'rgba(255,255,255,0.1)' : '#f5a623', 
                            border: 'none', 
                            color: video.crop_status !== 'completed' ? '#aaa' : '#000',
                            padding: '0.3rem 0.8rem', borderRadius: '4px', cursor: video.crop_status !== 'completed' ? 'not-allowed' : 'pointer', fontSize: '0.8rem',
                            display: 'flex', alignItems: 'center', gap: '0.3rem',
                            fontWeight: 'bold'
                          }}
                        >
                          <Film size={14} /> Render Clip
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
              <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#4cf58d', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Film size={20} /> Exported Clips
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {clips.map(c => (
                  <div key={c.id} style={{
                    background: 'rgba(76, 245, 141, 0.1)',
                    border: '1px solid rgba(76, 245, 141, 0.3)',
                    borderRadius: '8px',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4 style={{ margin: 0, color: '#4cf58d', fontSize: '1rem' }}>{c.title || `Clip ${c.id}`}</h4>
                      {c.status === 'completed' && (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => {
                              setActivePublishClip(c);
                            }}
                            style={{
                              background: 'transparent',
                              border: '1px solid rgba(167, 139, 250, 0.4)',
                              color: '#c084fc',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: '600'
                            }}
                          >
                            🚀 Publish
                          </button>
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#aaa', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{c.duration.toFixed(1)}s</span>
                      <span style={{ textTransform: 'uppercase' }}>{c.status}</span>
                    </div>
                    {c.status === 'completed' && c.storage_path ? (
                      <video 
                        src={`http://localhost:8000/${c.storage_path}?t=${cacheBust}`} 
                        controls 
                        style={{ width: '100%', borderRadius: '4px', marginTop: '0.5rem' }} 
                      />
                    ) : (
                      <div style={{ 
                        height: '150px', 
                        background: 'rgba(0,0,0,0.3)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        borderRadius: '4px',
                        color: '#666',
                        marginTop: '0.5rem'
                      }}>
                        {c.status === 'rendering' ? (
                          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}>
                            <RefreshCw size={24} color="#4cf58d" />
                          </motion.div>
                        ) : c.status}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Metadata & Actions */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Metadata */}
          <div>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--accent-color)' }}>Metadata</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="meta-chip">
                <span style={{ fontSize: '0.8rem', color: '#aaa', textTransform: 'uppercase' }}>Duration</span>
                <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{video.duration ? `${video.duration.toFixed(2)}s` : 'N/A'}</div>
              </div>
              <div className="meta-chip">
                <span style={{ fontSize: '0.8rem', color: '#aaa', textTransform: 'uppercase' }}>Resolution</span>
                <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{video.resolution || 'N/A'}</div>
              </div>
              <div className="meta-chip">
                <span style={{ fontSize: '0.8rem', color: '#aaa', textTransform: 'uppercase' }}>FPS</span>
                <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{video.fps || 'N/A'}</div>
              </div>
              <div className="meta-chip">
                <span style={{ fontSize: '0.8rem', color: '#aaa', textTransform: 'uppercase' }}>Bitrate</span>
                <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{video.bitrate ? `${Math.round(video.bitrate / 1000)} kbps` : 'N/A'}</div>
              </div>
            </div>
            
            {/* Transcript Preview */}
            {video.transcript && video.transcript.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <h4 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: 'var(--accent-color)' }}>Transcript ({video.transcript.length} words)</h4>
                <div style={{ 
                  background: 'rgba(0,0,0,0.3)', 
                  padding: '1rem', 
                  borderRadius: '8px', 
                  maxHeight: '150px', 
                  overflowY: 'auto',
                  border: '1px solid rgba(255,255,255,0.05)',
                  fontSize: '0.9rem',
                  lineHeight: '1.5'
                }}>
                  {video.transcript.map((w, i) => (
                    <span key={i} style={{ marginRight: '0.3rem', cursor: 'pointer' }} title={`${w.start}s - ${w.end}s`}>
                      {w.text}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* AI Analysis Preview */}
          {video.content_analysis && (
            <div style={{ marginTop: '1.5rem', background: 'rgba(76, 245, 141, 0.1)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(76, 245, 141, 0.3)' }}>
              <h4 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: '#4cf58d' }}>AI Insights</h4>
              <p style={{ margin: '0 0 0.5rem', fontWeight: 'bold' }}>Topic: {video.content_analysis.topic}</p>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>{video.content_analysis.summary}</p>
              <ul style={{ margin: '0', paddingLeft: '1.2rem', fontSize: '0.85rem' }}>
                {video.content_analysis.key_points && video.content_analysis.key_points.map((pt, i) => <li key={i}>{pt}</li>)}
              </ul>
            </div>
          )}

          {/* Smart Crop Preview */}
          {video.crop_metadata && video.crop_metadata.trajectory && (
            <div style={{ marginTop: '1.5rem', background: 'rgba(59, 130, 246, 0.1)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
              <h4 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: '#3b82f6' }}>Smart Cropping Trajectory (9:16)</h4>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>Successfully tracked primary subjects and generated smooth cinematic pan coordinates.</p>
              <div style={{ fontSize: '0.85rem', color: '#aaa', display: 'flex', gap: '1rem' }}>
                <span>Frames Tracked: {video.crop_metadata.trajectory.length}</span>
                <span>Aspect Ratio: 9:16</span>
              </div>
            </div>
          )}

          {/* Neural Pipeline Steps Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: 'var(--accent-color)' }}>Neural Pipeline Steps</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative', paddingLeft: '0.5rem', marginTop: '0.5rem' }}>
              
              {/* Vertical timeline connector line */}
              <div style={{
                position: 'absolute',
                top: '15px',
                left: '21px',
                bottom: '15px',
                width: '2px',
                background: 'rgba(255,255,255,0.08)',
                zIndex: 1
              }} />

              {steps.map((step, idx) => {
                const config = getStepConfig(step.status);
                const isProcessing = step.status === 'processing' || step.status === 'pending';

                return (
                  <div key={step.key} style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start', position: 'relative', zIndex: 2 }}>
                    
                    {/* Circle Node */}
                    <div style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '50%',
                      background: config.bg,
                      border: `2px solid ${config.border}`,
                      color: config.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      fontSize: '0.95rem',
                      boxShadow: isProcessing ? `0 0 10px ${config.color}` : 'none',
                      flexShrink: 0
                    }}>
                      {config.spin ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <RefreshCw size={14} />
                        </motion.div>
                      ) : (
                        step.status === 'completed' || step.status === 'done' || step.status === 'success' ? (
                          <span style={{ fontSize: '0.85rem' }}>✓</span>
                        ) : step.status === 'failed' ? (
                          <span style={{ fontSize: '0.85rem' }}>✕</span>
                        ) : (
                          <span>{idx + 1}</span>
                        )
                      )}
                    </div>

                    {/* Step details */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#fff', fontWeight: 600 }}>{step.title}</h4>
                        
                        {/* Trigger / Re-run Action */}
                        {step.canTrigger && (
                          <button
                            onClick={async () => {
                              try {
                                await step.triggerAction();
                                // Refresh current video data instantly to start polling
                                const allVideos = await api.getVideos();
                                const updated = allVideos.find(v => v.id === video.id);
                                if (updated) setVideo(updated);
                              } catch (e) {
                                console.error(`Failed to trigger step ${step.key}`, e);
                              }
                            }}
                            disabled={isProcessing}
                            style={{
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              color: isProcessing ? '#475569' : 'var(--accent-color)',
                              cursor: isProcessing ? 'not-allowed' : 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              padding: '0.25rem 0.6rem',
                              borderRadius: '6px',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => { if(!isProcessing) e.currentTarget.style.background = 'rgba(139,92,246,0.15)'; }}
                            onMouseLeave={e => { if(!isProcessing) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}
                          >
                            <RefreshCw size={11} /> {step.status === 'none' ? 'Run' : 'Re-run'}
                          </button>
                        )}
                      </div>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{step.description}</p>
                      
                      {/* Sub-controls (FPS selector for crop step) */}
                      {step.key === 'crop' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Target FPS:</span>
                          <select 
                            value={targetFps} 
                            onChange={e => setTargetFps(e.target.value)}
                            style={{ 
                              background: 'rgba(0,0,0,0.3)', 
                              color: 'white', 
                              border: '1px solid rgba(255,255,255,0.1)', 
                              borderRadius: '6px',
                              padding: '0.15rem 0.4rem',
                              fontSize: '0.75rem'
                            }}
                            disabled={isProcessing}
                          >
                            <option value={5}>5 FPS (Fast)</option>
                            <option value={15}>15 FPS (Smooth)</option>
                            <option value={30}>30 FPS (Heavy)</option>
                            <option value={60}>60 FPS (Extreme)</option>
                          </select>
                        </div>
                      )}
                    </div>

                  </div>
                );
              })}

            </div>
          </div>
        </div>
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
