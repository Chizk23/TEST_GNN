import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import usePlayerStore from '../../store/playerStore'
import useGNNStore from '../../store/useGNNStore'
import { easeInOutCubic } from '../../engine/interpolate'

const COMMUNITY_COLORS = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#06b6d4', '#ec4899']

export default function EmbeddingSpaceB() {
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const selectedNodeId = useGNNStore(s => s.selectedNodeId)
  
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const canvasParentRef = useRef(null)
  const [dims, setDims] = useState({ width: 400, height: 300 })
  const [projMode, setProjMode] = useState('pca')
  const [showTrajectory, setShowTrajectory] = useState(true)
  const [dataReady, setDataReady] = useState(false)

  const graphDataRef = useRef(null)
  // snapshotsRef and epochRef are now derived from usePlayerStore directly
  // const snapshotsRef = useRef([])
  // const epochRef = useRef(0)
  const silhouetteRef = useRef(0)

  useEffect(() => {
    const unsub = useGNNStore.subscribe((state) => {
      const gd = state.graphData
      if (gd && gd.nodes?.length > 0) { graphDataRef.current = gd; setDataReady(true) }
    })
    const gd = useGNNStore.getState().graphData
    if (gd && gd.nodes?.length > 0) { graphDataRef.current = gd; setDataReady(true) }
    return unsub
  }, [])

  useEffect(() => {
    // snapshots and epochInt are now derived from usePlayerStore directly at the component level
    // if (state.snapshots.length > 0) snapshotsRef.current = state.snapshots
    // epochRef.current = Math.max(0, Math.min(snapshotsRef.current.length - 1, Math.floor(state.currentEpochFloat)))
    const snap = snapshots[epochInt]
    if (snap) silhouetteRef.current = snap.silhouette || 0
    if (snap?.node_predictions && graphDataRef.current) {
      graphDataRef.current.nodes.forEach((n, i) => { n.community = snap.node_predictions[i] })
    }
    drawCanvas()
  }, [dims, projMode, showTrajectory, snapshots, epochInt, selectedNodeId]) // Added snapshots, epochInt, selectedNodeId to dependencies

  useEffect(() => {
    if (!canvasParentRef.current) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      if (width > 0 && height > 0) setDims({ width, height })
    })
    ro.observe(canvasParentRef.current)
    return () => ro.disconnect()
  }, [])

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current, graphData = graphDataRef.current
    if (!canvas || snapshots.length === 0 || !graphData) return
    const ctx = canvas.getContext('2d'), { width, height } = dims, dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr; canvas.height = height * dpr; ctx.scale(dpr, dpr); ctx.clearRect(0, 0, width, height)
    const snap = snapshots[epochInt]; if (!snap) return
    const points = projMode === 'tsne' ? snap.tsne_2d : snap.embeddings_2d
    if (!points || points.length === 0) return
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    points.forEach(([x, y]) => { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y })
    const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1, padding = 35
    const scaleX = (x) => padding + ((x - minX) / rangeX) * (width - padding * 2)
    const scaleY = (y) => padding + ((y - minY) / rangeY) * (height - padding * 2)

    if (showTrajectory && epochInt > 0) {
      const trailLen = Math.min(10, epochInt)
      for (let ni = 0; ni < points.length; ni++) {
        const comm = graphData.nodes[ni]?.community ?? 0, color = COMMUNITY_COLORS[comm % COMMUNITY_COLORS.length]
        ctx.beginPath(); for (let t = trailLen; t >= 0; t--) {
          const idx = epochInt - t; if (idx < 0) continue
          const trailPts = projMode === 'tsne' ? snapshots[idx]?.tsne_2d : snapshots[idx]?.embeddings_2d
          if (!trailPts?.[ni]) continue
          const [tx, ty] = trailPts[ni]; if (t === trailLen) ctx.moveTo(scaleX(tx), scaleY(ty)); else ctx.lineTo(scaleX(tx), scaleY(ty))
        }
        ctx.strokeStyle = color + '25'; ctx.lineWidth = 1; ctx.stroke()
      }
    }
    points.forEach(([x, y], i) => {
      const cx = scaleX(x), cy = scaleY(y), comm = graphData.nodes[i]?.community ?? 0, color = COMMUNITY_COLORS[comm % COMMUNITY_COLORS.length]
      const isSelected = selectedNodeId === i
      
      if (isSelected) {
        ctx.beginPath(); ctx.arc(cx, cy, 12, 0, 2 * Math.PI); ctx.fillStyle = 'rgba(34, 211, 238, 0.2)'; ctx.fill(); ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 1.5; ctx.stroke();
      }

      ctx.beginPath(); ctx.arc(cx, cy, isSelected ? 6 : 4, 0, 2 * Math.PI); ctx.fillStyle = isSelected ? '#fff' : color; ctx.fill()
      ctx.shadowBlur = 8; ctx.shadowColor = color + '66'; ctx.fill(); ctx.shadowBlur = 0
    })
    ctx.fillStyle = '#475569'; ctx.font = '8px monospace'; ctx.textAlign = 'center'; ctx.fillText(projMode === 'tsne' ? 't-SNE DIM 1' : 'PC 1', width / 2, height - 8)
  }, [dims, projMode, showTrajectory, snapshots, epochInt, selectedNodeId])

  useEffect(() => { if (dataReady) drawCanvas() }, [dataReady, drawCanvas])

  if ((!dataReady && !graphDataRef.current) || snapshotsRef.current.length === 0) {
    return ( <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs bg-slate-950/20 backdrop-blur-sm rounded-xl"><p className="animate-pulse">Waiting for training cycle...</p></div> )
  }

  return (
    <div ref={containerRef} className="relative flex flex-col h-full bg-slate-950/20 backdrop-blur-sm rounded-xl border border-slate-800/40 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/50 border-b border-slate-800/50 backdrop-blur-md z-20">
        <div className="flex items-center gap-3"><h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_8px_#a855f7]" />Embedding Space</h3><div className="h-3 w-px bg-white/10" /><span className="text-[9px] font-black text-slate-500 font-mono">EPOCH <span className="text-white">{epochRef.current}</span></span></div>
        <div className="flex items-center gap-3">{silhouetteRef.current !== 0 && ( <div className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[8px] font-black text-amber-400 uppercase tracking-tighter">Silhouette: {silhouetteRef.current.toFixed(3)}</div> )}<div className="flex bg-slate-950/50 rounded-lg p-0.5 border border-slate-800/50"><button onClick={() => setProjMode(projMode === 'pca' ? 'tsne' : 'pca')} className="px-2 py-0.5 rounded text-[8px] font-bold uppercase transition-all text-slate-400 hover:text-white">{projMode}</button><div className="w-px h-2 bg-white/10 self-center mx-1" /><button onClick={() => setShowTrajectory(!showTrajectory)} className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase transition-all ${showTrajectory ? 'text-indigo-400' : 'text-slate-600'}`}>Trail</button></div></div>
      </div>
      <div ref={canvasParentRef} className="flex-1 relative min-h-0"><canvas ref={canvasRef} style={{ width: dims.width, height: dims.height }} className="w-full h-full" /><div className="absolute bottom-3 left-4 flex gap-3 pointer-events-none">{COMMUNITY_COLORS.slice(0, 3).map((c, i) => ( <div key={i} className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c }} /><span className="text-[8px] text-slate-600 font-black font-mono">Group {i}</span></div> ))}</div></div>
    </div>
  )
}
