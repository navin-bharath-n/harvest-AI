import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Play, Share2, CheckCircle2, Loader2, Sparkles, ExternalLink } from 'lucide-react';
import { api } from '../api/client';

export default function SmartLinkRedirectPage() {
  const { slug } = useParams();
  const [copied, setCopied] = useState(false);
  const [device, setDevice] = useState('mobile');
  const [linkData, setLinkData] = useState(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    let mounted = true;
    const fetchLink = async () => {
      if (!slug) return;
      try {
        const data = await api.getSmartLink(slug);
        if (mounted) setLinkData(data);
      } catch (err) {
        console.warn(`Smart link for '${slug}' not found on server, using fallback preview.`, err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchLink();
    return () => {
      mounted = false;
    };
  }, [slug]);

  const title = linkData?.title || (slug ? `${slug.charAt(0).toUpperCase() + slug.slice(1)} Channel` : 'Encore Creator');
  const destinationUrl = linkData?.primary_url || 'https://www.youtube.com/';
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

        {loading ? (
          <div style={{ padding: '24px 0', display: 'flex', alignItems: 'center', gap: 8, color: '#A9ABC2' }}>
            <Loader2 size={18} className="animate-spin" />
            <span>Resolving creator channel…</span>
          </div>
        ) : (
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>{title}</h1>
            <p style={{ margin: '6px 0 0', fontSize: 14, color: '#A9ABC2' }}>
              {linkData?.is_evergreen ? 'Always links to the newest release' : 'Official Creator Destination'}
            </p>
          </div>
        )}

        {/* QR Code Block for TV / Desktop or phone sharing */}
        <div style={{ background: '#ffffff', padding: 12, borderRadius: 20, boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}>
          <img src={qrUrl} alt="Tracked Smart QR Code" style={{ width: 180, height: 180, display: 'block' }} />
        </div>

        <span style={{ fontSize: 13, color: '#C9CBDD' }}>
          {device === 'tv' ? 'Scan with your phone to subscribe' : 'Scan or tap to open directly in your app'}
        </span>

        {/* Primary Action Button */}
        <a
          href={destinationUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ width: '100%', background: '#3DD6C6', color: '#0D0E16', fontWeight: 800, fontSize: 16, padding: '16px 20px', borderRadius: 14, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxSizing: 'border-box' }}
        >
          <Play size={20} fill="currentColor" /> Open Latest Content
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
          Tracked by Encore · Device: {device} · Slug: {slug || 'default'}
        </span>
      </div>
    </div>
  );
}
