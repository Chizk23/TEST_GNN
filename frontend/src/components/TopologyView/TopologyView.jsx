import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { forceCenter, forceManyBody, forceX, forceY, forceCollide } from 'd3-force'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { easeInOutCubic } from '../../engine/interpolate'

const CLASS_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#06b6d4', '#ec4899', '#f97316', '#10b981',
]

export default function TopologyView() {
  const { graphData: rawGraphData, viewMode, selectedModel, attentionHead, setAttentionHead, selectedNodeId, setSelectedNode, groundTruth, dataVersion } = useGNNStore()
  const { snapshots, currentEpochFloat, trainingDone } = usePlayerStore()
  
  const graphParentRef = useRef()
  const fgRef = useRef()
  const [dims, setDims] = useState({ width: 600, height: 400 })

  const animState = useRef({
    model: selectedModel, snaps: snapshots, cef: currentEpochFloat, sid: selectedNodeId, head: attentionHead, vmode: viewMode
  })

  useEffect(() => {
    animState.current = { model: selectedModel, snaps: snapshots, cef: currentEpochFloat, sid: selectedNodeId, head: attentionHead, vmode: viewMode }
  }, [selectedModel, snapshots, currentEpochFloat, selectedNodeId, attentionHead, viewMode])

  const graphData = useMemo(() => {
    if (!rawGraphData) return null
    // Deep-ish copy to prevent mutation issues, and force source/target back to IDs
    return {
      nodes: rawGraphData.nodes.map(n => ({ ...n })),
      links: rawGraphData.links.map((l, i) => ({ 
        ...l, 
        source: typeof l.source === 'object' ? l.source.id : l.source,
        target: typeof l.target === 'object' ? l.target.id : l.target,
        _idx: i 
      }))
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

  // Force Layout Tuning
  useEffect(() => {
    if (fgRef.current && graphData) {
      const fg = fgRef.current
      
      // Use the center of the current dimensions
      fg.d3Force('center', forceCenter(dims.width / 2, dims.height / 2))
      
      // Modify the EXISTING link force (don't create a new one — that causes 'node not found')
      const existingLinkForce = fg.d3Force('link')
      if (existingLinkForce) {
        existingLinkForce
          .distance(link => {
            const s = typeof link.source === 'object' ? link.source.id : link.source
            const t = typeof link.target === 'object' ? link.target.id : link.target
            const sameClass = groundTruth?.[s] === groundTruth?.[t]
            const progress = trainingDone ? 1 : Math.min(1, currentEpochFloat / (snapshots.length || 100))
            return sameClass ? 35 - (20 * progress) : 55
          })
          .strength(0.7)
      }
      
      fg.d3Force('charge', forceManyBody().strength(-150).distanceMax(300))
      fg.d3Force('collide', forceCollide(d => (selectedNodeId === d.id ? 12 : 8)))

      // Class-based positioning
      if (groundTruth && snapshots.length > 0) {
        const progress = trainingDone ? 1 : Math.min(1, currentEpochFloat / (snapshots.length || 100))
        const pullStrength = 0.08 * progress
        
        fg.d3Force('x', forceX(dims.width / 2 + 0).strength(0.02)) // gentle pull to center
        fg.d3Force('y', forceY(dims.height / 2 + 0).strength(0.02))

        // Pull same labels to "islands"
        fg.d3Force('classX', forceX(d => {
          const label = groundTruth[d.id] || 0
          const angle = (label * 2 * Math.PI) / 7
          return (dims.width / 2) + Math.cos(angle) * 160 * progress
        }).strength(pullStrength))

        fg.d3Force('classY', forceY(d => {
          const label = groundTruth[d.id] || 0
          const angle = (label * 2 * Math.PI) / 7
          return (dims.height / 2) + Math.sin(angle) * 160 * progress
        }).strength(pullStrength))
      }

      fg.d3ReheatSimulation()
    }
  }, [graphData, groundTruth, currentEpochFloat, trainingDone, snapshots.length, dims.width, dims.height])

  // Center once when data is loaded
  useEffect(() => {
    if (fgRef.current && graphData && dims.width > 0) {
        const fg = fgRef.current
        fg.d3Force('center', forceCenter(dims.width / 2, dims.height / 2))
        fg.d3ReheatSimulation()
        setTimeout(() => fg.zoomToFit(400, 100), 150)
    }
  }, [graphData, dataVersion, dims.width, dims.height])

  // Focus when training is done
  useEffect(() => {
    if (trainingDone && fgRef.current) {
        fgRef.current.zoomToFit(1000, 150)
    }
  }, [trainingDone])

  const nodeCanvasObject = (node, ctx, globalScale) => {
    const { snaps, cef, sid } = animState.current
    if (!snaps || snaps.length === 0) return
    const epochInt = Math.floor(cef)
    const snapA = snaps[epochInt]
    if (!snapA || !snapA.node_predictions) return

    const pred = snapA.node_predictions?.[node.id] ?? 0
    const isErrorMode = animState.current.vmode === 'error'
    const gt = (groundTruth && typeof groundTruth[node.id] !== 'undefined') ? groundTruth[node.id] : null
    const isCorrect = gt !== null && pred === gt
    
    let color = CLASS_COLORS[pred % CLASS_COLORS.length] || '#6366f1'
    let size = (sid !== null && sid === node.id ? 7 : 4.5) + (node.degree || 0) * 0.4

    if (isErrorMode && gt !== null) {
      if (isCorrect) { color = '#10b981'; size *= 0.8 } 
      else { color = '#ef4444'; size *= 1.2 }        
    }

    const isSelected = sid !== null && sid === node.id

    if (isSelected) {
      ctx.beginPath(); ctx.arc(node.x, node.y, size + 4, 0, 2 * Math.PI); ctx.fillStyle = 'rgba(34, 211, 238, 0.15)'; ctx.fill()
    }
    ctx.beginPath()
    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI)
    ctx.fillStyle = color
    ctx.fill()
    
    ctx.strokeStyle = isSelected ? '#fff' : 'rgba(255,255,255,0.2)'
    ctx.lineWidth = 1.2 / globalScale
    ctx.stroke()

    // Render Node ID Label
    const fontSize = isSelected ? 8 : 6.5
    ctx.font = `bold ${fontSize / globalScale}px Inter, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#fff'
    ctx.fillText(`${node.id}`, node.x, node.y)
  }

  const handleReset = () => {
    if (fgRef.current) {
        fgRef.current.centerAt(0, 0, 400)
        fgRef.current.zoom(1.5, 400)
        setTimeout(() => fgRef.current.zoomToFit(400, 100), 500)
    }
  }

  if (!graphData) return null

  return (
    <div className="relative flex flex-col h-full bg-slate-950/20 backdrop-blur-sm rounded-xl border border-slate-800/40 overflow-hidden">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/50 border-b border-slate-800/50 backdrop-blur-md z-20">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
          Topology View
        </h3>
        <div className="flex items-center gap-3">
            <button onClick={handleReset} className="w-6 h-6 flex items-center justify-center rounded bg-slate-800/50 text-slate-500 hover:text-white transition-all border border-slate-700/50 text-[10px]" title="Reset View">⟳</button>
            {selectedModel === 'GAT' && (
                <div className="flex gap-1 bg-slate-950/50 rounded-lg p-0.5 border border-slate-800/50 shadow-inner">
                {['avg', '0', '1', '2', '3'].map((h) => (
                    <button key={h} onClick={() => setAttentionHead(h)} className={`px-2 py-0.5 rounded text-[8px] font-black transition-all ${attentionHead === h ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-slate-500 hover:text-slate-300'}`}>{h === 'avg' ? 'AVG' : `H${h}`}</button>
                ))}
                </div>
            )}
            <div className="flex bg-slate-950/50 rounded-lg p-0.5 border border-slate-800/50 shadow-inner">
                {['prediction', 'error'].map((mode) => (
                <button key={mode} onClick={() => useGNNStore.getState().setViewMode(mode)} className={`px-2.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider transition-all ${viewMode === mode ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'text-slate-600 hover:text-slate-400'}`}>{mode}</button>
                ))}
            </div>
        </div>
      </div>

      <div ref={graphParentRef} className="flex-1 relative min-h-0 cursor-move">
        <ForceGraph2D
          key={dataVersion}
          ref={fgRef}
          width={dims.width}
          height={dims.height}
          graphData={graphData}
          nodeCanvasObject={nodeCanvasObject}
          nodePointerAreaPaint={(node, color, ctx) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(node.x, node.y, 8, 0, 2 * Math.PI); ctx.fill() }}
          linkCanvasObject={(link, ctx, globalScale) => {
            const { snaps, cef, sid, model, head } = animState.current
            if (!snaps || snaps.length === 0) return
            const snap = snaps[Math.floor(cef)]
            if (!snap) return
            
            const s = typeof link.source === 'object' ? link.source : { id: link.source, x: 0, y: 0 }
            const t = typeof link.target === 'object' ? link.target : { id: link.target, x: 0, y: 0 }
            
            if (!Number.isFinite(s.x) || !Number.isFinite(t.x)) return

            let weight = 0
            if (model === 'GAT' && snap.attention_weights) {
              if (head === 'avg') weight = snap.attention_weights[link._idx] || 0
              else { const hIdx = parseInt(head); weight = snap.attention_weights_per_head?.[hIdx]?.[link._idx] || snap.attention_weights[link._idx] || 0 }
            }
            const color = sid !== null ? (s.id === sid || t.id === sid ? `rgba(34, 211, 238, 0.75)` : 'rgba(148,163,184,0.08)') : `rgba(59, 130, 246, ${0.15 + weight * 0.35})`
            ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y)
            ctx.strokeStyle = color; ctx.lineWidth = (0.8 + weight * 2.5) / globalScale; ctx.stroke()
          }}
          linkDirectionalParticles={(link) => {
            const { model, snaps, cef } = animState.current
            if (model === 'SAGE') { const seed = link._idx + Math.floor(cef * 10); return (Math.sin(seed) * 10000 % 1) > 0.85 ? 1 : 0 }
            if (model !== 'GAT' || !snaps || snaps.length === 0) return 0
            const snap = snaps[Math.floor(cef)] || snaps[0]
            const weight = (snap?.attention_weights && snap.attention_weights[link._idx]) || 0
            return weight > 0.4 ? 2 : 0 
          }}
          linkDirectionalParticleWidth={1.5}
          linkDirectionalParticleSpeed={(link) => {
            const { snaps, cef } = animState.current
            const snap = snaps?.[Math.floor(cef)] || snapshots?.[0]
            const weight = (snap?.attention_weights && snap.attention_weights[link._idx]) || 0
            return 0.002 + weight * 0.008
          }}
          linkDirectionalParticleColor={(link) => animState.current.model === 'SAGE' ? '#8b5cf6' : 'rgba(34, 211, 238, 0.8)'}
          onNodeClick={(node) => setSelectedNode(node.id)}
          cooldownTicks={150}
          backgroundColor="transparent"
          enableNodeDrag={true}
          enablePanInteraction={true}
          enableZoomInteraction={true}
        />

        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-slate-900/60 backdrop-blur-md rounded-full px-4 py-1.5 border border-slate-800/40 z-10 pointer-events-none shadow-xl">
          <div className="flex items-center gap-4">
            {CLASS_COLORS.slice(0, 7).map((c, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c }} />
                <span className="text-[8px] text-slate-500 font-black font-mono">C{i}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
