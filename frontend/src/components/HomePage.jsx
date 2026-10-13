import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Mic, Sparkles, Smartphone, Subtitles, Share2,
  LogIn, FolderPlus, UploadCloud, ArrowRight,
  Video, Film, CheckCircle2, Play
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Navbar from './Navbar';
import Footer from './Footer';

/* Subtle one-time reveal on scroll */
function Reveal({ children, delay = 0 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.05, rootMargin: '0px 0px -20px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`hv-reveal${visible ? ' hv-in' : ''}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* Illustration data: a fixed waveform with three highlighted moments */
const BARS = Array.from({ length: 56 }, (_, i) => {
  const v = Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.45));
  return 20 + Math.round(v * 70);
});
const HIGHLIGHTS = [
  [6, 12],
  [23, 31],
  [41, 47],
];
const highlightIndex = (i) => HIGHLIGHTS.findIndex(([a, b]) => i >= a && i <= b);

function ClipIllustration() {
  return (
    <div className="hv-figure" aria-hidden="true">
      <div className="hv-fig-top-bar">
        <div className="hv-fig-label">
          <span className="hv-live-dot" />
          <span>Source Recording · Audio Waveform</span>
        </div>
        <span className="hv-fig-time">14:35</span>
      </div>

      <div className="hv-wave-container">
        <div className="hv-wave">
          {BARS.map((h, i) => {
            const hl = highlightIndex(i);
            const isHot = hl >= 0;
            const barDelay = (i * 0.011).toFixed(3);
            const hotDelay = isHot ? (0.32 + hl * 0.12).toFixed(2) : 0;
            return (
              <span
                key={i}
                className={isHot ? 'hv-bar hv-hot' : 'hv-bar'}
                style={{
                  height: `${h}%`,
                  '--delay': `${barDelay}s`,
                  '--hot-delay': `${hotDelay}s`,
                }}
              />
            );
          })}
        </div>
      </div>

      <div className="hv-wave-tags">
        <span className="hv-wave-tag">⚡ 01 Hook (0:45)</span>
        <span className="hv-wave-tag">🔥 02 Highlight (0:58)</span>
        <span className="hv-wave-tag">💡 03 Insight (0:32)</span>
      </div>

      <div className="hv-fig-label hv-fig-label-2">
        <span>AI Generated 9:16 Vertical Shorts</span>
      </div>

      <div className="hv-clips">
        <div className="hv-clip" style={{ '--c': '0.2s' }}>
          <div className="hv-clip-badge">Shorts · 0:45</div>
          <div className="hv-clip-person">
            <span className="hv-head" />
            <span className="hv-body" />
          </div>
          <div className="hv-clip-caption">
            <span className="hv-caption-pill">"The secret to 10x growth"</span>
          </div>
          <div className="hv-clip-platform">YouTube Shorts</div>
        </div>

        <div className="hv-clip hv-clip-active" style={{ '--c': '0.35s' }}>
          <div className="hv-clip-badge active">TikTok · 0:58</div>
          <div className="hv-clip-person">
            <span className="hv-head active" />
            <span className="hv-body active" />
          </div>
          <div className="hv-clip-caption">
            <span className="hv-caption-pill active">"Most people get this wrong!"</span>
          </div>
          <div className="hv-clip-platform active">TikTok</div>
        </div>

        <div className="hv-clip" style={{ '--c': '0.5s' }}>
          <div className="hv-clip-badge">Reels · 0:32</div>
          <div className="hv-clip-person">
            <span className="hv-head" />
            <span className="hv-body" />
          </div>
          <div className="hv-clip-caption">
            <span className="hv-caption-pill">"Here is how it works..."</span>
          </div>
          <div className="hv-clip-platform">Instagram</div>
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  {
    icon: Mic,
    t: 'Audio transcription',
    d: 'Whisper AI model converts spoken dialogue into precise timestamps with word-level accuracy.',
    badge: '01'
  },
  {
    icon: Sparkles,
    t: 'Hook & highlight detection',
    d: 'AI identifies high-retention moments, conversational climaxes, and strong opening hooks.',
    badge: '02'
  },
  {
    icon: Smartphone,
    t: 'Dynamic vertical framing',
    d: 'Face and speaker tracking automatically crops and centers the active speaker for 9:16 mobile screens.',
    badge: '03'
  },
  {
    icon: Subtitles,
    t: 'Kinetic synchronized subtitles',
    d: 'Animated captions are rhythmically synced to speech so clips grab attention even with sound muted.',
    badge: '04'
  },
  {
    icon: Share2,
    t: 'Instant export & publishing',
    d: 'Download 1080×1920 HD vertical MP4 clips or publish directly to YouTube Shorts, TikTok, and Instagram.',
    badge: '05'
  },
];

const UPLOAD = [
  {
    icon: LogIn,
    t: 'Sign in to your account',
    d: 'Create a free account or sign in to your dedicated creator workspace.',
    step: 'Step 1'
  },
  {
    icon: FolderPlus,
    t: 'Select or create a project',
    d: 'Organize series, episodes, or client videos cleanly within project folders.',
    step: 'Step 2'
  },
  {
    icon: UploadCloud,
    t: 'Upload file or paste link',
    d: 'Drop any MP4, MOV, or WebM video file, or paste a YouTube URL for instant 1-click ingest.',
    step: 'Step 3'
  },
];

export default function HomePage() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="hv-page">
      <style>{css}</style>

      <Navbar />

      <main>
        {/* Hero */}
        <section className="hv-hero">
          <div className="hv-container hv-hero-grid">
            <div className="hv-hero-content">
              <div className="hv-eyebrow hv-fade" style={{ animationDelay: '0ms' }}>
                <Sparkles size={13} />
                <span>AI-Powered Short Video Creator</span>
              </div>

              <h1 className="hv-title hv-fade" style={{ animationDelay: '80ms' }}>
                Turn long recordings into short vertical clips.
              </h1>

              <p className="hv-lead hv-fade" style={{ animationDelay: '160ms' }}>
                Harvest takes podcasts, interviews, and long videos and extracts viral moments,
                framing active speakers into ready-to-publish 9:16 vertical shorts with captions.
              </p>

              <div className="hv-cta hv-fade" style={{ animationDelay: '240ms' }}>
                {isAuthenticated ? (
                  <Link to="/studio" className="hv-btn">
                    <span>Open Studio</span>
                    <ArrowRight size={16} />
                  </Link>
                ) : (
                  <Link to="/register" className="hv-btn">
                    <span>Get Started Free</span>
                    <ArrowRight size={16} />
                  </Link>
                )}
                <a href="#how-it-works" className="hv-link">
                  See how it works
                </a>
              </div>

              <p className="hv-note hv-fade" style={{ animationDelay: '300ms' }}>
                <CheckCircle2 size={14} color="#1f6f4a" />
                <span>Supports MP4, MOV, WebM &amp; YouTube URLs</span>
              </p>
            </div>

            <div className="hv-hero-visual hv-fade" style={{ animationDelay: '140ms' }}>
              <ClipIllustration />
            </div>
          </div>
        </section>

        {/* Supported Platforms Ribbon */}
        <section className="hv-ribbon">
          <div className="hv-container hv-ribbon-inner">
            <span className="hv-ribbon-label">Optimized for vertical feeds:</span>
            <div className="hv-ribbon-pills">
              <span className="hv-pill">YouTube Shorts</span>
              <span className="hv-pill">TikTok</span>
              <span className="hv-pill">Instagram Reels</span>
              <span className="hv-pill">Facebook Reels</span>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="hv-section hv-rule">
          <div className="hv-container hv-split">
            <Reveal>
              <div className="hv-split-head">
                <span className="hv-section-tag">AI PIPELINE</span>
                <h2 className="hv-h2">How short videos are generated</h2>
                <p className="hv-sub">
                  Five automated stages from raw speech to finished vertical short. You upload, Harvest does the cutting.
                </p>
                <div className="hv-split-cta">
                  <Link to={isAuthenticated ? '/studio' : '/register'} className="hv-split-btn">
                    <span>Try it on your video</span>
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            </Reveal>

            <ol className="hv-steps">
              {STEPS.map((s, i) => {
                const IconComponent = s.icon;
                return (
                  <li key={s.t}>
                    <Reveal delay={i * 50}>
                      <div className="hv-step-card">
                        <div className="hv-step-icon-wrap">
                          <IconComponent size={20} />
                        </div>
                        <div className="hv-step-content">
                          <div className="hv-step-top">
                            <span className="hv-step-n">STAGE {s.badge}</span>
                          </div>
                          <h3>{s.t}</h3>
                          <p>{s.d}</p>
                        </div>
                      </div>
                    </Reveal>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* Upload */}
        <section className="hv-section hv-tint hv-rule">
          <div className="hv-container">
            <Reveal>
              <div className="hv-center-head">
                <span className="hv-section-tag">WORKFLOW</span>
                <h2 className="hv-h2">How to upload</h2>
                <p className="hv-sub">
                  Files are processed securely within your workspace in three simple steps.
                </p>
              </div>
            </Reveal>

            <div className="hv-upload">
              {UPLOAD.map((u, i) => {
                const IconComponent = u.icon;
                return (
                  <Reveal key={u.t} delay={i * 60}>
                    <div className="hv-upload-card">
                      <div className="hv-upload-card-top">
                        <div className="hv-upload-icon-box">
                          <IconComponent size={20} />
                        </div>
                        <span className="hv-upload-n">{u.step}</span>
                      </div>
                      <h3>{u.t}</h3>
                      <p>{u.d}</p>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="hv-section">
          <div className="hv-container">
            <Reveal>
              <div className="hv-closing">
                <div className="hv-closing-text">
                  <span className="hv-section-tag">GET STARTED TODAY</span>
                  <h2 className="hv-h2 hv-h2-tight">Ready to try it on your own footage?</h2>
                  <p className="hv-sub hv-sub-left">
                    Create an account, drop your video, and generate your first viral shorts in minutes.
                  </p>
                </div>
                <div className="hv-closing-cta">
                  {isAuthenticated ? (
                    <Link to="/studio" className="hv-btn hv-btn-lg">
                      <span>Open Studio</span>
                      <ArrowRight size={17} />
                    </Link>
                  ) : (
                    <Link to="/register" className="hv-btn hv-btn-lg">
                      <span>Get Started Free</span>
                      <ArrowRight size={17} />
                    </Link>
                  )}
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

const css = `
.hv-page{
  --ink:#16181d; --muted:#5b616b; --line:#e6e6e1; --tint:#fafaf8;
  --accent:#1f6f4a; --accent-dark:#185a3c; --accent-subtle:#ecfdf5; --idle:#e2e8f0;
  min-height:100vh;display:flex;flex-direction:column;background:#fff;color:var(--ink);
  font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased;
}
.hv-page main{flex:1}
.hv-container{width:100%;max-width:1120px;margin:0 auto;padding:0 1.5rem;box-sizing:border-box}
.hv-page h1,.hv-page h2{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-weight:700;letter-spacing:-0.02em;color:var(--ink)}
.hv-page a:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:4px}

/* Eyebrow badge */
.hv-eyebrow{
  display:inline-flex;align-items:center;gap:.45rem;padding:.3rem .75rem;
  background:var(--accent-subtle);border:1px solid #a7f3d0;color:var(--accent);
  border-radius:999px;font-size:.78rem;font-weight:700;letter-spacing:.03em;
  margin-bottom:1rem;
}

.hv-section-tag{
  display:inline-block;font-size:.72rem;font-weight:700;letter-spacing:.08em;
  text-transform:uppercase;color:var(--accent);margin-bottom:.45rem;
}

/* Hero */
.hv-hero{padding:4.5rem 0 5rem}
.hv-hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:3.5rem;align-items:center}
.hv-title{font-size:clamp(2.3rem,4.5vw,3.4rem);line-height:1.12;margin:0 0 1.25rem}
.hv-lead{font-size:1.12rem;line-height:1.65;color:var(--muted);margin:0 0 2rem;max-width:32rem}
.hv-cta{display:flex;align-items:center;flex-wrap:wrap;gap:1.25rem;margin-bottom:1.5rem}
.hv-btn{
  display:inline-flex;align-items:center;gap:.5rem;padding:.8rem 1.6rem;
  background:var(--accent);color:#fff;font-size:1rem;font-weight:600;
  text-decoration:none;border-radius:8px;box-shadow:0 2px 8px rgba(31,111,74,.24);
  transition:all .18s ease;cursor:pointer;
}
.hv-btn:hover{background:var(--accent-dark);transform:translateY(-1px);box-shadow:0 4px 12px rgba(31,111,74,.32)}
.hv-btn-lg{padding:.9rem 1.8rem;font-size:1.05rem}
.hv-link{
  color:var(--ink);font-weight:600;font-size:.98rem;text-decoration:underline;
  text-decoration-color:#b9b9b2;text-underline-offset:4px;transition:all .15s ease;
}
.hv-link:hover{text-decoration-color:var(--ink);color:var(--accent)}
.hv-note{
  display:inline-flex;align-items:center;gap:.45rem;margin:0;font-size:.85rem;color:#64748b;font-weight:500;
}

/* Supported platforms ribbon */
.hv-ribbon{background:#fafaf8;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:1.1rem 0}
.hv-ribbon-inner{display:flex;align-items:center;justify-content:center;gap:1.25rem;flex-wrap:wrap}
.hv-ribbon-label{font-size:.825rem;font-weight:600;color:#64748b}
.hv-ribbon-pills{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap}
.hv-pill{
  display:inline-flex;align-items:center;padding:3px 10px;background:#ffffff;
  border:1px solid #e2e8f0;border-radius:6px;font-size:.78rem;font-weight:600;
  color:#334155;box-shadow:0 1px 2px rgba(0,0,0,.03);
}

/* Illustration Dashboard */
.hv-figure{
  border:1px solid var(--line);border-radius:14px;padding:1.4rem;background:#ffffff;
  box-shadow:0 6px 24px rgba(0,0,0,.04);
}
.hv-fig-top-bar{display:flex;align-items:center;justify-content:space-between;margin-bottom:.85rem}
.hv-fig-label{
  display:flex;align-items:center;gap:.45rem;font-size:.75rem;font-weight:700;
  letter-spacing:.05em;text-transform:uppercase;color:#64748b;
}
.hv-live-dot{
  width:8px;height:8px;border-radius:50%;background:#10b981;
  box-shadow:0 0 0 2px rgba(16,185,129,.25);
  animation:hvDotStart .5s cubic-bezier(0.16,1,0.3,1) forwards;
}
.hv-fig-time{
  font-size:.78rem;font-weight:700;color:#059669;background:#ecfdf5;
  padding:2px 8px;border-radius:4px;border:1px solid #a7f3d0;font-variant-numeric:tabular-nums;
}
.hv-fig-label-2{margin:1.4rem 0 .75rem;font-size:.75rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#64748b}

.hv-wave-container{
  position:relative;overflow:hidden;border-radius:6px;background:#f8fafc;
  padding:4px 2px;border:1px solid #f1f5f9;
}
.hv-wave{display:flex;align-items:center;gap:2.5px;height:68px;padding:0 2px}
.hv-bar{
  flex:1;border-radius:2px;background:var(--idle);
  transform-origin:bottom center;
  animation:hvBarGrow .6s cubic-bezier(0.16,1,0.3,1) both;
  animation-delay:var(--delay, 0s);
}
.hv-bar.hv-hot{
  animation:hvBarGrow .6s cubic-bezier(0.16,1,0.3,1) both, hvHotStart .45s ease forwards;
  animation-delay:var(--delay, 0s), var(--hot-delay, .32s);
}

.hv-wave-tags{display:flex;align-items:center;gap:.45rem;margin-top:.7rem;flex-wrap:wrap}
.hv-wave-tag{
  font-size:.7rem;font-weight:600;color:#1e293b;background:#f1f5f9;
  border:1px solid #e2e8f0;border-radius:4px;padding:2px 7px;
  animation:hvFadeUp .45s ease both;animation-delay:.35s;
}

.hv-clips{display:flex;gap:.85rem;justify-content:space-between}
.hv-clip{
  flex:1;max-width:115px;aspect-ratio:9/16;border:1px solid #e2e8f0;border-radius:10px;
  background:#f8fafc;position:relative;overflow:hidden;opacity:0;
  display:flex;flex-direction:column;justify-content:space-between;padding:6px;box-sizing:border-box;
  animation:hvCardStart .6s cubic-bezier(0.16,1,0.3,1) forwards;
  animation-delay:var(--c, .2s);
  transition:transform .2s ease, box-shadow .2s ease;
}
.hv-clip.hv-clip-active{
  border-color:#10b981;background:#f0fdf4;box-shadow:0 4px 14px rgba(16,185,129,.16);
}
.hv-clip:hover{
  transform:translateY(-3px);
  box-shadow:0 6px 18px rgba(0,0,0,.07);
}
.hv-clip.hv-clip-active:hover{
  box-shadow:0 8px 22px rgba(16,185,129,.24);
}
.hv-clip-badge{
  font-size:.62rem;font-weight:700;color:#475569;background:#e2e8f0;
  padding:1px 5px;border-radius:4px;text-align:center;letter-spacing:.02em;
}
.hv-clip-badge.active{background:#dcfce7;color:#15803d;border:1px solid #bbf7d0}
.hv-clip-person{
  display:flex;flex-direction:column;align-items:center;margin:auto 0;
}
.hv-head{width:22px;height:22px;border-radius:50%;background:#cbd5e1}
.hv-head.active{background:#86efac}
.hv-body{width:42px;height:32px;margin-top:4px;border-radius:18px 18px 0 0;background:#cbd5e1}
.hv-body.active{background:#86efac}
.hv-clip-caption{padding:2px 0}
.hv-caption-pill{
  display:block;font-size:.58rem;font-weight:700;color:#0f172a;background:#ffffff;
  border-radius:4px;padding:2px 4px;text-align:center;border:1px solid #e2e8f0;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.hv-caption-pill.active{background:#ecfdf5;border-color:#a7f3d0;color:#047857}
.hv-clip-platform{
  font-size:.58rem;font-weight:700;color:#64748b;text-align:center;
  padding-top:2px;letter-spacing:.02em;
}
.hv-clip-platform.active{color:#059669}

/* Sections */
.hv-section{padding:5rem 0}
.hv-rule{border-top:1px solid var(--line)}
.hv-tint{background:var(--tint)}
.hv-h2{font-size:clamp(1.75rem,3.2vw,2.3rem);line-height:1.2;margin:0 0 .75rem}
.hv-h2-tight{margin-bottom:.5rem}
.hv-sub{font-size:1.05rem;line-height:1.65;color:var(--muted);margin:0;max-width:30rem}
.hv-sub-left{max-width:none}
.hv-center-head{text-align:center;max-width:32rem;margin:0 auto 3rem}
.hv-center-head .hv-sub{margin:0 auto}

/* Split layout for Steps */
.hv-split{display:grid;grid-template-columns:.85fr 1.15fr;gap:4.5rem;align-items:start}
.hv-split-head{position:sticky;top:3rem}
.hv-split-cta{margin-top:1.5rem}
.hv-split-btn{
  display:inline-flex;align-items:center;gap:.45rem;padding:.6rem 1.2rem;
  background:#ffffff;color:var(--accent);border:1.5px solid var(--accent);
  border-radius:6px;font-size:.9rem;font-weight:600;text-decoration:none;
  transition:all .15s ease;
}
.hv-split-btn:hover{background:var(--accent-subtle)}

.hv-steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.9rem}
.hv-step-card{
  display:flex;align-items:flex-start;gap:1.25rem;padding:1.35rem;
  background:#ffffff;border:1px solid var(--line);border-radius:12px;
  box-shadow:0 1px 3px rgba(0,0,0,.03);transition:all .2s ease;
}
.hv-step-card:hover{
  border-color:#cbd5e1;transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.05);
}
.hv-step-icon-wrap{
  width:42px;height:42px;border-radius:10px;background:var(--accent-subtle);
  border:1px solid #a7f3d0;display:flex;align-items:center;justify-content:center;
  color:var(--accent);flex-shrink:0;
}
.hv-step-content{flex:1;min-width:0}
.hv-step-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:.3rem}
.hv-step-n{
  font-size:.7rem;font-weight:700;color:#64748b;letter-spacing:.06em;
  background:#f1f5f9;padding:1px 6px;border-radius:4px;
}
.hv-step-card h3{margin:0 0 .35rem;font-size:1.08rem;font-weight:700;color:var(--ink)}
.hv-step-card p{margin:0;font-size:.92rem;line-height:1.55;color:var(--muted)}

/* Upload Section */
.hv-upload{display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem}
.hv-upload-card{
  background:#ffffff;border:1px solid var(--line);border-radius:12px;padding:1.6rem 1.4rem;
  box-shadow:0 1px 3px rgba(0,0,0,.03);transition:all .2s ease;display:flex;flex-direction:column;
}
.hv-upload-card:hover{
  border-color:#cbd5e1;transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.05);
}
.hv-upload-card-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem}
.hv-upload-icon-box{
  width:40px;height:40px;border-radius:10px;background:#f8fafc;
  border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:center;
  color:#1e293b;
}
.hv-upload-n{
  font-size:.72rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
  color:var(--accent);background:var(--accent-subtle);padding:2px 8px;border-radius:999px;
  border:1px solid #a7f3d0;
}
.hv-upload-card h3{margin:0 0 .4rem;font-size:1.1rem;font-weight:700;color:var(--ink)}
.hv-upload-card p{margin:0;font-size:.92rem;line-height:1.55;color:var(--muted)}

/* Closing CTA Card */
.hv-closing{
  display:flex;align-items:center;justify-content:space-between;gap:2.5rem;
  background:linear-gradient(135deg, #ffffff 0%, #f7fdf9 100%);
  border:1.5px solid #a7f3d0;border-radius:16px;padding:3rem;
  box-shadow:0 4px 20px rgba(31,111,74,.06);
}
.hv-closing-text{flex:1;max-width:32rem}
.hv-closing-cta{flex-shrink:0}

/* Motion */
.hv-reveal{opacity:0;transform:translateY(12px);transition:opacity .5s ease,transform .5s ease}
.hv-reveal.hv-in{opacity:1;transform:none}
.hv-fade{opacity:0;animation:hvUp .6s ease forwards}
@keyframes hvUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}

/* Start animations only (one-time on mount, no continuous loop) */
@keyframes hvDotStart{
  from{transform:scale(0);opacity:0}
  to{transform:scale(1);opacity:1}
}

@keyframes hvBarGrow{
  0%{transform:scaleY(0);opacity:.25}
  100%{transform:scaleY(1);opacity:1}
}

@keyframes hvHotStart{
  from{background:var(--idle)}
  to{background:#10b981}
}

@keyframes hvFadeUp{
  from{opacity:0;transform:translateY(6px)}
  to{opacity:1;transform:none}
}

@keyframes hvCardStart{
  from{opacity:0;transform:translateY(14px)}
  to{opacity:1;transform:translateY(0)}
}

/* Mobile optimizations (<= 768px) */
@media (max-width:768px){
  .hv-hero{padding:2.5rem 0 3rem}
  .hv-hero-grid{grid-template-columns:1fr;gap:2.25rem}
  .hv-title{font-size:clamp(1.95rem,6.5vw,2.5rem);margin-bottom:1rem}
  .hv-lead{font-size:1.02rem;line-height:1.6;margin-bottom:1.5rem}
  .hv-cta{gap:1rem;margin-bottom:1.25rem}

  .hv-ribbon{padding:.85rem 0}
  .hv-ribbon-inner{gap:.65rem;flex-direction:column;align-items:center}

  /* Strictly vertical for "How short videos are generated" */
  .hv-split{display:flex;flex-direction:column;gap:1.75rem}
  .hv-split-head{position:static;max-width:100%}
  .hv-steps{width:100%;gap:.75rem}
  .hv-step-card{padding:1.1rem;gap:1rem}

  /* Strictly vertical for "How to upload" */
  .hv-upload{display:flex;flex-direction:column;gap:1rem;width:100%}
  .hv-upload-card{padding:1.25rem}
  .hv-center-head{margin-bottom:1.75rem;text-align:left}
  .hv-center-head .hv-sub{margin-left:0}

  .hv-section{padding:3rem 0}
  .hv-container{padding:0 1.15rem}
  .hv-closing{padding:1.75rem 1.25rem;flex-direction:column;align-items:stretch;gap:1.5rem;text-align:left}
  .hv-closing-cta .hv-btn{width:100%;justify-content:center}
}

@media (max-width:480px){
  .hv-container{padding:0 1rem}
  .hv-figure{padding:1rem}
  .hv-clips{gap:.5rem}
  .hv-cta{flex-direction:column;align-items:stretch;gap:.75rem}
  .hv-btn{justify-content:center;width:100%}
}
@media (prefers-reduced-motion:reduce){
  .hv-reveal,.hv-fade,.hv-clip,.hv-bar,.hv-live-dot,.hv-wave-tag{opacity:1;transform:none;animation:none!important;transition:none}
  .hv-bar.hv-hot{animation:none;background:#10b981}
}
`;