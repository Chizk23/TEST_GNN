import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { forceCenter } from 'd3-force'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { easeInOutCubic, lerp } from '../../engine/interpolate'
import { CLASS_COLORS } from '../../utils/colors'

function getLinkColor(score) {
  if (score > 0.7) return `rgba(239, 68, 68, ${0.7 + (score - 0.7) * 1.0})`;
  if (score > 0.3) return `rgba(234, 179, 8, ${0.5 + (score - 0.3) * 1.2})`;
  return `rgba(96, 165, 250, ${0.15 + score * 0.5})`;
}

export default function TaskTopology3() {
  const rawGraphData = useGNNStore(s => s.graphData)
  const groundTruth = useGNNStore(s => s.groundTruth)
  const taskData = useGNNStore(s => s.taskData)
  const selectedModel = useGNNStore(s => s.selectedModel)
  const { snapshots, currentEpochFloat, trainingDone } = usePlayerStore()
  const selectedNodeId = useGNNStore(s => s.selectedNodeId)

  const [showNodes, setShowNodes] = useState(true)
  const [showTriangles, setShowTriangles] = useState(true)
  const [dims, setDims] = useState({ width: 600, height: 400 })
  const graphParentRef = useRef()
  const fgRef = useRef()

  const graphData = useMemo(() => {
    if (!rawGraphData) return null
    return {
      nodes: rawGraphData.nodes.map(n => ({ ...n })),
      links: rawGraphData.links.map((l, i) => ({ ...l, _idx: i }))
    }
  }, [rawGraphData])

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

  const linkCanvasObject = useCallback((link, ctx) => {
    if (!snapshots || snapshots.length === 0) return
    const testEdges = taskData?.testEdges || []
    const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
    const t = easeInOutCubic(Math.max(0, Math.min(1, currentEpochFloat - epochInt)))
    const snapA = snapshots[epochInt]
    const snapB = snapshots[epochInt + 1] || snapA
    const testIdx = testEdges.findIndex(te => (te.source === link.source.id && te.target === link.target.id) || (te.source === link.target.id && te.target === link.source.id))

    let color = 'rgba(148, 163, 184, 0.12)'; let width = 1.2; let isFuture = false
    if (testIdx !== -1) {
      const scoreA = snapA?.edge_scores?.[testIdx] || 0
      const scoreB = snapB?.edge_scores?.[testIdx] || scoreA
      let score = lerp(scoreA, scoreB, t)
      if (selectedModel === 'SAGE') {
         const noise = (Math.sin(testIdx * 10 + currentEpochFloat * 8) * 0.05) * (1 - (currentEpochFloat/snapshots.length))
         score = Math.max(0, Math.min(1, score + noise))
      }
      color = getLinkColor(score); width = 2.5 + score * 4.5
      isFuture = !testEdges[testIdx].exists && score > 0.5
    }

    ctx.beginPath()
    if (isFuture) { ctx.setLineDash([4, 4]); ctx.lineDashOffset = -(performance.now() / 40) % 10 } else ctx.setLineDash([])
    ctx.moveTo(link.source.x, link.source.y); ctx.lineTo(link.target.x, link.target.y)
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); ctx.setLineDash([])

    if (selectedModel === 'GAT' && showTriangles && testIdx !== -1) {
      const scoreA = snapA?.edge_scores?.[testIdx] || 0
      if (scoreA > 0.5 && snapA?.attention_weights) {
        const sId = link.source.id, tId = link.target.id
        const graphLinks = rawGraphData?.links || []
        const sNeighbors = new Set(), tNeighbors = new Set()
        graphLinks.forEach((gl, gi) => {
          const gs = typeof gl.source === 'object' ? gl.source.id : gl.source, gt = typeof gl.target === 'object' ? gl.target.id : gl.target
          const attn = snapA.attention_weights?.[gi] || 0
          if (attn > 0.3) { if (gs === sId) sNeighbors.add(gt); if (gt === sId) sNeighbors.add(gs); if (gs === tId) tNeighbors.add(gt); if (gt === tId) tNeighbors.add(gs) }
        });
        for (const common of sNeighbors) {
          if (tNeighbors.has(common)) {
            const fgNodes = fgRef.current?.graphData()?.nodes, cNode = fgNodes?.find(n => n.id === common)
            if (cNode && Number.isFinite(cNode.x)) {
              ctx.beginPath(); ctx.moveTo(link.source.x, link.source.y); ctx.lineTo(link.target.x, link.target.y); ctx.lineTo(cNode.x, cNode.y); ctx.closePath(); ctx.fillStyle = 'rgba(234, 179, 8, 0.06)'; ctx.fill()
            }
          }
        }
      }
    }
  }, [snapshots, currentEpochFloat, taskData, selectedModel, showTriangles, rawGraphData])

  if (!graphData) return null
  const auc = snapshots[Math.floor(currentEpochFloat)]?.auc || 0.5

  return (
    <div className="relative flex flex-col h-full bg-slate-950 overflow-hidden rounded-xl border border-white/5 shadow-2xl">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/60 backdrop-blur-xl border-b border-white/5 z-20">
        <div className="flex items-center gap-3">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
            Link Prediction
          </h3>
          <div className="h-3 w-px bg-white/10" />
          <div className="flex items-center gap-2 bg-slate-950/40 px-2 py-0.5 rounded-md border border-white/5">
             <span className="text-[8px] text-slate-500 font-black uppercase">AUC-ROC</span>
             <span className={`text-[11px] font-black font-mono ${auc > 0.7 ? 'text-green-400' : 'text-amber-400'}`}>{auc.toFixed(3)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleReset} className="w-6 h-6 flex items-center justify-center rounded bg-slate-800/50 text-slate-500 hover:text-white transition-all border border-slate-700/50 text-[10px]">⟳</button>
          {selectedModel === 'GAT' && ( <button onClick={() => setShowTriangles(!showTriangles)} className={`px-2 py-0.5 rounded text-[8px] font-black transition-all border ${showTriangles ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300' : 'text-slate-600 border-transparent'}`}>TRI</button> )}
          <button onClick={() => setShowNodes(!showNodes)} className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider transition-all border ${showNodes ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : 'text-slate-600 border-transparent'}`}>{showNodes ? 'Nodes' : 'Ghost'}</button>
        </div>
      </div>

      <div ref={graphParentRef} className="flex-1 relative min-h-0">
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          width={dims.width}
          height={dims.height}
          nodeCanvasObject={(node, ctx, globalScale) => {
            if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return
            if (!showNodes) return
            const r = Math.max(5, Math.sqrt(node.degree || 1) * 2 + 3)
            const color = CLASS_COLORS[groundTruth?.[node.id]] || '#6366f1'
            ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, 2 * Math.PI); ctx.fillStyle = color; ctx.fill()
            ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1/globalScale; ctx.stroke()
            
            // Render Node ID Label
            ctx.fillStyle = '#fff'
            ctx.font = `bold ${Math.max(6, 9/globalScale)}px Inter, sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(`${node.id}`, node.x, node.y)
          }}
          nodeCanvasObjectMode={() => 'replace'}
          linkCanvasObject={linkCanvasObject}
          linkCanvasObjectMode={() => 'replace'}
          cooldownTicks={100}
          backgroundColor="transparent"
          enableNodeDrag={true}
        />
        <div className="absolute bottom-3 left-4 bg-slate-900/60 backdrop-blur-md rounded-lg p-2 border border-white/5 z-10 pointer-events-none flex gap-4">
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-1"><div className="w-2 h-1 bg-red-500 rounded-sm" /><span className="text-[7px] text-slate-500 font-bold uppercase">POS</span></div>
             <div className="flex items-center gap-1"><div className="w-2 h-1 bg-yellow-500 rounded-sm" /><span className="text-[7px] text-slate-500 font-bold uppercase">UNC</span></div>
             <div className="flex items-center gap-1"><div className="w-2 h-1 bg-blue-400 rounded-sm" /><span className="text-[7px] text-slate-500 font-bold uppercase">NEG</span></div>
             <div className="flex items-center gap-1"><div className="w-2 border-t border-dashed border-yellow-500" /><span className="text-[7px] text-yellow-500 font-black uppercase">FUT</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}
