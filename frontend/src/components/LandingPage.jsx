import React, { useRef, useState, useEffect, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Video, Sparkles as SparklesIcon, Wand2, Cpu, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sparkles, Float } from '@react-three/drei';
import * as THREE from 'three';

// --- 3D Scene Components ---

class CanvasErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    console.error("Canvas 3D crash captured by Error Boundary:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) return this.props.fallback || null;
    return this.props.children;
  }
}

function CrystallineCore() {
  const meshRef = useRef();
  const wireframeRef = useRef();
  const [hovered, setHovered] = useState(false);
  const mouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e) => {
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();

    // Slow organic drift rotation
    if (meshRef.current && wireframeRef.current) {
      meshRef.current.rotation.y = time * 0.12;
      meshRef.current.rotation.x = time * 0.06;

      wireframeRef.current.rotation.y = -time * 0.08;
      wireframeRef.current.rotation.z = time * 0.08;

      // Mouse react influence
      meshRef.current.rotation.y += THREE.MathUtils.lerp(0, mouse.current.x * 0.35, 0.05);
      meshRef.current.rotation.x += THREE.MathUtils.lerp(0, mouse.current.y * 0.35, 0.05);

      // Subtle breathing scale
      const scale = 1.05 + Math.sin(time * 1.2) * 0.03 + (hovered ? 0.1 : 0);
      meshRef.current.scale.setScalar(scale);
      wireframeRef.current.scale.setScalar(scale * 1.05);
    }
  });

  return (
    <group>
      {/* Dynamic ambient focus lights */}
      <pointLight position={[2, 3, 2]} color="#8b5cf6" intensity={6} distance={15} />
      <pointLight position={[-3, -2, -2]} color="#6366f1" intensity={4} distance={15} />
      <pointLight position={[0, 0, 5]} color="#d946ef" intensity={3} distance={10} />

      {/* Main glass luxury torus knot */}
      <mesh
        ref={meshRef}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <torusKnotGeometry args={[0.46, 0.12, 140, 16, 2, 3]} />
        <meshPhysicalMaterial
          color="#ffffff"
          emissive="#2e1065"
          emissiveIntensity={0.75}
          roughness={0.03}
          metalness={0.92}
          clearcoat={1.0}
          clearcoatRoughness={0.05}
          transmission={0.9}
          thickness={0.8}
          ior={1.48}
        />
      </mesh>

      {/* Technological digital wireframe shell */}
      <mesh ref={wireframeRef}>
        <torusKnotGeometry args={[0.46, 0.12, 140, 16, 2, 3]} />
        <meshBasicMaterial
          color="#c084fc"
          wireframe
          transparent
          opacity={0.16}
        />
      </mesh>
    </group>
  );
}

// --- Main Component ---

export default function LandingPage() {
  const navigate = useNavigate();
  const [webGLSupported] = useState(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    try {
      const canvas = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch (e) {
      return false;
    }
  });

  return (
    <div
      style={{
        width: '100vw',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflowX: 'hidden',
        backgroundColor: '#030305',
        position: 'relative',
        fontFamily: 'var(--font-sans)',
        color: '#fff',
      }}
    >
      {/* Cyber mesh grid background overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.02) 1.5px, transparent 1.5px)',
          backgroundSize: '32px 32px',
          zIndex: 1,
          opacity: 0.8,
          pointerEvents: 'none',
        }}
      />

      {/* Global light leaks */}
      <div className="bg-glow" style={{ width: '80vw', height: '80vw', top: '-40vh', left: '-10vw', opacity: 0.25 }} />
      <div className="bg-glow" style={{ width: '60vw', height: '60vw', bottom: '-20vh', right: '-10vw', opacity: 0.18, background: 'radial-gradient(circle, rgba(99,102,241,0.4) 0%, transparent 60%)' }} />

      {/* Immersive 3D Canvas Background */}
      {webGLSupported && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            zIndex: 2,
            pointerEvents: 'none', // Allow clicking UI overlays below/above
          }}
        >
          <CanvasErrorBoundary fallback={<div className="bg-glow" style={{ width: '60vw', height: '60vw', opacity: 0.3 }} />}>
            <Canvas
              camera={{ position: [0, 0, 3.2], fov: 45 }}
              style={{ pointerEvents: 'auto' }}
            >
              <ambientLight intensity={0.4} />
              <Suspense fallback={null}>
                <Float speed={1.8} rotationIntensity={0.6} floatIntensity={0.8}>
                  <CrystallineCore />
                </Float>
                <Sparkles count={70} scale={8} size={1.5} speed={0.25} color="#c084fc" opacity={0.4} />
                <Sparkles count={35} scale={7} size={2.0} speed={0.3} color="#ffd54f" opacity={0.3} />
              </Suspense>
            </Canvas>
          </CanvasErrorBoundary>
        </div>
      )}

      {/* Luxury Navbar */}
      <header
        style={{
          width: '100%',
          padding: '1.75rem 5%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 10,
          borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
          background: 'linear-gradient(to bottom, rgba(3, 3, 5, 0.8), transparent)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #8b5cf6, #d946ef)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 15px rgba(139, 92, 246, 0.4)',
            }}
          >
            <Video size={18} color="#fff" />
          </div>
          <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', fontFamily: 'var(--font-display)' }}>
            HARVEST <span className="text-gold" style={{ fontWeight: 800 }}>AI</span>
          </span>
        </div>
        <div>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              color: '#fff',
              padding: '0.6rem 1.4rem',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.07)';
            }}
          >
            Enter App
          </button>
        </div>
      </header>

      {/* Hero Content Section */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          padding: '4rem 5%',
          zIndex: 5,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '1200px',
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
            gap: '4rem',
            alignItems: 'center',
          }}
        >
          {/* Left Hero Column */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, cubicBezier: [0.16, 1, 0.3, 1] }}
            style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'left' }}
          >
            {/* Premium Gold Tag */}
            <div
              style={{
                alignSelf: 'flex-start',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: 'rgba(255, 215, 0, 0.05)',
                border: '1px solid rgba(255, 215, 0, 0.25)',
                borderRadius: '30px',
                padding: '0.35rem 1rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: '#ffe082',
                boxShadow: '0 0 10px rgba(255, 215, 0, 0.05)',
              }}
            >
              <SparklesIcon size={12} color="#ffe082" />
            </div>

            {/* Main Header */}
            <h1 className="text-luxury-headline" style={{ fontSize: '3.6rem', lineHeight: '1.1', margin: 0 }}>
              Harvest Viral <br /> Shorts Instantly
            </h1>

            {/* Subtitle */}
            <p
              style={{
                fontSize: '1.05rem',
                lineHeight: '1.7',
                color: '#a1a1aa',
                margin: 0,
                maxWidth: '480px',
              }}
            >
              Transform standard horizontal videos into high-retention vertical highlights. Driven by automated audio transcribers, visual tracking AI, and custom rendering styles.
            </p>

            {/* Luxury Call to Action */}
            <div style={{ marginTop: '0.75rem' }}>
              <button
                onClick={() => navigate('/dashboard')}
                className="glow-btn-luxury"
              >
                Go to Workspace
                <ArrowUpRight size={18} />
              </button>
            </div>

            {/* Luxury Stats Panel */}
            <div className="luxury-stats-grid">

              <div className="luxury-stat-item">
                <span className="luxury-stat-value text-gold">10x</span>
                <span className="luxury-stat-label">Faster Yield</span>
              </div>
              <div className="luxury-stat-item">
                <span className="luxury-stat-value">1 Click</span>
                <span className="luxury-stat-label">Direct Publish</span>
              </div>
            </div>
          </motion.div>

          {/* Right Showcase Column */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, cubicBezier: [0.16, 1, 0.3, 1] }}
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              perspective: '1000px',
            }}
          >
            {/* Frosted Luxury Pipeline Card */}
            <motion.div
              whileHover={{ rotateY: -3, rotateX: 3, scale: 1.02 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              className="glass-card-luxury"
              style={{
                width: '100%',
                maxWidth: '440px',
                padding: '2rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.5rem',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                position: 'relative',
              }}
            >
              {/* Internal abstract glow overlays */}
              <div className="luxury-glow-overlay" style={{ top: '-30%', right: '-30%', width: '180px', height: '180px' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'rgba(139, 92, 246, 0.12)',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Cpu size={15} color="#c084fc" />
                  </div>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f8fafc', letterSpacing: '0.02em' }}>
                    NEURAL AGENT STATUS
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                  <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600, textTransform: 'uppercase' }}>Active</span>
                </div>
              </div>

              {/* Pipeline Steps Mock */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', zIndex: 1 }}>
                {[
                  { title: 'Neural Audio Transcription', engine: 'OpenAI Whisper Model', status: '✓ Complete', completed: true },
                  { title: 'Visual Topic & Sentiment Analysis', engine: 'Qwen 3B Vision AI', status: '✓ Complete', completed: true },
                  { title: 'High-Interest Segment Extraction', engine: 'Focal score detection', status: '✓ Complete', completed: true },
                  { title: 'Smart Subtitle Frame Alignment', engine: 'Dynamic 9:16 Cropper', status: '⟳ Running', active: true },
                ].map((step, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'rgba(0, 0, 0, 0.25)',
                      border: `1px solid ${step.active ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255, 255, 255, 0.03)'}`,
                      borderRadius: '12px',
                      padding: '0.85rem 1.1rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      boxShadow: step.active ? '0 4px 15px rgba(139, 92, 246, 0.08)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', textAlign: 'left' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: step.active ? '#fff' : '#cbd5e1' }}>
                        {step.title}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{step.engine}</span>
                    </div>
                    <div>
                      <span
                        className={step.active ? 'processing-pulse' : ''}
                        style={{
                          margin: 0,
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: step.completed ? '#10b981' : '#a78bfa',
                          textTransform: 'uppercase',
                        }}
                      >
                        {step.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Card Footer Feature Info */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.75rem',
                  color: '#475569',
                  borderTop: '1px solid rgba(255, 255, 255, 0.04)',
                  paddingTop: '0.85rem',
                  zIndex: 1,
                }}
              >
                <Wand2 size={12} color="#475569" />
                Auto-generates 5 standard presets: Viral, Story, Minimal, Intense, Custom.
              </div>
            </motion.div>
          </motion.div>
        </div>
      </main>

      {/* Footer copyright */}
      <footer
        style={{
          width: '100%',
          padding: '1.5rem',
          textAlign: 'center',
          fontSize: '0.75rem',
          color: '#334155',
          borderTop: '1px solid rgba(255, 255, 255, 0.02)',
          zIndex: 10,
        }}
      >
        © 2026 Harvest AI Corp. All rights authorized. Powered by Qwen & Whisper Neural Models.
      </footer>
    </div>
  );
}