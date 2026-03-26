import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { forceCenter } from 'd3-force'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { easeInOutCubic } from '../../engine/interpolate'
import { polygonHull } from 'd3-polygon'

const COMMUNITY_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#06b6d4', '#ec4899']

export default function TaskTopology4() {
  const rawGraphData = useGNNStore(s => s.graphData)
  const { snapshots, currentEpochFloat, trainingDone } = usePlayerStore()
  const graphParentRef = useRef()
  const fgRef = useRef()
  const selectedNodeId = useGNNStore(s => s.selectedNodeId)
  const [dims, setDims] = useState({ width: 600, height: 400 })

  const graphData = useMemo(() => {
    if (!rawGraphData) return null
    return {
      nodes: rawGraphData.nodes.map(n => ({ ...n })),
      links: rawGraphData.links.map((l, i) => ({ ...l, _idx: i }))
    }
  }, [rawGraphData])

  useEffect(() => {
    if (fgRef.current && snapshots.length > 0 && graphData) {
        const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
        const snap = snapshots[epochInt], preds = snap?.node_predictions || []
        const fg = fgRef.current
        const centers = [{ x: -220, y: -150 }, { x: 220, y: -150 }, { x: -220, y: 150 }, { x: 220, y: 150 }, { x: 0, y: -250 }, { x: 0, y: 250 }, { x: 0, y: 0 }]
        fg.d3Force('community', (alpha) => {
            graphData.nodes.forEach(node => {
                const cid = preds[node.id] ?? 0, center = centers[cid % centers.length]
                node.vx += (center.x - node.x) * alpha * 0.08; node.vy += (center.y - node.y) * alpha * 0.08
            })
        })
        fg.d3Force('charge').strength(-120); fg.d3ReheatSimulation()
    }
  }, [currentEpochFloat, snapshots, graphData])

  useEffect(() => {
    if (!graphParentRef.current) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      if (width > 0 && height > 0) setDims({ width, height })
    })
    ro.observe(graphParentRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (fgRef.current && graphData) {
      const fg = fgRef.current
      fg.d3Force('center', forceCenter(dims.width / 2, dims.height / 2))
      fg.d3ReheatSimulation()
      setTimeout(() => fg.zoomToFit(400, 100), 100)
    }
  }, [graphData, dims.width, dims.height])

  useEffect(() => {
    if (trainingDone && fgRef.current) {
        fgRef.current.zoomToFit(1000, 150)
    }
  }, [trainingDone])

  const handleReset = () => {
    if (fgRef.current) {
        fgRef.current.zoomToFit(400, 100)
    }
  }

  const communityHulls = useMemo(() => {
    if (snapshots.length === 0 || !graphData) return []
    const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
    const snap = snapshots[epochInt], preds = snap?.node_predictions || []
    const communities = {}
    graphData.nodes.forEach(node => {
      const cid = preds[node.id] ?? 0; if (!communities[cid]) communities[cid] = []; communities[cid].push([node.x, node.y])
    })
    return Object.entries(communities).map(([cid, points]) => {
      if (points.length < 3) return null
      const hull = polygonHull(points); return hull ? { cid: parseInt(cid), path: hull } : null
    }).filter(Boolean)
  }, [currentEpochFloat, snapshots, graphData])

  const nodeCanvasObject = useCallback((node, ctx, globalScale) => {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return
    const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
    const snap = snapshots[epochInt] || snapshots[0]
    const communityId = snap?.node_predictions?.[node.id] ?? 0, isBridge = snap?.bridge_nodes?.[node.id] || false
    const color = COMMUNITY_COLORS[communityId % COMMUNITY_COLORS.length], size = Math.sqrt(node.degree || 1) * 2 + 5
    
    if (isBridge) {
        const pulse = (Math.sin(Date.now() / 300) + 1) * 2; ctx.beginPath(); ctx.arc(node.x, node.y, size + 4 + pulse, 0, 2 * Math.PI)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'; ctx.fill(); ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 + pulse/10})`; ctx.lineWidth = 1/globalScale; ctx.stroke()
    }
    
    const grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, size)
    grad.addColorStop(0, '#fff'); grad.addColorStop(0.2, color); grad.addColorStop(1, 'rgba(0,0,0,0.2)')
    ctx.beginPath(); ctx.arc(node.x, node.y, size, 0, 2 * Math.PI); ctx.fillStyle = grad; ctx.fill()
    
    // Render Node ID Label
    ctx.fillStyle = '#fff'
    ctx.font = `bold ${Math.max(6, 10/globalScale)}px Inter, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${node.id}`, node.x, node.y)
  }, [snapshots, currentEpochFloat])

  const drawBefore = useCallback((ctx, globalScale) => {
    communityHulls.forEach(hull => {
      const color = COMMUNITY_COLORS[hull.cid % COMMUNITY_COLORS.length]; ctx.beginPath(); ctx.moveTo(hull.path[0][0], hull.path[0][1])
      for (let i = 1; i < hull.path.length; i++) ctx.lineTo(hull.path[i][0], hull.path[i][1])
      ctx.closePath(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = `${color}44`; ctx.lineWidth = 40 / globalScale; ctx.stroke(); ctx.fillStyle = `${color}11`; ctx.fill()
    })
  }, [communityHulls])

  if (!graphData) return null
  const snapshot = snapshots[Math.floor(currentEpochFloat)], modularityQ = snapshot?.modularity_q || 0

  return (
    <div className="relative flex flex-col h-full bg-slate-950 overflow-hidden rounded-xl border border-white/5">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900/60 backdrop-blur-xl border-b border-white/5 z-20">
        <div className="flex flex-col"><h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_#6366f1]" />Community Islands</h3><div className="text-[8px] text-slate-500 font-bold uppercase mt-0.5">Detecting structural clusters via Modularity</div></div>
        <div className="flex items-center gap-6">
          <button onClick={handleReset} className="w-6 h-6 flex items-center justify-center rounded bg-slate-800/50 text-slate-500 hover:text-white transition-all border border-slate-700/50 text-[10px]">⟳</button>
          <div className="flex flex-col items-end"><span className="text-[8px] text-slate-500 uppercase font-black tracking-widest leading-none mb-1">Q-Score</span><div className="flex items-baseline gap-1.5"><span className={`text-xl font-black font-mono tracking-tighter ${modularityQ > 0.4 ? 'text-green-400' : 'text-amber-400'}`}>{modularityQ.toFixed(3)}</span><div className="w-16 h-1 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-indigo-500 shadow-[0_0_8px_#6366f1]" style={{ width: `${modularityQ * 100}%` }} /></div></div></div>
        </div>
      </div>
      <div ref={graphParentRef} className="flex-1 relative min-h-0">
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          width={dims.width}
          height={dims.height}
          nodeCanvasObject={nodeCanvasObject}
          nodeCanvasObjectMode={() => 'replace'}
          onRenderFramePre={drawBefore}
          linkColor={(link) => { const snap = snapshots[Math.floor(currentEpochFloat)] || snapshots[0]; if (!snap) return 'rgba(148,163,184,0.05)'; const srcComm = snap.node_predictions?.[link.source.id], tgtComm = snap.node_predictions?.[link.target.id]; return srcComm === tgtComm ? `${COMMUNITY_COLORS[srcComm % COMMUNITY_COLORS.length]}33` : 'rgba(148, 163, 184, 0.05)' }}
          linkWidth={(link) => { const snap = snapshots[Math.floor(currentEpochFloat)] || snapshots[0]; if (!snap) return 0.5; const srcComm = snap.node_predictions?.[link.source.id], tgtComm = snap.node_predictions?.[link.target.id]; return srcComm === tgtComm ? 1.5 : 0.5 }}
          cooldownTicks={100}
          backgroundColor="transparent"
          enableNodeDrag={true}
        />
        <div className="absolute bottom-4 left-4 bg-slate-950/60 backdrop-blur-md rounded-xl p-3 border border-white/5 z-10 pointer-events-none transition-all"><div className="flex items-center gap-4">{COMMUNITY_COLORS.slice(0, 6).map((c, i) => (<div key={i} className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c, boxShadow: `0 0 6px ${c}88` }} /><span className="text-[7px] text-slate-500 font-black font-mono">Island_{i}</span></div>))}<div className="h-4 w-px bg-white/10 mx-1" /><div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full border border-white bg-white/10 animate-pulse" /><span className="text-[7px] text-slate-300 font-black uppercase tracking-tight">Bridge</span></div></div></div>
      </div>
    </div>
  )
}
