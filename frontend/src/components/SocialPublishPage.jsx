import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Download,
  ExternalLink,
  Flame,
  Image as ImageIcon,
  Layers,
  LoaderCircle,
  LogOut,
  Sliders,
  Sparkles,
  Trash2,
  UploadCloud,
  Users,
  Video,
  Clock,
  Check,
  Film,
  Wand2,
  X,
  Play,
  Pause,
  Volume2
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import harvestLogo from '../Untitled Design.png';

const platforms = [
  { id: 'youtube', name: 'YouTube', Icon: Video, hint: 'Publish this short to your YouTube channel.' },
  { id: 'facebook', name: 'Facebook', Icon: Users, hint: 'Publish this short to your Facebook Page.' },
  { id: 'instagram', name: 'Instagram', Icon: Camera, hint: 'Publish this short to your Instagram professional account.' },
];

const primaryButton = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.5rem',
  border: '1px solid #1f6f4a',
  borderRadius: 7,
  background: '#1f6f4a',
  color: '#fff',
  padding: '0.7rem 1rem',
  fontSize: '0.9rem',
  fontWeight: 650,
  cursor: 'pointer',
};

const secondaryButton = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.45rem',
  border: '1px solid #d9dcd8',
  borderRadius: 7,
  background: '#fff',
  color: '#252a34',
  padding: '0.65rem 0.95rem',
  fontSize: '0.86rem',
  fontWeight: 600,
  cursor: 'pointer',
};

export default function SocialPublishPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const clipId = searchParams.get('clip_id');
  const returnTo = location.state?.returnTo || '/studio';
  const [clip, setClip] = useState(location.state?.clip || null);
  const [connections, setConnections] = useState([]);
  const [videoUrl, setVideoUrl] = useState('');
  const [title, setTitle] = useState(location.state?.clip?.title || '');
  const [description, setDescription] = useState('Generated with Harvest AI');
  const [privacy, setPrivacy] = useState('public');
  const [loading, setLoading] = useState(true);
  const [workingPlatform, setWorkingPlatform] = useState('');
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState(false);
  const oauthPopupRef = useRef(null);
  const currentUserId = user?.id;

  // ──────────────────────────────────────────────────────────────────────────
  // Custom Thumbnail State
  // ──────────────────────────────────────────────────────────────────────────
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState(null);
  const [thumbnailPath, setThumbnailPath] = useState(null);
  const [isUploadingThumb, setIsUploadingThumb] = useState(false);
  const thumbInputRef = useRef(null);

  // ──────────────────────────────────────────────────────────────────────────
  // Watermark, Header & Footer Branding State
  // ──────────────────────────────────────────────────────────────────────────
  const [activeBrandingTab, setActiveBrandingTab] = useState('watermark'); // 'watermark' | 'header' | 'footer'

  // Watermark (Channel logo, e.g. "nb")
  const [watermarkPreviewUrl, setWatermarkPreviewUrl] = useState(null);
  const [watermarkPath, setWatermarkPath] = useState(null);
  const [watermarkPosition, setWatermarkPosition] = useState('header'); // 'header', 'footer', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'header_and_footer'
  const [watermarkScale, setWatermarkScale] = useState(20); // 8% to 40% of video width
  const [watermarkOpacity, setWatermarkOpacity] = useState(90); // 40% to 100%
  const [watermarkMode, setWatermarkMode] = useState('interval_2s'); // 'interval_2s' | 'always'
  const watermarkInputRef = useRef(null);

  // Header Banner
  const [headerPreviewUrl, setHeaderPreviewUrl] = useState(null);
  const [headerPath, setHeaderPath] = useState(null);
  const [headerHeight, setHeaderHeight] = useState(160); // 60px to 260px
  const headerInputRef = useRef(null);

  // Footer Banner
  const [footerPreviewUrl, setFooterPreviewUrl] = useState(null);
  const [footerPath, setFooterPath] = useState(null);
  const [footerHeight, setFooterHeight] = useState(180); // 60px to 260px
  const footerInputRef = useRef(null);

  const [isBurningBranding, setIsBurningBranding] = useState(false);
  const [brandingBurned, setBrandingBurned] = useState(false);

  // ──────────────────────────────────────────────────────────────────────────
  // Cloudflare R2 Video Templates & CTA Outro State
  // ──────────────────────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [outroMode, setOutroMode] = useState('none'); // 'none' | 'template' | 'custom'
  const [templateFilterCategory, setTemplateFilterCategory] = useState('all');
  const [playingTemplateId, setPlayingTemplateId] = useState(null);

  // Custom 9:16 Creator Outro
  const [outroDuration, setOutroDuration] = useState(3.0);
  const [showLikeAction, setShowLikeAction] = useState(true);
  const [outroLikeText, setOutroLikeText] = useState('Like');
  const [showCommentAction, setShowCommentAction] = useState(true);
  const [outroCommentText, setOutroCommentText] = useState('Comment');
  const [showSubscribeAction, setShowSubscribeAction] = useState(true);
  const [outroSubscribeText, setOutroSubscribeText] = useState('Subscribe');
  const [showFollowAction, setShowFollowAction] = useState(true);
  const [outroFollowText, setOutroFollowText] = useState('Follow');
  const [outroLongText, setOutroLongText] = useState('');
  const [outroMusicStyle, setOutroMusicStyle] = useState('upbeat');

  const refreshConnections = useCallback(async () => {
    if (!currentUserId) return [];
    try {
      const items = await api.getUserConnections(currentUserId);
      setConnections(items || []);
      return items || [];
    } catch {
      return [];
    }
  }, [currentUserId]);

  useEffect(() => {
    let active = true;
    let createdVideoUrl = '';
    const load = async () => {
      if (!clipId) {
        setMessageError(true);
        setMessage('Choose a generated video in Studio before opening publishing.');
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [clipResult, , tmplData] = await Promise.all([
          api.getClip(clipId),
          refreshConnections(),
          api.getTemplates().catch(() => [])
        ]);
        if (!active) return;
        setClip(clipResult);
        setTemplates(tmplData || []);
        setTitle((current) => current || clipResult.title || 'Harvest short');

        // Restore any existing custom thumbnail
        const existingThumb = clipResult.edit_options?.thumbnail_path;
        if (existingThumb) {
          setThumbnailPath(existingThumb);
          api.getClipThumbnailMedia(clipId).then((blobUrl) => {
            if (active) setThumbnailPreviewUrl(blobUrl);
          }).catch(() => {});
        }

        // Restore existing branding configuration
        const existingBranding = clipResult.edit_options?.branding;
        if (existingBranding) {
          if (existingBranding.watermark_path) setWatermarkPath(existingBranding.watermark_path);
          if (existingBranding.watermark_position) setWatermarkPosition(existingBranding.watermark_position);
          if (existingBranding.watermark_scale) setWatermarkScale(Math.round(existingBranding.watermark_scale * 100));
          if (existingBranding.watermark_opacity) setWatermarkOpacity(Math.round(existingBranding.watermark_opacity * 100));
          if (existingBranding.watermark_mode) setWatermarkMode(existingBranding.watermark_mode);
          if (existingBranding.header_image_path) setHeaderPath(existingBranding.header_image_path);
          if (existingBranding.header_height) setHeaderHeight(existingBranding.header_height);
          if (existingBranding.footer_image_path) setFooterPath(existingBranding.footer_image_path);
          if (existingBranding.footer_height) setFooterHeight(existingBranding.footer_height);
          if (clipResult.edit_options?.branding_burned) setBrandingBurned(true);
        }

        // Restore existing outro configuration
        const existingTemplateId = clipResult.edit_options?.template_id || existingBranding?.template_id;
        const existingCustomOutro = clipResult.edit_options?.enable_outro || existingBranding?.enable_outro;
        if (existingTemplateId) {
          setSelectedTemplateId(existingTemplateId);
          setOutroMode('template');
        } else if (existingCustomOutro) {
          setOutroMode('custom');
          const eo = clipResult.edit_options || existingBranding || {};
          if (eo.outro_like_text) setOutroLikeText(eo.outro_like_text);
          if (eo.outro_comment_text) setOutroCommentText(eo.outro_comment_text);
          if (eo.outro_subscribe_text) setOutroSubscribeText(eo.outro_subscribe_text);
          if (eo.outro_follow_text) setOutroFollowText(eo.outro_follow_text);
          if (eo.outro_custom_text) setOutroLongText(eo.outro_custom_text);
          if (eo.outro_duration) setOutroDuration(Number(eo.outro_duration));
          if (eo.outro_music_style) setOutroMusicStyle(eo.outro_music_style);
        }

        if (clipResult.status === 'completed' && clipResult.storage_path) {
          const mediaUrl = await api.getClipMedia(clipId);
          if (active) {
            createdVideoUrl = mediaUrl;
            setVideoUrl(mediaUrl);
          } else {
            URL.revokeObjectURL(mediaUrl);
          }
        }
      } catch (error) {
        if (active) {
          setMessageError(true);
          setMessage(error.response?.data?.detail || error.message || 'Could not load the selected video.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
      if (createdVideoUrl) URL.revokeObjectURL(createdVideoUrl);
    };
  }, [clipId, refreshConnections]);

  useEffect(() => {
    const handleOAuthMessage = async (event) => {
      const isAllowed =
        api.isAllowedOAuthOrigin(event.origin) ||
        (oauthPopupRef.current && event.source === oauthPopupRef.current);
      if (!isAllowed) return;
      oauthPopupRef.current = null;
      if (event.data?.type === 'HARVEST_AUTH_FAILURE') {
        setMessageError(true);
        setMessage(`Account connection failed: ${event.data.error || 'Please try again.'}`);
        return;
      }
      if (event.data?.type !== 'HARVEST_AUTH_SUCCESS') return;
      try {
        await refreshConnections();
        setMessageError(false);
        setMessage(`${platforms.find((platform) => platform.id === event.data.platform)?.name || 'Social'} account connected.`);
      } catch (error) {
        setMessageError(true);
        setMessage(`Account connected, but the account list could not refresh: ${error.message}`);
      }
    };
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [refreshConnections]);

  const connectionByPlatform = useMemo(() => {
    return Object.fromEntries((connections || []).map((connection) => [connection.platform, connection]));
  }, [connections]);

  const connectPlatform = (platform) => {
    if (!user?.id) return;
    const popup = window.open(
      api.getSocialLoginUrl(platform, user.id),
      `harvest-${platform}-oauth`,
      'popup=yes,width=620,height=760,resizable=yes,scrollbars=yes'
    );
    if (!popup) {
      setMessageError(true);
      setMessage('Your browser blocked the sign-in window. Allow popups for this site and try again.');
      return;
    }
    oauthPopupRef.current = popup;
    setMessageError(false);
    setMessage(`Finish connecting your ${platforms.find((item) => item.id === platform)?.name} account in the sign-in window.`);
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Thumbnail Handlers
  // ──────────────────────────────────────────────────────────────────────────
  const handleThumbnailUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !clipId) return;
    const localUrl = URL.createObjectURL(file);
    setThumbnailPreviewUrl(localUrl);
    setIsUploadingThumb(true);
    setMessageError(false);
    setMessage('Uploading custom thumbnail…');
    try {
      const res = await api.uploadClipThumbnail(clipId, file);
      setThumbnailPath(res.thumbnail_path);
      setMessage('Custom thumbnail uploaded and attached to clip.');
    } catch (err) {
      setMessageError(true);
      setMessage(`Failed to upload thumbnail: ${err.response?.data?.detail || err.message}`);
    } finally {
      setIsUploadingThumb(false);
    }
  };

  const removeThumbnail = () => {
    setThumbnailPreviewUrl(null);
    setThumbnailPath(null);
    if (thumbInputRef.current) thumbInputRef.current.value = '';
    setMessage('Custom thumbnail removed.');
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Branding Image Handlers (Logo, Header, Footer)
  // ──────────────────────────────────────────────────────────────────────────
  const handleBrandingUpload = async (event, assetType) => {
    const file = event.target.files?.[0];
    if (!file || !clipId) return;
    const localUrl = URL.createObjectURL(file);
    if (assetType === 'watermark') {
      setWatermarkPreviewUrl(localUrl);
    } else if (assetType === 'header') {
      setHeaderPreviewUrl(localUrl);
    } else if (assetType === 'footer') {
      setFooterPreviewUrl(localUrl);
    }
    setBrandingBurned(false); // New image uploaded, live preview updated
    setMessageError(false);
    setMessage(`Uploading ${assetType} image…`);
    try {
      const res = await api.uploadBrandingImage(clipId, file, assetType);
      if (assetType === 'watermark') setWatermarkPath(res.storage_path);
      else if (assetType === 'header') setHeaderPath(res.storage_path);
      else if (assetType === 'footer') setFooterPath(res.storage_path);
      setMessage(`${assetType.charAt(0).toUpperCase() + assetType.slice(1)} image ready for preview & burn.`);
    } catch (err) {
      setMessageError(true);
      setMessage(`Failed to upload ${assetType}: ${err.response?.data?.detail || err.message}`);
    }
  };

  const clearBrandingAsset = (assetType) => {
    if (assetType === 'watermark') {
      setWatermarkPreviewUrl(null);
      setWatermarkPath(null);
      if (watermarkInputRef.current) watermarkInputRef.current.value = '';
    } else if (assetType === 'header') {
      setHeaderPreviewUrl(null);
      setHeaderPath(null);
      if (headerInputRef.current) headerInputRef.current.value = '';
    } else if (assetType === 'footer') {
      setFooterPreviewUrl(null);
      setFooterPath(null);
      if (footerInputRef.current) footerInputRef.current.value = '';
    }
    setBrandingBurned(false);
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Burn Branding with FFmpeg
  // ──────────────────────────────────────────────────────────────────────────
  const burnBrandingIntoVideo = async () => {
    if (!clipId || isBurningBranding) return;
    const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
    const isTemplateMode = outroMode === 'template' && selectedTemplate;
    const isCustomMode = outroMode === 'custom';

    if (!watermarkPath && !headerPath && !footerPath && !isTemplateMode && !isCustomMode && !thumbnailPath) {
      setMessageError(true);
      setMessage('Please select an outro template, upload a logo, or attach a thumbnail first.');
      return;
    }
    setIsBurningBranding(true);
    setMessageError(false);
    setMessage('Rendering customizations and burning into video with FFmpeg…');
    try {
      const payload = {
        watermark_path: watermarkPath || null,
        watermark_position: watermarkPosition,
        watermark_scale: Number(watermarkScale) / 100,
        watermark_opacity: Number(watermarkOpacity) / 100,
        watermark_mode: watermarkMode,
        header_image_path: headerPath || null,
        header_height: Number(headerHeight),
        footer_image_path: footerPath || null,
        footer_height: Number(footerHeight),
        thumbnail_path: thumbnailPath || null,
        template_id: isTemplateMode ? selectedTemplate.id : null,
        template_storage_path: isTemplateMode ? selectedTemplate.storage_path : null,
        enable_outro: isCustomMode,
        outro_like_text: isCustomMode && showLikeAction ? outroLikeText : '',
        outro_comment_text: isCustomMode && showCommentAction ? outroCommentText : '',
        outro_subscribe_text: isCustomMode && showSubscribeAction ? outroSubscribeText : '',
        outro_follow_text: isCustomMode && showFollowAction ? outroFollowText : '',
        outro_custom_text: isCustomMode ? outroLongText : '',
        outro_duration: isCustomMode ? outroDuration : (selectedTemplate?.duration || 3.0),
        outro_music_style: outroMusicStyle || 'upbeat',
      };
      const updatedClip = await api.applyClipBranding(clipId, payload);
      setClip(updatedClip);
      setBrandingBurned(true);

      // Refresh the video stream to display burned output
      const newMediaUrl = await api.getClipMedia(clipId);
      setVideoUrl(newMediaUrl);

      setMessage('Branding & outro successfully burned into video! The video player now reflects the final render.');
    } catch (err) {
      setMessageError(true);
      setMessage(`Failed to process video: ${err.response?.data?.detail || err.message}`);
    } finally {
      setIsBurningBranding(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Social Publish Handler
  // ──────────────────────────────────────────────────────────────────────────
  const publishToPlatform = async (platform) => {
    if (!clipId || workingPlatform) return;
    if (clip?.status !== 'completed') {
      setMessageError(true);
      setMessage('This video is not ready to publish yet.');
      return;
    }
    setWorkingPlatform(platform);
    setMessageError(false);
    setMessage(`Uploading to ${platforms.find((item) => item.id === platform)?.name}…`);
    try {
      const brandingConfig = (watermarkPath || headerPath || footerPath) ? {
        watermark_path: watermarkPath,
        watermark_position: watermarkPosition,
        watermark_scale: Number(watermarkScale) / 100,
        watermark_opacity: Number(watermarkOpacity) / 100,
        watermark_mode: watermarkMode,
        header_image_path: headerPath,
        header_height: Number(headerHeight),
        footer_image_path: footerPath,
        footer_height: Number(footerHeight),
      } : null;

      await api.publishClip(
        clipId,
        [platform],
        title.trim() || 'Harvest short',
        description.trim(),
        privacy,
        {},
        thumbnailPath,
        brandingConfig
      );

      // Publishing runs in background; poll for result
      for (let attempt = 0; attempt < 90; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const updatedClip = await api.getClip(clipId);
        const result = updatedClip?.published_urls?.[platform];
        if (typeof result === 'string' && result) {
          if (result.startsWith('error:')) throw new Error(result.slice(6).trim());
          setMessage(`Published successfully to ${platforms.find((item) => item.id === platform)?.name}!`);
          return;
        }
      }
      setMessage('The upload is processing in the background. Check back shortly.');
    } catch (error) {
      setMessageError(true);
      setMessage(`Upload failed: ${error.response?.data?.detail || error.message}`);
    } finally {
      setWorkingPlatform('');
    }
  };

  const getWatermarkPositionStyle = (pos) => {
    switch (pos) {
      case 'top-left':
        return { top: '3.5%', left: '4%' };
      case 'top-right':
        return { top: '3.5%', right: '4%' };
      case 'bottom-left':
        return { bottom: '3.5%', left: '4%' };
      case 'bottom-right':
        return { bottom: '3.5%', right: '4%' };
      case 'footer':
      case 'bottom':
        return { bottom: '3.5%', left: '50%', transform: 'translateX(-50%)' };
      case 'header_and_footer':
        return { top: '3.5%', left: '50%', transform: 'translateX(-50%)' };
      case 'header':
      default:
        return { top: '3.5%', left: '50%', transform: 'translateX(-50%)' };
    }
  };

  const hasAnyBranding = Boolean(watermarkPreviewUrl || headerPreviewUrl || footerPreviewUrl || watermarkPath || headerPath || footerPath);
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  const hasAnyOutro = Boolean((outroMode === 'template' && selectedTemplate) || outroMode === 'custom');
  const hasAnyCustomization = Boolean(hasAnyBranding || hasAnyOutro);

  return (
    <div style={{ minHeight: '100vh', background: '#f8f8f5', color: '#16181d', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <style>{`
        @keyframes harvest-publish-spin { to { transform: rotate(360deg); } }
        .harvest-publish-spin { animation: harvest-publish-spin 0.8s linear infinite; }
        
        /* 2-Second interval pulsing: 2 seconds visible, 2 seconds hidden */
        @keyframes harvest-watermark-blink {
          0%, 48% { opacity: 1; }
          50%, 98% { opacity: 0; }
          100% { opacity: 1; }
        }
        .harvest-watermark-pulse {
          animation: harvest-watermark-blink 4s infinite ease-in-out;
        }

        @media (max-width: 860px) {
          .harvest-publish-layout { grid-template-columns: minmax(0, 1fr) !important; }
          .harvest-publish-header { padding: 0 1rem !important; }
          .harvest-publish-brand { font-size: 1rem !important; }
        }
      `}</style>

      {/* App Header */}
      <header className="harvest-publish-header" style={{ height: 72, padding: '0 5vw', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', background: '#fff', borderBottom: '1px solid #e6e6e1' }}>
        <button type="button" onClick={() => navigate(returnTo)} aria-label="Back to Studio" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: 0, color: '#16181d', border: 0, background: 'transparent', cursor: 'pointer' }}>
          <img src={harvestLogo} alt="Harvest" style={{ width: 38, height: 38, objectFit: 'contain' }} />
          <span className="harvest-publish-brand" style={{ fontSize: '1.25rem', fontFamily: 'Georgia, serif', fontWeight: 700 }}>Harvest Studio</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ color: '#5b616b', fontSize: '0.9rem' }}>{user?.full_name || user?.email || 'Account'}</span>
          <button type="button" onClick={logout} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 0.8rem', border: '1px solid #e6e6e1', borderRadius: 7, background: '#fff', color: '#343943', cursor: 'pointer' }}><LogOut size={16} /> Sign Out</button>
        </div>
      </header>

      <main style={{ maxWidth: 1240, margin: '0 auto', padding: '2rem 1.25rem 4rem' }}>
        <button type="button" onClick={() => navigate(returnTo)} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', marginBottom: '1rem', padding: '0.4rem 0', border: 0, color: '#536071', background: 'transparent', fontWeight: 600, cursor: 'pointer' }}>
          <ArrowLeft size={17} /> Back to Studio
        </button>

        <section style={{ padding: '1.4rem 1.5rem', marginBottom: '1.25rem', background: '#fff', border: '1px solid #e6e6e1', borderRadius: 12, boxShadow: '0 2px 8px rgba(22,24,29,0.03)' }}>
          <div style={{ color: '#7a808a', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 650, fontSize: '0.76rem', marginBottom: '0.45rem' }}>Publish & Branding Studio</div>
          <h1 style={{ margin: '0 0 0.35rem', fontFamily: 'Georgia, serif', fontSize: '1.65rem' }}>{clip?.title || 'Selected generated video'}</h1>
          <p style={{ margin: 0, color: '#657080', fontSize: '0.95rem' }}>Set your custom thumbnail, add watermarks and header/footer banners, then publish directly to your channels.</p>
        </section>

        {message && (
          <div role="status" style={{ display: 'flex', gap: '0.55rem', alignItems: 'center', padding: '0.85rem 1rem', marginBottom: '1.25rem', background: messageError ? '#fff5f3' : '#eef8f2', border: `1px solid ${messageError ? '#f0c9c2' : '#c3e6d1'}`, borderRadius: 8, color: messageError ? '#9c3327' : '#1b5e3d' }}>
            {!messageError ? <CheckCircle2 size={18} color="#1f6f4a" /> : <Flame size={18} color="#c53030" />}
            {message}
          </div>
        )}

        {loading ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: '#5b616b' }}>
            <LoaderCircle size={28} className="harvest-publish-spin" />
            <p>Loading video and connected accounts…</p>
          </div>
        ) : !clipId ? (
          <section style={{ padding: '2rem', background: '#fff', border: '1px solid #e6e6e1', borderRadius: 12 }}>
            <button type="button" style={primaryButton} onClick={() => navigate(returnTo)}>Choose a video in Studio</button>
          </section>
        ) : (
          <div className="harvest-publish-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(320px, 390px)', alignItems: 'start', gap: '1.4rem' }}>
            {/* Left Column: Form & Tools */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              {/* 1. Post Details */}
              <section style={{ padding: '1.35rem', background: '#fff', border: '1px solid #e6e6e1', borderRadius: 12 }}>
                <h2 style={{ margin: '0 0 1rem', fontSize: '1.18rem' }}>1. Post details</h2>
                <label style={{ display: 'block', marginBottom: '0.9rem', color: '#586273', fontSize: '0.88rem', fontWeight: 600 }}>Video title
                  <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '0.35rem', padding: '0.7rem 0.75rem', border: '1px solid #d9dcd8', borderRadius: 7, color: '#16181d', font: 'inherit' }} />
                </label>
                <label style={{ display: 'block', marginBottom: '0.9rem', color: '#586273', fontSize: '0.88rem', fontWeight: 600 }}>Description
                  <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} maxLength={5000} style={{ display: 'block', width: '100%', boxSizing: 'border-box', resize: 'vertical', marginTop: '0.35rem', padding: '0.7rem 0.75rem', border: '1px solid #d9dcd8', borderRadius: 7, color: '#16181d', font: 'inherit' }} />
                </label>
                <label style={{ display: 'block', color: '#586273', fontSize: '0.88rem', fontWeight: 600 }}>YouTube visibility
                  <select value={privacy} onChange={(event) => setPrivacy(event.target.value)} style={{ display: 'block', marginTop: '0.35rem', padding: '0.65rem 0.75rem', border: '1px solid #d9dcd8', borderRadius: 7, background: '#fff', color: '#16181d', font: 'inherit' }}>
                    <option value="public">Public</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="private">Private</option>
                  </select>
                </label>
              </section>

              {/* 2. Custom Thumbnail Card */}
              <section style={{ padding: '1.35rem', background: '#fff', border: '1px solid #e6e6e1', borderRadius: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                  <h2 style={{ margin: 0, fontSize: '1.18rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ImageIcon size={20} color="#1f6f4a" /> 2. Custom Thumbnail
                  </h2>
                  {thumbnailPath && (
                    <span style={{ fontSize: '0.74rem', background: '#eef6f0', color: '#1f6f4a', border: '1px solid #cce5d4', padding: '0.2rem 0.6rem', borderRadius: 99, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Check size={12} /> Thumbnail Attached
                    </span>
                  )}
                </div>
                <p style={{ margin: '0 0 1rem', color: '#657080', fontSize: '0.88rem' }}>
                  Upload a custom thumbnail image (PNG, JPG, WebP) for YouTube and social feeds.
                </p>

                <input
                  type="file"
                  ref={thumbInputRef}
                  accept="image/png,image/jpeg,image/webp,image/jpg"
                  style={{ display: 'none' }}
                  onChange={handleThumbnailUpload}
                />

                {thumbnailPreviewUrl ? (
                  <div style={{ display: 'flex', gap: '1.1rem', alignItems: 'center', background: '#f9f9f7', padding: '0.9rem', borderRadius: 9, border: '1px solid #e6e6e1' }}>
                    <div style={{ width: 85, height: 120, borderRadius: 6, overflow: 'hidden', background: '#1c1e24', flexShrink: 0, boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}>
                      <img src={thumbnailPreviewUrl} alt="Thumbnail Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#16181d', marginBottom: '0.25rem' }}>Custom Thumbnail Active</div>
                      <div style={{ fontSize: '0.8rem', color: '#657080', marginBottom: '0.8rem' }}>Will be uploaded to YouTube Shorts / video on publish.</div>
                      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          disabled={isUploadingThumb}
                          onClick={() => thumbInputRef.current?.click()}
                          style={secondaryButton}
                        >
                          {isUploadingThumb ? <LoaderCircle size={14} className="harvest-publish-spin" /> : <UploadCloud size={14} />} Replace
                        </button>
                        <button
                          type="button"
                          onClick={removeThumbnail}
                          style={{ ...secondaryButton, color: '#b91c1c', borderColor: '#fecaca' }}
                        >
                          <Trash2 size={14} /> Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => thumbInputRef.current?.click()}
                    style={{
                      border: '2px dashed #d9dcd8',
                      borderRadius: 10,
                      padding: '1.6rem 1rem',
                      textAlign: 'center',
                      background: '#fcfcfb',
                      cursor: 'pointer',
                      transition: 'border-color 0.2s',
                    }}
                  >
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#eef6f0', display: 'grid', placeItems: 'center', margin: '0 auto 0.75rem' }}>
                      <ImageIcon size={22} color="#1f6f4a" />
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.94rem', color: '#16181d', marginBottom: '0.2rem' }}>Click to upload custom thumbnail</div>
                    <div style={{ fontSize: '0.82rem', color: '#7a828e' }}>Recommended: 1080×1920 (vertical) or 1280×720 (landscape)</div>
                  </div>
                )}
              </section>

              {/* 3. Watermark, Header & Footer Branding Studio */}
              <section style={{ padding: '1.35rem', background: '#fff', border: '1px solid #e6e6e1', borderRadius: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <h2 style={{ margin: 0, fontSize: '1.18rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Layers size={20} color="#1f6f4a" /> 3. Watermark & Branding Studio
                  </h2>
                  {brandingBurned ? (
                    <span style={{ fontSize: '0.74rem', background: '#eef6f0', color: '#1f6f4a', border: '1px solid #cce5d4', padding: '0.2rem 0.6rem', borderRadius: 99, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Check size={12} /> Branding Burned In
                    </span>
                  ) : hasAnyBranding ? (
                    <span style={{ fontSize: '0.74rem', background: '#fff8ea', color: '#b45309', border: '1px solid #fde68a', padding: '0.2rem 0.6rem', borderRadius: 99, fontWeight: 700 }}>
                      Previewing Overlay
                    </span>
                  ) : null}
                </div>
                <p style={{ margin: '0 0 1.1rem', color: '#657080', fontSize: '0.88rem' }}>
                  Add your channel logo (e.g. "nb"), custom header banner, or footer banner with custom sizing and interval timing.
                </p>

                {/* Tab Switcher */}
                <div style={{ display: 'flex', gap: '0.35rem', padding: '0.3rem', background: '#f4f5f3', borderRadius: 8, marginBottom: '1.25rem' }}>
                  {[
                    { id: 'watermark', label: 'Logo / Watermark' },
                    { id: 'header', label: 'Header Banner' },
                    { id: 'footer', label: 'Footer Banner' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveBrandingTab(tab.id)}
                      style={{
                        flex: 1,
                        padding: '0.55rem 0.75rem',
                        border: 0,
                        borderRadius: 6,
                        background: activeBrandingTab === tab.id ? '#fff' : 'transparent',
                        color: activeBrandingTab === tab.id ? '#16181d' : '#657080',
                        fontWeight: activeBrandingTab === tab.id ? 700 : 550,
                        fontSize: '0.86rem',
                        cursor: 'pointer',
                        boxShadow: activeBrandingTab === tab.id ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Hidden File Inputs */}
                <input
                  type="file"
                  ref={watermarkInputRef}
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  style={{ display: 'none' }}
                  onChange={(e) => handleBrandingUpload(e, 'watermark')}
                />
                <input
                  type="file"
                  ref={headerInputRef}
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  style={{ display: 'none' }}
                  onChange={(e) => handleBrandingUpload(e, 'header')}
                />
                <input
                  type="file"
                  ref={footerInputRef}
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  style={{ display: 'none' }}
                  onChange={(e) => handleBrandingUpload(e, 'footer')}
                />

                {/* Tab 1: Logo / Watermark */}
                {activeBrandingTab === 'watermark' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', background: '#fcfcfb', border: '1px solid #e6e6e1', borderRadius: 9, padding: '0.9rem' }}>
                      {watermarkPreviewUrl ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                          <div style={{ width: 50, height: 50, borderRadius: 8, background: '#1c1e24', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                            <img src={watermarkPreviewUrl} alt="Logo" style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Channel Logo Ready</div>
                            <div style={{ fontSize: '0.8rem', color: '#657080' }}>Visible across video or every 2 sec</div>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Upload Logo / Watermark</div>
                          <div style={{ fontSize: '0.8rem', color: '#657080' }}>e.g. "nb" channel icon with transparent background</div>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button type="button" onClick={() => watermarkInputRef.current?.click()} style={secondaryButton}>
                          <UploadCloud size={14} /> {watermarkPreviewUrl ? 'Replace' : 'Upload Logo'}
                        </button>
                        {watermarkPreviewUrl && (
                          <button type="button" onClick={() => clearBrandingAsset('watermark')} style={{ ...secondaryButton, color: '#b91c1c' }}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Watermark Placement */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem' }}>
                      {[
                        { id: 'header', label: 'Header (Top)' },
                        { id: 'footer', label: 'Footer (Bottom)' },
                        { id: 'top-left', label: 'Top Left' },
                        { id: 'top-right', label: 'Top Right' },
                        { id: 'bottom-left', label: 'Bottom Left' },
                        { id: 'bottom-right', label: 'Bottom Right' },
                        { id: 'header_and_footer', label: 'Both Top & Bottom' },
                      ].map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => { setWatermarkPosition(p.id); setBrandingBurned(false); }}
                          style={{
                            padding: '0.55rem 0.65rem',
                            borderRadius: 6,
                            border: `1px solid ${watermarkPosition === p.id ? '#1f6f4a' : '#d9dcd8'}`,
                            background: watermarkPosition === p.id ? '#eef6f0' : '#fff',
                            color: watermarkPosition === p.id ? '#1f6f4a' : '#343943',
                            fontWeight: watermarkPosition === p.id ? 700 : 500,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                          }}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>

                    {/* Watermark Display Interval Mode */}
                    <div style={{ background: '#fcfcfb', border: '1px solid #e6e6e1', borderRadius: 9, padding: '0.9rem' }}>
                      <div style={{ fontWeight: 650, fontSize: '0.88rem', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Clock size={16} color="#1f6f4a" /> Watermark Timing Mode
                      </div>
                      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem', cursor: 'pointer', fontWeight: watermarkMode === 'interval_2s' ? 700 : 500 }}>
                          <input
                            type="radio"
                            name="watermarkMode"
                            checked={watermarkMode === 'interval_2s'}
                            onChange={() => { setWatermarkMode('interval_2s'); setBrandingBurned(false); }}
                          />
                          Every 2 Seconds (Pulsing / 2s on-off)
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem', cursor: 'pointer', fontWeight: watermarkMode === 'always' ? 700 : 500 }}>
                          <input
                            type="radio"
                            name="watermarkMode"
                            checked={watermarkMode === 'always'}
                            onChange={() => { setWatermarkMode('always'); setBrandingBurned(false); }}
                          />
                          Always Visible
                        </label>
                      </div>
                    </div>

                    {/* Sliders: Logo Size & Opacity */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <label style={{ fontSize: '0.84rem', fontWeight: 600, color: '#586273' }}>
                        Logo Size: <strong style={{ color: '#16181d' }}>{watermarkScale}%</strong>
                        <input
                          type="range"
                          min="8"
                          max="40"
                          value={watermarkScale}
                          onChange={(e) => { setWatermarkScale(Number(e.target.value)); setBrandingBurned(false); }}
                          style={{ width: '100%', marginTop: '0.4rem', accentColor: '#1f6f4a' }}
                        />
                      </label>
                      <label style={{ fontSize: '0.84rem', fontWeight: 600, color: '#586273' }}>
                        Logo Opacity: <strong style={{ color: '#16181d' }}>{watermarkOpacity}%</strong>
                        <input
                          type="range"
                          min="40"
                          max="100"
                          value={watermarkOpacity}
                          onChange={(e) => { setWatermarkOpacity(Number(e.target.value)); setBrandingBurned(false); }}
                          style={{ width: '100%', marginTop: '0.4rem', accentColor: '#1f6f4a' }}
                        />
                      </label>
                    </div>
                  </div>
                )}

                {/* Tab 2: Header Banner */}
                {activeBrandingTab === 'header' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', background: '#fcfcfb', border: '1px solid #e6e6e1', borderRadius: 9, padding: '0.9rem' }}>
                      {headerPreviewUrl ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                          <div style={{ width: 80, height: 36, borderRadius: 6, background: '#1c1e24', overflow: 'hidden' }}>
                            <img src={headerPreviewUrl} alt="Header" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Header Banner Active</div>
                            <div style={{ fontSize: '0.8rem', color: '#657080' }}>Overlaid across the top of video</div>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Upload Header Banner</div>
                          <div style={{ fontSize: '0.8rem', color: '#657080' }}>Shows title or banner at the top of the video</div>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button type="button" onClick={() => headerInputRef.current?.click()} style={secondaryButton}>
                          <UploadCloud size={14} /> {headerPreviewUrl ? 'Replace' : 'Upload Banner'}
                        </button>
                        {headerPreviewUrl && (
                          <button type="button" onClick={() => clearBrandingAsset('header')} style={{ ...secondaryButton, color: '#b91c1c' }}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#586273' }}>
                      Header Banner Height: <strong style={{ color: '#16181d' }}>{headerHeight}px</strong>
                      <input
                        type="range"
                        min="60"
                        max="260"
                        step="10"
                        value={headerHeight}
                        onChange={(e) => { setHeaderHeight(Number(e.target.value)); setBrandingBurned(false); }}
                        style={{ width: '100%', marginTop: '0.4rem', accentColor: '#1f6f4a' }}
                      />
                    </label>
                  </div>
                )}

                {/* Tab 3: Footer Banner */}
                {activeBrandingTab === 'footer' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', background: '#fcfcfb', border: '1px solid #e6e6e1', borderRadius: 9, padding: '0.9rem' }}>
                      {footerPreviewUrl ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                          <div style={{ width: 80, height: 36, borderRadius: 6, background: '#1c1e24', overflow: 'hidden' }}>
                            <img src={footerPreviewUrl} alt="Footer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Footer Banner Active</div>
                            <div style={{ fontSize: '0.8rem', color: '#657080' }}>Overlaid across the bottom of video</div>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Upload Footer Banner</div>
                          <div style={{ fontSize: '0.8rem', color: '#657080' }}>Shows social handles or callout at bottom</div>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button type="button" onClick={() => footerInputRef.current?.click()} style={secondaryButton}>
                          <UploadCloud size={14} /> {footerPreviewUrl ? 'Replace' : 'Upload Banner'}
                        </button>
                        {footerPreviewUrl && (
                          <button type="button" onClick={() => clearBrandingAsset('footer')} style={{ ...secondaryButton, color: '#b91c1c' }}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#586273' }}>
                      Footer Banner Height: <strong style={{ color: '#16181d' }}>{footerHeight}px</strong>
                      <input
                        type="range"
                        min="60"
                        max="260"
                        step="10"
                        value={footerHeight}
                        onChange={(e) => { setFooterHeight(Number(e.target.value)); setBrandingBurned(false); }}
                        style={{ width: '100%', marginTop: '0.4rem', accentColor: '#1f6f4a' }}
                      />
                    </label>
                  </div>
                )}
              </section>

              {/* 4. Creator Outro & Call to Action Cards */}
              <section style={{ padding: '1.35rem', background: '#fff', border: '1px solid #e6e6e1', borderRadius: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <h2 style={{ margin: 0, fontSize: '1.18rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Film size={20} color="#1f6f4a" /> 4. Outro & Call to Action Cards
                  </h2>
                  {outroMode === 'template' && selectedTemplate ? (
                    <span style={{ fontSize: '0.74rem', background: '#eef6f0', color: '#1f6f4a', border: '1px solid #cce5d4', padding: '0.2rem 0.6rem', borderRadius: 99, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Check size={12} /> {selectedTemplate.title} ({selectedTemplate.duration}s)
                    </span>
                  ) : outroMode === 'custom' ? (
                    <span style={{ fontSize: '0.74rem', background: '#eef6f0', color: '#1f6f4a', border: '1px solid #cce5d4', padding: '0.2rem 0.6rem', borderRadius: 99, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Check size={12} /> Custom 9:16 CTA ({outroDuration}s)
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.74rem', background: '#f1f5f9', color: '#64748b', padding: '0.2rem 0.6rem', borderRadius: 99, fontWeight: 600 }}>
                      No Outro Selected
                    </span>
                  )}
                </div>
                <p style={{ margin: '0 0 1.1rem', color: '#657080', fontSize: '0.88rem' }}>
                  Optionally append a professional animated outro screen, subscribe alert, or call-to-action card to the end of your short.
                </p>

                {/* Outro Mode Switcher */}
                <div style={{ display: 'flex', gap: '0.35rem', padding: '0.3rem', background: '#f4f5f3', borderRadius: 8, marginBottom: '1.25rem' }}>
                  {[
                    { id: 'none', label: 'No Outro', icon: X },
                    { id: 'template', label: 'Cloudflare R2 Templates', icon: Film },
                    { id: 'custom', label: 'Custom 9:16 Builder', icon: Wand2 },
                  ].map((tab) => {
                    const TabIcon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => { setOutroMode(tab.id); setBrandingBurned(false); }}
                        style={{
                          flex: 1,
                          padding: '0.55rem 0.75rem',
                          border: 0,
                          borderRadius: 6,
                          background: outroMode === tab.id ? '#fff' : 'transparent',
                          color: outroMode === tab.id ? '#16181d' : '#657080',
                          fontWeight: outroMode === tab.id ? 700 : 550,
                          fontSize: '0.86rem',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.4rem',
                          boxShadow: outroMode === tab.id ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <TabIcon size={14} />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* MODE 1: CLOUDFLARE R2 TEMPLATES */}
                {outroMode === 'template' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Category Filter Pills */}
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {[
                        { id: 'all', label: 'All Templates' },
                        { id: 'Outro', label: 'Outros' },
                        { id: 'Subscribe', label: 'Subscribe' },
                        { id: 'Profile Outro', label: 'Profile Outros' },
                        { id: 'All-in-One', label: 'All-in-One' },
                        { id: 'Social Story', label: 'Social Story' },
                      ].map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setTemplateFilterCategory(cat.id)}
                          style={{
                            fontSize: '0.78rem',
                            fontWeight: templateFilterCategory === cat.id ? 700 : 500,
                            padding: '0.3rem 0.65rem',
                            borderRadius: '6px',
                            border: templateFilterCategory === cat.id ? '1px solid #1f6f4a' : '1px solid #e2e8f0',
                            backgroundColor: templateFilterCategory === cat.id ? '#ecfdf5' : '#ffffff',
                            color: templateFilterCategory === cat.id ? '#1f6f4a' : '#475569',
                            cursor: 'pointer',
                          }}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>

                    {/* Template Cards Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.85rem', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
                      {templates
                        .filter((t) => templateFilterCategory === 'all' || t.category === templateFilterCategory)
                        .map((tmpl) => {
                          const isSelected = selectedTemplateId === tmpl.id;
                          return (
                            <div
                              key={tmpl.id}
                              onClick={() => { setSelectedTemplateId(tmpl.id); setBrandingBurned(false); }}
                              style={{
                                border: isSelected ? '2px solid #1f6f4a' : '1px solid #e2e8f0',
                                borderRadius: 10,
                                overflow: 'hidden',
                                background: isSelected ? '#f6fbf8' : '#fff',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                display: 'flex',
                                flexDirection: 'column',
                              }}
                            >
                              <div style={{ position: 'relative', width: '100%', height: 110, background: '#111827', overflow: 'hidden' }}>
                                {tmpl.thumb_url ? (
                                  <img src={tmpl.thumb_url} alt={tmpl.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                  <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#94a3b8' }}>
                                    <Film size={24} />
                                  </div>
                                )}
                                <span style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: '0.68rem', padding: '2px 5px', borderRadius: 4, fontWeight: 700 }}>
                                  {tmpl.duration}s
                                </span>
                                {isSelected && (
                                  <span style={{ position: 'absolute', top: 6, right: 6, background: '#1f6f4a', color: '#fff', width: 20, height: 20, borderRadius: '50%', display: 'grid', placeItems: 'center' }}>
                                    <Check size={12} />
                                  </span>
                                )}
                              </div>
                              <div style={{ padding: '0.65rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1e293b', marginBottom: '0.2rem', lineHeight: 1.3 }}>
                                  {tmpl.title}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                  {tmpl.badge || tmpl.category}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* MODE 2: CUSTOM 9:16 BUILDER */}
                {outroMode === 'custom' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: '#fcfcfb', border: '1px solid #e6e6e1', borderRadius: 9, padding: '1rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#16181d' }}>Action Buttons to Display</div>
                    <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                      {[
                        { label: '👍 Like', active: showLikeAction, toggle: () => setShowLikeAction(!showLikeAction) },
                        { label: '💬 Comment', active: showCommentAction, toggle: () => setShowCommentAction(!showCommentAction) },
                        { label: '🔔 Subscribe', active: showSubscribeAction, toggle: () => setShowSubscribeAction(!showSubscribeAction) },
                        { label: '❤️ Follow', active: showFollowAction, toggle: () => setShowFollowAction(!showFollowAction) },
                      ].map((btn, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => { btn.toggle(); setBrandingBurned(false); }}
                          style={{
                            padding: '0.45rem 0.8rem',
                            borderRadius: 6,
                            border: btn.active ? '1.5px solid #1f6f4a' : '1px solid #d9dcd8',
                            background: btn.active ? '#eef6f0' : '#fff',
                            color: btn.active ? '#1f6f4a' : '#586273',
                            fontWeight: btn.active ? 700 : 500,
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                          }}
                        >
                          {btn.label}
                        </button>
                      ))}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#586273' }}>
                        Outro Duration: <strong style={{ color: '#16181d' }}>{outroDuration}s</strong>
                        <input
                          type="range"
                          min="2.0"
                          max="5.0"
                          step="0.5"
                          value={outroDuration}
                          onChange={(e) => { setOutroDuration(Number(e.target.value)); setBrandingBurned(false); }}
                          style={{ width: '100%', marginTop: '0.35rem', accentColor: '#1f6f4a' }}
                        />
                      </label>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#586273' }}>
                        Music Style:
                        <select
                          value={outroMusicStyle}
                          onChange={(e) => { setOutroMusicStyle(e.target.value); setBrandingBurned(false); }}
                          style={{ display: 'block', width: '100%', marginTop: '0.35rem', padding: '0.45rem', borderRadius: 6, border: '1px solid #d9dcd8', background: '#fff', fontSize: '0.82rem' }}
                        >
                          <option value="upbeat">Upbeat / Energetic</option>
                          <option value="chill">Chill / Lo-Fi</option>
                          <option value="cinematic">Cinematic</option>
                          <option value="pop">Modern Pop</option>
                        </select>
                      </label>
                    </div>

                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#586273' }}>
                      Custom Outro Text / Channel Link (Optional):
                      <input
                        type="text"
                        placeholder="e.g. Follow @harvestai for more tips!"
                        value={outroLongText}
                        onChange={(e) => { setOutroLongText(e.target.value); setBrandingBurned(false); }}
                        style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '0.35rem', padding: '0.55rem 0.7rem', border: '1px solid #d9dcd8', borderRadius: 6, fontSize: '0.84rem' }}
                      />
                    </label>
                  </div>
                )}

                {/* MODE 3: NO OUTRO */}
                {outroMode === 'none' && (
                  <div style={{ padding: '1rem', borderRadius: 8, background: '#f8fafc', border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', gap: '0.65rem', color: '#475569', fontSize: '0.84rem' }}>
                    <CheckCircle2 size={16} color="#10b981" />
                    <span><strong>No Outro Screen:</strong> The vertical short will finish immediately after the video moment ends without appending any outro screen.</span>
                  </div>
                )}

                {/* Combined Burn / Render Customizations Button */}
                <div style={{ marginTop: '1.25rem', paddingTop: '1.1rem', borderTop: '1px solid #f0f0ed', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.8rem' }}>
                  <div style={{ fontSize: '0.82rem', color: '#657080' }}>
                    {brandingBurned
                      ? '✓ Customizations are burned into the video and reflected in the player.'
                      : hasAnyCustomization
                      ? 'Customizations ready. Click to render & burn into video with FFmpeg.'
                      : 'Customize logo, branding, or outro above, then click to burn.'}
                  </div>
                  <button
                    type="button"
                    disabled={isBurningBranding || (!hasAnyCustomization && !thumbnailPath)}
                    onClick={burnBrandingIntoVideo}
                    style={{
                      ...primaryButton,
                      background: brandingBurned ? '#2563eb' : '#1f6f4a',
                      borderColor: brandingBurned ? '#2563eb' : '#1f6f4a',
                      opacity: (!hasAnyCustomization && !thumbnailPath) ? 0.6 : 1,
                      cursor: (!hasAnyCustomization && !thumbnailPath) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isBurningBranding ? (
                      <><LoaderCircle size={16} className="harvest-publish-spin" /> Rendering with FFmpeg…</>
                    ) : (
                      <><Sparkles size={16} /> {brandingBurned ? 'Re-Apply Customizations' : 'Burn Branding & Outro into Video'}</>
                    )}
                  </button>
                </div>
              </section>

              {/* 4. Social Channels Connection & Upload */}
              <section style={{ padding: '1.35rem', background: '#fff', border: '1px solid #e6e6e1', borderRadius: 12 }}>
                <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.18rem' }}>4. Channels & Upload</h2>
                <p style={{ margin: '0 0 1rem', color: '#657080', fontSize: '0.9rem' }}>Connect your accounts once. Your video will be uploaded with your title, custom thumbnail, and branding.</p>
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {platforms.map(({ id, name, Icon, hint }) => {
                    const connection = connectionByPlatform[id];
                    const busy = workingPlatform === id;
                    return (
                      <article key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '1rem', border: '1px solid #e6e6e1', borderRadius: 9, background: '#fff' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', minWidth: 0 }}>
                          <div style={{ width: 40, height: 40, flex: '0 0 40px', display: 'grid', placeItems: 'center', background: '#f4f5f3', borderRadius: 9 }}><Icon size={21} /></div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700 }}>{name}{connection && <span style={{ color: '#1f6f4a', fontSize: '0.76rem', fontWeight: 650 }}>Connected</span>}</div>
                            <div style={{ marginTop: '0.2rem', color: '#657080', fontSize: '0.84rem' }}>{connection ? (connection.account_name || connection.account_handle || 'Account connected') : hint}</div>
                          </div>
                        </div>
                        {connection ? (
                          <button
                            type="button"
                            disabled={Boolean(workingPlatform) || clip?.status !== 'completed'}
                            onClick={() => publishToPlatform(id)}
                            style={{
                              ...primaryButton,
                              minWidth: 118,
                              opacity: (workingPlatform && !busy) || clip?.status !== 'completed' ? 0.55 : 1,
                              cursor: workingPlatform || clip?.status !== 'completed' ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {busy ? <><LoaderCircle size={16} className="harvest-publish-spin" /> Uploading…</> : <><UploadCloud size={16} /> Upload</>}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={Boolean(workingPlatform)}
                            onClick={() => connectPlatform(id)}
                            style={{
                              minWidth: 118,
                              display: 'inline-flex',
                              justifyContent: 'center',
                              alignItems: 'center',
                              gap: '0.4rem',
                              padding: '0.65rem 0.8rem',
                              border: '1px solid #d9dcd8',
                              borderRadius: 7,
                              background: '#fff',
                              color: '#1d2732',
                              fontWeight: 650,
                              cursor: workingPlatform ? 'not-allowed' : 'pointer'
                            }}
                          >
                            Connect <ExternalLink size={14} />
                          </button>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* Right Column: Live Interactive Video & Thumbnail Preview */}
            <aside style={{ padding: '1.25rem', background: '#fff', border: '1px solid #e6e6e1', borderRadius: 12, position: 'sticky', top: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.9rem' }}>
                <h2 style={{ margin: 0, fontFamily: 'Georgia, serif', fontSize: '1.18rem' }}>Live Video Preview</h2>
                {hasAnyBranding && !brandingBurned && (
                  <span style={{ fontSize: '0.72rem', background: '#eef6f0', color: '#1f6f4a', padding: '0.2rem 0.55rem', borderRadius: 99, fontWeight: 700, border: '1px solid #cce5d4' }}>
                    Live Overlay Active
                  </span>
                )}
                {brandingBurned && (
                  <span style={{ fontSize: '0.72rem', background: '#e8f0fe', color: '#1a73e8', padding: '0.2rem 0.55rem', borderRadius: 99, fontWeight: 700, border: '1px solid #c2d7fa' }}>
                    Burned-In Output
                  </span>
                )}
              </div>

              {/* Video Player Container with Live Overlay Layers */}
              <div style={{ position: 'relative', width: '100%', maxHeight: '64vh', aspectRatio: '9 / 16', background: '#0e1014', borderRadius: 10, overflow: 'hidden', margin: '0 auto', boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
                {videoUrl ? (
                  <>
                    <video
                      src={videoUrl}
                      controls
                      playsInline
                      style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }}
                    />

                    {/* Live Preview Layers (Overlayed in browser before burning) */}
                    {!brandingBurned && (
                      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
                        {/* Header Banner */}
                        {headerPreviewUrl && (
                          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${(headerHeight / 1920) * 100}%`, minHeight: '6%', maxHeight: '25%', zIndex: 12 }}>
                            <img src={headerPreviewUrl} alt="Header Banner" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        )}

                        {/* Footer Banner */}
                        {footerPreviewUrl && (
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${(footerHeight / 1920) * 100}%`, minHeight: '6%', maxHeight: '25%', zIndex: 12 }}>
                            <img src={footerPreviewUrl} alt="Footer Banner" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        )}

                        {/* Watermark Logo */}
                        {watermarkPreviewUrl && (
                          <>
                            <div
                              className={watermarkMode === 'interval_2s' ? 'harvest-watermark-pulse' : ''}
                              style={{
                                position: 'absolute',
                                zIndex: 14,
                                opacity: watermarkOpacity / 100,
                                width: `${watermarkScale}%`,
                                maxWidth: '40%',
                                ...getWatermarkPositionStyle(watermarkPosition),
                              }}
                            >
                              <img src={watermarkPreviewUrl} alt="Watermark" style={{ width: '100%', height: 'auto', display: 'block', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))' }} />
                            </div>

                            {/* Second logo instance if Both Top & Bottom selected */}
                            {watermarkPosition === 'header_and_footer' && (
                              <div
                                className={watermarkMode === 'interval_2s' ? 'harvest-watermark-pulse' : ''}
                                style={{
                                  position: 'absolute',
                                  zIndex: 14,
                                  bottom: '3.5%',
                                  left: '50%',
                                  transform: 'translateX(-50%)',
                                  opacity: watermarkOpacity / 100,
                                  width: `${watermarkScale}%`,
                                  maxWidth: '40%',
                                }}
                              >
                                <img src={watermarkPreviewUrl} alt="Watermark Bottom" style={{ width: '100%', height: 'auto', display: 'block', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))' }} />
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: '1rem', textAlign: 'center', background: '#f7f7f5', color: '#657080' }}>
                    {clip?.status === 'completed' ? 'Video preview is unavailable.' : 'This clip is being prepared…'}
                  </div>
                )}
              </div>

              {/* Status & Download Options */}
              <div style={{ marginTop: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#657080', fontSize: '0.84rem' }}>
                <span>Status: <strong style={{ color: '#16181d' }}>{clip?.status || 'ready'}</strong></span>
                <span>Aspect: <strong>9:16</strong></span>
              </div>

              {videoUrl && (
                <a
                  href={videoUrl}
                  download={`${title || 'harvest_clip'}.mp4`}
                  style={{
                    ...secondaryButton,
                    width: '100%',
                    boxSizing: 'border-box',
                    marginTop: '0.85rem',
                    textDecoration: 'none',
                    fontWeight: 650,
                  }}
                >
                  <Download size={15} /> Download Video MP4
                </a>
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
