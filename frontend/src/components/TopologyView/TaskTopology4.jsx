import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { easeInOutCubic } from '../../engine/interpolate'

const COMMUNITY_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#06b6d4', '#ec4899']

export default function TaskTopology4() {
  const rawGraphData = useGNNStore(s => s.graphData)
  const { snapshots, currentEpochFloat } = usePlayerStore()
  
  const containerRef = useRef()
  const fgRef = useRef()
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 })

  // 1. Cố định cấu trúc đồ thị
  const graphData = useMemo(() => {
    if (!rawGraphData) return null
    return {
      nodes: rawGraphData.nodes.map(n => ({ ...n })),
      links: rawGraphData.links.map((l, i) => ({ ...l, _idx: i }))
    }
  }, [rawGraphData])

  // 2. Cập nhật lực cộng đồng (Island Force)
  useEffect(() => {
    if (fgRef.current && snapshots.length > 0 && graphData) {
        const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
        const snap = snapshots[epochInt]
        const preds = snap?.node_predictions || []
        
        const fg = fgRef.current
        const centers = [
            { x: -180, y: -120 }, { x: 180, y: -120 },
            { x: -180, y: 120 }, { x: 180, y: 120 },
            { x: 0, y: -180 }, { x: 0, y: 180 }
        ]

        // Cài đặt lực kéo về tâm đảo cho từng node
        fg.d3Force('community', (alpha) => {
            graphData.nodes.forEach(node => {
                const cid = preds[node.id] ?? 0
                const center = centers[cid % centers.length]
                // Apply velocity towards community center
                node.vx += (center.x - node.x) * alpha * 0.05
                node.vy += (center.y - node.y) * alpha * 0.05
            })
        })
        
        // Kích hoạt lại simulation để các node di chuyển mượt mà
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

  // 3. Hàm vẽ Node với bảo vệ tọa độ
  const nodeCanvasObject = useCallback((node, ctx, globalScale) => {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return

    const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
    const snap = snapshots[epochInt] || snapshots[0]
    const communityId = snap?.node_predictions?.[node.id] ?? 0
    const isBridge = snap?.bridge_nodes?.[node.id] || false
    
    const color = COMMUNITY_COLORS[communityId % COMMUNITY_COLORS.length]
    const size = Math.sqrt(node.degree || 1) * 1.5 + 4

    // Bridge Highlight
    if (isBridge) {
        ctx.beginPath()
        ctx.arc(node.x, node.y, size + 4, 0, 2 * Math.PI)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
        ctx.lineWidth = 1.5 / globalScale
        ctx.stroke()
    }

    // Node Core
    ctx.beginPath()
    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI)
    ctx.fillStyle = color
    ctx.fill()
    
    // Inner Light
    try {
        const grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, size)
        grad.addColorStop(0, 'rgba(255,255,255,0.3)')
        grad.addColorStop(1, 'transparent')
        ctx.fillStyle = grad
        ctx.fill()
    } catch(e) {}

  }, [snapshots, currentEpochFloat])

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
        linkColor={(link) => {
            const snap = snapshots[Math.floor(currentEpochFloat)] || snapshots[0]
            if (!snap) return 'rgba(148,163,184,0.05)'
            const srcComm = snap.node_predictions?.[link.source.id]
            const tgtComm = snap.node_predictions?.[link.target.id]
            return srcComm === tgtComm 
                ? `rgba(148, 163, 184, 0.22)` 
                : 'rgba(148, 163, 184, 0.03)'
        }}
        linkWidth={(link) => {
            const snap = snapshots[Math.floor(currentEpochFloat)] || snapshots[0]
            if (!snap) return 0.5
            const srcComm = snap.node_predictions?.[link.source.id]
            const tgtComm = snap.node_predictions?.[link.target.id]
            return srcComm === tgtComm ? 1.2 : 0.4
        }}
        cooldownTicks={80}
        backgroundColor="transparent"
      />

      {/* Q HUD */}
      <div className="absolute top-4 left-4 z-10">
        <div className="bg-slate-900/90 backdrop-blur-md rounded-2xl p-4 border border-slate-800 shadow-2xl min-w-[180px]">
          <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block mb-1">Modularity Q</span>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-black font-mono ${modularityQ > 0.4 ? 'text-green-400' : 'text-yellow-400'}`}>
                {modularityQ.toFixed(3)}
            </span>
            <span className="text-[10px] text-slate-600 font-bold">/ 1.0</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 mt-3 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-yellow-500 to-green-500 transition-all duration-500" 
                 style={{ width: `${modularityQ * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-slate-900/80 backdrop-blur-md rounded-xl p-3 border border-slate-800/50 z-10">
        <div className="text-[9px] text-slate-500 font-bold uppercase mb-2">Community Islands</div>
        <div className="flex gap-3 flex-wrap max-w-[200px]">
          {COMMUNITY_COLORS.slice(0, 4).map((c, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c }} />
              <span className="text-[10px] text-slate-400 font-mono">Island_{i}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-2 border-t border-slate-800 space-y-1">
            <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full border border-white bg-white/20" />
                <span className="text-[9px] text-slate-300 font-bold italic">Bridge / Gateway Node</span>
            </div>
        </div>
      </div>
    </div>
  )
}
