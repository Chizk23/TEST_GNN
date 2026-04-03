import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import usePlayerStore from '../../store/playerStore'
import useGNNStore from '../../store/useGNNStore'

const COMMUNITY_COLORS = ['#3b82f6', '#22c55e', '#f97316']

/**
 * EmbeddingSpaceB — Main embedding view for Task 5
 * Features: PCA/t-SNE toggle, trajectory mode (last 10 epochs)
 * 
 * FIX: Stores graphData and snap data in refs so they are never lost
 * when stores reset epoch to 0 or clear data.
 */
export default function EmbeddingSpaceB() {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [dims, setDims] = useState({ width: 400, height: 300 })
  const [projMode, setProjMode] = useState('pca')
  const [showTrajectory, setShowTrajectory] = useState(true)
  const [dataReady, setDataReady] = useState(false)

  // Refs to preserve data across store resets
  const graphDataRef = useRef(null)
  const snapshotsRef = useRef([])
  const epochRef = useRef(0)

  // Capture graphData from store into ref
  useEffect(() => {
    const unsub = useGNNStore.subscribe((state) => {
      const gd = state.graphData
      if (gd && gd.nodes?.length > 0) {
        graphDataRef.current = gd
        setDataReady(true)
      }
    })
    const gd = useGNNStore.getState().graphData
    if (gd && gd.nodes?.length > 0) {
      graphDataRef.current = gd
      setDataReady(true)
    }
    return unsub
  }, [])

  // Capture snapshots and epoch from playerStore
  useEffect(() => {
    const unsub = usePlayerStore.subscribe((state) => {
      if (state.snapshots.length > 0) {
        snapshotsRef.current = state.snapshots
      }
      epochRef.current = Math.max(0, Math.min(
        snapshotsRef.current.length - 1,
        Math.floor(state.currentEpochFloat)
      ))

      // Update communities in graphData for node coloring if predictions exist
      const snap = snapshotsRef.current[epochRef.current]
      if (snap?.node_predictions && graphDataRef.current) {
        graphDataRef.current.nodes.forEach((n, i) => {
          n.community = snap.node_predictions[i]
        })
      }

      // Trigger canvas redraw
      drawCanvas()
    })
    return unsub
  }, [dims, projMode, showTrajectory]) // re-subscribe when these change

  // Responsive
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      if (width > 0 && height > 0) setDims({ width, height })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Canvas drawing function (called from subscription, not React render)
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const graphData = graphDataRef.current
    const snapshots = snapshotsRef.current
    const epochInt = epochRef.current

    if (!canvas || snapshots.length === 0 || !graphData) return
    const ctx = canvas.getContext('2d')
    const { width, height } = dims
    const dpr = window.devicePixelRatio || 1

    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    const snap = snapshots[epochInt]
    if (!snap) return

    const points = projMode === 'tsne' ? snap.tsne_2d : snap.embeddings_2d
    if (!points || points.length === 0) return

    // Compute bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    points.forEach(([x, y]) => {
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    })
    const rangeX = maxX - minX || 1
    const rangeY = maxY - minY || 1
    const padding = 30
    const scaleX = (x) => padding + ((x - minX) / rangeX) * (width - padding * 2)
    const scaleY = (y) => padding + ((y - minY) / rangeY) * (height - padding * 2)

    // Draw trajectory trails (last 10 epochs)
    if (showTrajectory && epochInt > 0) {
      const trailLen = Math.min(10, epochInt)
      for (let ni = 0; ni < points.length; ni++) {
        const comm = graphData.nodes[ni]?.community ?? 0
        const color = COMMUNITY_COLORS[comm % COMMUNITY_COLORS.length]

        ctx.beginPath()
        for (let t = trailLen; t >= 0; t--) {
          const idx = epochInt - t
          if (idx < 0) continue
          const trailSnap = snapshots[idx]
          const trailPts = projMode === 'tsne' ? trailSnap?.tsne_2d : trailSnap?.embeddings_2d
          if (!trailPts?.[ni]) continue
          const [tx, ty] = trailPts[ni]
          if (t === trailLen) ctx.moveTo(scaleX(tx), scaleY(ty))
          else ctx.lineTo(scaleX(tx), scaleY(ty))
        }
        ctx.strokeStyle = color + '30'
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }

    // Draw nodes
    points.forEach(([x, y], i) => {
      const cx = scaleX(x)
      const cy = scaleY(y)
      const comm = graphData.nodes[i]?.community ?? 0
      const color = COMMUNITY_COLORS[comm % COMMUNITY_COLORS.length]

      // Glow
      ctx.beginPath()
      ctx.arc(cx, cy, 6, 0, 2 * Math.PI)
      ctx.fillStyle = color + '20'
      ctx.fill()

      // Node dot
      ctx.beginPath()
      ctx.arc(cx, cy, 3.5, 0, 2 * Math.PI)
      ctx.fillStyle = color
      ctx.fill()
    })

    // Axis labels
    ctx.fillStyle = '#475569'
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(projMode === 'tsne' ? 't-SNE Dim 1' : 'PC 1', width / 2, height - 6)
    ctx.save()
    ctx.translate(10, height / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText(projMode === 'tsne' ? 't-SNE Dim 2' : 'PC 2', 0, 0)
    ctx.restore()

    // Epoch label
    ctx.fillStyle = '#94a3b8'
    ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(`${projMode.toUpperCase()} — Epoch ${epochInt}`, padding, 16)

  }, [dims, projMode, showTrajectory])

  // Initial draw when data becomes ready
  useEffect(() => {
    if (dataReady) drawCanvas()
  }, [dataReady, drawCanvas])

  const currentSnapshot = snapshotsRef.current[epochRef.current]
  const knnPreservation = currentSnapshot?.knn_preservation ?? 0
  const linkReconAuc = currentSnapshot?.link_recon_auc ?? 0
  const activeProjection = projMode === 'tsne' ? 't-SNE' : 'PCA'

  if ((!dataReady && !graphDataRef.current) || snapshotsRef.current.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
        <div className="text-center">
          <div className="text-3xl mb-2 opacity-40">📐</div>
          <p>Embedding space will appear during training</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="w-full h-full relative bg-slate-950 overflow-hidden">
      <canvas
        ref={canvasRef}
        style={{ width: dims.width, height: dims.height }}
        className="absolute inset-0"
      />

      {/* Controls */}
      <div className="absolute top-2 right-2 z-10 flex gap-1.5">
        <button
          onClick={() => setProjMode(projMode === 'pca' ? 'tsne' : 'pca')}
          className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-800/90 border border-slate-700/50 text-slate-300 hover:bg-slate-700/90 transition-all"
        >
          {projMode === 'pca' ? '📊 PCA' : '🔮 t-SNE'}
        </button>
        <button
          onClick={() => setShowTrajectory(!showTrajectory)}
          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all border
            ${showTrajectory
              ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
              : 'bg-slate-800/90 text-slate-500 border-slate-700/50'}`}
        >
          〰️ Trail
        </button>
      </div>

      <div className="absolute top-2 left-2 z-10 flex gap-2">
        <div className="bg-slate-900/85 border border-slate-700/40 rounded-lg px-2 py-1.5">
          <div className="text-[8px] uppercase tracking-wider text-slate-500">{activeProjection}</div>
          <div className="text-[11px] font-mono font-bold text-cyan-300">{(knnPreservation * 100).toFixed(0)}% kNN</div>
        </div>
        <div className="bg-slate-900/85 border border-slate-700/40 rounded-lg px-2 py-1.5">
          <div className="text-[8px] uppercase tracking-wider text-slate-500">Recon</div>
          <div className="text-[11px] font-mono font-bold text-orange-300">{linkReconAuc.toFixed(3)} AUC</div>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-2 left-2 bg-slate-900/80 backdrop-blur-sm rounded-lg px-2 py-1.5 border border-slate-700/30 z-10">
        {COMMUNITY_COLORS.map((c, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[9px] text-slate-400">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
            Group {i}
          </div>
        ))}
      </div>
    </div>
  )
}
