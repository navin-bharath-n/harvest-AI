import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp, Users, QrCode, Play, Sparkles, AlertCircle,
  ArrowUpRight, BarChart3, Clock, Compass, FileText, Share2, Layers
} from 'lucide-react';
import { api } from '../api/client';
import Navbar from './Navbar';
import Footer from './Footer';

export default function GrowthDashboardPage() {
  const [activeTab, setActiveTab] = useState('overview'); // overview, insights, formats
  const [generatingFormats, setGeneratingFormats] = useState(false);
  const [formatsResult, setFormatsResult] = useState(null);

  const handleGenerateFormats = async () => {
    setGeneratingFormats(true);
    try {
      const data = await api.generateFormats({ tone: 'authentic' });
      setFormatsResult(data);
      setActiveTab('formats');
    } catch (err) {
      console.warn('API format generation failed, using local preview:', err);
      // Local fallback preview
      setFormatsResult({
        carousel_slides: [
          { slide_number: 1, headline: 'THE TRUTH ABOUT AUDIENCE GROWTH', body: 'Why posting 5x a day fails — and what top creators do instead.' },
          { slide_number: 2, headline: '01. The 3-Second Hook Rule', body: 'Every algorithm tests retention first. If your opening doesn\'t pose tension, 70% leave.' },
          { slide_number: 3, headline: '02. Universal Safe Zones', body: 'Captions too low get covered by app buttons. Lift text into the active zone.' },
          { slide_number: 4, headline: '03. Turn Endings into Encores', body: 'Give viewers a tracked QR or evergreen next-video link so they binge your catalog.' },
        ],
        linkedin_post: 'Most creators spend 8 hours editing a video, only to lose 80% of viewers in 4 seconds...',
        twitter_thread: [
          '1/4 How to turn 1 video into 50k+ cross-platform impressions (without burning out) 🧵👇',
          '2/4 Cut the fluff. Your first 3 seconds determine whether the algorithm pushes your video to 1,000 or 100,000 feeds.',
          '3/4 Universal Safe Zones: lift your text so it never collides with UI buttons.',
        ],
      });
      setActiveTab('formats');
    } finally {
      setGeneratingFormats(false);
    }
  };

  return (
    <div style={{ backgroundColor: '#0D0E16', color: '#F4F2EE', minHeight: '100vh', fontFamily: '"Outfit", "Figtree", system-ui, sans-serif' }}>
      <Navbar />

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px 96px', display: 'flex', flexDirection: 'column', gap: 36 }}>
        {/* Top Header */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20 }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', color: '#E36BFF', textTransform: 'uppercase' }}>
              Growth Room & Level 3 Insights
            </span>
            <h1 style={{ margin: '6px 0 0', fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800 }}>
              Growth Dashboard
            </h1>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={handleGenerateFormats}
              disabled={generatingFormats}
              style={{ background: '#E36BFF', color: '#0D0E16', border: 0, borderRadius: 12, padding: '12px 20px', fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <Layers size={18} />
              {generatingFormats ? 'Generating Repurposed Formats…' : 'One Upload → All Formats'}
            </button>
            <Link
              to="/studio"
              style={{ background: '#161827', border: '1px solid #2E3150', color: '#F4F2EE', borderRadius: 12, padding: '12px 20px', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}
            >
              Open Studio
            </Link>
          </div>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #2E3150', paddingBottom: 12 }}>
          {[
            { id: 'overview', label: '28-Day Overview & Attribution' },
            { id: 'insights', label: 'Retention Diagnosis & Radar' },
            { id: 'formats', label: 'Non-Video Repurposed Formats' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: activeTab === tab.id ? '#1A1C2C' : 'transparent',
                color: activeTab === tab.id ? '#3DD6C6' : '#A9ABC2',
                border: activeTab === tab.id ? '1px solid #3DD6C6' : '1px solid transparent',
                borderRadius: 10,
                padding: '8px 16px',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB 1: Overview */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            {/* Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
              <div style={{ background: '#161827', border: '1px solid #2E3150', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#A9ABC2', fontWeight: 600 }}>Total Video Views</span>
                <span style={{ fontSize: 36, fontWeight: 800 }}>148.2K</span>
                <span style={{ fontSize: 12, color: '#3DD6C6', fontWeight: 700 }}>+24% vs last 28 days</span>
              </div>

              <div style={{ background: '#161827', border: '1px solid #2E3150', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#A9ABC2', fontWeight: 600 }}>Followers From Outros & Links</span>
                <span style={{ fontSize: 36, fontWeight: 800, color: '#3DD6C6' }}>+642</span>
                <span style={{ fontSize: 12, color: '#3DD6C6', fontWeight: 700 }}>Traced to 8 niche outro cards</span>
              </div>

              <div style={{ background: '#161827', border: '1px solid #2E3150', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#A9ABC2', fontWeight: 600 }}>QR Scans & Smart Link Taps</span>
                <span style={{ fontSize: 36, fontWeight: 800, color: '#FF9A3D' }}>3,890</span>
                <span style={{ fontSize: 12, color: '#A9ABC2', fontWeight: 600 }}>62% mobile / 38% TV scans</span>
              </div>

              <div style={{ background: '#161827', border: '1px solid #2E3150', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#A9ABC2', fontWeight: 600 }}>Average Completion Rate</span>
                <span style={{ fontSize: 36, fontWeight: 800, color: '#E36BFF' }}>72.4%</span>
                <span style={{ fontSize: 12, color: '#3DD6C6', fontWeight: 700 }}>+11% above niche benchmark</span>
              </div>
            </div>

            {/* Next Best Action Card */}
            <div style={{ background: '#1E1530', border: '2px solid #E36BFF', borderRadius: 20, padding: 28, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 20 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(227, 107, 255, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#E36BFF' }}>
                  <Sparkles size={24} />
                </div>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', color: '#E36BFF' }}>NEXT BEST ACTION</span>
                  <h3 style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 800 }}>Schedule your "Pasta Recipe Secrets" clip tomorrow at 11:30 AM</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 14, color: '#E6DDF5' }}>Audience activity peaks on Instagram & Shorts at this time. Predicted +42% reach over baseline.</p>
                </div>
              </div>
              <Link to="/studio" style={{ background: '#E36BFF', color: '#0D0E16', fontWeight: 800, padding: '12px 24px', borderRadius: 12, textDecoration: 'none' }}>
                Review in Studio
              </Link>
            </div>
          </div>
        )}

        {/* TAB 2: Insights & Retention */}
        {activeTab === 'insights' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            {/* Retention Diagnosis Curve */}
            <div style={{ background: '#161827', border: '1px solid #2E3150', borderRadius: 24, padding: 32, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Video Retention Diagnosis</h2>
                  <p style={{ margin: '4px 0 0', fontSize: 14, color: '#A9ABC2' }}>Audience drop-offs explained in plain words, not complex charts.</p>
                </div>
                <span style={{ background: '#1A1C2C', color: '#3DD6C6', border: '1px solid #3DD6C6', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 700 }}>
                  Completion: 76% (Top 10% in Niche)
                </span>
              </div>

              {/* Graphical Timeline Representation */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                <div style={{ width: '100%', height: 48, background: '#0D0E16', borderRadius: 12, border: '1px solid #2E3150', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
                  <div style={{ width: '76%', height: '100%', background: 'linear-gradient(90deg, #3DD6C6 0%, #FF9A3D 50%, #E36BFF 100%)', opacity: 0.3 }} />
                  {/* Markers */}
                  <div style={{ position: 'absolute', left: '12%', height: '100%', width: 2, background: '#FF9A3D' }} />
                  <div style={{ position: 'absolute', left: '55%', height: '100%', width: 2, background: '#3DD6C6' }} />
                  <div style={{ position: 'absolute', left: '88%', height: '100%', width: 2, background: '#E36BFF' }} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                  <div style={{ background: '#1A1C2C', borderRadius: 14, padding: 16, borderLeft: '4px solid #FF9A3D' }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#FF9A3D' }}>AT 0:04 · DROP-OFF</span>
                    <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#DCDDEA' }}>Slow intro: 2.2s dead air before voice. Cut 2 seconds next time to keep 15% more viewers.</p>
                  </div>
                  <div style={{ background: '#1A1C2C', borderRadius: 14, padding: 16, borderLeft: '4px solid #3DD6C6' }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#3DD6C6' }}>AT 0:18 · REWATCH PEAK</span>
                    <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#DCDDEA' }}>Ingredient reveal sparked instant rewatches and 48 comments.</p>
                  </div>
                  <div style={{ background: '#1A1C2C', borderRadius: 14, padding: 16, borderLeft: '4px solid #E36BFF' }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#E36BFF' }}>AT 0:28 · OUTRO SCAN SPIKE</span>
                    <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#DCDDEA' }}>Tracked QR code captured 182 scans for the recipe checklist download.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Trend Radar */}
            <div style={{ background: '#161827', border: '1px solid #2E3150', borderRadius: 24, padding: 32, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Trend Radar (Cross-Platform)</h2>
                <span style={{ fontSize: 13, color: '#A9ABC2' }}>Topics rising on TikTok before YouTube</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                {[
                  { tag: 'No-Knead Focaccia Technique', surge: '+142%', source: 'Rising on TikTok → YouTube Shorts' },
                  { tag: '3-Ingredient Pan Sauces', surge: '+88%', source: 'High save rate on Instagram Reels' },
                  { tag: 'Cast Iron Restoration ASMR', surge: '+65%', source: 'High watch time on TikTok' },
                ].map((t, idx) => (
                  <div key={idx} style={{ background: '#1A1C2C', border: '1px solid #2E3150', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#3DD6C6', fontWeight: 700 }}>{t.surge} SURGE</span>
                      <ArrowUpRight size={16} color="#3DD6C6" />
                    </div>
                    <span style={{ fontSize: 17, fontWeight: 700 }}>{t.tag}</span>
                    <span style={{ fontSize: 13, color: '#A9ABC2' }}>{t.source}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Repurposed Formats */}
        {activeTab === 'formats' && formatsResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            <div style={{ background: '#161827', border: '1px solid #2E3150', borderRadius: 24, padding: 32, display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#3DD6C6', letterSpacing: '0.12em' }}>PRD SECTION 12: N-1</span>
                <h2 style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 800 }}>Instagram & LinkedIn Carousel Slides</h2>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                {formatsResult.carousel_slides.map((s, idx) => (
                  <div key={idx} style={{ background: '#0D0E16', border: '1px solid #2E3150', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#E36BFF' }}>SLIDE {s.slide_number}</span>
                    <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{s.headline}</h4>
                    <p style={{ margin: 0, fontSize: 13.5, color: '#C9CBDD', lineHeight: 1.45 }}>{s.body}</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
              {/* LinkedIn Post */}
              <div style={{ background: '#161827', border: '1px solid #2E3150', borderRadius: 24, padding: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#3DD6C6', letterSpacing: '0.12em' }}>PRD N-2 · LINKEDIN POST</span>
                <textarea
                  readOnly
                  value={formatsResult.linkedin_post}
                  style={{ width: '100%', height: 200, background: '#0D0E16', border: '1px solid #2E3150', borderRadius: 12, padding: 14, color: '#F4F2EE', fontSize: 13.5, resize: 'none' }}
                />
                <button
                  onClick={() => navigator.clipboard.writeText(formatsResult.linkedin_post)}
                  style={{ background: '#1A1C2C', color: '#F4F2EE', border: '1px solid #2E3150', borderRadius: 10, padding: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                  Copy to Clipboard
                </button>
              </div>

              {/* Twitter Thread */}
              <div style={{ background: '#161827', border: '1px solid #2E3150', borderRadius: 24, padding: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#E36BFF', letterSpacing: '0.12em' }}>PRD N-2 · X THREAD</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 200, overflowY: 'auto' }}>
                  {formatsResult.twitter_thread.map((t, idx) => (
                    <div key={idx} style={{ background: '#0D0E16', border: '1px solid #2E3150', borderRadius: 10, padding: 12, fontSize: 13, color: '#DCDDEA' }}>
                      {t}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(formatsResult.twitter_thread.join('\n\n'))}
                  style={{ background: '#1A1C2C', color: '#F4F2EE', border: '1px solid #2E3150', borderRadius: 10, padding: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                  Copy All Tweets
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
