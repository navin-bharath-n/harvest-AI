import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ArrowRight, Sparkles, HelpCircle, X } from 'lucide-react';
import Navbar from './Navbar';
import Footer from './Footer';

const NICHES = [
  { name: 'Cooking', tag: 'Warm orange & gold', text: 'Watch Our Next Recipe', color: '#ff9a3d' },
  { name: 'Travel', tag: 'Cyan & teal', text: 'Watch Our Next Adventure', color: '#3dd6c6' },
  { name: 'Tech / AI', tag: 'Blue & purple neon', text: 'Watch Our Next Video', color: '#688bff' },
  { name: 'Lifestyle', tag: 'Rainbow gradient', text: 'Watch Our Next Video', color: '#e36bff' },
  { name: 'Gaming', tag: 'Magenta & cyan', text: 'Watch Our Next Gameplay', color: '#ff4893' },
  { name: 'Education', tag: 'Gold & amber', text: 'Watch Our Next Lesson', color: '#f2c14e' },
  { name: 'Business', tag: 'Gold & champagne', text: 'Watch Our Next Video', color: '#ffd277' },
  { name: 'Music', tag: 'Pink & orange', text: 'Watch Our Next Song', color: '#ff6f61' },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(true);
  const [finderOpen, setFinderOpen] = useState(false);
  const [q1, setQ1] = useState('');
  const [q2, setQ2] = useState('');
  const [q3, setQ3] = useState('');

  const getRecommendedRoom = () => {
    if (q2 === 'multiple' || q3 === 'yes') {
      return {
        room: 'Control Room',
        color: '#F2C14E',
        price: annual ? '$49/mo' : '$59/mo',
        reason: 'Managing multiple brands or reporting to sponsors/clients fits Control Room perfectly.',
      };
    }
    if (q1 === 'grow' || q1 === 'predict') {
      return {
        room: 'Growth Room',
        color: '#E36BFF',
        price: annual ? '$19/mo' : '$24/mo',
        reason: 'Top-creator playbooks, audience learning, and predictions make Growth Room your best choice.',
      };
    }
    if (q1 === 'fix' || q1 === 'schedule') {
      return {
        room: 'Create Room',
        color: '#FF9A3D',
        price: annual ? '$9/mo' : '$12/mo',
        reason: 'One-tap fixes in your own voice and multi-platform scheduling fit Create Room.',
      };
    }
    return {
      room: 'Think Room',
      color: '#3DD6C6',
      price: '$0 Free',
      reason: 'Try checking your videos and get pre-publish report cards completely free forever.',
    };
  };

  return (
    <div style={{ backgroundColor: '#0D0E16', color: '#F4F2EE', minHeight: '100vh', fontFamily: '"Outfit", "Figtree", system-ui, sans-serif' }}>
      <Navbar />

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px 96px', display: 'flex', flexDirection: 'column', gap: 96 }}>
        {/* Hero Section */}
        <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 20 }}>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#3DD6C6', background: 'rgba(61, 214, 198, 0.1)', padding: '6px 14px', borderRadius: 999 }}>
            Quality, not quantity
          </span>
          <h1 style={{ margin: 0, fontSize: 'clamp(42px, 7vw, 92px)', fontWeight: 800, lineHeight: 0.98, letterSpacing: '-0.03em', maxWidth: 900 }}>
            Pick your room.
          </h1>
          <p style={{ margin: 0, fontSize: '1.2rem', lineHeight: 1.55, color: '#C9CBDD', maxWidth: 660 }}>
            Every room makes your videos better. Each one up doesn't give you more stuff — it gives you smarter help, from checking your video to proving what it earned.
          </p>

          {/* Monthly / Yearly Switcher */}
          <div role="group" aria-label="Billing period" style={{ display: 'inline-flex', gap: 6, padding: 5, background: '#1A1C2C', border: '1px solid #2E3150', borderRadius: 999, marginTop: 12 }}>
            <button
              type="button"
              onClick={() => setAnnual(false)}
              style={{
                border: 0,
                borderRadius: 999,
                padding: '10px 22px',
                minHeight: 44,
                font: '600 15px inherit',
                cursor: 'pointer',
                background: !annual ? '#F4F2EE' : 'transparent',
                color: !annual ? '#0D0E16' : '#C9CBDD',
                transition: 'all 0.2s ease',
              }}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              style={{
                border: 0,
                borderRadius: 999,
                padding: '10px 22px',
                minHeight: 44,
                font: '600 15px inherit',
                cursor: 'pointer',
                background: annual ? '#F4F2EE' : 'transparent',
                color: annual ? '#0D0E16' : '#C9CBDD',
                transition: 'all 0.2s ease',
              }}
            >
              Yearly · save up to 25%
            </button>
          </div>
        </section>

        {/* 4 Room Cards */}
        <section id="rooms" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24, alignItems: 'stretch' }}>
          {/* Room 01: Think Room */}
          <article style={{ background: '#161827', border: '1px solid #2E3150', borderRadius: 24, padding: '32px 26px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', color: '#0D0E16', background: '#3DD6C6', padding: '5px 10px', borderRadius: 6 }}>ROOM 01</span>
              <span style={{ fontSize: 42, fontWeight: 800, color: '#2E3150', lineHeight: 1 }}>01</span>
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Think Room</h2>
              <p style={{ margin: '4px 0 0', fontSize: 17, fontWeight: 600, color: '#3DD6C6' }}>Checks your video.</p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 46, fontWeight: 800, lineHeight: 1 }}>$0</p>
              <p style={{ margin: '4px 0 0', fontSize: 14, color: '#A9ABC2' }}>Free forever</p>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14.5, color: '#DCDDEA', flexGrow: 1, lineHeight: 1.45 }}>
              <li>A report card on every video: hook, audio, captions, platform risks</li>
              <li>Captions, hook and loop mode</li>
              <li>All 8 niche outros (with small badge)</li>
              <li>1 smart link and tracked QR code</li>
              <li>See what happened: views, followers, taps</li>
            </ul>
            <p style={{ margin: 0, fontSize: 12.5, color: '#A9ABC2' }}>Fair use: 15 video-minutes, up to 5 videos a month</p>
            <Link to="/check" style={{ textAlign: 'center', fontWeight: 700, fontSize: 15, color: '#0D0E16', background: '#3DD6C6', borderRadius: 12, padding: '14px', textDecoration: 'none' }}>
              Start free
            </Link>
          </article>

          {/* Room 02: Create Room */}
          <article style={{ background: '#161827', border: '1px solid #2E3150', borderRadius: 24, padding: '32px 26px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', color: '#0D0E16', background: '#FF9A3D', padding: '5px 10px', borderRadius: 6 }}>ROOM 02</span>
              <span style={{ fontSize: 42, fontWeight: 800, color: '#2E3150', lineHeight: 1 }}>02</span>
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Create Room</h2>
              <p style={{ margin: '4px 0 0', fontSize: 17, fontWeight: 600, color: '#FF9A3D' }}>Fixes your video.</p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 46, fontWeight: 800, lineHeight: 1 }}>{annual ? '$9' : '$12'}<span style={{ fontSize: 17, fontWeight: 600, color: '#A9ABC2' }}> /month</span></p>
              <p style={{ margin: '4px 0 0', fontSize: 14, color: '#A9ABC2' }}>{annual ? 'Billed $108 yearly — save $36' : 'Billed monthly'}</p>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14.5, color: '#DCDDEA', flexGrow: 1, lineHeight: 1.45 }}>
              <li>One-tap fixes, written in your own voice</li>
              <li>Clips from long videos, sized for every platform</li>
              <li>Schedule to every launch platform</li>
              <li>No badge, 3 smart links, evergreen next-video link</li>
              <li>See why a video worked — or flopped</li>
            </ul>
            <p style={{ margin: 0, fontSize: 12.5, color: '#A9ABC2' }}>Fair use: 120 video-minutes a month</p>
            <Link to="/studio" style={{ textAlign: 'center', fontWeight: 700, fontSize: 15, color: '#0D0E16', background: '#FF9A3D', borderRadius: 12, padding: '14px', textDecoration: 'none' }}>
              Start creating
            </Link>
          </article>

          {/* Room 03: Growth Room */}
          <article style={{ background: '#1E1530', border: '2px solid #E36BFF', borderRadius: 24, padding: '32px 26px', display: 'flex', flexDirection: 'column', gap: 20, position: 'relative' }}>
            <div style={{ position: 'absolute', top: -14, left: 24, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0D0E16', background: '#E36BFF', padding: '5px 14px', borderRadius: 999 }}>
              Most creators pick this
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', color: '#0D0E16', background: '#E36BFF', padding: '5px 10px', borderRadius: 6 }}>ROOM 03</span>
              <span style={{ fontSize: 42, fontWeight: 800, color: '#3D2E5C', lineHeight: 1 }}>03</span>
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Growth Room</h2>
              <p style={{ margin: '4px 0 0', fontSize: 17, fontWeight: 600, color: '#E36BFF' }}>Tells you what to make next.</p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 46, fontWeight: 800, lineHeight: 1 }}>{annual ? '$19' : '$24'}<span style={{ fontSize: 17, fontWeight: 600, color: '#B9A8D6' }}> /month</span></p>
              <p style={{ margin: '4px 0 0', fontSize: 14, color: '#B9A8D6' }}>{annual ? 'Billed $228 yearly — save $60' : 'Billed monthly'}</p>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14.5, color: '#E6DDF5', flexGrow: 1, lineHeight: 1.45 }}>
              <li>Advice that learns from what really grew your audience</li>
              <li>Top-creator playbooks and idea planner</li>
              <li>Predicted performance before you post</li>
              <li>Carousels, posts and newsletters from every video</li>
              <li>Automatic A/B tests and verified media kit</li>
            </ul>
            <p style={{ margin: 0, fontSize: 12.5, color: '#B9A8D6' }}>Fair use: 400 video-minutes a month</p>
            <Link to="/studio" style={{ textAlign: 'center', fontWeight: 700, fontSize: 15, color: '#0D0E16', background: '#E36BFF', borderRadius: 12, padding: '14px', textDecoration: 'none' }}>
              Try it 14 days
            </Link>
          </article>

          {/* Room 04: Control Room */}
          <article style={{ background: '#161827', border: '1px solid #2E3150', borderRadius: 24, padding: '32px 26px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', color: '#0D0E16', background: '#F2C14E', padding: '5px 10px', borderRadius: 6 }}>ROOM 04</span>
              <span style={{ fontSize: 42, fontWeight: 800, color: '#2E3150', lineHeight: 1 }}>04</span>
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Control Room</h2>
              <p style={{ margin: '4px 0 0', fontSize: 17, fontWeight: 600, color: '#F2C14E' }}>Proves your results.</p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 46, fontWeight: 800, lineHeight: 1 }}>{annual ? '$49' : '$59'}<span style={{ fontSize: 17, fontWeight: 600, color: '#A9ABC2' }}> /month</span></p>
              <p style={{ margin: '4px 0 0', fontSize: 14, color: '#A9ABC2' }}>{annual ? 'Billed $588 yearly — save $120' : 'Billed monthly'}</p>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14.5, color: '#DCDDEA', flexGrow: 1, lineHeight: 1.45 }}>
              <li>Followers and results traced to every video</li>
              <li>Sponsor proof and white-label client reports</li>
              <li>5 brands, 3 seats, approvals (+$8 per extra brand)</li>
              <li>Studio mode: calendar and batch editing</li>
              <li>Priority support and onboarding call</li>
            </ul>
            <p style={{ margin: 0, fontSize: 12.5, color: '#A9ABC2' }}>Fair use: 1,000 video-minutes a month</p>
            <a href="mailto:support@encore.app?subject=Control%20Room%20Inquiry" style={{ textAlign: 'center', fontWeight: 700, fontSize: 15, color: '#0D0E16', background: '#F2C14E', borderRadius: 12, padding: '14px', textDecoration: 'none' }}>
              Talk to us
            </a>
          </article>
        </section>

        {/* Question Ladder */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, letterSpacing: '-0.02em' }}>
            Each room answers a bigger question.
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24, borderTop: '1px solid #2E3150', paddingTop: 24 }}>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#3DD6C6' }}>THINK ROOM</p>
              <p style={{ margin: '8px 0', fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>“How did my video do?”</p>
              <p style={{ margin: 0, fontSize: 14, color: '#A9ABC2', lineHeight: 1.5 }}>Every platform's numbers in one calm view.</p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#FF9A3D' }}>CREATE ROOM</p>
              <p style={{ margin: '8px 0', fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>“Why did it work?”</p>
              <p style={{ margin: 0, fontSize: 14, color: '#A9ABC2', lineHeight: 1.5 }}>Drop-offs explained in plain words, like “slow intro at 0:04”.</p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#E36BFF' }}>GROWTH ROOM</p>
              <p style={{ margin: '8px 0', fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>“What should I make next?”</p>
              <p style={{ margin: 0, fontSize: 14, color: '#A9ABC2', lineHeight: 1.5 }}>Trends, predictions and experiments built on your real results.</p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#F2C14E' }}>CONTROL ROOM</p>
              <p style={{ margin: '8px 0', fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>“How do I prove it?”</p>
              <p style={{ margin: 0, fontSize: 14, color: '#A9ABC2', lineHeight: 1.5 }}>Reports brands and clients trust, because the growth is tracked.</p>
            </div>
          </div>
        </section>

        {/* 8 Niche Outros Showcase */}
        <section id="outros" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800 }}>Eight niche outros. In every room.</h2>
              <p style={{ margin: '8px 0 0', fontSize: 16, color: '#C9CBDD' }}>Each ends your video with a tracked QR code and a next-video card — so viewers keep watching instead of scrolling away.</p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 16 }}>
            {NICHES.map((n, i) => (
              <div key={i} style={{ background: '#161827', border: '1px solid #2E3150', borderRadius: 16, padding: '16px 12px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: n.color, margin: '0 auto', opacity: 0.85 }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: '#F4F2EE' }}>{n.name}</span>
                <span style={{ fontSize: 11, color: '#A9ABC2' }}>{n.tag}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Stack Comparison */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800 }}>One room instead of four tools.</h2>
            <p style={{ margin: '12px 0 0', fontSize: 16, color: '#C9CBDD', lineHeight: 1.55 }}>
              Creators usually pay for a clipping tool, a caption tool, a scheduler and a YouTube insights tool. None of them shows which video actually grew your audience.
            </p>
          </div>
          <div style={{ background: '#161827', border: '1px solid #2E3150', borderRadius: 20, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', color: '#A9ABC2' }}>THE USUAL STACK</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, color: '#DCDDEA' }}>
              <span>Clipping + captions + scheduler + insights</span>
              <span style={{ fontWeight: 700 }}>≈ $88/mo</span>
            </div>
            <div style={{ height: 1, background: '#2E3150' }} />
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', color: '#E36BFF' }}>GROWTH ROOM</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: '#F4F2EE' }}>
              <span>All of it, plus proof of what grew you</span>
              <span style={{ fontWeight: 800, color: '#E36BFF' }}>$19/mo yearly</span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#A9ABC2' }}>Stack price is a typical total of published monthly prices for popular tools, October 2026. Their prices change; ours is $228 a year.</p>
          </div>
        </section>

        {/* Funnel: Not sure which room? */}
        <section style={{ background: '#F4F2EE', color: '#0D0E16', borderRadius: 28, padding: 'clamp(32px, 5vw, 64px)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
          <div style={{ flex: '1 1 400px' }}>
            <h2 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800 }}>Not sure which room?</h2>
            <p style={{ margin: '8px 0 0', fontSize: 18, color: '#3A3B4A' }}>Check one video free. No sign-up. Get your report card and top 3 fixes in about a minute.</p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={() => setFinderOpen(true)}
              style={{ fontWeight: 700, fontSize: 16, color: '#0D0E16', background: 'transparent', border: '2px solid #0D0E16', borderRadius: 14, padding: '16px 24px', cursor: 'pointer' }}
            >
              Room Finder (30s)
            </button>
            <Link to="/check" style={{ fontWeight: 700, fontSize: 16, color: '#F4F2EE', background: '#0D0E16', borderRadius: 14, padding: '16px 28px', textDecoration: 'none' }}>
              Check my video free
            </Link>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800 }}>Good questions.</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 28 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>What are video-minutes?</h3>
              <p style={{ margin: '6px 0 0', fontSize: 14.5, color: '#C9CBDD', lineHeight: 1.5 }}>Minutes of source video we process each month. They're fair-use limits that keep prices low — not the reason to upgrade. Rooms differ by how smart the help is.</p>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Under 1,000 followers?</h3>
              <p style={{ margin: '6px 0 0', fontSize: 14.5, color: '#C9CBDD', lineHeight: 1.5 }}>Rising creators get 50% off Create Room and Growth Room, checked through your connected account ($54/yr and $114/yr).</p>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Can I cancel?</h3>
              <p style={{ margin: '6px 0 0', fontSize: 14.5, color: '#C9CBDD', lineHeight: 1.5 }}>Anytime. Yearly billing saves up to 25%. The Growth Room trial isn't charged until day 14.</p>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Will I go viral?</h3>
              <p style={{ margin: '6px 0 0', fontSize: 14.5, color: '#C9CBDD', lineHeight: 1.5 }}>No tool can promise that. We help you make better videos and show you honestly what worked.</p>
            </div>
          </div>
        </section>

        {/* Room Finder Modal */}
        {finderOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
            <div style={{ background: '#161827', border: '1px solid #2E3150', borderRadius: 24, padding: 32, maxWidth: 520, width: '100%', display: 'flex', flexDirection: 'column', gap: 20, position: 'relative' }}>
              <button onClick={() => setFinderOpen(false)} style={{ position: 'absolute', top: 20, right: 20, background: 'transparent', border: 0, color: '#A9ABC2', cursor: 'pointer' }}>
                <X size={24} />
              </button>
              <h3 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>30-Second Room Finder</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 14, fontWeight: 600, color: '#C9CBDD' }}>1. What do you want most right now?</label>
                <select value={q1} onChange={(e) => setQ1(e.target.value)} style={{ background: '#0D0E16', color: '#F4F2EE', border: '1px solid #2E3150', borderRadius: 8, padding: 10, font: 'inherit' }}>
                  <option value="">Select your main goal...</option>
                  <option value="check">Check my videos and spot drop-off risks</option>
                  <option value="fix">1-tap auto fixes and multi-platform clipping</option>
                  <option value="grow">Learn what actually grew followers & predict next ideas</option>
                  <option value="prove">Prove results to sponsors and clients</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 14, fontWeight: 600, color: '#C9CBDD' }}>2. How many brands or channels do you run?</label>
                <select value={q2} onChange={(e) => setQ2(e.target.value)} style={{ background: '#0D0E16', color: '#F4F2EE', border: '1px solid #2E3150', borderRadius: 8, padding: 10, font: 'inherit' }}>
                  <option value="">Select number of channels...</option>
                  <option value="single">1 Channel / Brand</option>
                  <option value="multiple">2 to 5 Brands (Agency / Studio)</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 14, fontWeight: 600, color: '#C9CBDD' }}>3. Do you report to sponsors or clients?</label>
                <select value={q3} onChange={(e) => setQ3(e.target.value)} style={{ background: '#0D0E16', color: '#F4F2EE', border: '1px solid #2E3150', borderRadius: 8, padding: 10, font: 'inherit' }}>
                  <option value="">Select reporting need...</option>
                  <option value="no">No, creating for myself</option>
                  <option value="yes">Yes, need verified proof & white-label reports</option>
                </select>
              </div>

              {q1 && (
                <div style={{ background: '#1A1C2C', border: `1px solid ${getRecommendedRoom().color}`, borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: getRecommendedRoom().color }}>RECOMMENDED FOR YOU</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 20, fontWeight: 800 }}>{getRecommendedRoom().room}</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: getRecommendedRoom().color }}>{getRecommendedRoom().price}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: '#C9CBDD' }}>{getRecommendedRoom().reason}</p>
                </div>
              )}

              <button
                onClick={() => setFinderOpen(false)}
                style={{ background: '#F4F2EE', color: '#0D0E16', fontWeight: 700, border: 0, borderRadius: 10, padding: 12, cursor: 'pointer', marginTop: 8 }}
              >
                Close & View Rooms
              </button>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
