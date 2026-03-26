import React, { useRef, useEffect, useState, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { lerpColor } from '../../engine/interpolate'

const COMMUNITY_COLORS = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#06b6d4', '#f43f5e']

/**
 * TaskTopology5 — Proximity Heat View
 * Renders the original graph with edges colored by embedding proximity.
 * 
 * FIX: Uses a ref-based graphData clone so ForceGraph2D never re-initializes,
 * and preserves last-known embeddings so visuals never go blank.
 */
export default function TaskTopology5() {
  const containerRef = useRef()
  const fgRef = useRef()
  const animRef = useRef({ embeddings: null })
  const graphDataRef = useRef(null) // persisted clone
  const [dims, setDims] = useState({ width: 800, height: 400 })
  const [layoutFrozen, setLayoutFrozen] = useState(false)
  const [graphReady, setGraphReady] = useState(false)

  // Clone graphData into ref — never let it be lost
  useEffect(() => {
    const unsub = useGNNStore.subscribe((state) => {
      const gd = state.graphData
      if (gd && gd.nodes?.length > 0) {
        graphDataRef.current = {
          nodes: gd.nodes.map(n => ({ ...n })),
          links: gd.links.map(l => ({
            source: typeof l.source === 'object' ? l.source.id : l.source,
            target: typeof l.target === 'object' ? l.target.id : l.target,
          })),
        }
        setGraphReady(true)
      }
    })
    // Check immediately too
    const gd = useGNNStore.getState().graphData
    if (gd && gd.nodes?.length > 0) {
      graphDataRef.current = {
        nodes: gd.nodes.map(n => ({ ...n })),
        links: gd.links.map(l => ({
          source: typeof l.source === 'object' ? l.source.id : l.source,
          target: typeof l.target === 'object' ? l.target.id : l.target,
        })),
      }
      setGraphReady(true)
    }
    return unsub
  }, [])

  // Subscribe to player store (Zero-Render pattern)
  // Keep last-known embeddings and predictions so we never go blank
  useEffect(() => {
    const unsub = usePlayerStore.subscribe((state) => {
      const { snapshots, currentEpochFloat } = state
      const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
      const snap = snapshots[epochInt]
      if (snap?.embeddings_2d) {
        animRef.current.embeddings = snap.embeddings_2d
      }
      if (snap?.node_predictions && graphDataRef.current) {
        // Update communities in graphDataRef for node coloring
        graphDataRef.current.nodes.forEach((n, i) => {
          n.community = snap.node_predictions[i]
        })
      }
      // Only refresh if we have the graph
      if (fgRef.current && graphDataRef.current) fgRef.current.refresh()
    })
    return unsub
  }, [])

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

  // Layout freeze
  useEffect(() => {
    if (!fgRef.current || !graphReady) return
    setLayoutFrozen(false)
    const fg = fgRef.current
    fg.d3Force('charge')?.strength(-80).distanceMax(200)
    fg.d3Force('link')?.distance(30)
    fg.d3Force('center')?.strength(0.05)
    fg.d3ReheatSimulation()
  }, [graphReady])

  const handleEngineStop = useCallback(() => {
    if (layoutFrozen || !fgRef.current) return
    const nodes = fgRef.current.graphData()?.nodes
    if (nodes?.length > 0) {
      nodes.forEach(n => { n.fx = n.x; n.fy = n.y })
      setLayoutFrozen(true)
    }
  }, [layoutFrozen])

  // Link canvas — colored by embedding proximity
  const linkCanvasObject = useCallback((link, ctx) => {
    const emb = animRef.current.embeddings
    const s = link.source
    const t = link.target
    if (!Number.isFinite(s.x) || !Number.isFinite(t.x)) return

    let color = 'rgba(100,116,139,0.15)'
    let width = 1.5

    if (emb) {
      const sId = typeof s === 'object' ? s.id : s
      const tId = typeof t === 'object' ? t.id : t
      const embS = emb[sId]
      const embT = emb[tId]
      if (embS && embT && Number.isFinite(embS[0]) && Number.isFinite(embT[0])) {
        const dx = embS[0] - embT[0]
        const dy = embS[1] - embT[1]
        const dist = Math.sqrt(dx * dx + dy * dy)
        const norm = Math.min(1, dist / 8)
        color = lerpColor('#06b6d4', '#ef4444', isNaN(norm) ? 0 : norm)
        width = 1 + (1 - (isNaN(norm) ? 0 : norm)) * 4
      }
    }

    ctx.beginPath()
    ctx.moveTo(s.x, s.y)
    ctx.lineTo(t.x, t.y)
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.stroke()
  }, [])

  // Node canvas — colored by community, with ID labels
  const nodeCanvasObject = useCallback((node, ctx, globalScale) => {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return
    const degree = node.degree || 1
    const r = Math.max(6, Math.sqrt(degree) * 2 + 4)
    const comm = node.community ?? 0
    const color = COMMUNITY_COLORS[comm % COMMUNITY_COLORS.length]

    // Glow halo
    ctx.beginPath()
    ctx.arc(node.x, node.y, r + 4, 0, 2 * Math.PI)
    ctx.fillStyle = color + '20'
    ctx.fill()

    // Main circle
    ctx.beginPath()
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.lineWidth = 1.2 / globalScale
    ctx.stroke()

    // Node ID label
    const fontSize = Math.max(7, 9 / Math.sqrt(globalScale))
    ctx.font = `bold ${fontSize}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#fff'
    ctx.fillText(`${node.id}`, node.x, node.y)
  }, [])

  if (!graphReady && !graphDataRef.current) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-500">
        <div className="text-center">
          <div className="text-3xl mb-2">🧬</div>
          <p className="text-sm">Start training for Graph Embedding</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="w-full h-full relative bg-slate-950">
      <ForceGraph2D
        ref={fgRef}
        graphData={graphDataRef.current}
        width={dims.width}
        height={dims.height}
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode={() => 'replace'}
        linkCanvasObject={linkCanvasObject}
        linkCanvasObjectMode={() => 'replace'}
        onEngineStop={handleEngineStop}
        cooldownTicks={layoutFrozen ? 0 : 200}
        warmupTicks={layoutFrozen ? 0 : 50}
        d3VelocityDecay={0.4}
        backgroundColor="transparent"
        minZoom={0.5}
        maxZoom={8}
      />

      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-slate-900/90 backdrop-blur-md rounded-xl px-3 py-2 border border-slate-700/40 z-10">
        <div className="text-[8px] text-slate-500 uppercase tracking-wider font-bold mb-1.5">Embedding Proximity</div>
        <div className="flex items-center gap-1 mb-1.5">
          <span className="text-[8px] text-cyan-400 font-bold">Close</span>
          <div className="w-16 h-1.5 rounded-full bg-gradient-to-r from-cyan-500 via-yellow-500 to-red-500" />
          <span className="text-[8px] text-red-400 font-bold">Far</span>
        </div>
        <div className="flex gap-2">
          {COMMUNITY_COLORS.slice(0, 3).map((c, i) => (
            <div key={i} className="flex items-center gap-0.5 text-[8px] text-slate-400">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
              G{i}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
