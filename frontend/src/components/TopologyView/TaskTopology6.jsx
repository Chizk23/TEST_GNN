import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import usePlayerStore from '../../store/playerStore'

const NODE_COLORS = ['#22c55e', '#ef4444', '#3b82f6', '#eab308', '#a855f7', '#06b6d4']

/**
 * MiniGraphSVG for Task 6 — with optional "grow" animation
 * Nodes & edges appear sequentially (GraphRNN-style) based on revealProgress
 */
function MiniGraphSVG({ nodes, links, size = 130, valid, revealProgress = 1 }) {
  const padding = 15
  const r = (size - padding * 2) / 2
  const cx = size / 2
  const cy = size / 2

  const nodePos = useMemo(() => {
    const pos = {}
    const n = nodes.length
    if (n === 1) { pos[nodes[0].id] = { x: cx, y: cy }; return pos }
    nodes.forEach((node, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2
      pos[node.id] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
    })
    return pos
  }, [nodes, r, cx, cy])

  const visibleNodes = Math.ceil(nodes.length * revealProgress)
  const visibleLinks = Math.ceil(links.length * revealProgress)

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`}>
      {links.slice(0, visibleLinks).map((link, i) => {
        const s = typeof link.source === 'object' ? link.source.id : link.source
        const t = typeof link.target === 'object' ? link.target.id : link.target
        if (s >= visibleNodes || t >= visibleNodes) return null
        const p1 = nodePos[s]; const p2 = nodePos[t]
        if (!p1 || !p2) return null
        return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                     stroke={valid ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)'} strokeWidth="2"
                     style={{ opacity: i / links.length < revealProgress ? 1 : 0, transition: 'opacity 0.2s' }} />
      })}
      {nodes.slice(0, visibleNodes).map((node, ni) => {
        const p = nodePos[node.id]
        if (!p) return null
        const color = NODE_COLORS[ni % NODE_COLORS.length]
        return (
          <g key={node.id}>
            {/* Glow */}
            <circle cx={p.x} cy={p.y} r={8} fill={color} opacity={0.15}
                    style={{ opacity: ni < visibleNodes ? 0.15 : 0, transition: 'opacity 0.15s' }} />
            {/* Node */}
            <circle cx={p.x} cy={p.y} r={5} fill={color} stroke="rgba(255,255,255,0.4)" strokeWidth="1"
                    style={{ opacity: ni < visibleNodes ? 1 : 0, transition: 'opacity 0.15s' }} />
            {/* ID label */}
            <text x={p.x} y={p.y + 1} textAnchor="middle" dominantBaseline="central"
                  fill="#fff" fontSize="7" fontWeight="bold" fontFamily="monospace"
                  style={{ opacity: ni < visibleNodes ? 1 : 0 }}>
              {node.id}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default function TaskTopology6() {
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]

  const [expandedGraph, setExpandedGraph] = useState(null)
  const [revealProgress, setRevealProgress] = useState(1)

  // Keep last valid graphs to prevent disappearing
  const prevGraphsRef = useRef([])
  const generatedGraphs = snap?.generated_graphs || prevGraphsRef.current || []

  useEffect(() => {
    if (snap?.generated_graphs?.length) {
      prevGraphsRef.current = snap.generated_graphs
    }
  }, [snap])

  // Grow animation: when epoch changes, animate reveal from 0 to 1
  const prevEpochRef = useRef(epochInt)
  useEffect(() => {
    if (epochInt !== prevEpochRef.current) {
      prevEpochRef.current = epochInt
      setRevealProgress(0)
      let start = performance.now()
      const duration = 600 // ms
      const animate = (now) => {
        const elapsed = now - start
        const p = Math.min(1, elapsed / duration)
        setRevealProgress(p)
        if (p < 1) requestAnimationFrame(animate)
      }
      requestAnimationFrame(animate)
    }
  }, [epochInt])

  if (!generatedGraphs.length) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-500">
        <div className="text-center">
          <div className="text-3xl mb-2">✨</div>
          <p className="text-sm">Start training for Graph Generation</p>
        </div>
      </div>
    )
  }

  const validCount = generatedGraphs.filter(g => g.valid).length

  return (
    <div className="w-full h-full overflow-auto p-3 bg-slate-950">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
          Generated Graphs — Epoch {epochInt}
        </div>
        <div className="flex gap-2 text-[10px]">
          <span className="px-2 py-0.5 rounded bg-green-900/30 text-green-400 font-bold">
            ✓ {validCount} valid
          </span>
          <span className="px-2 py-0.5 rounded bg-red-900/30 text-red-400 font-bold">
            ✗ {generatedGraphs.length - validCount} invalid
          </span>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {generatedGraphs.map((g) => (
          <button
            key={g.id}
            onClick={() => setExpandedGraph(expandedGraph === g.id ? null : g.id)}
            className={`relative rounded-xl p-2 flex flex-col items-center cursor-pointer overflow-hidden
              transition-all duration-300 border-2
              ${expandedGraph === g.id ? 'border-indigo-500/60 scale-[1.03] shadow-xl shadow-indigo-500/10' : ''}
              ${g.valid
                ? 'border-green-500/30 bg-green-900/5 hover:bg-green-900/10'
                : 'border-red-500/30 bg-red-900/5 hover:bg-red-900/10'}`}
          >
            {/* Mini graph with grow animation */}
            <div className="w-full h-[120px] pointer-events-none relative">
              <MiniGraphSVG
                nodes={g.nodes}
                links={g.links}
                size={130}
                valid={g.valid}
                revealProgress={revealProgress}
              />
            </div>

            {/* Bottom info */}
            <div className="w-full flex justify-between items-center text-[9px] mt-1 px-1">
              <span className="text-slate-400 font-mono font-bold">{g.nodes.length}n · {g.links.length}e</span>
              <span className={`font-bold ${g.valid ? 'text-green-400' : 'text-red-400'}`}>
                {g.valid ? '✓' : '✗'} {(g.score * 100).toFixed(0)}%
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Loss metrics */}
      {snap && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="bg-slate-800/40 rounded-lg px-2 py-1.5 text-center">
            <span className="text-slate-500 text-[10px] block">Recon Loss</span>
            <span className="text-orange-400 font-bold">{(snap.recon_loss || 0).toFixed(3)}</span>
          </div>
          <div className="bg-slate-800/40 rounded-lg px-2 py-1.5 text-center">
            <span className="text-slate-500 text-[10px] block">KL Loss</span>
            <span className="text-purple-400 font-bold">{(snap.kl_loss || 0).toFixed(3)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
