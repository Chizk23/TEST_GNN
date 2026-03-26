import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { easeInOutCubic } from '../../engine/interpolate'

import { polygonHull } from 'd3-polygon'

const COMMUNITY_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#06b6d4', '#ec4899']

export default function TaskTopology4() {
  const rawGraphData = useGNNStore(s => s.graphData)
  const { snapshots, currentEpochFloat } = usePlayerStore()
  
  const containerRef = useRef()
  const fgRef = useRef()
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 })

  // 1. Fixed Graph Structure
  const graphData = useMemo(() => {
    if (!rawGraphData) return null
    return {
      nodes: rawGraphData.nodes.map(n => ({ ...n })),
      links: rawGraphData.links.map((l, i) => ({ ...l, _idx: i }))
    }
  }, [rawGraphData])

  // 2. Community Force (Island Force)
  useEffect(() => {
    if (fgRef.current && snapshots.length > 0 && graphData) {
        const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
        const snap = snapshots[epochInt]
        const preds = snap?.node_predictions || []
        
        const fg = fgRef.current
        const centers = [
            { x: -220, y: -150 }, { x: 220, y: -150 },
            { x: -220, y: 150 }, { x: 220, y: 150 },
            { x: 0, y: -250 }, { x: 0, y: 250 },
            { x: 0, y: 0 }
        ]

        fg.d3Force('community', (alpha) => {
            graphData.nodes.forEach(node => {
                const cid = preds[node.id] ?? 0
                const center = centers[cid % centers.length]
                // Apply velocity towards community center with higher strength (0.08)
                node.vx += (center.x - node.x) * alpha * 0.08
                node.vy += (center.y - node.y) * alpha * 0.08
            })
        })
        
        fg.d3Force('charge').strength(-120) // Push nodes apart within islands
        fg.d3ReheatSimulation()
    }
  }, [currentEpochFloat, snapshots, graphData])

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(([e]) => {
      if (e.contentRect.width > 0) setDimensions({ width: e.contentRect.width, height: e.contentRect.height })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // 3. Convex Hulls Calculation
  const communityHulls = useMemo(() => {
    if (snapshots.length === 0 || !graphData) return []
    const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
    const snap = snapshots[epochInt]
    const preds = snap?.node_predictions || []
    
    const communities = {}
    graphData.nodes.forEach(node => {
      const cid = preds[node.id] ?? 0
      if (!communities[cid]) communities[cid] = []
      communities[cid].push([node.x, node.y])
    })

    return Object.entries(communities).map(([cid, points]) => {
      if (points.length < 3) return null
      const hull = polygonHull(points)
      return hull ? { cid: parseInt(cid), path: hull } : null
    }).filter(Boolean)
  }, [currentEpochFloat, snapshots, graphData])

  // 4. Custom Drawing
  const nodeCanvasObject = useCallback((node, ctx, globalScale) => {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return

    const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
    const snap = snapshots[epochInt] || snapshots[0]
    const communityId = snap?.node_predictions?.[node.id] ?? 0
    const isBridge = snap?.bridge_nodes?.[node.id] || false
    
    const color = COMMUNITY_COLORS[communityId % COMMUNITY_COLORS.length]
    const size = Math.sqrt(node.degree || 1) * 2 + 5

    // Bridge Pulse Effect
    if (isBridge) {
        const pulse = (Math.sin(Date.now() / 300) + 1) * 2;
        ctx.beginPath()
        ctx.arc(node.x, node.y, size + 4 + pulse, 0, 2 * Math.PI)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
        ctx.fill()
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 + pulse/10})`
        ctx.lineWidth = 1/globalScale
        ctx.stroke()
    }

    // Node Core with Gradient
    const grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, size)
    grad.addColorStop(0, '#fff')
    grad.addColorStop(0.2, color)
    grad.addColorStop(1, 'rgba(0,0,0,0.2)')
    
    ctx.beginPath()
    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI)
    ctx.fillStyle = grad
    ctx.fill()

    // Community Label (only at higher zoom)
    if (globalScale > 2) {
        ctx.font = `bold ${10/globalScale}px Inter, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillStyle = 'white'
        ctx.fillText(`${node.id}`, node.x, node.y + size + 7/globalScale)
    }
  }, [snapshots, currentEpochFloat])

  // Drawing the Hulls (Background clouds)
  const drawBefore = useCallback((ctx, globalScale) => {
    communityHulls.forEach(hull => {
      const color = COMMUNITY_COLORS[hull.cid % COMMUNITY_COLORS.length]
      ctx.beginPath()
      ctx.moveTo(hull.path[0][0], hull.path[0][1])
      for (let i = 1; i < hull.path.length; i++) {
        ctx.lineTo(hull.path[i][0], hull.path[i][1])
      }
      ctx.closePath()
      
      // Glassy bubble effect
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.strokeStyle = `${color}44`
      ctx.lineWidth = 40 / globalScale
      ctx.stroke()
      
      ctx.fillStyle = `${color}11`
      ctx.fill()
    })
  }, [communityHulls])

  if (!graphData) return null

  const modularityQ = snapshots[Math.floor(currentEpochFloat)]?.modularity_q || 0

  return (
    <div ref={containerRef} className="w-full h-full relative bg-slate-950 overflow-hidden">
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode={() => 'replace'}
        onRenderFramePre={drawBefore}
        linkColor={(link) => {
            const snap = snapshots[Math.floor(currentEpochFloat)] || snapshots[0]
            if (!snap) return 'rgba(148,163,184,0.05)'
            const srcComm = snap.node_predictions?.[link.source.id]
            const tgtComm = snap.node_predictions?.[link.target.id]
            return srcComm === tgtComm 
                ? `${COMMUNITY_COLORS[srcComm % COMMUNITY_COLORS.length]}33` 
                : 'rgba(148, 163, 184, 0.05)'
        }}
        linkWidth={(link) => {
            const snap = snapshots[Math.floor(currentEpochFloat)] || snapshots[0]
            if (!snap) return 0.5
            const srcComm = snap.node_predictions?.[link.source.id]
            const tgtComm = snap.node_predictions?.[link.target.id]
            return srcComm === tgtComm ? 1.5 : 0.5
        }}
        cooldownTicks={100}
        backgroundColor="transparent"
      />

      {/* Q HUD */}
      <div className="absolute top-6 left-6 z-10">
        <div className="bg-slate-900/60 backdrop-blur-xl rounded-[2rem] p-6 border border-white/5 shadow-2xl min-w-[210px]">
          <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block mb-1">Detection Quality</span>
          <div className="flex items-baseline gap-2">
            <span className={`text-4xl font-black font-mono tracking-tighter ${modularityQ > 0.4 ? 'text-green-400' : 'text-amber-400'}`}>
                {modularityQ.toFixed(3)}
            </span>
            <span className="text-xs text-slate-600 font-bold uppercase">Q-Score</span>
          </div>
          <div className="w-full bg-slate-800/50 h-2 mt-4 rounded-full overflow-hidden border border-white/5">
            <div className="h-full bg-gradient-to-r from-amber-500 to-green-500 transition-all duration-700 shadow-[0_0_10px_rgba(34,197,94,0.3)]" 
                 style={{ width: `${modularityQ * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-6 left-6 bg-slate-900/40 backdrop-blur-md rounded-2xl p-4 border border-white/5 z-10">
        <div className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-3">Community Structure</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {COMMUNITY_COLORS.slice(0, 6).map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shadow-[0_0_8px] shadow-current transition-all" style={{ backgroundColor: c, color: c }} />
              <span className="text-[10px] text-slate-300 font-black font-mono uppercase tracking-tighter">Island_{i}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-white/5 space-y-2">
            <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full border border-white bg-white/10 animate-pulse" />
                <span className="text-[10px] text-slate-200 font-black uppercase italic tracking-tight">Bridge Gateway</span>
            </div>
        </div>
      </div>
    </div>
  )
}

