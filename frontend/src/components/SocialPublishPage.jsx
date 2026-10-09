import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Camera, CheckCircle2, ExternalLink, LoaderCircle, LogOut, UploadCloud, Users, Video } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import harvestLogo from '../Untitled Design.png';

const platforms = [
  { id: 'youtube', name: 'YouTube', Icon: Video, hint: 'Publish this short to your YouTube channel.' },
  { id: 'facebook', name: 'Facebook', Icon: Users, hint: 'Publish this short to your Facebook Page.' },
  { id: 'instagram', name: 'Instagram', Icon: Camera, hint: 'Publish this short to your Instagram professional account.' },
];

const primaryButton = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
  border: '1px solid #1f6f4a', borderRadius: 7, background: '#1f6f4a', color: '#fff',
  padding: '0.7rem 1rem', fontSize: '0.9rem', fontWeight: 650, cursor: 'pointer',
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
  const [description, setDescription] = useState('Generated with Harvest');
  const [privacy, setPrivacy] = useState('public');
  const [loading, setLoading] = useState(true);
  const [workingPlatform, setWorkingPlatform] = useState('');
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState(false);
  const oauthPopupRef = useRef(null);
  const currentUserId = user?.id;

  const refreshConnections = useCallback(async () => {
    if (!currentUserId) return [];
    const items = await api.getUserConnections(currentUserId);
    setConnections(items || []);
    return items || [];
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
        const [clipResult] = await Promise.all([api.getClip(clipId), refreshConnections()]);
        if (!active) return;
        setClip(clipResult);
        setTitle((current) => current || clipResult.title || 'Harvest short');
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
        setMessage(`${platforms.find((platform) => platform.id === event.data.platform)?.name || 'Social'} account connected. You can publish it now.`);
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
      await api.publishClip(clipId, [platform], title.trim() || 'Harvest short', description.trim(), privacy, {});
      // Publishing runs in the background; wait for its saved URL or error.
      for (let attempt = 0; attempt < 90; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const updatedClip = await api.getClip(clipId);
        const result = updatedClip?.published_urls?.[platform];
        if (typeof result === 'string' && result) {
          if (result.startsWith('error:')) throw new Error(result.slice(6).trim());
          setMessage(`Published to ${platforms.find((item) => item.id === platform)?.name}.`);
          return;
        }
      }
      setMessage('The upload is still processing in the background. Check back shortly.');
    } catch (error) {
      setMessageError(true);
      setMessage(`Upload failed: ${error.response?.data?.detail || error.message}`);
    } finally {
      setWorkingPlatform('');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8f8f5', color: '#16181d', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <style>{'@keyframes harvest-publish-spin { to { transform: rotate(360deg); } } .harvest-publish-spin { animation: harvest-publish-spin 0.8s linear infinite; } @media (max-width: 760px) { .harvest-publish-layout { grid-template-columns: minmax(0, 1fr) !important; } .harvest-publish-header { padding: 0 1rem !important; } .harvest-publish-brand { font-size: 1rem !important; } }'}</style>
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
        <button type="button" onClick={() => navigate(returnTo)} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', marginBottom: '1rem', padding: '0.4rem 0', border: 0, color: '#536071', background: 'transparent', fontWeight: 600, cursor: 'pointer' }}><ArrowLeft size={17} /> Back to Studio</button>
        <section style={{ padding: '1.4rem 1.5rem', marginBottom: '1.25rem', background: '#fff', border: '1px solid #e6e6e1', borderRadius: 12, boxShadow: '0 2px 8px rgba(22,24,29,0.03)' }}>
          <div style={{ color: '#7a808a', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 650, fontSize: '0.76rem', marginBottom: '0.45rem' }}>Publish your short</div>
          <h1 style={{ margin: '0 0 0.35rem', fontFamily: 'Georgia, serif', fontSize: '1.65rem' }}>{clip?.title || 'Selected generated video'}</h1>
          <p style={{ margin: 0, color: '#657080', fontSize: '0.95rem' }}>Connect a channel, review the post details, then upload your video.</p>
        </section>

        {message && <div role="status" style={{ display: 'flex', gap: '0.55rem', alignItems: 'center', padding: '0.85rem 1rem', marginBottom: '1.25rem', background: messageError ? '#fff5f3' : '#fff', border: `1px solid ${messageError ? '#f0c9c2' : '#e6e6e1'}`, borderRadius: 8, color: messageError ? '#9c3327' : '#293442' }}>
          {!messageError && <CheckCircle2 size={18} color="#1f6f4a" />}{message}
        </div>}

        {loading ? <div style={{ padding: '4rem', textAlign: 'center', color: '#5b616b' }}><LoaderCircle size={28} className="harvest-publish-spin" /> <p>Loading video and connected accounts…</p></div> : !clipId ? (
          <section style={{ padding: '2rem', background: '#fff', border: '1px solid #e6e6e1', borderRadius: 12 }}>
            <button type="button" style={primaryButton} onClick={() => navigate(returnTo)}>Choose a video in Studio</button>
          </section>
        ) : (
          <div className="harvest-publish-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 360px)', alignItems: 'start', gap: '1.25rem' }}>
            <div>
              <section style={{ padding: '1.35rem', marginBottom: '1rem', background: '#fff', border: '1px solid #e6e6e1', borderRadius: 12 }}>
                <h2 style={{ margin: '0 0 1rem', fontSize: '1.18rem' }}>Post details</h2>
                <label style={{ display: 'block', marginBottom: '0.9rem', color: '#586273', fontSize: '0.88rem', fontWeight: 600 }}>Video title
                  <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '0.35rem', padding: '0.7rem 0.75rem', border: '1px solid #d9dcd8', borderRadius: 7, color: '#16181d', font: 'inherit' }} />
                </label>
                <label style={{ display: 'block', marginBottom: '0.9rem', color: '#586273', fontSize: '0.88rem', fontWeight: 600 }}>Description
                  <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} maxLength={5000} style={{ display: 'block', width: '100%', boxSizing: 'border-box', resize: 'vertical', marginTop: '0.35rem', padding: '0.7rem 0.75rem', border: '1px solid #d9dcd8', borderRadius: 7, color: '#16181d', font: 'inherit' }} />
                </label>
                <label style={{ display: 'block', color: '#586273', fontSize: '0.88rem', fontWeight: 600 }}>YouTube visibility
                  <select value={privacy} onChange={(event) => setPrivacy(event.target.value)} style={{ display: 'block', marginTop: '0.35rem', padding: '0.65rem 0.75rem', border: '1px solid #d9dcd8', borderRadius: 7, background: '#fff', color: '#16181d', font: 'inherit' }}>
                    <option value="public">Public</option><option value="unlisted">Unlisted</option><option value="private">Private</option>
                  </select>
                </label>
              </section>

              <section style={{ padding: '1.35rem', background: '#fff', border: '1px solid #e6e6e1', borderRadius: 12 }}>
                <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.18rem' }}>Channels</h2>
                <p style={{ margin: '0 0 1rem', color: '#657080', fontSize: '0.9rem' }}>Connect an account once. Your connection will be available the next time you publish.</p>
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {platforms.map(({ id, name, Icon, hint }) => {
                    const connection = connectionByPlatform[id];
                    const busy = workingPlatform === id;
                    return <article key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '1rem', border: '1px solid #e6e6e1', borderRadius: 9, background: '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', minWidth: 0 }}>
                        <div style={{ width: 40, height: 40, flex: '0 0 40px', display: 'grid', placeItems: 'center', background: '#f4f5f3', borderRadius: 9 }}><Icon size={21} /></div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700 }}>{name}{connection && <span style={{ color: '#1f6f4a', fontSize: '0.76rem', fontWeight: 650 }}>Connected</span>}</div>
                          <div style={{ marginTop: '0.2rem', color: '#657080', fontSize: '0.84rem' }}>{connection ? (connection.account_name || connection.account_handle || 'Account connected') : hint}</div>
                        </div>
                      </div>
                      {connection ? <button type="button" disabled={Boolean(workingPlatform) || clip?.status !== 'completed'} onClick={() => publishToPlatform(id)} style={{ ...primaryButton, minWidth: 118, opacity: (workingPlatform && !busy) || clip?.status !== 'completed' ? 0.55 : 1, cursor: workingPlatform || clip?.status !== 'completed' ? 'not-allowed' : 'pointer' }}>
                        {busy ? <><LoaderCircle size={16} className="harvest-publish-spin" /> Uploading…</> : <><UploadCloud size={16} /> Upload</>}
                      </button> : <button type="button" disabled={Boolean(workingPlatform)} onClick={() => connectPlatform(id)} style={{ minWidth: 118, display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: '0.4rem', padding: '0.65rem 0.8rem', border: '1px solid #d9dcd8', borderRadius: 7, background: '#fff', color: '#1d2732', fontWeight: 650, cursor: workingPlatform ? 'not-allowed' : 'pointer' }}>
                        Connect <ExternalLink size={14} />
                      </button>}
                    </article>;
                  })}
                </div>
              </section>
            </div>

            <aside style={{ padding: '1.1rem', background: '#fff', border: '1px solid #e6e6e1', borderRadius: 12 }}>
              <h2 style={{ margin: '0 0 0.9rem', fontFamily: 'Georgia, serif', fontSize: '1.15rem' }}>Selected video</h2>
              {videoUrl ? <video src={videoUrl} controls playsInline style={{ display: 'block', width: '100%', maxHeight: '62vh', aspectRatio: '9 / 16', objectFit: 'contain', background: '#17191d', borderRadius: 8 }} /> : <div style={{ minHeight: 260, display: 'grid', placeItems: 'center', padding: '1rem', textAlign: 'center', background: '#f7f7f5', color: '#657080', border: '1px dashed #d9dcd8', borderRadius: 8 }}>{clip?.status === 'completed' ? 'Video preview is unavailable.' : 'This clip is not ready to publish yet.'}</div>}
              <div style={{ marginTop: '0.75rem', color: '#657080', fontSize: '0.84rem' }}>Status: <strong style={{ color: '#16181d' }}>{clip?.status || 'loading'}</strong></div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
