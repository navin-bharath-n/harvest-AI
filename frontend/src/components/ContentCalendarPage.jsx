import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, ChevronLeft, ChevronRight, Plus, CheckCircle2, Clock, Coffee, Sparkles } from 'lucide-react';
import Navbar from './Navbar';
import Footer from './Footer';

const BRANDS = [
  { id: 'b1', name: 'DailyWhisper365', niche: 'Faith & Reflection', color: '#3DD6C6' },
  { id: 'b2', name: 'Tokyo Taste Lab', niche: 'Cooking & Street Food', color: '#FF9A3D' },
  { id: 'b3', name: 'Nexus Tech Review', niche: 'Tech / AI Gear', color: '#E36BFF' },
];

const SCHEDULE_DAYS = [
  {
    day: 'Monday',
    date: 'Oct 19',
    posts: [
      { id: 1, title: 'Morning Reflection Hook', platform: 'YouTube Shorts', time: '09:00 AM', status: 'Scheduled', type: 'Clip + Outro' },
      { id: 2, title: '3 Mistakes Ruining Your Day', platform: 'Instagram Reels', time: '12:30 PM', status: 'Approved', type: 'Loop Mode' },
    ],
  },
  {
    day: 'Tuesday',
    date: 'Oct 20',
    posts: [
      { id: 3, title: 'Deep Peace in Chaotic Times', platform: 'TikTok', time: '05:00 PM', status: 'Scheduled', type: 'Clip + QR Outro' },
    ],
  },
  {
    day: 'Wednesday',
    date: 'Oct 21',
    isRestDay: true,
    posts: [
      { id: 4, title: 'Repurposed Archive Winner (2025)', platform: 'YouTube Shorts', time: '11:00 AM', status: 'Auto-Bank', type: 'Content Bank Filler' },
    ],
  },
  {
    day: 'Thursday',
    date: 'Oct 22',
    posts: [
      { id: 5, title: 'Why You Must Keep Going', platform: 'Facebook Reels', time: '02:15 PM', status: 'Draft', type: 'Clip + Outro' },
      { id: 6, title: 'Evening Solace Episode', platform: 'Instagram Reels', time: '07:30 PM', status: 'Scheduled', type: 'Loop Mode' },
    ],
  },
  {
    day: 'Friday',
    date: 'Oct 23',
    posts: [
      { id: 7, title: 'Weekend Blessing Special', platform: 'YouTube Shorts', time: '10:00 AM', status: 'Approved', type: 'Clip + Outro' },
    ],
  },
  {
    day: 'Saturday',
    date: 'Oct 24',
    posts: [],
  },
  {
    day: 'Sunday',
    date: 'Oct 25',
    posts: [
      { id: 8, title: 'Weekly Summary & Community Prayer', platform: 'All Platforms', time: '08:00 AM', status: 'Scheduled', type: 'Post Kit + Outro' },
    ],
  },
];

export default function ContentCalendarPage() {
  const [selectedBrand, setSelectedBrand] = useState('b1');

  const brand = BRANDS.find(b => b.id === selectedBrand);

  return (
    <div style={{ backgroundColor: '#0D0E16', color: '#F4F2EE', minHeight: '100vh', fontFamily: '"Outfit", "Figtree", system-ui, sans-serif' }}>
      <Navbar />

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '40px 24px 96px', display: 'flex', flexDirection: 'column', gap: 32 }}>
        {/* Header */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 20 }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', color: '#F2C14E', textTransform: 'uppercase' }}>
              Control Room · Studio Mode
            </span>
            <h1 style={{ margin: '4px 0 0', fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 800 }}>
              Content Calendar & Multi-Brand Scheduler
            </h1>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <label style={{ fontSize: 13, color: '#A9ABC2', fontWeight: 600 }}>Active Brand:</label>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              style={{ background: '#161827', color: '#F4F2EE', border: '1px solid #2E3150', borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 700, outline: 'none' }}
            >
              {BRANDS.map(b => (
                <option key={b.id} value={b.id}>{b.name} ({b.niche})</option>
              ))}
            </select>
            <Link
              to="/studio"
              style={{ background: '#3DD6C6', color: '#0D0E16', fontWeight: 800, padding: '10px 18px', borderRadius: 10, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14 }}
            >
              <Plus size={16} /> New Clip
            </Link>
          </div>
        </div>

        {/* Burnout-Aware Planning Notice (PRD B-13) */}
        <div style={{ background: '#1A1C2C', border: '1px solid #2E3150', borderRadius: 16, padding: '14px 20px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Coffee size={20} color="#FF9A3D" />
            <span style={{ fontSize: 14, color: '#DCDDEA' }}>
              <strong>Burnout-Aware Scheduling Active:</strong> Wednesday is marked as a creator rest day. Repurposed high-performing archive content will post automatically.
            </span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#3DD6C6', background: 'rgba(61, 214, 198, 0.1)', padding: '4px 10px', borderRadius: 6 }}>
            Archive Bank: 14 clips ready
          </span>
        </div>

        {/* Week Calendar Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
          {SCHEDULE_DAYS.map((d, idx) => (
            <div
              key={idx}
              style={{
                background: d.isRestDay ? 'rgba(255, 154, 61, 0.04)' : '#161827',
                border: d.isRestDay ? '1px dashed #FF9A3D' : '1px solid #2E3150',
                borderRadius: 18,
                padding: 16,
                minHeight: 280,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid #2E3150', paddingBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: d.isRestDay ? '#FF9A3D' : '#F4F2EE' }}>{d.day}</span>
                <span style={{ fontSize: 12, color: '#A9ABC2' }}>{d.date}</span>
              </div>

              {d.isRestDay && (
                <div style={{ background: 'rgba(255, 154, 61, 0.12)', color: '#FF9A3D', padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Coffee size={12} /> REST DAY
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexGrow: 1 }}>
                {d.posts.map(p => (
                  <div
                    key={p.id}
                    style={{
                      background: '#1A1C2C',
                      border: '1px solid #2E3150',
                      borderRadius: 12,
                      padding: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: p.status === 'Scheduled' ? '#3DD6C6' : p.status === 'Approved' ? '#E36BFF' : '#A9ABC2', textTransform: 'uppercase' }}>
                        {p.status}
                      </span>
                      <span style={{ fontSize: 10, color: '#A9ABC2' }}>{p.time}</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#F4F2EE', lineHeight: 1.3 }}>
                      {p.title}
                    </span>
                    <span style={{ fontSize: 11, color: '#A9ABC2' }}>
                      {p.platform} · {p.type}
                    </span>
                  </div>
                ))}

                {d.posts.length === 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexGrow: 1, color: '#2E3150', fontSize: 12 }}>
                    Empty
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
