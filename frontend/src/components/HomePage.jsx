import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
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
      { threshold: 0.12 }
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
const BARS = Array.from({ length: 64 }, (_, i) => {
  const v = Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.45));
  return 18 + Math.round(v * 72);
});
const HIGHLIGHTS = [
  [7, 13],
  [27, 35],
  [47, 52],
];
const highlightIndex = (i) => HIGHLIGHTS.findIndex(([a, b]) => i >= a && i <= b);

function ClipIllustration() {
  return (
    <div className="hv-figure" aria-hidden="true">
      <div className="hv-fig-label">Your recording</div>
      <div className="hv-wave">
        {BARS.map((h, i) => {
          const hl = highlightIndex(i);
          return (
            <span
              key={i}
              className={hl >= 0 ? 'hv-bar hv-hot' : 'hv-bar'}
              style={{ height: `${h}%`, '--d': `${0.7 + hl * 0.45}s` }}
            />
          );
        })}
      </div>

      <div className="hv-fig-label hv-fig-label-2">Highlights, cut to vertical</div>
      <div className="hv-clips">
        {[0, 1, 2].map((n) => (
          <div key={n} className="hv-clip" style={{ '--c': `${1.5 + n * 0.35}s` }}>
            <div className="hv-clip-person">
              <span className="hv-head" />
              <span className="hv-body" />
            </div>
            <div className="hv-clip-caption">
              <span />
              <span />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const STEPS = [
  { t: 'Audio transcription', d: 'The spoken dialogue is converted into timestamped text.' },
  { t: 'Highlight detection', d: 'Key discussion moments are picked out of the conversation.' },
  { t: 'Vertical framing', d: 'Speakers are cropped and centered for 9:16 screens.' },
  { t: 'Subtitles', d: 'Captions are synced to the audio, so clips work with the sound off.' },
  { t: 'Clip export', d: 'Download the finished clips or publish them to social networks.' },
];

const UPLOAD = [
  { t: 'Log in', d: 'Sign in to your Harvest account.' },
  { t: 'Choose a project', d: 'Create a new project or open an existing one.' },
  { t: 'Add your video', d: 'Drop the file into the studio upload area.' },
];

export default function HomePage() {
  return (
    <div className="hv-page">
      <style>{css}</style>

      <Navbar />

      <main>
        {/* Hero */}
        <section className="hv-hero">
          <div className="hv-container hv-hero-grid">
            <div>
              <h1 className="hv-title hv-fade" style={{ animationDelay: '0ms' }}>
                Turn long recordings into short vertical clips.
              </h1>
              <p className="hv-lead hv-fade" style={{ animationDelay: '90ms' }}>
                Harvest takes your podcasts, interviews, and other long recordings and cuts them into
                clips sized for mobile social platforms.
              </p>
              <div className="hv-cta hv-fade" style={{ animationDelay: '180ms' }}>
                <Link to="/register" className="hv-btn">
                  Get Started
                </Link>
                <a href="#how-it-works" className="hv-link">
                  See how it works
                </a>
              </div>
              <p className="hv-note hv-fade" style={{ animationDelay: '260ms' }}>
                Accepts MP4, MOV, and WebM files.
              </p>
            </div>

            <div className="hv-fade" style={{ animationDelay: '120ms' }}>
              <ClipIllustration />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="hv-section hv-rule">
          <div className="hv-container hv-split">
            <Reveal>
              <div className="hv-split-head">
                <h2 className="hv-h2">How short videos are generated</h2>
                <p className="hv-sub">Five steps, all automatic. You upload, Harvest does the cutting.</p>
              </div>
            </Reveal>

            <ol className="hv-steps">
              {STEPS.map((s, i) => (
                <li key={s.t}>
                  <Reveal delay={i * 50}>
                    <div className="hv-step">
                      <span className="hv-step-n">{String(i + 1).padStart(2, '0')}</span>
                      <div>
                        <h3>{s.t}</h3>
                        <p>{s.d}</p>
                      </div>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Upload */}
        <section className="hv-section hv-tint hv-rule">
          <div className="hv-container">
            <Reveal>
              <h2 className="hv-h2">How to upload</h2>
              <p className="hv-sub hv-sub-left">
                Files are processed securely within your workspace.
              </p>
            </Reveal>

            <div className="hv-upload">
              {UPLOAD.map((u, i) => (
                <Reveal key={u.t} delay={i * 60}>
                  <div className="hv-upload-item">
                    <span className="hv-upload-n">Step {i + 1}</span>
                    <h3>{u.t}</h3>
                    <p>{u.d}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="hv-section">
          <div className="hv-container">
            <Reveal>
              <div className="hv-closing">
                <div>
                  <h2 className="hv-h2 hv-h2-tight">Ready to try it on your own footage?</h2>
                  <p className="hv-sub hv-sub-left">Create an account and upload your first video.</p>
                </div>
                <Link to="/register" className="hv-btn">
                  Get Started
                </Link>
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
  --accent:#1f6f4a; --accent-dark:#185a3c; --idle:#d7d7d1;
  min-height:100vh;display:flex;flex-direction:column;background:#fff;color:var(--ink);
  font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased;
}
.hv-page main{flex:1}
.hv-container{width:100%;max-width:1080px;margin:0 auto;padding:0 1.5rem;box-sizing:border-box}
.hv-page h1,.hv-page h2{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-weight:700;letter-spacing:-0.02em;color:var(--ink)}
.hv-page a:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:4px}

/* Hero */
.hv-hero{padding:5rem 0 5.5rem}
.hv-hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:4rem;align-items:center}
.hv-title{font-size:clamp(2.3rem,4.6vw,3.5rem);line-height:1.1;margin:0 0 1.25rem}
.hv-lead{font-size:1.15rem;line-height:1.65;color:var(--muted);margin:0 0 2rem;max-width:30rem}
.hv-cta{display:flex;align-items:center;flex-wrap:wrap;gap:1.5rem;margin-bottom:1.25rem}
.hv-btn{display:inline-block;padding:.8rem 1.5rem;background:var(--accent);color:#fff;font-size:1rem;font-weight:600;
  text-decoration:none;border-radius:6px;transition:background .15s ease}
.hv-btn:hover{background:var(--accent-dark)}
.hv-link{color:var(--ink);font-weight:600;font-size:.98rem;text-decoration:underline;text-decoration-color:#b9b9b2;
  text-underline-offset:4px;transition:text-decoration-color .15s ease}
.hv-link:hover{text-decoration-color:var(--ink)}
.hv-note{margin:0;font-size:.88rem;color:#7a808a}

/* Illustration */
.hv-figure{border:1px solid var(--line);border-radius:12px;padding:1.5rem;background:#fff}
.hv-fig-label{font-size:.75rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#7a808a;margin-bottom:.75rem}
.hv-fig-label-2{margin-top:1.5rem}
.hv-wave{display:flex;align-items:center;gap:3px;height:76px}
.hv-bar{flex:1;border-radius:2px;background:var(--idle)}
.hv-hot{animation:hvHot .45s ease forwards;animation-delay:var(--d)}
.hv-clips{display:flex;gap:.9rem}
.hv-clip{flex:1;max-width:96px;aspect-ratio:9/16;border:1px solid var(--line);border-radius:8px;background:var(--tint);
  position:relative;overflow:hidden;opacity:0;animation:hvUp .5s ease forwards;animation-delay:var(--c)}
.hv-clip-person{position:absolute;left:0;right:0;top:22%;display:flex;flex-direction:column;align-items:center}
.hv-head{width:26%;aspect-ratio:1;border-radius:50%;background:#cfcfc9}
.hv-body{width:58%;height:42px;margin-top:6px;border-radius:22px 22px 0 0;background:#cfcfc9}
.hv-clip-caption{position:absolute;left:9%;right:9%;bottom:10%;display:flex;flex-direction:column;gap:4px;align-items:center}
.hv-clip-caption span{display:block;height:5px;border-radius:3px;background:var(--ink)}
.hv-clip-caption span:first-child{width:92%}
.hv-clip-caption span:last-child{width:60%}

/* Sections */
.hv-section{padding:5rem 0}
.hv-rule{border-top:1px solid var(--line)}
.hv-tint{background:var(--tint)}
.hv-h2{font-size:clamp(1.65rem,3vw,2.1rem);line-height:1.2;margin:0 0 .75rem}
.hv-h2-tight{margin-bottom:.5rem}
.hv-sub{font-size:1.02rem;line-height:1.65;color:var(--muted);margin:0;max-width:26rem}
.hv-sub-left{max-width:none}

.hv-split{display:grid;grid-template-columns:.8fr 1.2fr;gap:4rem;align-items:start}
.hv-split-head{position:sticky;top:2rem}
.hv-steps{list-style:none;margin:0;padding:0}
.hv-steps li{border-top:1px solid var(--line)}
.hv-steps li:last-child{border-bottom:1px solid var(--line)}
.hv-step{display:flex;gap:1.5rem;padding:1.5rem 0}
.hv-step-n{flex:none;width:2rem;font-size:.9rem;font-weight:600;color:var(--accent);font-variant-numeric:tabular-nums;padding-top:.2rem}
.hv-step h3{margin:0 0 .3rem;font-size:1.1rem;font-weight:650;color:var(--ink)}
.hv-step p{margin:0;font-size:.98rem;line-height:1.6;color:var(--muted)}

.hv-upload{display:grid;grid-template-columns:repeat(3,1fr);gap:2.5rem;margin-top:2.5rem}
.hv-upload-item{border-top:2px solid var(--ink);padding-top:1rem}
.hv-upload-n{display:block;font-size:.78rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#7a808a;margin-bottom:.4rem}
.hv-upload-item h3{margin:0 0 .35rem;font-size:1.1rem;font-weight:650}
.hv-upload-item p{margin:0;font-size:.98rem;line-height:1.6;color:var(--muted)}

.hv-closing{display:flex;align-items:center;justify-content:space-between;gap:2rem;flex-wrap:wrap;
  border:1px solid var(--line);border-radius:12px;padding:2.5rem}

/* Motion: kept small and run once */
.hv-reveal{opacity:0;transform:translateY(12px);transition:opacity .5s ease,transform .5s ease}
.hv-reveal.hv-in{opacity:1;transform:none}
.hv-fade{opacity:0;animation:hvUp .6s ease forwards}
@keyframes hvUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes hvHot{to{background:var(--accent)}}

@media (max-width:900px){
  .hv-hero{padding:3.5rem 0 4rem}
  .hv-hero-grid{grid-template-columns:1fr;gap:3rem}
  .hv-split{grid-template-columns:1fr;gap:2rem}
  .hv-split-head{position:static}
  .hv-upload{grid-template-columns:1fr;gap:1.75rem}
  .hv-section{padding:3.5rem 0}
}
@media (max-width:480px){
  .hv-closing{padding:1.75rem}
  .hv-figure{padding:1.1rem}
}
@media (prefers-reduced-motion:reduce){
  .hv-reveal,.hv-fade,.hv-clip{opacity:1;transform:none;animation:none;transition:none}
  .hv-hot{animation:none;background:var(--accent)}
}
`;