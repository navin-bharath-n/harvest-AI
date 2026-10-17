import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
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
  Calendar,
  Check,
  Film,
  Wand2,
  X,
  Play,
  Pause,
  Volume2,
  Move,
  QrCode,
  Quote,
  Link2
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
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

const appendHashtagsToDescription = (text, tags) => {
  const descriptionText = (text || '').trim();
  const existingTags = new Set((descriptionText.match(/#[^\s#]+/g) || []).map((tag) => tag.toLowerCase()));
  const extraTags = (tags || [])
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)
    .filter((tag) => !existingTags.has(tag.toLowerCase()));
  const tagText = extraTags.join(' ');
  if (!tagText) return descriptionText.slice(0, 5000);
  const separator = descriptionText ? '\n\n' : '';
  const descriptionLimit = Math.max(0, 5000 - separator.length - tagText.length);
  return `${descriptionText.slice(0, descriptionLimit)}${separator}${tagText}`;
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
  const [titleSuggestions, setTitleSuggestions] = useState([]);
  const [hashtags, setHashtags] = useState([]);
  const descriptionEditedRef = useRef(false);
  const [isGeneratingMetadata, setIsGeneratingMetadata] = useState(false);
  const [metadataSuggestionError, setMetadataSuggestionError] = useState('');
  const [privacy, setPrivacy] = useState('public');
  const [loading, setLoading] = useState(true);
  const [workingPlatform, setWorkingPlatform] = useState('');
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState(false);
  const oauthPopupRef = useRef(null);
  const currentUserId = user?.id;

  // Multi-platform selection & in-button status feedback
  const [selectedPlatforms, setSelectedPlatforms] = useState([]);
  const [platformButtonStatus, setPlatformButtonStatus] = useState({});
  const [batchActionStatus, setBatchActionStatus] = useState('idle'); // 'idle' | 'working' | 'succeeded' | 'error'

  // ──────────────────────────────────────────────────────────────────────────
  // Scheduled Publishing State
  // ──────────────────────────────────────────────────────────────────────────
  const [publishMode, setPublishMode] = useState('now'); // 'now' | 'schedule'
  const [scheduleDate, setScheduleDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(5, 0, 0, 0);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T05:00`;
  });
  const [isCancellingSchedule, setIsCancellingSchedule] = useState(false);

  // ──────────────────────────────────────────────────────────────────────────
  // Custom Thumbnail State
  // ──────────────────────────────────────────────────────────────────────────
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState(null);
  const [thumbnailPath, setThumbnailPath] = useState(null);
  const [isUploadingThumb, setIsUploadingThumb] = useState(false);
  const thumbInputRef = useRef(null);

  // ──────────────────────────────────────────────────────────────────────────
  // Watermark & Footer Branding State
  // ──────────────────────────────────────────────────────────────────────────
  const [activeBrandingTab, setActiveBrandingTab] = useState('watermark'); // 'watermark' | 'footer'

  // Watermark (Channel logo or image overlay)
  const [watermarkPreviewUrl, setWatermarkPreviewUrl] = useState(null);
  const [watermarkPath, setWatermarkPath] = useState(null);
  const [watermarkPosition, setWatermarkPosition] = useState('top-right');
  const [watermarkPos, setWatermarkPos] = useState({ x: 84, y: 8 }); // % coordinates from top-left
  const [isDraggingWatermark, setIsDraggingWatermark] = useState(false);
  const videoContainerRef = useRef(null);
  const watermarkOverlayRef = useRef(null);
  const footerOverlayRef = useRef(null);

  const [watermarkScale, setWatermarkScale] = useState(20); // 8% to 100% of video width
  const [watermarkAspectRatio, setWatermarkAspectRatio] = useState(1);
  const [watermarkOpacity, setWatermarkOpacity] = useState(90); // 40% to 100%
  const [watermarkMode, setWatermarkMode] = useState('always'); // 'always'
  const watermarkInputRef = useRef(null);

  // Footer Banner
  const [footerPreviewUrl, setFooterPreviewUrl] = useState(null);
  const [footerPath, setFooterPath] = useState(null);
  const [footerHeight, setFooterHeight] = useState(180); // 60px to 260px
  const [footerPos, setFooterPos] = useState({ y: 94 }); // % Y coordinate from top
  const [footerPosition, setFooterPosition] = useState('bottom');
  const [isDraggingFooter, setIsDraggingFooter] = useState(false);
  const footerInputRef = useRef(null);

  const getSafeFooterY = (y, height = footerHeight) => {
    const halfHeightPct = (Number(height) / 1920) * 50;
    return Math.max(halfHeightPct, Math.min(100 - halfHeightPct, Number(y) || 0));
  };

  const [isBurningBranding, setIsBurningBranding] = useState(false);
  const burningBranding = isBurningBranding;
  const [brandingBurned, setBrandingBurned] = useState(false);
  const [hasRenderedOnce, setHasRenderedOnce] = useState(false);
  const [currentStage, setCurrentStage] = useState('customize'); // 'customize' | 'publish'

  // Handle live interactive dragging of the watermark on the video player
  const handleWatermarkMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingWatermark(true);
  };

  const handleWatermarkTouchStart = (e) => {
    e.stopPropagation();
    setIsDraggingWatermark(true);
  };

  useEffect(() => {
    if (!isDraggingWatermark) return;

    const handlePointerMove = (e) => {
      if (!videoContainerRef.current) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const rect = videoContainerRef.current.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      let xPct = ((clientX - rect.left) / rect.width) * 100;
      let yPct = ((clientY - rect.top) / rect.height) * 100;

      // Coordinates represent the overlay center. Keep the complete logo inside the 9:16 frame.
      const logoRect = watermarkOverlayRef.current?.getBoundingClientRect();
      const halfWidthPct = logoRect ? (logoRect.width / rect.width) * 50 : 0;
      const halfHeightPct = logoRect ? (logoRect.height / rect.height) * 50 : 0;
      xPct = Math.max(halfWidthPct, Math.min(100 - halfWidthPct, Math.round(xPct * 10) / 10));
      yPct = Math.max(halfHeightPct, Math.min(100 - halfHeightPct, Math.round(yPct * 10) / 10));

      setWatermarkPos({ x: xPct, y: yPct });
      setWatermarkPosition(`custom:${xPct}:${yPct}`);
    };

    const handlePointerUp = () => {
      setIsDraggingWatermark(false);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [isDraggingWatermark]);

  // Handle live interactive dragging of the footer banner on the video player
  const handleFooterMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFooter(true);
  };

  const handleFooterTouchStart = (e) => {
    e.stopPropagation();
    setIsDraggingFooter(true);
  };

  useEffect(() => {
    if (!isDraggingFooter) return;

    const handlePointerMove = (e) => {
      if (!videoContainerRef.current) return;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const rect = videoContainerRef.current.getBoundingClientRect();
      if (!rect.height) return;

      let yPct = ((clientY - rect.top) / rect.height) * 100;
      const bannerRect = footerOverlayRef.current?.getBoundingClientRect();
      const halfH = bannerRect ? (bannerRect.height / rect.height) * 50 : ((footerHeight / 1920) * 100) / 2;
      yPct = Math.max(halfH, Math.min(100 - halfH, Math.round(yPct * 10) / 10));

      setFooterPos({ y: yPct });
      setFooterPosition(`custom:${yPct}`);
    };

    const handlePointerUp = () => {
      setIsDraggingFooter(false);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [isDraggingFooter, footerHeight]);

  // ──────────────────────────────────────────────────────────────────────────
  // Local Video Templates & CTA Outro State
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
  const [outroFollowText, setOutroFollowText] = useState('Share');
  const [outroLongText, setOutroLongText] = useState('');
  const [outroQrLink, setOutroQrLink] = useState('');
  const [outroQuoteText, setOutroQuoteText] = useState('');
  const [outroBackgroundPath, setOutroBackgroundPath] = useState(null);
  const [outroBackgroundPreviewUrl, setOutroBackgroundPreviewUrl] = useState(null);
  const outroBackgroundInputRef = useRef(null);
  const [outroConfig, setOutroConfig] = useState({
    design: 'faith_cinematic',
    font_family: 'serif',
    action_card_style: 'neon',
    action_card_opacity: 35,
    action_font_family: 'sans',
    action_colors: {
      like: '#23bfff',
      comment: '#27e77e',
      subscribe: '#ff484b',
      share: '#e042e4',
    },
    promo_font_family: 'sans',
    promo_text_color: '#ffffff',
    promo_bg_color: '#ffffff',
    promo_transparency: 82,
    quote_title: '✨ INSPIRING QUOTE / PROMO',
    quote_font_family: 'serif',
    quote_text_color: '#f1f5f9',
    quote_title_color: '#c084fc',
    quote_bg_color: '#121826',
    quote_border_color: '#a855f7',
    quote_transparency: 5,
    brand: 'DailyWhisper',
    brand_accent: '365',
    subbrand: 'A DAILY PRAYER FOR A BRIGHTER TOMORROW',
    headline: 'Thanks for',
    headline_emphasis: 'Watching',
    tagline: 'STAY CONNECTED • STAY BLESSED',
    action_support: {
      like: 'Support this channel',
      comment: 'Share your thoughts',
      subscribe: 'Don’t miss new videos',
      share: 'Help us reach more',
    },
    qr_title: 'SCAN & CONNECT',
    qr_label: 'OUR CHANNEL',
    qr_description: 'Watch more prayers, songs and uplifting messages.',
    footer: 'To God Be the Glory',
    bottom_note: 'PRAY DAILY • GROW IN FAITH • SHARE LOVE',
  });
  const getOutroActionColor = (key) => outroConfig.action_colors?.[key] || ({ like: '#23bfff', comment: '#27e77e', subscribe: '#ff484b', share: '#e042e4', follow: '#e042e4' }[key]);
  const getOutroActionCardStyle = (key) => {
    const accent = getOutroActionColor(key);
    const style = outroConfig.action_card_style || 'filled';
    return {
      display: 'flex', alignItems: 'center', gap: '0.4rem', borderRadius: 8,
      padding: '0.35rem 0.6rem', fontSize: '0.75rem', fontWeight: 650, color: '#fff',
      background: style === 'outline' ? 'rgba(7,16,29,0.95)' : style === 'glass' ? `rgba(255,255,255,${Math.max(0, Math.min(100, Number(outroConfig.action_card_opacity ?? 35))) / 100})` : `${accent}55`,
      border: `1px solid ${accent}`,
      boxShadow: style === 'neon' ? `0 0 10px ${accent}99` : 'none',
      fontFamily: outroConfig.action_font_family === 'serif' ? 'Georgia, serif' : outroConfig.action_font_family === 'script' ? 'cursive' : 'Arial, sans-serif',
    };
  };
  const getOutroTextFont = (family) => family === 'serif' ? 'Georgia, serif' : family === 'script' ? 'cursive' : 'Arial, sans-serif';
  const getOutroRgba = (hex, transparency = 0) => {
    const normalized = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex : '#000000';
    const red = parseInt(normalized.slice(1, 3), 16);
    const green = parseInt(normalized.slice(3, 5), 16);
    const blue = parseInt(normalized.slice(5, 7), 16);
    return `rgba(${red}, ${green}, ${blue}, ${Math.max(0.05, Math.min(1, (100 - Number(transparency || 0)) / 100))})`;
  };
  const [outroMusicStyle, setOutroMusicStyle] = useState('upbeat');
  const [asidePreviewTab, setAsidePreviewTab] = useState('video'); // 'video' | 'outro'

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

  const generateSocialMetadata = useCallback(async (force = false) => {
    if (!clipId) return;
    setIsGeneratingMetadata(true);
    setMetadataSuggestionError('');
    try {
      const suggestions = await api.suggestClipSocialMetadata(clipId, force);
      setTitleSuggestions(Array.isArray(suggestions?.titles) ? suggestions.titles.slice(0, 3) : []);
      setHashtags(Array.isArray(suggestions?.hashtags) ? suggestions.hashtags : []);
      if (!descriptionEditedRef.current && suggestions?.description) setDescription(suggestions.description);
    } catch (err) {
      setMetadataSuggestionError(err.response?.data?.detail || 'Could not generate title ideas right now.');
    } finally {
      setIsGeneratingMetadata(false);
    }
  }, [clipId]);

  useEffect(() => {
    generateSocialMetadata(false);
  }, [generateSocialMetadata]);

  useEffect(() => {
    refreshConnections();
  }, [refreshConnections]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!clipId) {
        setMessageError(true);
        setMessage('Choose a generated video in Studio before opening publishing.');
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [clipResult, tmplData] = await Promise.all([
          api.getClip(clipId),
          api.getTemplates().catch(() => [])
        ]);
        if (!active) return;
        setClip(clipResult);
        setTemplates(tmplData || []);
        setTitle((current) => current || clipResult.title || 'Harvest short');

        // Restore existing schedule status
        const existingSchedule = clipResult.edit_options?.scheduled_publish;
        if (existingSchedule && existingSchedule.status === 'scheduled') {
          setPublishMode('schedule');
          if (existingSchedule.scheduled_at) {
            try {
              const dt = new Date(existingSchedule.scheduled_at);
              const pad = (n) => String(n).padStart(2, '0');
              setScheduleDate(`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`);
            } catch { }
          }
        }

        // Restore any existing custom thumbnail
        const existingThumb = clipResult.edit_options?.thumbnail_path;
        if (existingThumb) {
          setThumbnailPath(existingThumb);
          api.getClipThumbnailMedia(clipId).then((blobUrl) => {
            if (active) setThumbnailPreviewUrl(blobUrl);
          }).catch(() => { });
        }

        // Restore existing branding configuration
        const existingBranding = clipResult.edit_options?.branding;
        if (existingBranding) {
          if (existingBranding.watermark_path) setWatermarkPath(existingBranding.watermark_path);
          if (existingBranding.watermark_position) {
            setWatermarkPosition(existingBranding.watermark_position);
            if (existingBranding.watermark_position.startsWith('custom:') || existingBranding.watermark_position.startsWith('coords:')) {
              const parts = existingBranding.watermark_position.split(':');
              const parsedX = parseFloat(parts[1]);
              const parsedY = parseFloat(parts[2]);
              if (Number.isFinite(parsedX) && Number.isFinite(parsedY)) {
                setWatermarkPos({ x: Math.max(0, Math.min(100, parsedX)), y: Math.max(0, Math.min(100, parsedY)) });
              }
            }
          }
          if (existingBranding.watermark_scale) setWatermarkScale(Math.round(existingBranding.watermark_scale * 100));
          if (existingBranding.watermark_opacity) setWatermarkOpacity(Math.round(existingBranding.watermark_opacity * 100));
          if (existingBranding.watermark_mode) setWatermarkMode(existingBranding.watermark_mode === 'interval_2s' ? 'always' : existingBranding.watermark_mode);
          if (existingBranding.footer_image_path) setFooterPath(existingBranding.footer_image_path);
          if (existingBranding.footer_height) setFooterHeight(existingBranding.footer_height);
          if (existingBranding.footer_position) {
            setFooterPosition(existingBranding.footer_position);
            if (existingBranding.footer_position.startsWith('custom:') || existingBranding.footer_position.startsWith('coords:')) {
              const parts = existingBranding.footer_position.split(':');
              const parsedY = parseFloat(parts[parts.length - 1]);
              if (!isNaN(parsedY)) setFooterPos({ y: parsedY });
            }
          }
          if (clipResult.edit_options?.branding_burned || clipResult.storage_path?.includes('_branded_')) {
            setBrandingBurned(true);
            setHasRenderedOnce(true);
          }
        }

        // Restore existing outro configuration
        const existingTemplateId = clipResult.edit_options?.template_id || existingBranding?.template_id;
        const existingCustomOutro = clipResult.edit_options?.enable_outro || existingBranding?.enable_outro;
        if (existingTemplateId) {
          setSelectedTemplateId(existingTemplateId);
          setOutroMode('template');
        } else if (existingCustomOutro) {
          setOutroMode('custom');
          const eo = existingBranding || clipResult.edit_options || {};
          if (Object.prototype.hasOwnProperty.call(eo, 'outro_like_text')) {
            const text = eo.outro_like_text ?? '';
            setOutroLikeText(text);
            setShowLikeAction(Boolean(text.trim()));
          }
          if (Object.prototype.hasOwnProperty.call(eo, 'outro_comment_text')) {
            const text = eo.outro_comment_text ?? '';
            setOutroCommentText(text);
            setShowCommentAction(Boolean(text.trim()));
          }
          if (Object.prototype.hasOwnProperty.call(eo, 'outro_subscribe_text')) {
            const text = eo.outro_subscribe_text ?? '';
            setOutroSubscribeText(text);
            setShowSubscribeAction(Boolean(text.trim()));
          }
          if (Object.prototype.hasOwnProperty.call(eo, 'outro_follow_text')) {
            const savedText = eo.outro_follow_text ?? '';
            const text = savedText === 'Follow' ? 'Share' : savedText;
            setOutroFollowText(text);
            setShowFollowAction(Boolean(text.trim()));
          }
          if (eo.outro_custom_text) setOutroLongText(eo.outro_custom_text);
          if (eo.outro_qr_link) setOutroQrLink(eo.outro_qr_link);
          if (eo.outro_quote_text) setOutroQuoteText(eo.outro_quote_text);
          if (eo.outro_config && typeof eo.outro_config === 'object') {
            setOutroConfig((current) => ({ ...current, ...eo.outro_config }));
            if (eo.outro_config.background_image_path) setOutroBackgroundPath(eo.outro_config.background_image_path);
          }
          if (eo.outro_duration) setOutroDuration(Number(eo.outro_duration));
          if (eo.outro_music_style) setOutroMusicStyle(eo.outro_music_style);
        }

        if (clipResult.status === 'completed' && clipResult.storage_path) {
          const mediaUrl = await api.getClipMedia(clipId);
          if (active) {
            setVideoUrl((prevUrl) => {
              if (prevUrl && prevUrl !== mediaUrl) {
                try { URL.revokeObjectURL(prevUrl); } catch { }
              }
              return mediaUrl;
            });
          } else {
            try { URL.revokeObjectURL(mediaUrl); } catch { }
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
    };
  }, [clipId]);

  useEffect(() => {
    return () => {
      setVideoUrl((currentUrl) => {
        if (currentUrl) {
          try { URL.revokeObjectURL(currentUrl); } catch { }
        }
        return '';
      });
      setThumbnailPreviewUrl((currentThumb) => {
        if (currentThumb && currentThumb.startsWith('blob:')) {
          try { URL.revokeObjectURL(currentThumb); } catch { }
        }
        return null;
      });
    };
  }, []);

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

  // Keep selectedPlatforms synced with all connected platforms
  useEffect(() => {
    if (connections && connections.length > 0) {
      const connIds = connections.map((c) => c.platform);
      setSelectedPlatforms((prev) => {
        if (!prev || prev.length === 0) return connIds;
        const valid = prev.filter((p) => connIds.includes(p));
        // If all valid were unselected, retain, else combine
        const combined = Array.from(new Set([...valid, ...connIds]));
        return combined.length > 0 ? combined : connIds;
      });
    }
  }, [connections]);

  const togglePlatformSelection = (platformId) => {
    setSelectedPlatforms((prev) => {
      if (prev.includes(platformId)) {
        return prev.filter((p) => p !== platformId);
      }
      return [...prev, platformId];
    });
  };

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

    // Watch for popup closed by user or auto-closed
    const checkClosed = setInterval(async () => {
      if (!popup || popup.closed) {
        clearInterval(checkClosed);
        if (oauthPopupRef.current === popup) {
          oauthPopupRef.current = null;
          try {
            await refreshConnections();
          } catch { }
        }
      }
    }, 800);
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
  // Branding Image Handlers (Logo, Footer)
  // ──────────────────────────────────────────────────────────────────────────
  const handleBrandingUpload = async (event, assetType) => {
    const file = event.target.files?.[0];
    if (!file || !clipId) return;
    const localUrl = URL.createObjectURL(file);
    if (assetType === 'watermark') {
      setWatermarkPreviewUrl(localUrl);
    } else if (assetType === 'footer') {
      setFooterPreviewUrl(localUrl);
    } else if (assetType === 'outro_background') {
      setOutroBackgroundPreviewUrl((previousUrl) => {
        if (previousUrl?.startsWith('blob:')) URL.revokeObjectURL(previousUrl);
        return localUrl;
      });
    }
    setBrandingBurned(false); // Any new upload needs to be burned into the next render.
    setMessageError(false);
    const assetLabel = assetType === 'outro_background' ? 'outro background' : assetType;
    setMessage(`Uploading ${assetLabel} image…`);
    try {
      const res = await api.uploadBrandingImage(clipId, file, assetType);
      if (assetType === 'watermark') setWatermarkPath(res.storage_path);
      else if (assetType === 'footer') setFooterPath(res.storage_path);
      else if (assetType === 'outro_background') setOutroBackgroundPath(res.storage_path);
      setMessage(`${assetLabel.charAt(0).toUpperCase() + assetLabel.slice(1)} image ready for live demo preview & render.`);
    } catch (err) {
      setMessageError(true);
      setMessage(`Failed to upload ${assetLabel}: ${err.response?.data?.detail || err.message}`);
    }
  };

  const clearBrandingAsset = (assetType) => {
    if (assetType === 'watermark') {
      setWatermarkPreviewUrl(null);
      setWatermarkPath(null);
      if (watermarkInputRef.current) watermarkInputRef.current.value = '';
    } else if (assetType === 'footer') {
      setFooterPreviewUrl(null);
      setFooterPath(null);
      if (footerInputRef.current) footerInputRef.current.value = '';
    } else if (assetType === 'outro_background') {
      if (outroBackgroundPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(outroBackgroundPreviewUrl);
      setOutroBackgroundPreviewUrl(null);
      setOutroBackgroundPath(null);
      setOutroConfig((current) => ({ ...current, background_image_path: '' }));
      if (outroBackgroundInputRef.current) outroBackgroundInputRef.current.value = '';
    }
    if (assetType === 'outro_background') {
      setBrandingBurned(false);
    } else if (hasRenderedOnce) {
      setBrandingBurned(true);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Burn Branding with FFmpeg
  // ──────────────────────────────────────────────────────────────────────────
  const burnBrandingIntoVideo = async () => {
    if (!clipId || isBurningBranding) return;
    const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
    const isTemplateMode = outroMode === 'template' && selectedTemplate;
    const isCustomMode = outroMode === 'custom';

    if (!watermarkPath && !footerPath && !isTemplateMode && !isCustomMode && !thumbnailPath) {
      setMessageError(true);
      setMessage('Please upload a logo, footer banner, select an outro template, or attach a thumbnail first.');
      return;
    }
    setIsBurningBranding(true);
    setMessageError(false);
    setMessage('Rendering full video with watermark and footer via FFmpeg…');
    try {
      const payload = {
        watermark_path: watermarkPath || null,
        watermark_position: watermarkPosition,
        watermark_scale: Number(watermarkScale) / 100,
        watermark_opacity: Number(watermarkOpacity) / 100,
        watermark_mode: watermarkMode,
        header_image_path: null,
        header_height: 160,
        footer_image_path: footerPath || null,
        footer_height: Number(footerHeight),
        footer_position: footerPosition,
        thumbnail_path: thumbnailPath || null,
        template_id: isTemplateMode ? selectedTemplate.id : null,
        template_storage_path: isTemplateMode ? selectedTemplate.storage_path : null,
        enable_outro: isCustomMode,
        outro_like_text: isCustomMode && showLikeAction ? outroLikeText : '',
        outro_comment_text: isCustomMode && showCommentAction ? outroCommentText : '',
        outro_subscribe_text: isCustomMode && showSubscribeAction ? outroSubscribeText : '',
        outro_follow_text: isCustomMode && showFollowAction ? outroFollowText : '',
        outro_custom_text: isCustomMode ? outroLongText : '',
        outro_qr_link: isCustomMode ? outroQrLink.trim() : '',
        outro_quote_text: isCustomMode ? outroQuoteText.trim() : '',
        outro_config: isCustomMode ? { ...outroConfig, background_image_path: outroBackgroundPath || '' } : null,
        outro_duration: isCustomMode ? outroDuration : (selectedTemplate?.duration || 3.0),
        outro_music_style: outroMusicStyle || 'upbeat',
      };
      const updatedClip = await api.applyClipBranding(clipId, payload);
      setClip(updatedClip);
      setBrandingBurned(true);
      setHasRenderedOnce(true);

      // Refresh the video stream to display burned output
      const newMediaUrl = await api.getClipMedia(clipId);
      setVideoUrl(newMediaUrl);

      setMessage('Full video rendered successfully! Now choose your channels to publish.');
      setCurrentStage('publish');
    } catch (err) {
      setMessageError(true);
      setMessage(`Failed to process video: ${err.response?.data?.detail || err.message}`);
    } finally {
      setIsBurningBranding(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Scheduling Helpers
  // ──────────────────────────────────────────────────────────────────────────
  const scheduledPublishInfo = useMemo(() => {
    return clip?.edit_options?.scheduled_publish || null;
  }, [clip]);

  const isCurrentlyScheduled = Boolean(
    scheduledPublishInfo && scheduledPublishInfo.status === 'scheduled'
  );

  const userTimeZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local Time';
    } catch {
      return 'Local Time';
    }
  }, []);

  const getMinScheduleDateTime = () => {
    const d = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes from now
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const setPresetSchedule = (type) => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    if (type === 'tomorrow-5am') {
      d.setDate(d.getDate() + 1);
      d.setHours(5, 0, 0, 0);
    } else if (type === 'plus-1h') {
      d.setTime(d.getTime() + 60 * 60 * 1000);
    } else if (type === 'tomorrow-9am') {
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
    } else if (type === 'tomorrow-5pm') {
      d.setDate(d.getDate() + 1);
      d.setHours(17, 0, 0, 0);
    }
    const val = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setScheduleDate(val);
    setPublishMode('schedule');
  };

  const formatScheduledDate = (isoStr) => {
    if (!isoStr) return '';
    try {
      const dt = new Date(isoStr);
      if (isNaN(dt.getTime())) return '';
      return dt.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return '';
    }
  };

  const handleCancelSchedule = async () => {
    if (!clipId || isCancellingSchedule) return;
    try {
      setIsCancellingSchedule(true);
      setMessageError(false);
      setMessage('Cancelling scheduled publication…');
      await api.cancelScheduledPublish(clipId);
      const updatedClip = await api.getClip(clipId);
      setClip(updatedClip);
      setMessage('Scheduled publication has been cancelled.');
    } catch (err) {
      setMessageError(true);
      setMessage(`Failed to cancel schedule: ${err.response?.data?.detail || err.message}`);
    } finally {
      setIsCancellingSchedule(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Social Publish Handler
  // ──────────────────────────────────────────────────────────────────────────
  const executePublish = async (targetPlatforms) => {
    if (!clipId || workingPlatform) return;
    if (!targetPlatforms || targetPlatforms.length === 0) {
      setMessageError(true);
      setMessage('Please select at least one connected channel to publish or schedule.');
      return;
    }
    if (clip?.status !== 'completed') {
      setMessageError(true);
      setMessage('This video is not ready to publish yet.');
      return;
    }
    if (hasAnyCustomization && !brandingBurned && !hasRenderedOnce) {
      setMessageError(true);
      setMessage('Your watermark logo, banner or outro is in live demo mode. Please click "Render Full Video" first to burn them into the video before publishing.');
      return;
    }

    setWorkingPlatform(targetPlatforms.join(','));
    setBatchActionStatus('working');
    setPlatformButtonStatus((prev) => {
      const next = { ...prev };
      targetPlatforms.forEach((p) => { next[p] = 'working'; });
      return next;
    });
    setMessageError(false);

    try {
      const descriptionWithHashtags = appendHashtagsToDescription(description, hashtags);
      const brandingConfig = (watermarkPath || footerPath) ? {
        watermark_path: watermarkPath,
        watermark_position: watermarkPosition,
        watermark_scale: Number(watermarkScale) / 100,
        watermark_opacity: Number(watermarkOpacity) / 100,
        watermark_mode: watermarkMode,
        header_image_path: null,
        header_height: 160,
        footer_image_path: footerPath,
        footer_height: Number(footerHeight),
        footer_position: footerPosition,
      } : null;

      // SCHEDULE MODE
      if (publishMode === 'schedule') {
        if (!scheduleDate) {
          setMessageError(true);
          setMessage('Please select a date and time for scheduled publishing.');
          setWorkingPlatform('');
          setBatchActionStatus('idle');
          setPlatformButtonStatus((prev) => {
            const next = { ...prev };
            targetPlatforms.forEach((p) => { next[p] = 'idle'; });
            return next;
          });
          return;
        }
        const schedTimeMs = new Date(scheduleDate).getTime();
        if (isNaN(schedTimeMs) || schedTimeMs <= Date.now()) {
          setMessageError(true);
          setMessage('Please choose a future date and time for scheduled publishing.');
          setWorkingPlatform('');
          setBatchActionStatus('idle');
          setPlatformButtonStatus((prev) => {
            const next = { ...prev };
            targetPlatforms.forEach((p) => { next[p] = 'idle'; });
            return next;
          });
          return;
        }

        const scheduledUtcIso = new Date(scheduleDate).toISOString();
        const platNames = targetPlatforms.map((p) => platforms.find((item) => item.id === p)?.name || p).join(', ');
        setMessage(`Scheduling video for ${platNames}…`);

        await api.publishClip(
          clipId,
          targetPlatforms,
          title.trim() || 'Harvest short',
          descriptionWithHashtags,
          privacy,
          {},
          thumbnailPath,
          brandingConfig,
          scheduledUtcIso
        );

        const updatedClip = await api.getClip(clipId);
        setClip(updatedClip);

        setBatchActionStatus('succeeded');
        setPlatformButtonStatus((prev) => {
          const next = { ...prev };
          targetPlatforms.forEach((p) => { next[p] = 'succeeded'; });
          return next;
        });

        setMessage(`Video scheduled successfully for ${formatScheduledDate(scheduledUtcIso)} across ${platNames}! It will automatically release to all selected platforms at that exact time.`);

        setTimeout(() => {
          setBatchActionStatus('idle');
        }, 5000);
        return;
      }

      // PUBLISH NOW MODE
      const platNames = targetPlatforms.map((p) => platforms.find((item) => item.id === p)?.name || p).join(', ');
      setMessage(`Uploading to ${platNames}…`);
      await api.publishClip(
        clipId,
        targetPlatforms,
        title.trim() || 'Harvest short',
        descriptionWithHashtags,
        privacy,
        {},
        thumbnailPath,
        brandingConfig,
        null
      );

      // Publishing runs in background; poll for results
      for (let attempt = 0; attempt < 90; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const updatedClip = await api.getClip(clipId);

        let allDone = true;
        const nextStatuses = {};
        for (const p of targetPlatforms) {
          const result = updatedClip?.published_urls?.[p];
          if (typeof result === 'string' && result) {
            if (result.startsWith('error:')) {
              nextStatuses[p] = 'error';
            } else {
              nextStatuses[p] = 'succeeded';
            }
          } else {
            allDone = false;
            nextStatuses[p] = 'working';
          }
        }

        setPlatformButtonStatus((prev) => ({ ...prev, ...nextStatuses }));

        if (allDone) {
          setClip(updatedClip);
          const hasError = targetPlatforms.some((p) => nextStatuses[p] === 'error');
          if (hasError) {
            setMessageError(true);
            setMessage('Upload completed with some errors. Please check channel status below.');
            setBatchActionStatus('error');
          } else {
            setMessageError(false);
            setMessage(`Published successfully to ${platNames}!`);
            setBatchActionStatus('succeeded');
          }
          setTimeout(() => setBatchActionStatus('idle'), 6000);
          return;
        }
      }
      setMessage('Uploads are processing in the background. Check back shortly.');
    } catch (error) {
      setMessageError(true);
      setMessage(`Upload failed: ${error.response?.data?.detail || error.message}`);
      setBatchActionStatus('error');
      setPlatformButtonStatus((prev) => {
        const next = { ...prev };
        targetPlatforms.forEach((p) => { next[p] = 'error'; });
        return next;
      });
    } finally {
      setWorkingPlatform('');
    }
  };

  const handleIndividualPublish = (platformId) => {
    if (publishMode === 'schedule') {
      const currentScheduled = scheduledPublishInfo?.platforms || [];
      const merged = Array.from(new Set([...currentScheduled, platformId]));
      executePublish(merged);
    } else {
      executePublish([platformId]);
    }
  };

  const getWatermarkPositionStyle = (pos) => {
    if (pos && (pos.startsWith('custom:') || pos.startsWith('coords:'))) {
      return {
        left: `${watermarkPos.x}%`,
        top: `${watermarkPos.y}%`,
        transform: 'translate(-50%, -50%)',
      };
    }
    switch (pos) {
      case 'top-left':
        return { left: `${watermarkPos.x || 16}%`, top: `${watermarkPos.y || 8}%`, transform: 'translate(-50%, -50%)' };
      case 'top-right':
        return { left: `${watermarkPos.x || 84}%`, top: `${watermarkPos.y || 8}%`, transform: 'translate(-50%, -50%)' };
      case 'bottom-left':
        return { left: `${watermarkPos.x || 16}%`, top: `${watermarkPos.y || 90}%`, transform: 'translate(-50%, -50%)' };
      case 'bottom-right':
        return { left: `${watermarkPos.x || 84}%`, top: `${watermarkPos.y || 90}%`, transform: 'translate(-50%, -50%)' };
      case 'center':
      case 'middle':
        return { left: `${watermarkPos.x || 50}%`, top: `${watermarkPos.y || 50}%`, transform: 'translate(-50%, -50%)' };
      case 'footer':
      case 'bottom':
        return { left: `${watermarkPos.x || 50}%`, top: `${watermarkPos.y || 90}%`, transform: 'translate(-50%, -50%)' };
      default:
        return { left: `${watermarkPos.x || 84}%`, top: `${watermarkPos.y || 8}%`, transform: 'translate(-50%, -50%)' };
    }
  };

  // Match the renderer's fit-inside sizing while keeping portrait logos inside the 9:16 frame.
  const watermarkPreviewWidth = Math.min(Number(watermarkScale) || 20, 96, 96 * watermarkAspectRatio * (16 / 9));

  const hasAnyBranding = Boolean(watermarkPreviewUrl || watermarkPath || footerPreviewUrl || footerPath);
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  const hasAnyOutro = Boolean((outroMode === 'template' && selectedTemplate) || outroMode === 'custom');
  const hasAnyCustomization = Boolean(hasAnyBranding || hasAnyOutro);

  const isScheduleMode = publishMode === 'schedule';
  const canUpload = clip?.status === 'completed' && (!hasAnyCustomization || brandingBurned || hasRenderedOnce) && !workingPlatform;

  return (
    <div style={{ minHeight: '100vh', background: '#f8f8f5', color: '#16181d', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <style>{`
        @keyframes harvest-publish-spin { to { transform: rotate(360deg); } }
        .harvest-publish-spin { animation: harvest-publish-spin 0.8s linear infinite; }
        


        /* Base input styling: precise heights prevent iOS viewport zoom and clipping */
        .harvest-publish-input,
        .harvest-publish-select {
          font-family: inherit !important;
          font-size: 0.95rem !important; /* 16px min prevents iOS zoom */
          font-weight: 400 !important;
          height: 42px !important;
          line-height: 42px !important;
          padding: 0 0.75rem !important;
          box-sizing: border-box !important;
          border-radius: 8px !important;
        }

        .harvest-publish-textarea {
          font-family: inherit !important;
          font-size: 0.95rem !important;
          font-weight: 400 !important;
          line-height: 1.45 !important;
          padding: 0.6rem 0.75rem !important;
          box-sizing: border-box !important;
          border-radius: 8px !important;
        }

        .harvest-publish-input:focus,
        .harvest-publish-textarea:focus,
        .harvest-publish-select:focus {
          outline: none;
          border-color: #1f6f4a !important;
          box-shadow: 0 0 0 3px rgba(31, 111, 74, 0.15);
        }

        .harvest-outro-mobile-label {
          display: none;
        }

        .harvest-template-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 0.85rem;
          max-height: 420px;
          overflow-y: auto;
          padding-right: 4px;
        }

        .harvest-template-card-thumb {
          position: relative;
          width: 100%;
          height: 110px;
          background: #111827;
          overflow: hidden;
        }

        @media (max-width: 860px) {
          /* Header */
          .harvest-publish-header {
            height: 54px !important;
            padding: 0 0.85rem !important;
            gap: 0.5rem !important;
          }
          .harvest-publish-brand {
            font-size: 1.05rem !important;
          }
          .harvest-publish-header img {
            width: 28px !important;
            height: 28px !important;
          }
          .harvest-publish-user {
            display: none !important; /* Hides email on small viewports so Sign Out is always accessible */
          }
          .harvest-publish-logout-btn {
            padding: 0.35rem 0.6rem !important;
            font-size: 0.8rem !important;
          }

          /* Main container & Hero: compact and clean with ample bottom clearance */
          .harvest-publish-main {
            padding: 0.75rem 0.65rem calc(8rem + env(safe-area-inset-bottom, 20px)) !important;
          }
          .harvest-publish-hero {
            padding: 0.75rem 0.85rem !important;
            margin-bottom: 0.65rem !important;
            border-radius: 9px !important;
          }
          .harvest-publish-hero h1 {
            font-size: 1.12rem !important;
            line-height: 1.25 !important;
            margin-bottom: 0.15rem !important;
          }
          .harvest-publish-hero p {
            display: none !important; /* Hides long filler subtitle on mobile so controls are right at your fingertips */
          }

          /* Two-stage Tabs */
          .harvest-publish-stage-tabs {
            gap: 0.4rem !important;
            margin-bottom: 0.75rem !important;
          }
          .harvest-publish-stage-btn {
            padding: 0.55rem 0.4rem !important;
            font-size: 0.82rem !important;
            gap: 0.35rem !important;
            min-height: 40px !important;
            border-radius: 8px !important;
          }
          .harvest-publish-stage-btn svg {
            width: 15px !important;
            height: 15px !important;
          }
          .harvest-publish-tab-sub {
            display: none !important; /* Condenses labels to '1. Customize' & '2. Publish' on mobile */
          }

          /* Outro switcher compact labels on mobile */
          .harvest-outro-desktop-label {
            display: none !important;
          }
          .harvest-outro-mobile-label {
            display: inline !important;
          }

          /* Single-column grid with live video preview elevated to the top */
          .harvest-publish-layout {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 0.85rem !important;
          }

          /* Aside Video Preview placed right beneath stage tabs on mobile */
          .harvest-publish-aside {
            order: -1 !important;
            position: static !important;
            padding: 0.85rem !important;
            border-radius: 9px !important;
            margin-bottom: 0.25rem !important;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04) !important;
          }
          .harvest-publish-video-box {
            max-height: 44vh !important;
            max-width: 260px !important;
            margin: 0 auto !important;
          }

          /* On mobile in Stage 1, hide duplicate aside actions so preview stays clean and user flows through forms */
          .harvest-publish-aside-stage1-actions {
            display: none !important;
          }

          /* Section cards: compact & scannable */
          .harvest-publish-section {
            padding: 0.85rem !important;
            border-radius: 9px !important;
            margin-bottom: 0.75rem !important;
          }
          .harvest-publish-section h2 {
            font-size: 0.98rem !important;
            margin-bottom: 0.55rem !important;
          }
          .harvest-publish-section p.harvest-section-desc {
            font-size: 0.8rem !important;
            line-height: 1.35 !important;
            margin-bottom: 0.65rem !important;
            color: #64748b !important;
          }

          /* 2-column compact grid for template cards on mobile */
          .harvest-template-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 0.55rem !important;
            max-height: 320px !important;
          }
          .harvest-template-card-thumb {
            height: 78px !important;
          }

          /* Channel platform cards */
          .harvest-publish-platform-card {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 0.65rem !important;
            padding: 0.75rem 0.85rem !important;
            border-radius: 8px !important;
          }
          .harvest-publish-platform-btn {
            width: 100% !important;
            min-width: 0 !important;
            justify-content: center !important;
            padding: 0.6rem 0.8rem !important;
            font-size: 0.84rem !important;
          }

          /* Mobile bottom action bar for Stage 1 */
          .harvest-publish-stage1-mobile-actions {
            display: block !important;
            margin-top: 0.4rem;
          }
        }
      `}</style>

      {/* App Header */}
      <header className="harvest-publish-header" style={{ height: 72, padding: '0 5vw', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', background: '#fff', borderBottom: '1px solid #e6e6e1' }}>
        <button type="button" onClick={() => navigate(returnTo)} aria-label="Back to Studio" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: 0, color: '#16181d', border: 0, background: 'transparent', cursor: 'pointer' }}>
          <img src={harvestLogo} alt="Harvest" style={{ width: 38, height: 38, objectFit: 'contain' }} />
          <span className="harvest-publish-brand" style={{ fontSize: '1.25rem', fontFamily: 'Georgia, serif', fontWeight: 700 }}>Harvest Studio</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span className="harvest-publish-user" style={{ color: '#5b616b', fontSize: '0.9rem' }}>{user?.full_name || user?.email || 'Account'}</span>
          <button type="button" className="harvest-publish-logout-btn" onClick={logout} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 0.8rem', border: '1px solid #e6e6e1', borderRadius: 7, background: '#fff', color: '#343943', cursor: 'pointer' }}><LogOut size={16} /> Sign Out</button>
        </div>
      </header>

      <main className="harvest-publish-main" style={{ maxWidth: 1240, margin: '0 auto', padding: '2rem 1.25rem 4rem' }}>
        <button type="button" onClick={() => navigate(returnTo)} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', marginBottom: '1rem', padding: '0.4rem 0', border: 0, color: '#536071', background: 'transparent', fontWeight: 600, cursor: 'pointer' }}>
          <ArrowLeft size={17} /> Back to Studio
        </button>

        <section className="harvest-publish-hero" style={{ padding: '1.4rem 1.5rem', marginBottom: '1.25rem', background: '#fff', border: '1px solid #e6e6e1', borderRadius: 12, boxShadow: '0 2px 8px rgba(22,24,29,0.03)' }}>
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
          <>
            {/* Two-Stage Progress Tabs: 1. Customize & Brand vs 2. Channels & Publish */}
            <div className="harvest-publish-stage-tabs" style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <button
                type="button"
                className="harvest-publish-stage-btn"
                onClick={() => setCurrentStage('customize')}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.6rem',
                  padding: '0.85rem 1rem',
                  borderRadius: 10,
                  border: currentStage === 'customize' ? '2px solid #1f6f4a' : '1px solid #d9dcd8',
                  background: currentStage === 'customize' ? '#fff' : '#f4f5f3',
                  color: currentStage === 'customize' ? '#1f6f4a' : '#586273',
                  fontWeight: 700,
                  fontSize: '0.94rem',
                  cursor: 'pointer',
                  boxShadow: currentStage === 'customize' ? '0 2px 8px rgba(31,111,74,0.1)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <Sliders size={18} />
                <span>1. Customize <span className="harvest-publish-tab-sub">&amp; Brand</span></span>
                {(hasAnyCustomization || hasRenderedOnce) && (
                  <span style={{ fontSize: '0.72rem', background: (brandingBurned || hasRenderedOnce) ? '#dcfce7' : '#fef3c7', color: (brandingBurned || hasRenderedOnce) ? '#15803d' : '#b45309', padding: '0.15rem 0.5rem', borderRadius: 99, fontWeight: 700 }}>
                    {(brandingBurned || hasRenderedOnce) ? 'Rendered' : 'Edits Active'}
                  </span>
                )}
              </button>

              <button
                type="button"
                className="harvest-publish-stage-btn"
                onClick={() => setCurrentStage('publish')}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.6rem',
                  padding: '0.85rem 1rem',
                  borderRadius: 10,
                  border: currentStage === 'publish' ? '2px solid #1f6f4a' : '1px solid #d9dcd8',
                  background: currentStage === 'publish' ? '#fff' : '#f4f5f3',
                  color: currentStage === 'publish' ? '#1f6f4a' : '#586273',
                  fontWeight: 700,
                  fontSize: '0.94rem',
                  cursor: 'pointer',
                  boxShadow: currentStage === 'publish' ? '0 2px 8px rgba(31,111,74,0.1)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <UploadCloud size={18} />
                <span>2. <span className="harvest-publish-tab-sub">Channels &amp; </span>Publish</span>
                {(hasRenderedOnce || !hasAnyCustomization) && (
                  <span style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#15803d', padding: '0.15rem 0.5rem', borderRadius: 99, fontWeight: 700 }}>
                    Ready
                  </span>
                )}
              </button>
            </div>

            <div className="harvest-publish-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(320px, 390px)', alignItems: 'start', gap: '1.4rem' }}>
              {/* Left Column: Form & Tools */}
              <div className="harvest-publish-form-col" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {currentStage === 'customize' ? (
                  <>

                    {/* 1. Post Details */}
                    <section className="harvest-publish-section" style={{ padding: '1.35rem', background: '#fff', border: '1px solid #e6e6e1', borderRadius: 12 }}>
                      <h2 style={{ margin: '0 0 1rem', fontSize: '1.18rem' }}>1. Post details</h2>
                      <label style={{ display: 'block', marginBottom: '0.9rem', color: '#586273', fontSize: '0.88rem', fontWeight: 600 }}>Video title
                        <input className="harvest-publish-input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '0.35rem', padding: '0.7rem 0.75rem', border: '1px solid #d9dcd8', borderRadius: 7, color: '#16181d' }} />
                      </label>
                      <label style={{ display: 'block', marginBottom: '0.9rem', color: '#586273', fontSize: '0.88rem', fontWeight: 600 }}>Description
                      <textarea className="harvest-publish-textarea" value={description} onChange={(event) => { descriptionEditedRef.current = true; setDescription(event.target.value); }} rows={3} maxLength={5000} style={{ display: 'block', width: '100%', boxSizing: 'border-box', resize: 'vertical', marginTop: '0.35rem', padding: '0.7rem 0.75rem', border: '1px solid #d9dcd8', borderRadius: 7, color: '#16181d' }} />
                      </label>
                      <label style={{ display: 'block', color: '#586273', fontSize: '0.88rem', fontWeight: 600 }}>YouTube visibility
                        <select className="harvest-publish-select" value={privacy} onChange={(event) => setPrivacy(event.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '0.35rem', padding: '0.65rem 0.75rem', border: '1px solid #d9dcd8', borderRadius: 7, background: '#fff', color: '#16181d' }}>
                          <option value="public">Public</option>
                          <option value="unlisted">Unlisted</option>
                          <option value="private">Private</option>
                        </select>
                      </label>
                    </section>

                    {/* 2. Custom Thumbnail Card */}
                    <section className="harvest-publish-section" style={{ padding: '1.35rem', background: '#fff', border: '1px solid #e6e6e1', borderRadius: 12 }}>
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
                      <p className="harvest-section-desc" style={{ margin: '0 0 1rem', color: '#657080', fontSize: '0.88rem' }}>
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
                        <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', flexWrap: 'wrap', background: '#f9f9f7', padding: '0.85rem', borderRadius: 9, border: '1px solid #e6e6e1' }}>
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

                    {/* 3. Watermark & Footer Branding Studio */}
                    <section className="harvest-publish-section" style={{ padding: '1.35rem', background: '#fff', border: '1px solid #e6e6e1', borderRadius: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                        <h2 style={{ margin: 0, fontSize: '1.18rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Layers size={20} color="#1f6f4a" /> 3. Logo Watermark &amp; Footer Banner
                        </h2>
                        {brandingBurned ? (
                          <span style={{ fontSize: '0.74rem', background: '#eef6f0', color: '#1f6f4a', border: '1px solid #cce5d4', padding: '0.2rem 0.6rem', borderRadius: 99, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Check size={12} /> Full Video Rendered
                          </span>
                        ) : hasAnyBranding ? (
                          <span style={{ fontSize: '0.74rem', background: '#fff8ea', color: '#b45309', border: '1px solid #fde68a', padding: '0.2rem 0.6rem', borderRadius: 99, fontWeight: 700 }}>
                            Live Demo Preview (Unrendered)
                          </span>
                        ) : null}
                      </div>
                      <p className="harvest-section-desc" style={{ margin: '0 0 1.1rem', color: '#657080', fontSize: '0.88rem' }}>
                        Add your brand logo watermark (e.g. "nb") and bottom footer banner. See the live demo on the preview player, then click render to create the full video.
                      </p>

                      {/* Tab Switcher (Only Logo and Footer) */}
                      <div style={{ display: 'flex', gap: '0.35rem', padding: '0.3rem', background: '#f4f5f3', borderRadius: 8, marginBottom: '1.25rem' }}>
                        {[
                          { id: 'watermark', label: 'Logo / Watermark' },
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
                        ref={footerInputRef}
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        style={{ display: 'none' }}
                        onChange={(e) => handleBrandingUpload(e, 'footer')}
                      />

                      {/* Tab 1: Logo / Watermark */}
                      {activeBrandingTab === 'watermark' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', background: '#fcfcfb', border: '1px solid #e6e6e1', borderRadius: 9, padding: '0.85rem' }}>
                            {watermarkPreviewUrl ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                                <div style={{ width: 50, height: 50, borderRadius: 8, background: '#1c1e24', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                                  <img src={watermarkPreviewUrl} alt="Logo" style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }} />
                                </div>
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Logo / Watermark Active</div>
                                  <div style={{ fontSize: '0.8rem', color: '#657080' }}>Shown live in real time on the video player</div>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Upload Brand Logo</div>
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
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
                              <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#586273' }}>
                                Placement <span style={{ fontWeight: 400, color: '#1f6f4a' }}>(click preset or drag directly on the video!)</span>
                              </span>
                              {watermarkPosition.startsWith('custom:') && (
                                <span style={{ fontSize: '0.74rem', background: '#eef6f0', color: '#1f6f4a', padding: '0.15rem 0.5rem', borderRadius: 99, fontWeight: 700 }}>
                                  Custom Position: {Math.round(watermarkPos.x)}%, {Math.round(watermarkPos.y)}%
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.45rem' }}>
                              {[
                                { id: 'top-left', label: 'Top Left', x: 16, y: 8 },
                                { id: 'center', label: 'Center', x: 50, y: 50 },
                                { id: 'top-right', label: 'Top Right', x: 84, y: 8 },
                                { id: 'bottom-left', label: 'Bottom Left', x: 16, y: 90 },
                                { id: 'footer', label: 'Bottom Center', x: 50, y: 90 },
                                { id: 'bottom-right', label: 'Bottom Right', x: 84, y: 90 },
                              ].map((p) => {
                                const isSelected = watermarkPosition === p.id;
                                return (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => {
                                      setWatermarkPos({ x: p.x, y: p.y });
                                      setWatermarkPosition(p.id);
                                    }}
                                    style={{
                                      padding: '0.45rem 0.35rem',
                                      minHeight: 38,
                                      borderRadius: 7,
                                      border: isSelected ? '1.5px solid #1f6f4a' : '1px solid #d9dcd8',
                                      background: isSelected ? '#eef6f0' : '#fff',
                                      color: isSelected ? '#1f6f4a' : '#343943',
                                      fontWeight: isSelected ? 700 : 500,
                                      fontSize: '0.78rem',
                                      textAlign: 'center',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '0.3rem',
                                      cursor: 'pointer',
                                      transition: 'all 0.12s ease',
                                      boxShadow: isSelected ? '0 1px 4px rgba(31,111,74,0.15)' : 'none',
                                    }}
                                  >
                                    {isSelected && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1f6f4a', flexShrink: 0 }} />}
                                    <span>{p.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>



                          {/* Sliders: Logo Size & Opacity */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <label style={{ fontSize: '0.84rem', fontWeight: 600, color: '#586273' }}>
                              Logo Size: <strong style={{ color: '#16181d' }}>{watermarkScale}%</strong>
                              <input
                                type="range"
                                min="8"
                                max="100"
                                value={watermarkScale}
                                onChange={(e) => setWatermarkScale(Number(e.target.value))}
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
                                onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                                style={{ width: '100%', marginTop: '0.4rem', accentColor: '#1f6f4a' }}
                              />
                            </label>
                          </div>
                        </div>
                      )}

                      {/* Tab 2: Footer Banner */}
                      {activeBrandingTab === 'footer' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', background: '#fcfcfb', border: '1px solid #e6e6e1', borderRadius: 9, padding: '0.85rem' }}>
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
                            Footer Banner Size: <strong style={{ color: '#16181d' }}>{footerHeight}px high</strong>
                            <input
                              type="range"
                              min="60"
                              max="768"
                              step="10"
                              value={footerHeight}
                              onChange={(e) => setFooterHeight(Number(e.target.value))}
                              style={{ width: '100%', marginTop: '0.4rem', accentColor: '#1f6f4a' }}
                            />
                          </label>

                          {/* Position Presets & Draggable Indicator */}
                          <div style={{ background: '#fcfcfb', border: '1px solid #e6e6e1', borderRadius: 9, padding: '0.85rem' }}>
                            <div style={{ fontWeight: 650, fontSize: '0.85rem', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Move size={15} color="#1f6f4a" /> Banner Position ({Math.round(getSafeFooterY(footerPos.y))}% from top)
                              </span>
                              <span style={{ fontSize: '0.74rem', color: '#1f6f4a', fontWeight: 600 }}>Interactive Draggable</span>
                            </div>
                            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem' }}>
                              {[
                                { id: 'lower-third', label: 'Lower Third', y: 78 },
                                { id: 'center', label: 'Center', y: 50 },
                                { id: 'top', label: 'Top', y: 8 },
                              ].map((preset) => (
                                <button
                                  key={preset.id}
                                  type="button"
                                  onClick={() => {
                                    const safeY = getSafeFooterY(preset.y);
                                    setFooterPos({ y: safeY });
                                    setFooterPosition(`custom:${safeY}`);
                                  }}
                                  style={{
                                    flex: 1,
                                    padding: '0.4rem 0.5rem',
                                    borderRadius: 6,
                                    border: `1px solid ${Math.abs(getSafeFooterY(footerPos.y) - getSafeFooterY(preset.y)) < 3 ? '#1f6f4a' : '#d9dcd8'}`,
                                    background: Math.abs(getSafeFooterY(footerPos.y) - getSafeFooterY(preset.y)) < 3 ? '#eef6f0' : '#fff',
                                    color: Math.abs(getSafeFooterY(footerPos.y) - getSafeFooterY(preset.y)) < 3 ? '#1f6f4a' : '#343943',
                                    fontWeight: Math.abs(getSafeFooterY(footerPos.y) - getSafeFooterY(preset.y)) < 3 ? 700 : 500,
                                    fontSize: '0.78rem',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {preset.label}
                                </button>
                              ))}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#657080', marginTop: '0.45rem' }}>
                              Tip: You can also click and drag the banner directly up and down on the live video player!
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Branding Status Guide */}
                      <div style={{
                        marginTop: '1.25rem',
                        padding: '1rem 1.1rem',
                        borderRadius: 10,
                        backgroundColor: brandingBurned ? '#f0fdf4' : (hasAnyBranding ? '#fffbeb' : '#f9fafb'),
                        border: `1.5px solid ${brandingBurned ? '#86efac' : (hasAnyBranding ? '#fde68a' : '#e5e7eb')}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.85rem'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <Sparkles size={20} color={brandingBurned ? '#16a34a' : (hasAnyBranding ? '#d97706' : '#6b7280')} style={{ flexShrink: 0 }} />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: brandingBurned ? '#166534' : (hasAnyBranding ? '#92400e' : '#1f2937') }}>
                              {brandingBurned ? 'Full Video Rendered & Burned' : (hasAnyBranding ? 'Live Movable Demo Active' : 'Watermark & Branding Ready')}
                            </div>
                            <div style={{ fontSize: '0.81rem', color: brandingBurned ? '#15803d' : (hasAnyBranding ? '#78350f' : '#6b7280'), marginTop: 2 }}>
                              {brandingBurned
                                ? 'Your watermark and styling are burned into the MP4 and ready to publish.'
                                : (hasAnyBranding
                                  ? 'Drag your logo anywhere on the preview video, then click Render.'
                                  : 'Upload your logo watermark or footer banner above, then click Render or Proceed to Publish.')}
                            </div>
                          </div>
                        </div>
                        {brandingBurned ? (
                          <span style={{ fontSize: '0.74rem', background: '#dcfce7', color: '#166534', border: '1px solid #86efac', padding: '0.2rem 0.6rem', borderRadius: 99, fontWeight: 700, whiteSpace: 'nowrap' }}>
                            <Check size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} /> Ready
                          </span>
                        ) : hasAnyBranding ? (
                          <span style={{ fontSize: '0.74rem', background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '0.25rem 0.65rem', borderRadius: 99, fontWeight: 700, whiteSpace: 'nowrap' }}>
                            Ready to Render
                          </span>
                        ) : null}
                      </div>
                    </section>

                    {/* 4. Creator Outro & Call to Action Cards */}
                    <section className="harvest-publish-section" style={{ padding: '1.35rem', background: '#fff', border: '1px solid #e6e6e1', borderRadius: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                        <h2 style={{ margin: 0, fontSize: '1.18rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Film size={20} color="#1f6f4a" /> 4. Outro &amp; Call to Action Cards
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
                      <p className="harvest-section-desc" style={{ margin: '0 0 1.1rem', color: '#657080', fontSize: '0.88rem' }}>
                        Optionally append a professional animated outro screen, subscribe alert, or call-to-action card to the end of your short.
                      </p>

                      {/* Outro Mode Switcher */}
                      <div style={{ display: 'flex', gap: '0.35rem', padding: '0.3rem', background: '#f4f5f3', borderRadius: 8, marginBottom: '1.25rem' }}>
                        {[
                          { id: 'none', label: 'No Outro', mobileLabel: 'No Outro', icon: X },
                          { id: 'template', label: 'Local Templates', mobileLabel: 'Templates', icon: Film },
                          { id: 'custom', label: 'Custom 9:16 Builder', mobileLabel: 'Custom CTA', icon: Wand2 },
                        ].map((tab) => {
                          const TabIcon = tab.icon;
                          const isSelected = outroMode === tab.id;
                          return (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => {
                                setOutroMode(tab.id);
                                if (tab.id === 'none' && hasRenderedOnce) {
                                  setBrandingBurned(true);
                                }
                              }}
                              style={{
                                flex: 1,
                                padding: '0.5rem 0.45rem',
                                minHeight: 36,
                                border: 0,
                                borderRadius: 6,
                                background: isSelected ? '#fff' : 'transparent',
                                color: isSelected ? '#16181d' : '#657080',
                                fontWeight: isSelected ? 700 : 550,
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.35rem',
                                boxShadow: isSelected ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                                transition: 'all 0.15s ease',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <TabIcon size={14} style={{ flexShrink: 0 }} />
                              <span className="harvest-outro-desktop-label">{tab.label}</span>
                              <span className="harvest-outro-mobile-label">{tab.mobileLabel}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* MODE 1: LOCAL TEMPLATES */}
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

                          {/* Template Cards Grid: 2-column compact grid on mobile */}
                          <div className="harvest-template-grid">
                            {templates
                              .filter((t) => templateFilterCategory === 'all' || t.category === templateFilterCategory)
                              .map((tmpl) => {
                                const isSelected = selectedTemplateId === tmpl.id;
                                return (
                                  <div
                                    key={tmpl.id}
                                    onClick={() => setSelectedTemplateId(tmpl.id)}
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
                                    <div className="harvest-template-card-thumb">
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
                                    <div style={{ padding: '0.55rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                      <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#1e293b', marginBottom: '0.15rem', lineHeight: 1.25 }}>
                                        {tmpl.title}
                                      </div>
                                      <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', background: '#fcfcfb', border: '1px solid #e6e6e1', borderRadius: 9, padding: '0.85rem' }}>
                          <label style={{ fontWeight: 700, fontSize: '0.84rem', color: '#16181d' }}>
                            Outro design
                            <select value={outroConfig.design || 'faith_cinematic'} onChange={(event) => setOutroConfig((current) => ({ ...current, design: event.target.value }))} style={{ display: 'block', width: '100%', marginTop: '0.35rem', padding: '0.5rem', border: '1px solid #d9dcd8', borderRadius: 6, background: '#fff' }}>
                              <option value="faith_cinematic">Cinematic Faith (from local HTML/JSON template)</option>
                              <option value="classic">Classic CTA card</option>
                            </select>
                          </label>

                          <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#16181d' }}>Action Buttons to Display</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.45rem' }}>
                            {[
                              { label: '👍 Like', active: showLikeAction, toggle: () => setShowLikeAction(!showLikeAction) },
                              { label: '💬 Comment', active: showCommentAction, toggle: () => setShowCommentAction(!showCommentAction) },
                              { label: '🔔 Subscribe', active: showSubscribeAction, toggle: () => setShowSubscribeAction(!showSubscribeAction) },
                              { label: '↗ Share', active: showFollowAction, toggle: () => setShowFollowAction(!showFollowAction) },
                            ].map((btn, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => btn.toggle()}
                                style={{
                                  padding: '0.42rem 0.6rem',
                                  minHeight: 36,
                                  borderRadius: 6,
                                  border: btn.active ? '1.5px solid #1f6f4a' : '1px solid #d9dcd8',
                                  background: btn.active ? '#eef6f0' : '#fff',
                                  color: btn.active ? '#1f6f4a' : '#586273',
                                  fontWeight: btn.active ? 700 : 500,
                                  fontSize: '0.8rem',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '0.3rem',
                                }}
                              >
                                {btn.label}
                              </button>
                            ))}
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
                            {[
                              ['Like label', outroLikeText, setOutroLikeText],
                              ['Comment label', outroCommentText, setOutroCommentText],
                              ['Subscribe label', outroSubscribeText, setOutroSubscribeText],
                              ['Share label', outroFollowText, setOutroFollowText],
                            ].map(([label, value, setter]) => (
                              <label key={label} style={{ fontSize: '0.74rem', color: '#586273', fontWeight: 600 }}>
                                {label}
                                <input value={value} maxLength={32} onChange={(event) => setter(event.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '0.25rem', padding: '0.45rem', border: '1px solid #d9dcd8', borderRadius: 6 }} />
                              </label>
                            ))}
                          </div>

                          {outroConfig.design === 'faith_cinematic' && (
                            <div style={{ display: 'grid', gap: '0.55rem', padding: '0.65rem', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}>
                              <strong style={{ fontSize: '0.78rem', color: '#334155' }}>Action card appearance</strong>
                              <label style={{ fontSize: '0.72rem', color: '#586273', fontWeight: 600 }}>
                                Card style
                                <select value={outroConfig.action_card_style || 'neon'} onChange={(event) => setOutroConfig((current) => ({ ...current, action_card_style: event.target.value }))} style={{ display: 'block', width: '100%', marginTop: '0.25rem', padding: '0.4rem', border: '1px solid #d9dcd8', borderRadius: 5, background: '#fff' }}>
                                  <option value="neon">Neon tiles (reference style)</option><option value="filled">Color filled</option><option value="outline">Dark with color outline</option><option value="glass">Transparent glass</option>
                                </select>
                              </label>
                              {outroConfig.action_card_style === 'glass' && (
                                <label style={{ fontSize: '0.72rem', color: '#586273', fontWeight: 600 }}>
                                  Card transparency: {100 - Number(outroConfig.action_card_opacity ?? 35)}%
                                  <input type="range" min="0" max="80" value={outroConfig.action_card_opacity ?? 35} onChange={(event) => setOutroConfig((current) => ({ ...current, action_card_opacity: Number(event.target.value) }))} style={{ width: '100%' }} />
                                </label>
                              )}
                              <label style={{ fontSize: '0.72rem', color: '#586273', fontWeight: 600 }}>
                                Button text font
                                <select value={outroConfig.action_font_family || outroConfig.font_family || 'sans'} onChange={(event) => setOutroConfig((current) => ({ ...current, action_font_family: event.target.value }))} style={{ display: 'block', width: '100%', marginTop: '0.25rem', padding: '0.4rem', border: '1px solid #d9dcd8', borderRadius: 5, background: '#fff' }}>
                                  <option value="sans">Clean sans serif</option><option value="serif">Cinematic serif</option><option value="script">Script</option>
                                </select>
                              </label>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.45rem' }}>
                                {[
                                  ['Like accent', 'like'], ['Comment accent', 'comment'],
                                  ['Subscribe accent', 'subscribe'], ['Share accent', 'share'],
                                ].map(([label, key]) => (
                                  <label key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.72rem', color: '#586273', fontWeight: 600 }}>
                                    {label}
                                    <input type="color" value={getOutroActionColor(key)} onChange={(event) => setOutroConfig((current) => ({ ...current, action_colors: { ...(current.action_colors || {}), [key]: event.target.value } }))} aria-label={`${label} color`} />
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}

                          {outroConfig.design === 'faith_cinematic' && (
                            <div style={{ display: 'grid', gap: '0.65rem', padding: '0.7rem', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}>
                              <strong style={{ fontSize: '0.78rem', color: '#334155' }}>DailyWhisper pill</strong>
                              <label style={{ fontSize: '0.72rem', color: '#586273', fontWeight: 600 }}>
                                Text font
                                <select value={outroConfig.promo_font_family || 'sans'} onChange={(event) => setOutroConfig((current) => ({ ...current, promo_font_family: event.target.value }))} style={{ display: 'block', width: '100%', marginTop: '0.25rem', padding: '0.4rem', border: '1px solid #d9dcd8', borderRadius: 5, background: '#fff' }}>
                                  <option value="sans">Clean sans serif</option><option value="serif">Cinematic serif</option><option value="script">Script</option>
                                </select>
                              </label>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
                                {[['Text color', 'promo_text_color'], ['Pill tint', 'promo_bg_color']].map(([label, key]) => (
                                  <label key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: '#586273', fontWeight: 600 }}>
                                    {label}<input type="color" value={outroConfig[key]} onChange={(event) => setOutroConfig((current) => ({ ...current, [key]: event.target.value }))} aria-label={label} />
                                  </label>
                                ))}
                              </div>
                              <label style={{ fontSize: '0.72rem', color: '#586273', fontWeight: 600 }}>
                                Pill transparency: {outroConfig.promo_transparency}%
                                <input type="range" min="0" max="95" value={outroConfig.promo_transparency} onChange={(event) => setOutroConfig((current) => ({ ...current, promo_transparency: Number(event.target.value) }))} style={{ width: '100%' }} />
                              </label>
                            </div>
                          )}

                          {outroConfig.design === 'faith_cinematic' && (
                            <div style={{ display: 'grid', gap: '0.65rem', padding: '0.7rem', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}>
                              <strong style={{ fontSize: '0.78rem', color: '#334155' }}>Quote card</strong>
                              <label style={{ fontSize: '0.72rem', color: '#586273', fontWeight: 600 }}>
                                Card heading
                                <input value={outroConfig.quote_title || ''} maxLength={60} onChange={(event) => setOutroConfig((current) => ({ ...current, quote_title: event.target.value }))} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '0.25rem', padding: '0.4rem', border: '1px solid #d9dcd8', borderRadius: 5 }} />
                              </label>
                              <label style={{ fontSize: '0.72rem', color: '#586273', fontWeight: 600 }}>
                                Quote font
                                <select value={outroConfig.quote_font_family || 'serif'} onChange={(event) => setOutroConfig((current) => ({ ...current, quote_font_family: event.target.value }))} style={{ display: 'block', width: '100%', marginTop: '0.25rem', padding: '0.4rem', border: '1px solid #d9dcd8', borderRadius: 5, background: '#fff' }}>
                                  <option value="sans">Clean sans serif</option><option value="serif">Cinematic serif</option><option value="script">Script</option>
                                </select>
                              </label>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
                                {[['Quote text', 'quote_text_color'], ['Heading', 'quote_title_color'], ['Card tint', 'quote_bg_color'], ['Border', 'quote_border_color']].map(([label, key]) => (
                                  <label key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.35rem', fontSize: '0.72rem', color: '#586273', fontWeight: 600 }}>
                                    {label}<input type="color" value={outroConfig[key]} onChange={(event) => setOutroConfig((current) => ({ ...current, [key]: event.target.value }))} aria-label={`Quote ${label.toLowerCase()} color`} />
                                  </label>
                                ))}
                              </div>
                              <label style={{ fontSize: '0.72rem', color: '#586273', fontWeight: 600 }}>
                                Card transparency: {outroConfig.quote_transparency}%
                                <input type="range" min="0" max="95" value={outroConfig.quote_transparency} onChange={(event) => setOutroConfig((current) => ({ ...current, quote_transparency: Number(event.target.value) }))} style={{ width: '100%' }} />
                              </label>
                            </div>
                          )}

                          {outroConfig.design === 'faith_cinematic' && (
                            <div style={{ display: 'grid', gap: '0.65rem', padding: '0.75rem', border: '1px solid #e8dcc6', borderRadius: 8, background: '#fffaf1' }}>
                              <div style={{ fontSize: '0.82rem', fontWeight: 750, color: '#6d4d20' }}>Cinematic Faith design settings</div>
                              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <input ref={outroBackgroundInputRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={(event) => handleBrandingUpload(event, 'outro_background')} />
                                <button type="button" onClick={() => outroBackgroundInputRef.current?.click()} disabled={Boolean(message && message.startsWith('Uploading'))} style={{ ...secondaryButton, padding: '0.45rem 0.65rem' }}>
                                  {outroBackgroundPath ? 'Replace background image' : 'Upload background image'}
                                </button>
                                {outroBackgroundPath && <button type="button" onClick={() => clearBrandingAsset('outro_background')} style={{ ...secondaryButton, padding: '0.45rem 0.65rem', color: '#b42318' }}>Remove background</button>}
                                <span style={{ alignSelf: 'center', fontSize: '0.72rem', color: '#657080' }}>Vertical 9:16 images fit best; the background is cropped to fill.</span>
                              </div>
                              {outroBackgroundPreviewUrl && <img src={outroBackgroundPreviewUrl} alt="Outro background preview" style={{ width: 88, height: 128, objectFit: 'cover', borderRadius: 6, border: '1px solid #d9dcd8' }} />}
                              <label style={{ fontSize: '0.76rem', color: '#586273', fontWeight: 600 }}>
                                Font style
                                <select value={outroConfig.font_family || 'serif'} onChange={(event) => setOutroConfig((current) => ({ ...current, font_family: event.target.value }))} style={{ display: 'block', width: '100%', marginTop: '0.25rem', padding: '0.45rem', border: '1px solid #d9dcd8', borderRadius: 6, background: '#fff' }}>
                                  <option value="serif">Cinematic serif</option><option value="sans">Clean sans serif</option><option value="script">Script</option>
                                </select>
                              </label>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
                                {[
                                  ['Channel / brand name', 'brand'], ['Brand accent text', 'brand_accent'],
                                  ['Small line below brand', 'subbrand'], ['Headline first line', 'headline'],
                                  ['Large highlighted line', 'headline_emphasis'], ['Tagline', 'tagline'],
                                  ['QR card heading', 'qr_title'], ['QR card main label', 'qr_label'],
                                  ['QR card description', 'qr_description'],
                                  ['Footer text', 'footer'], ['Bottom text', 'bottom_note'],
                                ].map(([label, key]) => (
                                  <label key={key} style={{ fontSize: '0.72rem', color: '#586273', fontWeight: 600 }}>
                                    {label}
                                    <input value={outroConfig[key] || ''} maxLength={120} onChange={(event) => setOutroConfig((current) => ({ ...current, [key]: event.target.value }))} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '0.2rem', padding: '0.4rem', border: '1px solid #d9dcd8', borderRadius: 5 }} />
                                  </label>
                                ))}
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
                                {[
                                  ['Like supporting line', 'like'], ['Comment supporting line', 'comment'],
                                  ['Subscribe supporting line', 'subscribe'], ['Share supporting line', 'share'],
                                ].map(([label, key]) => (
                                  <label key={key} style={{ fontSize: '0.72rem', color: '#586273', fontWeight: 600 }}>
                                    {label}
                                    <input value={outroConfig.action_support?.[key] || ''} maxLength={60} onChange={(event) => setOutroConfig((current) => ({ ...current, action_support: { ...(current.action_support || {}), [key]: event.target.value } }))} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '0.2rem', padding: '0.4rem', border: '1px solid #d9dcd8', borderRadius: 5 }} />
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#586273' }}>
                              Outro Duration: <strong style={{ color: '#16181d' }}>{outroDuration}s</strong>
                              <input
                                type="range"
                                min="2.0"
                                max="5.0"
                                step="0.5"
                                value={outroDuration}
                                onChange={(e) => setOutroDuration(Number(e.target.value))}
                                style={{ width: '100%', marginTop: '0.35rem', accentColor: '#1f6f4a' }}
                              />
                            </label>
                            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#586273' }}>
                              Music Style:
                              <select
                                value={outroMusicStyle}
                                onChange={(e) => setOutroMusicStyle(e.target.value)}
                                style={{ display: 'block', width: '100%', marginTop: '0.35rem', padding: '0.45rem', borderRadius: 6, border: '1px solid #d9dcd8', background: '#fff', fontSize: '0.82rem' }}
                              >
                                <option value="upbeat">Upbeat / Energetic</option>
                                <option value="chill">Chill / Lo-Fi</option>
                                <option value="cinematic">Cinematic</option>
                                <option value="pop">Modern Pop</option>
                              </select>
                            </label>
                          </div>

                          {/* Custom Outro Headline */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#16181d' }}>
                              Custom Outro Text / Headline (Optional):
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. Follow @harvestai for more tips!"
                              value={outroLongText}
                              onChange={(e) => setOutroLongText(e.target.value)}
                              style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.7rem', border: '1px solid #d9dcd8', borderRadius: 6, fontSize: '0.84rem' }}
                            />
                          </div>

                          {/* Promotional QR Code Link */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#16181d', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <QrCode size={15} color="#1f6f4a" />
                                Promotional Link / QR Code URL (Optional):
                              </label>
                              {outroQrLink.trim() && (
                                <span style={{ fontSize: '0.7rem', color: '#1f6f4a', background: '#eef6f0', padding: '0.15rem 0.45rem', borderRadius: 99, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                  <Check size={11} /> Scannable QR Active
                                </span>
                              )}
                            </div>
                            <div style={{ position: 'relative' }}>
                              <input
                                type="text"
                                placeholder="e.g. https://yourstore.com/promo or https://youtube.com/@channel"
                                value={outroQrLink}
                                onChange={(e) => setOutroQrLink(e.target.value)}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  boxSizing: 'border-box',
                                  padding: '0.55rem 0.7rem 0.55rem 2.2rem',
                                  border: outroQrLink.trim() ? '1.5px solid #1f6f4a' : '1px solid #d9dcd8',
                                  borderRadius: 6,
                                  fontSize: '0.84rem',
                                  background: outroQrLink.trim() ? '#fbfdfb' : '#fff'
                                }}
                              />
                              <Link2 size={14} color="#64748b" style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)' }} />
                            </div>
                            <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                              Generates a scannable QR code on the outro. Viewers can scan it with their phones to visit your link directly!
                            </span>
                          </div>

                          {/* Promotional Quotes or Custom Texts Box */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#16181d', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <Quote size={15} color="#8b5cf6" />
                              Promotional Quotes / Custom Texts Box (Optional):
                            </label>
                            <textarea
                              rows={2}
                              placeholder="e.g. “Start building smarter today. Use code HARVEST20 for 20% off!” or any inspiring quote"
                              value={outroQuoteText}
                              onChange={(e) => setOutroQuoteText(e.target.value)}
                              style={{
                                display: 'block',
                                width: '100%',
                                boxSizing: 'border-box',
                                padding: '0.55rem 0.7rem',
                                border: outroQuoteText.trim() ? '1.5px solid #8b5cf6' : '1px solid #d9dcd8',
                                borderRadius: 6,
                                fontSize: '0.84rem',
                                fontFamily: 'inherit',
                                resize: 'vertical',
                                background: outroQuoteText.trim() ? '#faf5ff' : '#fff'
                              }}
                            />
                            <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                              Renders an elegant quote card on the outro with your quote or promotional message.
                            </span>
                          </div>

                          {/* Live Visual Preview of Outro Card */}
                          <div style={{ marginTop: '0.4rem', borderTop: '1px solid #e6e6e1', paddingTop: '0.85rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
                              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#16181d', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Sparkles size={14} color="#1f6f4a" />
                                Live Outro Preview Card (Appended to Short)
                              </div>
                              <span style={{ fontSize: '0.7rem', color: '#64748b', background: '#f1f5f9', padding: '0.15rem 0.45rem', borderRadius: 99 }}>
                                {outroDuration}s • {outroMusicStyle}
                              </span>
                            </div>

                            <div
                              style={{
                                backgroundImage: outroConfig.design === 'faith_cinematic'
                                  ? `${outroBackgroundPreviewUrl ? 'linear-gradient(180deg, rgba(4,10,20,0.2), rgba(4,10,20,0.82)), ' : ''}${outroBackgroundPreviewUrl ? `url(${outroBackgroundPreviewUrl})` : 'linear-gradient(180deg, #17507e 0%, #182b46 48%, #070d16 100%)'}`
                                  : 'linear-gradient(180deg, #0b0f19 0%, #111827 50%, #064e3b 100%)',
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                                borderRadius: 12,
                                padding: '1.25rem 1rem',
                                color: '#fff',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '0.75rem',
                                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                                border: '1px solid rgba(255,255,255,0.1)',
                              }}
                            >
                              {/* Header */}
                              <div style={{ textAlign: 'center', fontFamily: outroConfig.font_family === 'serif' ? 'Georgia, serif' : outroConfig.font_family === 'script' ? 'cursive' : 'Arial, sans-serif' }}>
                                {outroConfig.design === 'faith_cinematic' ? (
                                  <>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 800, letterSpacing: '0.05em', color: '#fff7e8' }}>{outroConfig.brand} <span style={{ color: '#ffca5b' }}>{outroConfig.brand_accent}</span></div>
                                    <div style={{ fontSize: '0.58rem', color: '#fff', marginTop: 2 }}>{outroConfig.subbrand}</div>
                                    <div style={{ marginTop: '1rem', fontSize: '1.45rem', fontStyle: 'italic', lineHeight: 1.05 }}>{outroConfig.headline}</div>
                                    <div style={{ fontSize: '2rem', fontStyle: 'italic', fontWeight: 700, color: '#ffca5b', lineHeight: 1.05 }}>{outroConfig.headline_emphasis}</div>
                                    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '0.62rem', letterSpacing: '0.12em', marginTop: '0.35rem' }}>{outroConfig.tagline}</div>
                                  </>
                                ) : (
                                  <>
                                    <div style={{ fontSize: '0.92rem', fontWeight: 800, letterSpacing: '0.05em', color: '#38bdf8' }}>THANKS FOR WATCHING</div>
                                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>{outroQrLink.trim() ? 'Scan the QR code & stay connected' : 'Support this channel & stay connected'}</div>
                                  </>
                                )}
                              </div>

                              {/* Action Buttons */}
                              {(showLikeAction || showCommentAction || showSubscribeAction || showFollowAction) && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.25rem', width: '100%', maxWidth: 460 }}>
                                  {showLikeAction && (
                                    <div style={getOutroActionCardStyle('like')}>
                                      <span style={{ width: 18, height: 18, borderRadius: 5, background: getOutroActionColor('like'), display: 'grid', placeItems: 'center', fontSize: '0.65rem' }}>👍</span>
                                      <div><span>{outroLikeText || 'Like'}</span>{outroConfig.design === 'faith_cinematic' && <small style={{ display: 'block', opacity: 0.8, fontWeight: 400 }}>{outroConfig.action_support?.like}</small>}</div>
                                    </div>
                                  )}
                                  {showCommentAction && (
                                    <div style={getOutroActionCardStyle('comment')}>
                                      <span style={{ width: 18, height: 18, borderRadius: 5, background: getOutroActionColor('comment'), display: 'grid', placeItems: 'center', fontSize: '0.65rem' }}>💬</span>
                                      <div><span>{outroCommentText || 'Comment'}</span>{outroConfig.design === 'faith_cinematic' && <small style={{ display: 'block', opacity: 0.8, fontWeight: 400 }}>{outroConfig.action_support?.comment}</small>}</div>
                                    </div>
                                  )}
                                  {showSubscribeAction && (
                                    <div style={getOutroActionCardStyle('subscribe')}>
                                      <span style={{ width: 18, height: 18, borderRadius: 5, background: getOutroActionColor('subscribe'), display: 'grid', placeItems: 'center', fontSize: '0.65rem' }}>🔔</span>
                                      <div><span>{outroSubscribeText || 'Subscribe'}</span>{outroConfig.design === 'faith_cinematic' && <small style={{ display: 'block', opacity: 0.8, fontWeight: 400 }}>{outroConfig.action_support?.subscribe}</small>}</div>
                                    </div>
                                  )}
                                  {showFollowAction && (
                                    <div style={getOutroActionCardStyle('follow')}>
                                      <span style={{ width: 18, height: 18, borderRadius: 5, background: getOutroActionColor('follow'), display: 'grid', placeItems: 'center', fontSize: '0.65rem' }}>❤️</span>
                                      <div><span>{outroFollowText || 'Share'}</span>{outroConfig.design === 'faith_cinematic' && <small style={{ display: 'block', opacity: 0.8, fontWeight: 400 }}>{outroConfig.action_support?.share || outroConfig.action_support?.follow}</small>}</div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Outro Headline text banner */}
                              {outroLongText.trim() && (
                                <div style={{ fontFamily: getOutroTextFont(outroConfig.promo_font_family), fontSize: '0.8rem', fontWeight: 700, color: outroConfig.promo_text_color, textAlign: 'center', padding: '0.35rem 0.8rem', background: getOutroRgba(outroConfig.promo_bg_color, outroConfig.promo_transparency), borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', width: '100%', maxWidth: 360, boxSizing: 'border-box' }}>
                                  👉 {outroLongText.trim()}
                                </div>
                              )}

                              {/* Quote Card */}
                              {outroQuoteText.trim() && (
                                <div style={{ width: '100%', maxWidth: 360, background: getOutroRgba(outroConfig.quote_bg_color, outroConfig.quote_transparency), border: `1px solid ${outroConfig.quote_border_color}`, borderRadius: 10, padding: '0.65rem 0.85rem', boxSizing: 'border-box', textAlign: 'center' }}>
                                  <div style={{ fontSize: '0.65rem', fontWeight: 750, color: outroConfig.quote_title_color, letterSpacing: '0.04em', marginBottom: '0.25rem' }}>
                                    {outroConfig.quote_title}
                                  </div>
                                  <div style={{ fontFamily: getOutroTextFont(outroConfig.quote_font_family), fontSize: '0.78rem', color: outroConfig.quote_text_color, fontStyle: 'italic', lineHeight: 1.35 }}>
                                    “{outroQuoteText.trim()}”
                                  </div>
                                </div>
                              )}

                              {/* QR Code Container */}
                              {outroQrLink.trim() ? (
                                <div style={{ background: '#ffffff', borderRadius: 14, padding: '0.75rem 0.9rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', boxShadow: '0 4px 16px rgba(0,0,0,0.3)', border: '2px solid #38bdf8' }}>
                                  <div style={{ background: '#0f172a', color: '#38bdf8', padding: '0.2rem 0.6rem', borderRadius: 6, fontSize: '0.66rem', fontWeight: 800, letterSpacing: '0.04em' }}>
                                    {outroConfig.design === 'faith_cinematic' ? outroConfig.qr_title : '📱 SCAN TO VISIT / SHOP'}
                                  </div>
                                  <div style={{ padding: '0.35rem', background: '#fff', borderRadius: 8 }}>
                                    <QRCodeSVG
                                      value={outroQrLink.trim()}
                                      size={116}
                                      level="M"
                                      includeMargin={false}
                                    />
                                  </div>
                                  {outroConfig.design === 'faith_cinematic' && <div style={{ color: '#1e1b45', fontSize: '0.68rem', fontWeight: 800 }}>{outroConfig.qr_label}</div>}
                                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#334155', maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {outroQrLink.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')}
                                  </div>
                                  {outroConfig.design === 'faith_cinematic' && <div style={{ fontSize: '0.62rem', color: '#334155', textAlign: 'center', maxWidth: 210 }}>{outroConfig.qr_description}</div>}
                                </div>
                              ) : (
                                <div style={{ padding: '0.65rem 1rem', borderRadius: 8, border: '1px dashed rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.03)', textAlign: 'center', fontSize: '0.74rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                  <QrCode size={16} color="#38bdf8" />
                                  <span>Enter a Promotional Link above to generate a scannable QR Code card</span>
                                </div>
                              )}
                              {outroConfig.design === 'faith_cinematic' && <div style={{ textAlign: 'center', color: '#ffca5b', fontFamily: outroConfig.font_family === 'serif' ? 'Georgia, serif' : 'Arial, sans-serif', fontWeight: 700 }}>{outroConfig.footer}<div style={{ color: '#fff', fontFamily: 'Arial, sans-serif', fontWeight: 400, fontSize: '0.62rem', marginTop: 3 }}>{outroConfig.bottom_note}</div></div>}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* MODE 3: NO OUTRO */}
                      {outroMode === 'none' && (
                        <div style={{ padding: '1rem', borderRadius: 8, background: '#f8fafc', border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', gap: '0.65rem', color: '#475569', fontSize: '0.84rem' }}>
                          <CheckCircle2 size={16} color="#10b981" />
                          <span><strong>No Outro Screen:</strong> The vertical short will finish immediately after the video moment ends without appending any outro screen.</span>
                        </div>
                      )}

                      {/* Mobile Bottom Action Bar for Stage 1 */}
                      <div className="harvest-publish-stage1-mobile-actions" style={{ display: 'none', marginTop: '1rem' }}>
                        {hasRenderedOnce || !hasAnyCustomization ? (
                          <button
                            type="button"
                            onClick={() => setCurrentStage('publish')}
                            style={{
                              ...primaryButton,
                              width: '100%',
                              boxSizing: 'border-box',
                              justifyContent: 'center',
                              background: '#1f6f4a',
                              padding: '0.8rem 1rem',
                              fontWeight: 700,
                              fontSize: '0.92rem',
                              boxShadow: '0 4px 14px rgba(31, 111, 74, 0.25)',
                            }}
                          >
                            <span>Proceed to Publish Options</span> <ArrowRight size={18} />
                          </button>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <button
                              type="button"
                              disabled={isBurningBranding}
                              onClick={burnBrandingIntoVideo}
                              style={{
                                ...primaryButton,
                                width: '100%',
                                boxSizing: 'border-box',
                                justifyContent: 'center',
                                background: '#16a34a',
                                borderColor: '#15803d',
                                padding: '0.8rem 1rem',
                                fontWeight: 700,
                                fontSize: '0.92rem',
                                boxShadow: '0 4px 14px rgba(22, 163, 74, 0.25)',
                                cursor: isBurningBranding ? 'not-allowed' : 'pointer',
                              }}
                            >
                              {isBurningBranding ? (
                                <><LoaderCircle size={17} className="harvest-publish-spin" /> Rendering Full Video…</>
                              ) : (
                                <><Sparkles size={17} /> Render Full Video</>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => setCurrentStage('publish')}
                              style={{
                                ...secondaryButton,
                                width: '100%',
                                boxSizing: 'border-box',
                                justifyContent: 'center',
                                fontSize: '0.82rem',
                                padding: '0.55rem',
                              }}
                            >
                              Skip Branding &amp; Publish Directly →
                            </button>
                          </div>
                        )}
                      </div>

                    </section>
                  </>
                ) : (
                  <>
                    {/* STAGE 2: PUBLISH VIEW */}
                    <section style={{ padding: '1.25rem 1.4rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <CheckCircle2 size={24} color="#16a34a" style={{ flexShrink: 0 }} />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#166534' }}>Video Ready to Publish</div>
                          <div style={{ fontSize: '0.84rem', color: '#15803d', marginTop: 2 }}>
                            Upload directly to your connected YouTube, Facebook, or Instagram accounts.
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCurrentStage('customize')}
                        style={{
                          ...secondaryButton,
                          fontSize: '0.84rem',
                          padding: '0.5rem 0.85rem',
                          background: '#fff',
                          color: '#166534',
                          borderColor: '#86efac',
                        }}
                      >
                        <Sliders size={14} /> Back to Customize
                      </button>
                    </section>

                    {/* Post Details (Quick Review & Edit) */}
                    <section className="harvest-publish-section" style={{ padding: '1.35rem', background: '#fff', border: '1px solid #e6e6e1', borderRadius: 12 }}>
                      <h2 style={{ margin: '0 0 1rem', fontSize: '1.18rem' }}>Post Details</h2>
                      <div style={{ marginBottom: '1rem', padding: '0.85rem', border: '1px solid #dbe7df', borderRadius: 9, background: '#f8fbf8' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.55rem' }}>
                          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1f6f4a' }}>✨ Choose a title</div>
                          <button type="button" onClick={() => generateSocialMetadata(true)} disabled={isGeneratingMetadata} style={{ ...secondaryButton, padding: '0.35rem 0.6rem', fontSize: '0.76rem', opacity: isGeneratingMetadata ? 0.6 : 1 }}>
                            {isGeneratingMetadata ? 'Generating…' : 'Refresh ideas'}
                          </button>
                        </div>
                        {titleSuggestions.length > 0 ? (
                          <div style={{ display: 'grid', gap: '0.4rem' }}>
                            {titleSuggestions.map((suggestion, index) => {
                              const nativeTitle = typeof suggestion === 'string' ? suggestion : suggestion?.video_language || suggestion?.english || '';
                              const englishTitle = typeof suggestion === 'string' ? suggestion : suggestion?.english || '';
                              return (
                                <div key={`${index}-${nativeTitle}-${englishTitle}`} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.6rem', border: '1px solid #d9dcd8', borderRadius: 7, background: '#fff' }}>
                                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1f6f4a' }}>OPTION {index + 1}</span>
                                  {[['Video language', nativeTitle], ['English', englishTitle]].map(([language, text]) => (
                                    <button key={language} type="button" onClick={() => setTitle(text)} aria-pressed={title === text} style={{ minWidth: 0, padding: '0.45rem', border: title === text ? '1px solid #1f6f4a' : '1px solid #e2e5e2', borderRadius: 6, background: title === text ? '#eef8f1' : '#fff', color: '#252a34', textAlign: 'left', cursor: 'pointer' }}>
                                      <span style={{ display: 'block', marginBottom: '0.2rem', color: '#657080', fontSize: '0.68rem' }}>{language}</span>
                                      <span>{text || 'Unavailable'}</span>
                                    </button>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.8rem', color: '#657080' }}>{isGeneratingMetadata ? 'Generating ideas from the video transcript…' : metadataSuggestionError || 'Title suggestions are unavailable; you can still enter a title below.'}</div>
                        )}
                      </div>
                      <label style={{ display: 'block', marginBottom: '0.9rem', color: '#586273', fontSize: '0.88rem', fontWeight: 600 }}>Video title
                        <input className="harvest-publish-input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '0.35rem', padding: '0.7rem 0.75rem', border: '1px solid #d9dcd8', borderRadius: 7, color: '#16181d' }} />
                      </label>
                      <label style={{ display: 'block', marginBottom: '0.9rem', color: '#586273', fontSize: '0.88rem', fontWeight: 600 }}>Hashtags
                        <input
                          className="harvest-publish-input"
                          value={hashtags.join(' ')}
                          onChange={(event) => setHashtags(event.target.value.split(/[\s,]+/).filter(Boolean).map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)))}
                          placeholder="#TamilCooking #Recipe #Shorts"
                          style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '0.35rem', padding: '0.7rem 0.75rem', border: '1px solid #d9dcd8', borderRadius: 7, color: '#16181d' }}
                        />
                        <span style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.76rem', color: '#657080', fontWeight: 400 }}>Hashtags in both languages are generated automatically and added to the social post description; edit or remove any tag.</span>
                      </label>
                      <label style={{ display: 'block', marginBottom: '0.9rem', color: '#586273', fontSize: '0.88rem', fontWeight: 600 }}>Description
                        <textarea className="harvest-publish-textarea" value={description} onChange={(event) => { descriptionEditedRef.current = true; setDescription(event.target.value); }} rows={3} maxLength={5000} style={{ display: 'block', width: '100%', boxSizing: 'border-box', resize: 'vertical', marginTop: '0.35rem', padding: '0.7rem 0.75rem', border: '1px solid #d9dcd8', borderRadius: 7, color: '#16181d' }} />
                      </label>
                      <label style={{ display: 'block', color: '#586273', fontSize: '0.88rem', fontWeight: 600 }}>YouTube visibility
                        <select className="harvest-publish-select" value={privacy} onChange={(event) => setPrivacy(event.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '0.35rem', padding: '0.65rem 0.75rem', border: '1px solid #d9dcd8', borderRadius: 7, background: '#fff', color: '#16181d' }}>
                          <option value="public">Public</option>
                          <option value="unlisted">Unlisted</option>
                          <option value="private">Private</option>
                        </select>
                      </label>
                    </section>

                    {/* Thumbnail summary in Publish view */}
                    {thumbnailPreviewUrl && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.9rem 1.1rem', background: '#fff', border: '1px solid #e6e6e1', borderRadius: 10 }}>
                        <img src={thumbnailPreviewUrl} alt="Thumbnail preview" style={{ width: 68, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid #d9dcd8' }} />
                        <div>
                          <div style={{ fontWeight: 650, fontSize: '0.86rem', color: '#16181d' }}>Custom Thumbnail Attached</div>
                          <div style={{ fontSize: '0.78rem', color: '#657080' }}>Will be uploaded to YouTube &amp; social platforms with your video.</div>
                        </div>
                      </div>
                    )}

                    {/* Channels & Upload Section (Only visible in Publish stage) */}
                    <section className="harvest-publish-section" style={{ padding: '1.35rem', background: '#fff', border: '1px solid #e6e6e1', borderRadius: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.35rem' }}>
                        <h2 style={{ margin: 0, fontSize: '1.18rem' }}>Channels &amp; Publish</h2>
                        {isCurrentlyScheduled && (
                          <span style={{ fontSize: '0.78rem', background: '#dcfce7', color: '#15803d', padding: '0.25rem 0.65rem', borderRadius: 99, fontWeight: 700, border: '1px solid #86efac', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                            <Clock size={13} /> Active Schedule
                          </span>
                        )}
                      </div>
                      <p className="harvest-section-desc" style={{ margin: '0 0 1rem', color: '#657080', fontSize: '0.9rem' }}>
                        Publish immediately or schedule your short to be released at a future time while you are away.
                      </p>

                      {/* SCHEDULE ACTIVE ALERT BANNER */}
                      {isCurrentlyScheduled && (
                        <div style={{
                          marginBottom: '1.15rem',
                          padding: '0.95rem 1.15rem',
                          background: '#f0fdf4',
                          border: '1.5px solid #86efac',
                          borderRadius: 10,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '1rem',
                          flexWrap: 'wrap'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#dcfce7', display: 'grid', placeItems: 'center', color: '#15803d', flexShrink: 0 }}>
                              <Clock size={20} />
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, color: '#166534', fontSize: '0.95rem' }}>
                                Scheduled for Automated Release
                              </div>
                              <div style={{ color: '#15803d', fontSize: '0.84rem', marginTop: '0.15rem' }}>
                                Target Time: <strong>{formatScheduledDate(scheduledPublishInfo?.scheduled_at)}</strong> ({userTimeZone})
                              </div>
                              {scheduledPublishInfo?.platforms && (
                                <div style={{ color: '#4b5563', fontSize: '0.78rem', marginTop: '0.15rem' }}>
                                  Channels: {scheduledPublishInfo.platforms.map((p) => platforms.find((item) => item.id === p)?.name || p).join(', ')}
                                </div>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={isCancellingSchedule}
                            onClick={handleCancelSchedule}
                            style={{
                              padding: '0.5rem 0.9rem',
                              fontSize: '0.82rem',
                              fontWeight: 650,
                              background: '#fff',
                              border: '1px solid #fca5a5',
                              color: '#dc2626',
                              borderRadius: 7,
                              cursor: isCancellingSchedule ? 'not-allowed' : 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem'
                            }}
                          >
                            {isCancellingSchedule ? (
                              <><LoaderCircle size={14} className="harvest-publish-spin" /> Cancelling…</>
                            ) : (
                              <><X size={14} /> Cancel Schedule</>
                            )}
                          </button>
                        </div>
                      )}

                      {/* SCHEDULE FAILED ALERT BANNER */}
                      {scheduledPublishInfo?.status === 'failed' && (
                        <div style={{
                          marginBottom: '1.15rem',
                          padding: '0.95rem 1.15rem',
                          background: '#fef2f2',
                          border: '1.5px solid #fecaca',
                          borderRadius: 10,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '1rem',
                          flexWrap: 'wrap'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#fee2e2', display: 'grid', placeItems: 'center', color: '#dc2626', flexShrink: 0 }}>
                              <X size={20} />
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, color: '#991b1b', fontSize: '0.95rem' }}>
                                Scheduled Publish Encountered an Issue
                              </div>
                              <div style={{ color: '#b91c1c', fontSize: '0.84rem', marginTop: '0.15rem' }}>
                                {scheduledPublishInfo.error || 'The platform API returned an error during automated publishing.'}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleCancelSchedule}
                            style={{
                              padding: '0.45rem 0.8rem',
                              fontSize: '0.82rem',
                              fontWeight: 650,
                              background: '#fff',
                              border: '1px solid #fca5a5',
                              color: '#b91c1c',
                              borderRadius: 6,
                              cursor: 'pointer'
                            }}
                          >
                            Dismiss
                          </button>
                        </div>
                      )}

                      {/* PUBLISH TIMING MODE SWITCHER */}
                      <div style={{ marginBottom: '1.25rem', padding: '0.9rem 1.05rem', background: '#f8faf9', border: '1px solid #e2e8e0', borderRadius: 10 }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#374151', marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Publishing Mode
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: publishMode === 'schedule' ? '0.85rem' : 0 }}>
                          <button
                            type="button"
                            onClick={() => setPublishMode('now')}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.45rem',
                              padding: '0.65rem 0.8rem',
                              borderRadius: 8,
                              border: publishMode === 'now' ? '2px solid #1f6f4a' : '1px solid #d9dcd8',
                              background: publishMode === 'now' ? '#fff' : '#f4f5f3',
                              color: publishMode === 'now' ? '#1f6f4a' : '#586273',
                              fontWeight: 700,
                              fontSize: '0.88rem',
                              cursor: 'pointer',
                              boxShadow: publishMode === 'now' ? '0 1px 6px rgba(31,111,74,0.12)' : 'none',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <UploadCloud size={16} /> Publish Now
                          </button>
                          <button
                            type="button"
                            onClick={() => setPublishMode('schedule')}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.45rem',
                              padding: '0.65rem 0.8rem',
                              borderRadius: 8,
                              border: publishMode === 'schedule' ? '2px solid #1f6f4a' : '1px solid #d9dcd8',
                              background: publishMode === 'schedule' ? '#fff' : '#f4f5f3',
                              color: publishMode === 'schedule' ? '#1f6f4a' : '#586273',
                              fontWeight: 700,
                              fontSize: '0.88rem',
                              cursor: 'pointer',
                              boxShadow: publishMode === 'schedule' ? '0 1px 6px rgba(31,111,74,0.12)' : 'none',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <Clock size={16} /> Schedule for Later
                          </button>
                        </div>

                        {publishMode === 'schedule' && (
                          <div style={{ padding: '0.9rem', background: '#fff', border: '1px solid #cce5d4', borderRadius: 8, marginTop: '0.6rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>
                                Select Date &amp; Time:
                              </label>
                              <span style={{ fontSize: '0.74rem', color: '#1f6f4a', background: '#eef6f0', border: '1px solid #cce5d4', padding: '0.2rem 0.5rem', borderRadius: 4, fontWeight: 650 }}>
                                🌐 {userTimeZone}
                              </span>
                            </div>
                            <input
                              type="datetime-local"
                              min={getMinScheduleDateTime()}
                              value={scheduleDate}
                              onChange={(e) => setScheduleDate(e.target.value)}
                              className="harvest-publish-input"
                              style={{
                                width: '100%',
                                padding: '0.6rem 0.75rem',
                                borderRadius: 7,
                                border: '1.5px solid #1f6f4a',
                                fontSize: '0.92rem',
                                color: '#0f172a',
                                fontWeight: 650,
                                background: '#fff',
                                boxSizing: 'border-box',
                                marginBottom: '0.65rem'
                              }}
                            />
                            {/* Quick Presets: 2x2 symmetric grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.45rem', marginBottom: '0.65rem' }}>
                              <button
                                type="button"
                                onClick={() => setPresetSchedule('tomorrow-5am')}
                                style={{ padding: '0.42rem 0.5rem', minHeight: 36, fontSize: '0.78rem', fontWeight: 650, background: '#eef6f0', color: '#1f6f4a', border: '1px solid #bbf7d0', borderRadius: 6, cursor: 'pointer', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                              >
                                🌅 Tomorrow 5:00 AM
                              </button>
                              <button
                                type="button"
                                onClick={() => setPresetSchedule('tomorrow-9am')}
                                style={{ padding: '0.42rem 0.5rem', minHeight: 36, fontSize: '0.78rem', fontWeight: 650, background: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                              >
                                ☀️ Tomorrow 9:00 AM
                              </button>
                              <button
                                type="button"
                                onClick={() => setPresetSchedule('tomorrow-5pm')}
                                style={{ padding: '0.42rem 0.5rem', minHeight: 36, fontSize: '0.78rem', fontWeight: 650, background: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                              >
                                🌆 Tomorrow 5:00 PM
                              </button>
                              <button
                                type="button"
                                onClick={() => setPresetSchedule('plus-1h')}
                                style={{ padding: '0.42rem 0.5rem', minHeight: 36, fontSize: '0.78rem', fontWeight: 650, background: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                              >
                                ⚡ +1 Hour
                              </button>
                            </div>
                            <div style={{ fontSize: '0.78rem', color: '#166534', lineHeight: 1.45, background: '#f0fdf4', padding: '0.55rem 0.75rem', borderRadius: 6, border: '1px solid #bbf7d0' }}>
                              ⏱ <strong>Automated Delivery:</strong> Once scheduled, Harvest AI will release your video automatically at this time without you needing to be online or awake.
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Multi-Platform Unified Batch Release Card */}
                      {connections && connections.length > 0 && (
                        <div style={{
                          background: isScheduleMode ? '#f0fdf4' : '#f8fafc',
                          border: isScheduleMode ? '1.5px solid #86efac' : '1px solid #cbd5e1',
                          borderRadius: 10,
                          padding: '1.1rem 1.25rem',
                          marginBottom: '1rem',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '0.96rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                {isScheduleMode ? <Clock size={18} color="#15803d" /> : <UploadCloud size={18} color="#1f6f4a" />}
                                {isScheduleMode ? 'Multi-Platform Scheduled Release' : 'Publish to Multiple Platforms Simultaneously'}
                              </div>
                              <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '0.2rem' }}>
                                {selectedPlatforms.length > 0
                                  ? `${selectedPlatforms.length} of ${connections.length} connected channel${connections.length > 1 ? 's' : ''} selected`
                                  : 'Select at least one connected channel below'}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button
                                type="button"
                                onClick={() => setSelectedPlatforms(connections.map((c) => c.platform))}
                                style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 5, color: '#1e293b', fontSize: '0.78rem', fontWeight: 650, cursor: 'pointer', padding: '0.25rem 0.55rem' }}
                              >
                                Select All
                              </button>
                              {selectedPlatforms.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedPlatforms([])}
                                  style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 5, color: '#64748b', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', padding: '0.25rem 0.55rem' }}
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={selectedPlatforms.length === 0 || !canUpload || Boolean(workingPlatform)}
                            onClick={() => executePublish(selectedPlatforms)}
                            style={{
                              width: '100%',
                              padding: '0.85rem 1.25rem',
                              borderRadius: 8,
                              fontWeight: 700,
                              fontSize: '0.95rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.6rem',
                              border: 'none',
                              cursor: (selectedPlatforms.length === 0 || !canUpload || Boolean(workingPlatform)) ? 'not-allowed' : 'pointer',
                              opacity: (selectedPlatforms.length === 0 || !canUpload || Boolean(workingPlatform)) ? 0.6 : 1,
                              color: '#fff',
                              background: batchActionStatus === 'succeeded'
                                ? '#10b981'
                                : '#1f6f4a',
                              boxShadow: batchActionStatus === 'succeeded'
                                ? '0 4px 12px rgba(16,185,129,0.35)'
                                : '0 4px 12px rgba(31,111,74,0.3)',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            {batchActionStatus === 'working' ? (
                              <>
                                <LoaderCircle size={18} className="harvest-publish-spin" />
                                {isScheduleMode
                                  ? `Scheduling for ${selectedPlatforms.length} Channel${selectedPlatforms.length > 1 ? 's' : ''}…`
                                  : `Publishing to ${selectedPlatforms.length} Channel${selectedPlatforms.length > 1 ? 's' : ''}…`}
                              </>
                            ) : batchActionStatus === 'succeeded' ? (
                              <>
                                <Check size={18} />
                                {isScheduleMode
                                  ? `✓ Successfully Scheduled for ${selectedPlatforms.length} Channel${selectedPlatforms.length > 1 ? 's' : ''}!`
                                  : `✓ Successfully Published to ${selectedPlatforms.length} Channel${selectedPlatforms.length > 1 ? 's' : ''}!`}
                              </>
                            ) : isScheduleMode ? (
                              <>
                                <Clock size={18} />
                                Schedule Video for {selectedPlatforms.length} Channel{selectedPlatforms.length === 1 ? '' : 's'}{scheduleDate ? ` (${formatScheduledDate(scheduleDate)})` : ''}
                              </>
                            ) : (
                              <>
                                <UploadCloud size={18} />
                                Upload to {selectedPlatforms.length} Selected Channel{selectedPlatforms.length === 1 ? '' : 's'} Now
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      <div style={{ display: 'grid', gap: '0.75rem' }}>
                        {platforms.map(({ id, name, Icon, hint }) => {
                          const connection = connectionByPlatform[id];
                          const isSelected = selectedPlatforms.includes(id);
                          const isBusy = (workingPlatform || '').split(',').includes(id);
                          const isSuccess = platformButtonStatus[id] === 'succeeded';
                          const isError = platformButtonStatus[id] === 'error' || Boolean(clip?.published_urls?.[id] && String(clip.published_urls[id]).startsWith('error:'));
                          const isAlreadyPublished = Boolean(clip?.published_urls?.[id] && !String(clip.published_urls[id]).startsWith('error:'));
                          const isAlreadyScheduled = Boolean(isCurrentlyScheduled && scheduledPublishInfo?.platforms?.includes(id));

                          return (
                            <article
                              key={id}
                              className="harvest-publish-platform-card"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '1rem',
                                padding: '1rem',
                                border: isSelected && connection ? '1.5px solid #1f6f4a' : '1px solid #e6e6e1',
                                borderRadius: 9,
                                background: isSelected && connection ? 'rgba(31, 111, 74, 0.02)' : '#fff',
                                transition: 'border 0.15s ease, background 0.15s ease'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                                {connection ? (
                                  <input
                                    type="checkbox"
                                    id={`select-platform-${id}`}
                                    checked={isSelected}
                                    onChange={() => togglePlatformSelection(id)}
                                    title={isSelected ? 'Deselect platform' : 'Select platform'}
                                    style={{
                                      width: 20,
                                      height: 20,
                                      cursor: 'pointer',
                                      accentColor: '#1f6f4a',
                                      flexShrink: 0
                                    }}
                                  />
                                ) : (
                                  <div style={{ width: 20, flexShrink: 0 }} />
                                )}

                                <div style={{ width: 40, height: 40, flex: '0 0 40px', display: 'grid', placeItems: 'center', background: '#f4f5f3', borderRadius: 9 }}>
                                  <Icon size={21} />
                                </div>

                                <div style={{ minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700 }}>
                                    {name}
                                    {connection && (
                                      <span style={{ color: '#1f6f4a', fontSize: '0.76rem', fontWeight: 650 }}>
                                        Connected
                                      </span>
                                    )}
                                    {isAlreadyScheduled && (
                                      <span style={{ color: '#166534', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 4, padding: '0.1rem 0.35rem', fontSize: '0.72rem', fontWeight: 700 }}>
                                        ⏰ Scheduled
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ marginTop: '0.2rem', color: '#657080', fontSize: '0.84rem' }}>
                                    {connection ? (connection.account_name || connection.account_handle || 'Account connected') : hint}
                                  </div>
                                </div>
                              </div>

                              {connection ? (
                                isAlreadyPublished ? (
                                  <a
                                    href={clip.published_urls[id]}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="harvest-publish-platform-btn"
                                    style={{
                                      ...primaryButton,
                                      minWidth: 126,
                                      background: '#047857',
                                      borderColor: '#065f46',
                                      textDecoration: 'none',
                                      boxShadow: '0 2px 6px rgba(4,120,87,0.25)'
                                    }}
                                  >
                                    <CheckCircle2 size={16} /> Published <ExternalLink size={13} />
                                  </a>
                                ) : isBusy ? (
                                  <button
                                    type="button"
                                    disabled
                                    className="harvest-publish-platform-btn"
                                    style={{
                                      ...primaryButton,
                                      minWidth: 126,
                                      background: '#d97706',
                                      borderColor: '#b45309',
                                      cursor: 'wait'
                                    }}
                                  >
                                    <LoaderCircle size={16} className="harvest-publish-spin" />
                                    {isScheduleMode ? 'Scheduling…' : 'Uploading…'}
                                  </button>
                                ) : isSuccess ? (
                                  <button
                                    type="button"
                                    className="harvest-publish-platform-btn"
                                    style={{
                                      ...primaryButton,
                                      minWidth: 126,
                                      background: '#10b981',
                                      borderColor: '#059669',
                                      boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
                                      cursor: 'default'
                                    }}
                                  >
                                    <Check size={16} /> {isScheduleMode ? 'Scheduled!' : 'Uploaded!'}
                                  </button>
                                ) : isAlreadyScheduled ? (
                                  <button
                                    type="button"
                                    onClick={() => handleIndividualPublish(id)}
                                    className="harvest-publish-platform-btn"
                                    style={{
                                      ...primaryButton,
                                      minWidth: 126,
                                      background: '#15803d',
                                      borderColor: '#166534',
                                      boxShadow: '0 2px 6px rgba(21,128,61,0.25)'
                                    }}
                                  >
                                    <Check size={16} /> Scheduled
                                  </button>
                                ) : isError ? (
                                  <button
                                    type="button"
                                    onClick={() => handleIndividualPublish(id)}
                                    className="harvest-publish-platform-btn"
                                    style={{
                                      ...primaryButton,
                                      minWidth: 126,
                                      background: '#dc2626',
                                      borderColor: '#b91c1c'
                                    }}
                                  >
                                    <X size={16} /> Failed (Retry)
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={!canUpload}
                                    onClick={() => handleIndividualPublish(id)}
                                    className="harvest-publish-platform-btn"
                                    style={{
                                      ...primaryButton,
                                      minWidth: 126,
                                      opacity: canUpload ? 1 : 0.5,
                                      cursor: canUpload ? 'pointer' : 'not-allowed',
                                      background: primaryButton.background,
                                      boxShadow: primaryButton.boxShadow
                                    }}
                                  >
                                    {isScheduleMode ? <Clock size={16} /> : <UploadCloud size={16} />}
                                    {isScheduleMode ? 'Schedule' : 'Upload'}
                                  </button>
                                )
                              ) : (
                                <button
                                  type="button"
                                  disabled={Boolean(workingPlatform)}
                                  onClick={() => connectPlatform(id)}
                                  className="harvest-publish-platform-btn"
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
                  </>
                )}
              </div>

              {/* Right Column: Live Interactive Video & Thumbnail Preview */}
              <aside className="harvest-publish-aside" style={{ padding: '1.25rem', background: '#fff', border: '1px solid #e6e6e1', borderRadius: 12, position: 'sticky', top: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.9rem' }}>
                  <h2 style={{ margin: 0, fontFamily: 'Georgia, serif', fontSize: '1.18rem' }}>Live Video Preview</h2>
                  {hasAnyBranding && !brandingBurned && (
                    <span style={{ fontSize: '0.72rem', background: '#eef6f0', color: '#1f6f4a', padding: '0.2rem 0.55rem', borderRadius: 99, fontWeight: 700, border: '1px solid #cce5d4' }}>
                      Live Overlay Active
                    </span>
                  )}
                  {brandingBurned && (
                    <span style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#15803d', padding: '0.2rem 0.55rem', borderRadius: 99, fontWeight: 700, border: '1px solid #86efac' }}>
                      Burned-In Output
                    </span>
                  )}
                </div>

                {/* Live Preview Mode Switcher (Video Clip vs Outro Screen) */}
                {outroMode !== 'none' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem', marginBottom: '0.75rem', background: '#f1f5f9', padding: '0.22rem', borderRadius: 8 }}>
                    <button
                      type="button"
                      onClick={() => setAsidePreviewTab('video')}
                      style={{
                        padding: '0.36rem 0.5rem',
                        borderRadius: 6,
                        border: 'none',
                        background: asidePreviewTab === 'video' ? '#fff' : 'transparent',
                        color: asidePreviewTab === 'video' ? '#16181d' : '#64748b',
                        fontWeight: asidePreviewTab === 'video' ? 700 : 500,
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        boxShadow: asidePreviewTab === 'video' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.3rem',
                      }}
                    >
                      <Film size={13} />
                      <span>Video Clip</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAsidePreviewTab('outro')}
                      style={{
                        padding: '0.36rem 0.5rem',
                        borderRadius: 6,
                        border: 'none',
                        background: asidePreviewTab === 'outro' ? '#fff' : 'transparent',
                        color: asidePreviewTab === 'outro' ? '#1f6f4a' : '#64748b',
                        fontWeight: asidePreviewTab === 'outro' ? 700 : 500,
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        boxShadow: asidePreviewTab === 'outro' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.3rem',
                      }}
                    >
                      <QrCode size={13} />
                      <span>Outro Screen</span>
                    </button>
                  </div>
                )}

                {/* Video Player Container with Live Overlay Layers */}
                <div
                  ref={videoContainerRef}
                  className="harvest-publish-video-box"
                  style={{
                    position: 'relative',
                    width: 'min(100%, 36vh)',
                    height: 'auto',
                    maxHeight: '64vh',
                    aspectRatio: '9 / 16',
                    background: '#0e1014',
                    borderRadius: 10,
                    overflow: 'hidden',
                    margin: '0 auto',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                    userSelect: (isDraggingWatermark || isDraggingFooter) ? 'none' : 'auto',
                  }}
                >
                  {asidePreviewTab === 'outro' && outroMode === 'custom' ? (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        backgroundImage: outroConfig.design === 'faith_cinematic'
                          ? `${outroBackgroundPreviewUrl ? 'linear-gradient(180deg, rgba(4,10,20,0.18), rgba(4,10,20,0.82)), ' : ''}${outroBackgroundPreviewUrl ? `url(${outroBackgroundPreviewUrl})` : 'linear-gradient(180deg, #17507e 0%, #182b46 48%, #070d16 100%)'}`
                          : 'linear-gradient(180deg, #0b0f19 0%, #111827 50%, #064e3b 100%)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1.25rem 0.85rem',
                        boxSizing: 'border-box',
                        color: '#fff',
                        gap: '0.65rem',
                        position: 'relative',
                        overflowY: 'auto',
                      }}
                    >
                      {/* Header */}
                      <div style={{ textAlign: 'center', fontFamily: outroConfig.font_family === 'serif' ? 'Georgia, serif' : outroConfig.font_family === 'script' ? 'cursive' : 'Arial, sans-serif' }}>
                        {outroConfig.design === 'faith_cinematic' ? (
                          <>
                            <div style={{ fontSize: '0.68rem', fontWeight: 800 }}>{outroConfig.brand} <span style={{ color: '#ffca5b' }}>{outroConfig.brand_accent}</span></div>
                            <div style={{ fontSize: '0.52rem', marginTop: 2 }}>{outroConfig.subbrand}</div>
                            <div style={{ fontSize: '1.1rem', fontStyle: 'italic', marginTop: '0.35rem' }}>{outroConfig.headline}</div>
                            <div style={{ fontSize: '1.45rem', color: '#ffca5b', fontWeight: 700, fontStyle: 'italic' }}>{outroConfig.headline_emphasis}</div>
                            <div style={{ fontSize: '0.48rem', letterSpacing: '0.08em', fontFamily: 'Arial, sans-serif' }}>{outroConfig.tagline}</div>
                          </>
                        ) : (
                          <><div style={{ fontSize: '0.88rem', fontWeight: 800, letterSpacing: '0.05em', color: '#38bdf8' }}>THANKS FOR WATCHING</div><div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 2 }}>{outroQrLink.trim() ? 'Scan the QR code & stay connected' : 'Support this channel & stay connected'}</div></>
                        )}
                      </div>

                      {/* Action buttons */}
                      {(showLikeAction || showCommentAction || showSubscribeAction || showFollowAction) && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.2rem', width: '100%', maxWidth: 300 }}>
                          {showLikeAction && (
                            <div style={{ ...getOutroActionCardStyle('like'), padding: '0.3rem 0.45rem', fontSize: '0.72rem' }}>
                              <span style={{ fontSize: '0.65rem' }}>👍</span> <span>{outroLikeText || 'Like'}</span>
                            </div>
                          )}
                          {showCommentAction && (
                            <div style={{ ...getOutroActionCardStyle('comment'), padding: '0.3rem 0.45rem', fontSize: '0.72rem' }}>
                              <span style={{ fontSize: '0.65rem' }}>💬</span> <span>{outroCommentText || 'Comment'}</span>
                            </div>
                          )}
                          {showSubscribeAction && (
                            <div style={{ ...getOutroActionCardStyle('subscribe'), padding: '0.3rem 0.45rem', fontSize: '0.72rem' }}>
                              <span style={{ fontSize: '0.65rem' }}>🔔</span> <span>{outroSubscribeText || 'Subscribe'}</span>
                            </div>
                          )}
                          {showFollowAction && (
                            <div style={{ ...getOutroActionCardStyle('follow'), padding: '0.3rem 0.45rem', fontSize: '0.72rem' }}>
                              <span style={{ fontSize: '0.65rem' }}>↗</span> <span>{outroFollowText || 'Share'}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Headline banner */}
                      {outroLongText.trim() && (
                        <div style={{ fontFamily: getOutroTextFont(outroConfig.promo_font_family), fontSize: '0.75rem', fontWeight: 700, color: outroConfig.promo_text_color, textAlign: 'center', padding: '0.28rem 0.6rem', background: getOutroRgba(outroConfig.promo_bg_color, outroConfig.promo_transparency), borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', maxWidth: 240, width: '100%', boxSizing: 'border-box' }}>
                          👉 {outroLongText.trim()}
                        </div>
                      )}

                      {/* Quote Card */}
                      {outroQuoteText.trim() && (
                        <div style={{ width: '100%', maxWidth: 240, background: getOutroRgba(outroConfig.quote_bg_color, outroConfig.quote_transparency), border: `1px solid ${outroConfig.quote_border_color}`, borderRadius: 8, padding: '0.45rem 0.65rem', boxSizing: 'border-box', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.6rem', fontWeight: 750, color: outroConfig.quote_title_color, marginBottom: '0.15rem' }}>
                            {outroConfig.quote_title}
                          </div>
                          <div style={{ fontFamily: getOutroTextFont(outroConfig.quote_font_family), fontSize: '0.7rem', color: outroConfig.quote_text_color, fontStyle: 'italic', lineHeight: 1.3 }}>
                            “{outroQuoteText.trim()}”
                          </div>
                        </div>
                      )}

                      {/* QR Code */}
                      {outroQrLink.trim() ? (
                        <div style={{ background: '#fff', borderRadius: 12, padding: '0.55rem 0.7rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', border: '2px solid #38bdf8' }}>
                          <div style={{ background: '#0f172a', color: '#38bdf8', padding: '0.15rem 0.45rem', borderRadius: 5, fontSize: '0.6rem', fontWeight: 800 }}>
                                    {outroConfig.design === 'faith_cinematic' ? outroConfig.qr_title : '📱 SCAN TO VISIT / SHOP'}
                          </div>
                          <QRCodeSVG value={outroQrLink.trim()} size={92} level="M" />
                          {outroConfig.design === 'faith_cinematic' && <div style={{ color: '#1e1b45', fontSize: '0.56rem', fontWeight: 800 }}>{outroConfig.qr_label}</div>}
                          <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#334155', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {outroQrLink.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')}
                          </div>
                          {outroConfig.design === 'faith_cinematic' && <div style={{ fontSize: '0.48rem', color: '#334155', textAlign: 'center', maxWidth: 170 }}>{outroConfig.qr_description}</div>}
                        </div>
                      ) : (
                        <div style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px dashed rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.03)', textAlign: 'center', fontSize: '0.68rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <QrCode size={13} color="#38bdf8" />
                          <span>Enter link to generate QR code</span>
                        </div>
                      )}
                      {outroConfig.design === 'faith_cinematic' && <div style={{ textAlign: 'center', color: '#ffca5b', fontSize: '0.6rem', fontFamily: outroConfig.font_family === 'serif' ? 'Georgia, serif' : 'Arial, sans-serif' }}>{outroConfig.footer}<div style={{ color: '#fff', fontFamily: 'Arial, sans-serif', fontSize: '0.45rem', marginTop: 2 }}>{outroConfig.bottom_note}</div></div>}
                    </div>
                  ) : asidePreviewTab === 'outro' && outroMode === 'template' && selectedTemplate ? (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#000', color: '#fff' }}>
                      {selectedTemplate.preview_video_url ? (
                        <video src={selectedTemplate.preview_video_url} autoPlay loop playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      ) : (
                        <div style={{ textAlign: 'center', padding: '1rem' }}>
                          <Film size={28} color="#10b981" />
                          <div style={{ marginTop: '0.5rem', fontWeight: 700, fontSize: '0.9rem' }}>{selectedTemplate.name}</div>
                          <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>Template Outro Screen ({selectedTemplate.duration || 3}s)</div>
                        </div>
                      )}
                    </div>
                  ) : videoUrl ? (
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
                          {/* Footer Banner (DRAGGABLE & MOVABLE ANYWHERE VERTICALLY ON THE VIDEO) */}
                          {footerPreviewUrl && (
                            <div
                              ref={footerOverlayRef}
                              onMouseDown={handleFooterMouseDown}
                              onTouchStart={handleFooterTouchStart}
                              style={{
                                position: 'absolute',
                                top: `${getSafeFooterY(footerPos.y)}%`,
                                transform: 'translateY(-50%)',
                                left: 0,
                                right: 0,
                                height: `${(footerHeight / 1920) * 100}%`,
                                zIndex: 25,
                                pointerEvents: 'auto',
                                cursor: isDraggingFooter ? 'grabbing' : 'grab',
                                userSelect: 'none',
                                touchAction: 'none',
                              }}
                            >
                              <div style={{
                                position: 'relative',
                                width: '100%',
                                height: '100%',
                                outline: isDraggingFooter ? '2px dashed #22c55e' : '1px dashed rgba(255,255,255,0.7)',
                                outlineOffset: -1,
                                transition: 'outline 0.15s ease',
                              }}>
                                <img
                                  src={footerPreviewUrl}
                                  alt="Footer Banner"
                                  draggable={false}
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'contain',
                                    display: 'block',
                                    pointerEvents: 'none',
                                    filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.6))',
                                  }}
                                />
                                {/* Floating drag handle indicator */}
                                <div style={{
                                  position: 'absolute',
                                  top: -22,
                                  left: '50%',
                                  transform: 'translateX(-50%)',
                                  background: 'rgba(0,0,0,0.85)',
                                  color: '#fff',
                                  padding: '2px 8px',
                                  borderRadius: 12,
                                  fontSize: '0.66rem',
                                  fontWeight: 650,
                                  whiteSpace: 'nowrap',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  pointerEvents: 'none',
                                  backdropFilter: 'blur(4px)',
                                  zIndex: 35,
                                }}>
                                  <Move size={10} /> {isDraggingFooter ? `${Math.round(getSafeFooterY(footerPos.y))}% from top` : 'Drag to reposition banner'}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Watermark Logo (DRAGGABLE & MOVABLE ANYWHERE ON THE VIDEO) */}
                          {watermarkPreviewUrl && (
                            <div
                              ref={watermarkOverlayRef}
                              onMouseDown={handleWatermarkMouseDown}
                              onTouchStart={handleWatermarkTouchStart}

                              style={{
                                position: 'absolute',
                                zIndex: 30,
                                opacity: watermarkOpacity / 100,
                                width: `${watermarkPreviewWidth}%`,
                                pointerEvents: 'auto',
                                cursor: isDraggingWatermark ? 'grabbing' : 'grab',
                                userSelect: 'none',
                                touchAction: 'none',
                                ...getWatermarkPositionStyle(watermarkPosition),
                              }}
                            >
                              <div style={{
                                position: 'relative',
                                outline: isDraggingWatermark ? '2px dashed #22c55e' : '1px dashed rgba(255,255,255,0.7)',
                                outlineOffset: 3,
                                borderRadius: 6,
                                transition: 'outline 0.15s ease',
                              }}>
                                <img
                                  src={watermarkPreviewUrl}
                                  alt="Watermark"
                                  draggable={false}
                                  onLoad={(event) => {
                                    const { naturalWidth, naturalHeight } = event.currentTarget;
                                    if (naturalWidth > 0 && naturalHeight > 0) {
                                      const ratio = naturalWidth / naturalHeight;
                                      setWatermarkAspectRatio((current) => Math.abs(current - ratio) > 0.001 ? ratio : current);
                                    }
                                  }}
                                  style={{
                                    width: '100%',
                                    height: 'auto',
                                    objectFit: 'contain',
                                    display: 'block',
                                    filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.6))',
                                    pointerEvents: 'none',
                                  }}
                                />
                                {/* Floating drag handle indicator */}
                                <div style={{
                                  position: 'absolute',
                                  bottom: -22,
                                  left: '50%',
                                  transform: 'translateX(-50%)',
                                  background: 'rgba(0,0,0,0.82)',
                                  color: '#fff',
                                  padding: '2px 8px',
                                  borderRadius: 12,
                                  fontSize: '0.66rem',
                                  fontWeight: 650,
                                  whiteSpace: 'nowrap',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  pointerEvents: 'none',
                                  backdropFilter: 'blur(4px)',
                                }}>
                                  <Move size={10} /> {isDraggingWatermark ? `${Math.round(watermarkPos.x)}%, ${Math.round(watermarkPos.y)}%` : 'Drag to place'}
                                </div>
                              </div>
                            </div>
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

                {/* Action Buttons: Render / Proceed to Publish / Back to Customize */}
                {currentStage === 'customize' ? (
                  <div className="harvest-publish-aside-stage1-actions">
                    {hasRenderedOnce ? (
                      <>
                        {/* Once rendered, it stays rendered! Direct publish option is primary */}
                        <button
                          type="button"
                          onClick={() => setCurrentStage('publish')}
                          style={{
                            ...primaryButton,
                            width: '100%',
                            boxSizing: 'border-box',
                            marginTop: '0.95rem',
                            justifyContent: 'center',
                            background: '#1f6f4a',
                            padding: '0.85rem 1.1rem',
                            fontWeight: 700,
                            fontSize: '0.94rem',
                            boxShadow: '0 4px 14px rgba(31, 111, 74, 0.3)',
                          }}
                        >
                          <span>Proceed to Publish Options</span> <ArrowRight size={18} />
                        </button>
                        {hasAnyCustomization && (
                          <button
                            type="button"
                            disabled={isBurningBranding}
                            onClick={burnBrandingIntoVideo}
                            style={{
                              ...secondaryButton,
                              width: '100%',
                              boxSizing: 'border-box',
                              marginTop: '0.5rem',
                              justifyContent: 'center',
                              fontSize: '0.84rem',
                              color: '#15803d',
                              borderColor: '#bbf7d0',
                              cursor: isBurningBranding ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {isBurningBranding ? (
                              <><LoaderCircle size={15} className="harvest-publish-spin" /> Rendering Updates…</>
                            ) : (
                              <><Sparkles size={15} /> Re-Render with Updates</>
                            )}
                          </button>
                        )}
                      </>
                    ) : !hasAnyCustomization ? (
                      <>
                        {/* Zero edits made or reversed: Directly show publish option */}
                        <button
                          type="button"
                          onClick={() => setCurrentStage('publish')}
                          style={{
                            ...primaryButton,
                            width: '100%',
                            boxSizing: 'border-box',
                            marginTop: '0.95rem',
                            justifyContent: 'center',
                            background: '#1f6f4a',
                            padding: '0.85rem 1.1rem',
                            fontWeight: 700,
                            fontSize: '0.94rem',
                            boxShadow: '0 4px 14px rgba(31, 111, 74, 0.3)',
                          }}
                        >
                          <span>Proceed to Publish Options</span> <ArrowRight size={18} />
                        </button>
                      </>
                    ) : (
                      <>
                        {/* Custom edits added: Render Full Video */}
                        <button
                          type="button"
                          disabled={isBurningBranding}
                          onClick={burnBrandingIntoVideo}
                          style={{
                            ...primaryButton,
                            width: '100%',
                            boxSizing: 'border-box',
                            marginTop: '0.95rem',
                            justifyContent: 'center',
                            background: '#16a34a',
                            borderColor: '#15803d',
                            padding: '0.85rem 1.1rem',
                            fontWeight: 700,
                            fontSize: '0.94rem',
                            boxShadow: '0 4px 14px rgba(22, 163, 74, 0.3)',
                            cursor: isBurningBranding ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {isBurningBranding ? (
                            <><LoaderCircle size={18} className="harvest-publish-spin" /> Rendering Full Video with FFmpeg…</>
                          ) : (
                            <><Sparkles size={18} /> Render Full Video</>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setCurrentStage('publish')}
                          style={{
                            ...secondaryButton,
                            width: '100%',
                            boxSizing: 'border-box',
                            marginTop: '0.5rem',
                            justifyContent: 'center',
                            fontSize: '0.84rem',
                          }}
                        >
                          Skip Branding &amp; Publish Directly →
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Publish stage action: Back to customize button */}
                    <button
                      type="button"
                      onClick={() => setCurrentStage('customize')}
                      style={{
                        ...secondaryButton,
                        width: '100%',
                        boxSizing: 'border-box',
                        marginTop: '0.95rem',
                        justifyContent: 'center',
                        fontWeight: 650,
                        fontSize: '0.88rem',
                      }}
                    >
                      <ArrowLeft size={16} /> Back to Customize Video
                    </button>
                  </>
                )}

                {videoUrl && currentStage === 'publish' && (
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
          </>
        )}
      </main>
    </div>
  );
}
