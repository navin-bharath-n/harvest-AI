import React, { Suspense, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight, BadgeCheck, Captions, Cpu, Languages,
  Play, Sparkles, Video, Wand, Globe, Mic, Scissors,
  Zap, Share2, TrendingUp, ChevronRight
} from 'lucide-react';
import { motion, useInView } from 'framer-motion';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Float, MeshTransmissionMaterial, Sparkles as ThreeSparkles } from '@react-three/drei';

/* ============================================================
   ERROR BOUNDARY
   ============================================================ */
class CanvasErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(e, i) { console.error('Canvas 3D error:', e, i); }
  render() {
    if (this.state.hasError) return this.props.fallback || null;
    return this.props.children;
  }
}

/* ============================================================
   3D SCENE  — gem kept small so it fits inside the card
   ============================================================ */
function PremiumCore() {
  const ringRef = useRef();
  const gemRef = useRef();
  const orbitRef = useRef();

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (ringRef.current) {
      ringRef.current.rotation.x = Math.sin(t * 0.35) * 0.18;
      ringRef.current.rotation.y = t * 0.22;
    }
    if (gemRef.current) {
      gemRef.current.rotation.y = -t * 0.18;
      gemRef.current.position.y = Math.sin(t * 1.2) * 0.05;
    }
    if (orbitRef.current) {
      orbitRef.current.rotation.z = t * 0.26;
      orbitRef.current.rotation.x = Math.sin(t * 0.25) * 0.16;
    }
  });

  return (
    // Shift left slightly so gem appears centred in the visible card area
    <group position={[0, 0.1, 0]}>
      <Float speed={1.25} rotationIntensity={0.22} floatIntensity={0.4}>
        {/* Gem — radius 0.62 instead of 0.88 so it never clips the card edge */}
        <mesh ref={gemRef}>
          <icosahedronGeometry args={[0.62, 3]} />
          <MeshTransmissionMaterial
            backside samples={8} thickness={0.5}
            roughness={0.06} clearcoat={1}
            chromaticAberration={0.04} anisotropy={0.22}
            color="#ffffff"
            attenuationColor="#dbeafe"
            attenuationDistance={0.85}
          />
        </mesh>

        {/* Gold orbit ring — kept tight so it never clips the card edge */}
        <mesh ref={ringRef} rotation={[Math.PI / 2.8, 0, 0]}>
          <torusGeometry args={[0.78, 0.014, 16, 200]} />
          <meshStandardMaterial color="#c9922a" metalness={0.95} roughness={0.18} />
        </mesh>

        {/* Indigo accent ring */}
        <mesh rotation={[Math.PI / 2, 0, Math.PI / 5]}>
          <torusGeometry args={[0.96, 0.007, 12, 200]} />
          <meshStandardMaterial color="#4f46e5" metalness={0.9} roughness={0.2} opacity={0.65} transparent />
        </mesh>

        {/* Orbiting dots */}
        <group ref={orbitRef}>
          {[0, 1, 2, 3].map((item) => (
            <mesh
              key={item}
              position={[
                Math.cos((item / 4) * Math.PI * 2) * 1.02,
                Math.sin((item / 4) * Math.PI * 2) * 0.34,
                Math.sin((item / 4) * Math.PI * 2) * 0.28,
              ]}
            >
              <sphereGeometry args={[0.042, 24, 24]} />
              <meshStandardMaterial
                color={['#4f46e5', '#c9922a', '#0ea5e9', '#10b981'][item]}
                metalness={0.4} roughness={0.15}
              />
            </mesh>
          ))}
        </group>
      </Float>

      <ThreeSparkles count={70} scale={[3.6, 2.4, 2.4]} size={1.4} speed={0.2} color="#c7d2fe" opacity={0.45} />
    </group>
  );
}

function PremiumScene() {
  return (
    <Canvas
      camera={{ position: [0, 0, 3.9], fov: 44 }}
      dpr={[1, 1.8]}
      style={{ width: '100%', height: '100%' }}
    >
      <color attach="background" args={['#f0f4ff']} />
      <ambientLight intensity={1.1} />
      <directionalLight position={[3, 4, 5]} intensity={2.2} color="#ffffff" />
      <pointLight position={[-3, -2, 3]} intensity={1.5} color="#c9922a" />
      <pointLight position={[3, 3, -2]} intensity={0.7} color="#4f46e5" />
      <Suspense fallback={null}>
        <PremiumCore />
        <Environment preset="city" />
      </Suspense>
    </Canvas>
  );
}

/* ============================================================
   TYPEWRITER
   ============================================================ */
function Typewriter({ words }) {
  const [idx, setIdx] = useState(0);
  const [chars, setChars] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const current = words[idx];
    const delay = deleting ? 48 : 88;
    const t = setTimeout(() => {
      if (!deleting && chars < current.length) {
        setChars(c => c + 1);
      } else if (!deleting && chars === current.length) {
        setTimeout(() => setDeleting(true), 1800);
      } else if (deleting && chars > 0) {
        setChars(c => c - 1);
      } else {
        setDeleting(false);
        setIdx(i => (i + 1) % words.length);
      }
    }, delay);
    return () => clearTimeout(t);
  }, [idx, chars, deleting, words]);

  return (
    <span style={{
      color: 'var(--indigo-600)',
      borderRight: '3px solid var(--indigo-600)',
      paddingRight: 3,
      display: 'inline-block',
      minWidth: '11.5rem',
      whiteSpace: 'nowrap',
      textAlign: 'left',
      verticalAlign: 'bottom',
    }}>
      {words[idx].slice(0, chars)}
    </span>
  );
}

/* ============================================================
   MARQUEE DATA
   ============================================================ */
const platforms = [
  { name: 'YouTube Shorts', color: '#ff0000' },
  { name: 'Instagram Reels', color: '#e1306c' },
  { name: 'Facebook Reels', color: '#1877f2' },
  { name: 'TikTok', color: '#010101' },
  { name: 'X / Twitter', color: '#555555' }];

/* ============================================================
   BENTO FEATURES
   ============================================================ */
const bentoFeatures = [
  {
    icon: Cpu,
    iconBg: '#eef2ff', iconColor: '#4f46e5',
    title: 'AI Smart Crop',
    desc: 'YOLOv11 + DeepSort + MediaPipe track your active speaker frame-by-frame for perfect 9:16 vertical reframes.',
    tag: 'Vision AI', tagBg: '#eef2ff', tagColor: '#4f46e5',
    size: 'wide',
  },
  {
    icon: Globe,
    iconBg: '#fef3c7', iconColor: '#b45309',
    title: 'Languages',
    desc: 'Faster-Whisper transcribes, then translates & burns word-level captions in any language.',
    tag: 'locales', tagBg: '#fef3c7', tagColor: '#b45309',
    size: 'mid',
  },
  {
    icon: Mic,
    iconBg: '#ecfdf5', iconColor: '#059669',
    title: 'AI Voice Clone',
    desc: 'Clone and dub the original speaker\'s voice into the translated language — no re-recording needed.',
    tag: 'Voice AI', tagBg: '#ecfdf5', tagColor: '#059669',
    size: 'third',
  },
  {
    icon: TrendingUp,
    iconBg: '#fdf4ff', iconColor: '#9333ea',
    title: 'Viral Clip Selection',
    desc: 'Qwen 2.5 LLM scores transcript segments for hook strength and viral appeal to find the best cuts.',
    tag: 'LLM Powered', tagBg: '#fdf4ff', tagColor: '#9333ea',
    size: 'third',
  },
  {
    icon: Scissors,
    iconBg: '#fff7ed', iconColor: '#ea580c',
    title: 'Multi-Variation Renders',
    desc: 'Generate 5 distinct short-form personas per video — Viral Hook, Storyteller, Minimalist, Intense & AI Custom.',
    tag: '5 Personas', tagBg: '#fff7ed', tagColor: '#ea580c',
    size: 'third',
  },
  {
    icon: Share2,
    iconBg: '#eff6ff', iconColor: '#2563eb',
    title: 'One-Click Publish',
    desc: 'Connect YouTube, Instagram & Facebook credentials and publish directly from your workspace.',
    tag: 'Multi-Platform', tagBg: '#eff6ff', tagColor: '#2563eb',
    size: 'mid',
  },
  {
    icon: Captions,
    iconBg: '#f0fdf4', iconColor: '#16a34a',
    title: 'Sync-Perfect Captions',
    desc: 'Word-level timestamps ensure every subtitle fires exactly when spoken, with adjustable styles.',
    tag: 'Auto-Sync', tagBg: '#f0fdf4', tagColor: '#16a34a',
    size: 'wide',
  },
];

/* ============================================================
   SCROLL FADE-IN WRAPPER
   ============================================================ */
function FadeIn({ children, delay = 0, style }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 26 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.65, delay, ease: [0.16, 1, 0.3, 1] }}
      style={style}
    >
      {children}
    </motion.div>
  );
}

/* ============================================================
   MAIN LANDING PAGE
   ============================================================ */
export default function LandingPage() {
  const navigate = useNavigate();

  const [webGLSupported] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const c = document.createElement('canvas');
      return Boolean(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch { return false; }
  });

  return (
    <div className="premium-shell">

      {/* ── STICKY NAV ────────────────────────────────────── */}
      <header className="premium-nav" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100 }}>
        <button
          className="premium-brand"
          onClick={() => navigate('/dashboard')}
          aria-label="Harvest AI home"
        >
          <span className="premium-brand-mark"><Video size={16} /></span>
          <span>Harvest AI</span>
        </button>

        <div className="premium-nav-actions">
          <button className="premium-secondary-button" onClick={() => navigate('/dashboard')}>
            <Play size={14} />
            Open Studio
          </button>
          <button className="premium-primary-button" onClick={() => navigate('/dashboard')}>
            Get Started
            <ChevronRight size={14} />
          </button>
        </div>
      </header>

      {/* ── HERO ──────────────────────────────────────────── */}
      <main style={{
        position: 'relative',
        zIndex: 2,
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.15fr) minmax(280px, 44%)',
        alignItems: 'center',
        gap: 'clamp(1.5rem, 4vw, 4rem)',
        padding: '0 clamp(1.5rem, 5vw, 4rem)',
        paddingTop: 66,
        maxWidth: 1300,
        margin: '0 auto',
        width: '100%',
      }}>

        {/* Left: copy */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '2.5rem 0' }}>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="premium-kicker"
          >
            <Sparkles size={13} />
            AI-Powered Short-Form Video Studio
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(2.6rem, 5.5vw, 5rem)',
              fontWeight: 800,
              color: 'var(--accent-dark)',
              lineHeight: 0.92,
              letterSpacing: '-0.02em',
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            Harvest<br />
            <span style={{
              background: 'linear-gradient(130deg, #0f172a 0%, #4f46e5 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              AI
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
            style={{ color: 'var(--text-muted)', fontSize: 'clamp(0.97rem, 1.4vw, 1.1rem)', lineHeight: 1.72, maxWidth: 520, margin: 0, minHeight: '76px' }}
          >
            Automatically repurpose long-form videos into polished&nbsp;
            <Typewriter words={['YouTube Shorts', 'Instagram Reels', 'Facebook Reels', 'TikTok Videos']} />
            &nbsp;with AI speaker tracking, translated captions &amp; voice dubbing.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}
          >
            <button
              className="premium-primary-button"
              onClick={() => navigate('/dashboard')}
              style={{ padding: '0.8rem 1.8rem', fontSize: '0.97rem', gap: '0.45rem' }}
            >
              Enter Workspace
              <ArrowUpRight size={17} />
            </button>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--status-done-text)', fontSize: '0.875rem', fontWeight: 600 }}>
              <BadgeCheck size={16} />
              Captions use your selected translation track
            </div>
          </motion.div>

          {/* Metric cards */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.24, ease: [0.16, 1, 0.3, 1] }}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '0.7rem' }}
          >
            {[
              { icon: Languages, label: 'Multilingual translation', value: 'Languages' },
              { icon: Captions, label: 'Caption burn-in', value: 'Word-level sync' },
              { icon: Cpu, label: 'AI highlight engine', value: 'Smart 9:16 crop' },
            ].map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '0.9rem', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}
              >
                <Icon size={16} color="var(--indigo-600)" />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
                <strong style={{ fontSize: '0.88rem', color: 'var(--text-heading)', fontWeight: 800 }}>{value}</strong>
              </div>
            ))}
          </motion.div>
        </section>

        {/* Right: 3D Stage */}
        <section
          aria-label="Animated AI preview"
          style={{
            position: 'relative',
            /* Fixed height so the canvas doesn't overflow */
            height: 'min(560px, 70vh)',
            borderRadius: 'var(--radius-xl)',
            overflow: 'hidden',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-xl)',
            background: 'linear-gradient(145deg, #f0f4ff, #ffffff)',
          }}
        >
          {webGLSupported ? (
            <CanvasErrorBoundary fallback={<div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #eef2ff, #f0f9ff)' }} />}>
              <PremiumScene />
            </CanvasErrorBoundary>
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #eef2ff, #f0f9ff)' }} />
          )}

          {/* Status panel overlay */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'absolute',
              right: 'clamp(0.75rem, 2.5vw, 1.5rem)',
              bottom: 'clamp(0.75rem, 2.5vw, 1.5rem)',
              width: 'min(300px, calc(100% - 1.5rem))',
              background: 'rgba(255,255,255,0.88)',
              backdropFilter: 'blur(20px) saturate(160%)',
              WebkitBackdropFilter: 'blur(20px) saturate(160%)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-lg)',
              padding: '0.9rem',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.6rem', marginBottom: '0.4rem', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800, fontSize: '0.875rem', color: 'var(--text-heading)' }}>
                <Wand size={14} /> Campaign render
              </span>
              <strong style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--status-done-text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Live</strong>
            </div>
            {[
              ['Translate dialogue', ' ready'],
              ['Sync caption timing', 'Word-level alignment'],
              ['Apply premium crop', '9:16 subject tracking'],
            ].map(([title, detail]) => (
              <div
                key={title}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', minHeight: 40, fontSize: '0.8rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}
              >
                <span>{title}</span>
                <strong style={{ color: 'var(--text-heading)', fontSize: '0.76rem', textAlign: 'right' }}>{detail}</strong>
              </div>
            ))}
          </motion.div>
        </section>
      </main>

      {/* ── MARQUEE STRIP ─────────────────────────────────── */}
      <div style={{
        position: 'relative', zIndex: 2,
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border-subtle)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '1.1rem 0',
        overflow: 'hidden',
      }}>
        <p style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-faint)', textAlign: 'center', marginBottom: '0.75rem' }}>
          Publish directly to your favourite platforms
        </p>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: '3rem', width: 'max-content', animation: 'slideRight 22s linear infinite' }}>
            {[...platforms, ...platforms].map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0, display: 'inline-block' }} />
                {p.name}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── FEATURES BENTO ────────────────────────────────── */}
      <section style={{
        position: 'relative', zIndex: 2, background: '#fff',
        padding: 'clamp(4rem, 8vw, 7rem) clamp(1.5rem, 5vw, 4rem)',
      }}>
        <FadeIn>
          <p style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--indigo-600)', marginBottom: '0.65rem' }}>
            What Harvest AI does
          </p>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.9rem, 4.5vw, 3rem)', fontWeight: 800, color: 'var(--text-heading)', lineHeight: 1.1, marginBottom: '0.85rem', maxWidth: 700 }}>
            Every tool you need to go viral — in one place.
          </h2>
          <p style={{ fontSize: '1rem', color: 'var(--text-muted)', maxWidth: 540, lineHeight: 1.7, marginBottom: '3rem' }}>
            From raw landscape footage to platform-optimised vertical short-form content,
            Harvest AI handles the entire pipeline automatically.
          </p>
        </FadeIn>

        {/* Bento grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '1.1rem', gridAutoRows: 'minmax(150px, auto)' }}>
          {bentoFeatures.map((f, i) => (
            <FadeIn
              key={f.title}
              delay={i * 0.06}
              style={{
                gridColumn: f.size === 'wide' ? 'span 7' : f.size === 'mid' ? 'span 5' : 'span 4',
              }}
            >
              <div
                style={{
                  height: '100%', minHeight: 150,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-xl)',
                  padding: '1.6rem',
                  boxShadow: 'var(--shadow-sm)',
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '0.65rem',
                  transition: 'box-shadow 0.3s var(--ease-out), transform 0.3s var(--ease-out)',
                  cursor: 'default',
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-lg)'; e.currentTarget.style.transform = 'translateY(-4px)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div>
                  <div style={{ width: 42, height: 42, borderRadius: 'var(--radius-md)', background: f.iconBg, color: f.iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.9rem' }}>
                    <f.icon size={20} />
                  </div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-heading)', margin: '0 0 0.4rem' }}>{f.title}</h3>
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 'var(--radius-full)', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', background: f.tagBg, color: f.tagColor, border: `1px solid ${f.tagColor}30`, width: 'fit-content', marginTop: '0.75rem' }}>
                  {f.tag}
                </span>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── CTA SECTION ───────────────────────────────────── */}
      <section style={{
        position: 'relative', zIndex: 2,
        background: 'var(--accent-dark)',
        padding: 'clamp(3.5rem, 7vw, 6rem) clamp(1.5rem, 5vw, 4rem)',
        overflow: 'hidden',
      }}>
        {/* background glow */}
        <div style={{ position: 'absolute', top: '-40%', right: '-10%', width: '60%', height: '200%', background: 'radial-gradient(circle, rgba(79,70,229,0.22), transparent 60%)', pointerEvents: 'none' }} />

        <FadeIn>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: '2rem' }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#fbbf24', marginBottom: '0.7rem' }}>
                <Zap size={12} /> Ready to launch?
              </div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.75rem, 3.5vw, 2.7rem)', fontWeight: 800, color: '#fff', lineHeight: 1.1, marginBottom: '0.65rem' }}>
                Start repurposing<br />videos today.
              </h2>
              <p style={{ fontSize: '0.97rem', color: 'rgba(255,255,255,0.58)', lineHeight: 1.68, maxWidth: 440 }}>
                No credit card. No cloud upload limits. Harvest AI runs locally — your footage stays private.
              </p>
            </div>

            <button
              onClick={() => navigate('/dashboard')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem', padding: '0.9rem 2rem', background: '#fff', color: 'var(--accent-dark)', border: 'none', borderRadius: 'var(--radius-md)', fontSize: '1rem', fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 30px rgba(0,0,0,0.32)', transition: 'transform 0.2s var(--ease-out), box-shadow 0.2s', whiteSpace: 'nowrap', fontFamily: 'inherit' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 14px 40px rgba(0,0,0,0.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.32)'; }}
            >
              Enter Workspace
              <ArrowUpRight size={18} />
            </button>
          </div>
        </FadeIn>
      </section>

      {/* Responsive overrides */}
      <style>{`
        @media (max-width: 960px) {
          main { grid-template-columns: 1fr !important; padding-bottom: 3rem !important; }
        }
        @media (max-width: 700px) {
          .bento-wide  { grid-column: span 12 !important; }
          .bento-mid   { grid-column: span 12 !important; }
          .bento-third { grid-column: span 12 !important; }
        }
      `}</style>
    </div>
  );
}
