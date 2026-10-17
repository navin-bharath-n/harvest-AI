import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ExternalLink, Smartphone, Tv, Play, Share2, Sparkles, CheckCircle2 } from 'lucide-react';

export default function SmartLinkRedirectPage() {
  const { slug } = useParams();
  const [copied, setCopied] = useState(false);
  const [device, setDevice] = useState('mobile');

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (/smart-tv|googletv|appletv|hbbtv|crkey/.test(ua)) {
      setDevice('tv');
    } else if (/iphone|ipad|ipod|android/.test(ua)) {
      setDevice('mobile');
    } else {
      setDevice('desktop');
    }
  }, []);

  const channelUrl = 'https://www.youtube.com/@DailyWhisper365';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(window.location.href)}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ backgroundColor: '#0D0E16', color: '#F4F2EE', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: '"Outfit", "Figtree", system-ui, sans-serif' }}>
      <div style={{ maxWidth: 440, width: '100%', background: '#161827', border: '1px solid #2E3150', borderRadius: 28, padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 20 }}>
        {/* Brand */}
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', color: '#3DD6C6', background: 'rgba(61, 214, 198, 0.1)', padding: '5px 12px', borderRadius: 999 }}>
          ENCORE SMART LINK
        </span>

        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>DailyWhisper365</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: '#A9ABC2' }}>A daily prayer for a brighter tomorrow</p>
        </div>

        {/* QR Code Block for TV / Desktop or phone sharing */}
        <div style={{ background: '#ffffff', padding: 12, borderRadius: 20, boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}>
          <img src={qrUrl} alt="Tracked Smart QR Code" style={{ width: 180, height: 180, display: 'block' }} />
        </div>

        <span style={{ fontSize: 13, color: '#C9CBDD' }}>
          {device === 'tv' ? 'Scan with your phone to subscribe' : 'Scan or tap to open directly in your app'}
        </span>

        {/* Primary Action Button */}
        <a
          href={channelUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ width: '100%', background: '#3DD6C6', color: '#0D0E16', fontWeight: 800, fontSize: 16, padding: '16px 20px', borderRadius: 14, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxSizing: 'border-box' }}
        >
          <Play size={20} fill="currentColor" /> Open Latest Video
        </a>

        {/* Secondary Actions */}
        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <button
            onClick={handleCopy}
            style={{ flex: 1, background: '#1A1C2C', border: '1px solid #2E3150', color: '#F4F2EE', padding: '12px', borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            {copied ? <CheckCircle2 size={16} color="#3DD6C6" /> : <Share2 size={16} />}
            {copied ? 'Copied Link' : 'Share Link'}
          </button>
          <Link
            to="/pricing"
            style={{ flex: 1, background: '#1A1C2C', border: '1px solid #2E3150', color: '#F4F2EE', padding: '12px', borderRadius: 12, fontWeight: 700, fontSize: 13, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            Get Encore
          </Link>
        </div>

        <span style={{ fontSize: 11, color: '#5B617A' }}>
          Tracked by Encore · Device: {device} · Slug: {slug}
        </span>
      </div>
    </div>
  );
}
