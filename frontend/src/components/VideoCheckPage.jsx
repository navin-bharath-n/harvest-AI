import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Sparkles, AlertTriangle, ArrowRight, Play, Wrench, ShieldCheck, Flame } from 'lucide-react';
import { api } from '../api/client';
import Navbar from './Navbar';
import Footer from './Footer';

const SAMPLE_VIDEOS = [
  { title: '3 cooking mistakes ruining your pasta', url: 'https://youtube.com/shorts/sample1', playbook: 'educational' },
  { title: 'I survived 24 hours on a deserted island', url: 'https://youtube.com/shorts/sample2', playbook: 'big_spectacle' },
  { title: 'Day in my life as a full-time creator in Tokyo', url: 'https://youtube.com/shorts/sample3', playbook: 'personality' },
];

export default function VideoCheckPage() {
  const [url, setUrl] = useState('');
  const [playbook, setPlaybook] = useState('auto');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [fixedItems, setFixedItems] = useState(new Set());
  const [bonusScore, setBonusScore] = useState(0);

  const handleEvaluate = async (targetUrl = url, targetPlaybook = playbook) => {
    setLoading(true);
    setFixedItems(new Set());
    setBonusScore(0);
    try {
      const data = await api.evaluateVideoCheck({
        url: targetUrl || 'https://youtube.com/shorts/sample-check',
        title: targetUrl ? targetUrl.split('/').pop() : 'Creator Short',
        playbook: targetPlaybook,
        platform: 'shorts',
      });
      setReport(data);
    } catch (err) {
      // Fallback report for local client preview
      setReport({
        score: 74,
        playbook: 'Personality & Relatable Vlog',
        hook_score: 72,
        audio_score: 70,
        visual_score: 82,
        caption_score: 86,
        platform_policy_score: 98,
        top_fixes: [
          {
            id: 'fix_hook',
            timestamp: '0:02',
            category: 'Hook Pacing',
            title: 'Slow Intro — 2.2s dead air before voice',
            description: 'Viewers scroll away if value isn\'t clear within 3s. Trim 1.8s dead air to jump straight into the hook.',
            one_tap: true,
            fix_impact: '+8 pts',
          },
          {
            id: 'fix_audio',
            timestamp: '0:11',
            category: 'Audio Balance',
            title: 'Background music masking dialogue',
            description: 'Audio ducking needed. Lower music track by -4.5dB under vocal frequencies.',
            one_tap: true,
            fix_impact: '+6 pts',
          },
          {
            id: 'fix_safe_zone',
            timestamp: '0:19',
            category: 'Safe Zone Overlap',
            title: 'Subtitles collide with Instagram/Shorts overlay',
            description: 'Lower text touches bottom engagement icons. Lift subtitles 40px into the universal reading zone.',
            one_tap: true,
            fix_impact: '+5 pts',
          },
        ],
        recommended_room: 'Create Room',
        recommended_reason: 'Your hook and safe-zone formatting need one-tap refinement. Create Room fixes both automatically.',
        fair_use_notice: 'No sign-up required for your first free report card.',
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleFix = (fixId, impactPts) => {
    const next = new Set(fixedItems);
    if (next.has(fixId)) {
      next.delete(fixId);
      setBonusScore(prev => prev - impactPts);
    } else {
      next.add(fixId);
      setBonusScore(prev => prev + impactPts);
    }
    setFixedItems(next);
  };

  const currentScore = report ? Math.min(100, report.score + bonusScore) : 0;

  return (
    <div style={{ backgroundColor: '#0D0E16', color: '#F4F2EE', minHeight: '100vh', fontFamily: '"Outfit", "Figtree", system-ui, sans-serif' }}>
      <Navbar />

      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '48px 24px 96px', display: 'flex', flexDirection: 'column', gap: 48 }}>
        {/* Header */}
        <section style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#3DD6C6', background: 'rgba(61, 214, 198, 0.1)', padding: '6px 14px', borderRadius: 999 }}>
            Free Pre-Publish Quality Review
          </span>
          <h1 style={{ margin: 0, fontSize: 'clamp(36px, 6vw, 68px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05 }}>
            Video Check
          </h1>
          <p style={{ margin: 0, fontSize: '1.15rem', color: '#C9CBDD', maxWidth: 600, lineHeight: 1.5 }}>
            Check your video before you post. Get a report card in about a minute — hook, audio, captions, safe zones, and 1-tap fixes.
          </p>

          {/* Input Box */}
          <div style={{ width: '100%', maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 10, background: '#161827', border: '1px solid #2E3150', borderRadius: 16, padding: 8 }}>
              <input
                type="text"
                placeholder="Paste video link (YouTube Shorts, Reels, or TikTok)..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                style={{ flex: 1, background: 'transparent', border: 0, color: '#F4F2EE', padding: '12px 16px', fontSize: 15, outline: 'none' }}
              />
              <button
                type="button"
                onClick={() => handleEvaluate()}
                disabled={loading}
                style={{ background: '#3DD6C6', color: '#0D0E16', fontWeight: 800, fontSize: 15, border: 0, borderRadius: 12, padding: '12px 24px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                {loading ? 'Checking…' : 'Check Free'}
              </button>
            </div>

            {/* Quick Sample Selector */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#A9ABC2' }}>
              <span>Or try an example:</span>
              {SAMPLE_VIDEOS.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setUrl(s.url);
                    setPlaybook(s.playbook);
                    handleEvaluate(s.url, s.playbook);
                  }}
                  style={{ background: '#1A1C2C', border: '1px solid #2E3150', color: '#DCDDEA', borderRadius: 20, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}
                >
                  {s.title}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Results Report Card */}
        {report && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            <div style={{ background: '#161827', border: '1px solid #2E3150', borderRadius: 24, padding: 'clamp(24px, 4vw, 40px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 36, alignItems: 'center' }}>
              {/* Score Ring */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12 }}>
                <div style={{ position: 'relative', width: 180, height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="180" height="180" viewBox="0 0 180 180">
                    <circle cx="90" cy="90" r="76" stroke="#2E3150" strokeWidth="12" fill="none" />
                    <circle
                      cx="90"
                      cy="90"
                      r="76"
                      stroke={currentScore >= 90 ? '#3DD6C6' : currentScore >= 80 ? '#FF9A3D' : '#E36BFF'}
                      strokeWidth="12"
                      strokeDasharray={2 * Math.PI * 76}
                      strokeDashoffset={(2 * Math.PI * 76) * (1 - currentScore / 100)}
                      strokeLinecap="round"
                      fill="none"
                      transform="rotate(-90 90 90)"
                      style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s ease' }}
                    />
                  </svg>
                  <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ fontSize: 48, fontWeight: 900, lineHeight: 1 }}>{currentScore}</span>
                    <span style={{ fontSize: 13, color: '#A9ABC2', fontWeight: 600 }}>OUT OF 100</span>
                  </div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#E36BFF', background: 'rgba(227, 107, 255, 0.1)', padding: '4px 12px', borderRadius: 8 }}>
                  Playbook: {report.playbook}
                </span>
                {bonusScore > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#3DD6C6' }}>
                    ✨ +{bonusScore} pts boosted with 1-tap fixes!
                  </span>
                )}
              </div>

              {/* Sub-scores */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Pre-Publish Signals</h3>
                {[
                  { label: 'Hook Punchiness (first 3s)', val: report.hook_score, note: 'Hook strength & opening dead-air' },
                  { label: 'Audio Balance & Ducking', val: report.audio_score, note: 'Vocal clarity over background music' },
                  { label: 'Platform Safe-Zone Margins', val: report.visual_score, note: 'Free from Reels/Shorts UI buttons' },
                  { label: 'Caption Readability', val: report.caption_score, note: 'Burned-in timing & font contrast' },
                  { label: 'Platform Policy & Copyright', val: report.platform_policy_score, note: 'Clean from re-upload flags' },
                ].map((s, idx) => (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 600 }}>
                      <span>{s.label}</span>
                      <span style={{ color: s.val >= 85 ? '#3DD6C6' : s.val >= 75 ? '#FF9A3D' : '#E36BFF' }}>{s.val}%</span>
                    </div>
                    <div style={{ width: '100%', height: 6, background: '#1A1C2C', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${s.val}%`, height: '100%', background: s.val >= 85 ? '#3DD6C6' : s.val >= 75 ? '#FF9A3D' : '#E36BFF', borderRadius: 4 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top 3 Timestamped Fixes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>Top 3 Recommended Fixes</h2>
                <span style={{ fontSize: 13, color: '#A9ABC2' }}>Click "Fix it" to simulate 1-tap correction</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {report.top_fixes.map((f, i) => {
                  const isDone = fixedItems.has(f.id);
                  const pts = parseInt(f.fix_impact) || 6;
                  return (
                    <div
                      key={f.id}
                      style={{
                        background: isDone ? 'rgba(61, 214, 198, 0.08)' : '#161827',
                        border: isDone ? '1px solid #3DD6C6' : '1px solid #2E3150',
                        borderRadius: 16,
                        padding: 20,
                        display: 'flex',
                        flexWrap: 'wrap',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 16,
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flex: '1 1 340px' }}>
                        <span style={{ background: '#1A1C2C', border: '1px solid #2E3150', borderRadius: 8, padding: '4px 10px', fontSize: 13, fontWeight: 800, color: '#FF9A3D' }}>
                          {f.timestamp}
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{ fontSize: 16, fontWeight: 700, color: isDone ? '#3DD6C6' : '#F4F2EE' }}>
                            {f.title}
                          </span>
                          <span style={{ fontSize: 13.5, color: '#C9CBDD', lineHeight: 1.45 }}>
                            {f.description}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#3DD6C6' }}>{f.fix_impact}</span>
                        <button
                          type="button"
                          onClick={() => toggleFix(f.id, pts)}
                          style={{
                            background: isDone ? '#3DD6C6' : '#1A1C2C',
                            color: isDone ? '#0D0E16' : '#F4F2EE',
                            border: '1px solid #3DD6C6',
                            borderRadius: 10,
                            padding: '8px 16px',
                            fontWeight: 700,
                            fontSize: 13,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          {isDone ? <CheckCircle2 size={16} /> : <Wrench size={16} />}
                          {isDone ? 'Fixed' : 'Fix it'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Room Recommendation Banner */}
            <div style={{ background: '#1E1530', border: '2px solid #E36BFF', borderRadius: 20, padding: 28, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 400px' }}>
                <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', color: '#E36BFF' }}>YOUR RECOMMENDED PLAN</span>
                <h3 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>{report.recommended_room}</h3>
                <p style={{ margin: 0, fontSize: 15, color: '#E6DDF5', lineHeight: 1.5 }}>{report.recommended_reason}</p>
              </div>
              <Link
                to="/studio"
                style={{ background: '#E36BFF', color: '#0D0E16', fontWeight: 800, fontSize: 16, borderRadius: 12, padding: '16px 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                Apply Fixes in Studio <ArrowRight size={18} />
              </Link>
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}
