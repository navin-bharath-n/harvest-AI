import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader, Zap, X, CheckCircle, ExternalLink, Trash2, Film, Sparkles, AlertOctagon } from 'lucide-react';
import { useGeneration } from '../context/GenerationContext';

export default function FloatingGenerationWidget() {
  const { activeTasks, completedTasks, cancelGeneration, cancelAllGenerations, dismissCompleted } = useGeneration();
  const navigate = useNavigate();
  const location = useLocation();
  const [cancellingId, setCancellingId] = useState(null);
  const [isCancellingAll, setIsCancellingAll] = useState(false);

  // If there are no active tasks and no completed notifications, render nothing
  if (activeTasks.length === 0 && completedTasks.length === 0) {
    return null;
  }

  const handleCancel = async (e, videoId) => {
    e.stopPropagation();
    setCancellingId(videoId);
    await cancelGeneration(videoId);
    setCancellingId(null);
  };

  const handleCancelAll = async (e) => {
    e.stopPropagation();
    setIsCancellingAll(true);
    await cancelAllGenerations();
    setIsCancellingAll(false);
  };

  const handleNavigate = (videoId) => {
    navigate(`/master-generator/${videoId}`);
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        maxWidth: '380px',
        width: 'calc(100vw - 48px)',
        pointerEvents: 'none'
      }}
    >
      {/* Batch Cancel All button if multiple tasks are running */}
      {activeTasks.length >= 2 && (
        <div style={{ pointerEvents: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleCancelAll}
            disabled={isCancellingAll}
            style={{
              background: 'rgba(239, 68, 68, 0.9)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(254, 202, 202, 0.4)',
              color: '#fff',
              borderRadius: '20px',
              padding: '6px 14px',
              fontSize: '0.75rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.35)'
            }}
          >
            <AlertOctagon size={13} />
            {isCancellingAll ? 'Cancelling All…' : `Cancel All Processes (${activeTasks.length})`}
          </button>
        </div>
      )}

      <AnimatePresence>
        {/* Active Generation Cards */}
        {activeTasks.map(task => {
          const isCurrentPage = location.pathname === `/master-generator/${task.videoId}`;
          const progressPercent = Math.max(10, Math.min(95, ((task.variationsReady || 0) / (task.variationsTotal || 5)) * 100));

          return (
            <motion.div
              key={`active-${task.videoId}`}
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.25 }}
              style={{
                pointerEvents: 'auto',
                background: 'rgba(15, 23, 42, 0.94)',
                backdropFilter: 'blur(16px)',
                border: '1.5px solid rgba(99, 102, 241, 0.4)',
                borderRadius: '16px',
                padding: '1rem',
                boxShadow: '0 20px 35px -10px rgba(0, 0, 0, 0.6), 0 0 20px rgba(99, 102, 241, 0.25)',
                color: '#f8fafc',
                cursor: 'pointer',
                overflow: 'hidden',
                position: 'relative'
              }}
              onClick={() => handleNavigate(task.videoId)}
            >
              {/* Top ambient glow line */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '2px',
                  background: 'linear-gradient(90deg, #4f46e5, #06b6d4, #ec4899)'
                }}
              />

              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '8px',
                      background: 'rgba(99, 102, 241, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    <Loader size={16} color="#818cf8" className="spin-fast" />
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        color: '#f8fafc',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                      title={task.videoTitle}
                    >
                      {task.videoTitle}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Sparkles size={11} color="#a5b4fc" /> Generating 5 Shorts...
                    </div>
                  </div>
                </div>

                {/* Cancel button */}
                <button
                  type="button"
                  onClick={(e) => handleCancel(e, task.videoId)}
                  disabled={cancellingId === task.videoId}
                  title="Cancel Generation"
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#fca5a5',
                    borderRadius: '8px',
                    padding: '5px 8px',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    transition: 'all 0.15s',
                    flexShrink: 0
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.3)';
                    e.currentTarget.style.color = '#fff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                    e.currentTarget.style.color = '#fca5a5';
                  }}
                >
                  <X size={13} />
                  {cancellingId === task.videoId ? 'Cancelling...' : 'Cancel'}
                </button>
              </div>

              {/* Progress Stage & Status */}
              <div style={{ marginBottom: '0.6rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#cbd5e1', marginBottom: '0.3rem' }}>
                  <span style={{ fontWeight: 600 }}>{task.stageLabel || 'Processing...'}</span>
                  <span style={{ color: '#818cf8', fontWeight: 700 }}>
                    {task.variationsReady || 0}/5 Ready
                  </span>
                </div>

                {/* Progress bar */}
                <div style={{ height: '5px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                  <motion.div
                    style={{
                      height: '100%',
                      background: 'linear-gradient(90deg, #6366f1, #06b6d4)',
                      borderRadius: '3px'
                    }}
                    initial={{ width: '10%' }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>

              {/* View action hint */}
              {!isCurrentPage && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.35rem',
                    fontSize: '0.72rem',
                    color: '#818cf8',
                    fontWeight: 600,
                    paddingTop: '0.35rem',
                    borderTop: '1px solid rgba(255, 255, 255, 0.08)'
                  }}
                >
                  <ExternalLink size={12} /> Click anywhere to open generator page
                </div>
              )}
            </motion.div>
          );
        })}

        {/* Completed Notifications */}
        {completedTasks.map(comp => (
          <motion.div
            key={`comp-${comp.videoId}`}
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.25 }}
            style={{
              pointerEvents: 'auto',
              background: 'rgba(6, 78, 59, 0.95)',
              backdropFilter: 'blur(16px)',
              border: '1.5px solid rgba(52, 211, 153, 0.4)',
              borderRadius: '16px',
              padding: '0.9rem 1rem',
              boxShadow: '0 20px 35px -10px rgba(0, 0, 0, 0.6), 0 0 20px rgba(16, 185, 129, 0.3)',
              color: '#f8fafc',
              overflow: 'hidden',
              position: 'relative'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', overflow: 'hidden' }}>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    background: 'rgba(52, 211, 153, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <CheckCircle size={18} color="#34d399" />
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.84rem', color: '#ecfdf5' }}>
                    🎉 5 Shorts Generated!
                  </div>
                  <div
                    style={{
                      fontSize: '0.72rem',
                      color: '#a7f3d0',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                    title={comp.videoTitle}
                  >
                    {comp.videoTitle}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => {
                    handleNavigate(comp.videoId);
                    dismissCompleted(comp.videoId);
                  }}
                  style={{
                    background: '#10b981',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)'
                  }}
                >
                  <Zap size={13} /> View Shorts
                </button>

                <button
                  type="button"
                  onClick={() => dismissCompleted(comp.videoId)}
                  title="Dismiss notification"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#6ee7b7',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
