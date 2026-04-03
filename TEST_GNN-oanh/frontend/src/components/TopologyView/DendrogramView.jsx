import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import usePlayerStore from '../../store/playerStore'
import useGNNStore from '../../store/useGNNStore'

const COMMUNITY_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#06b6d4', '#ec4899']

/**
 * DendrogramView — Draws a hierarchical tree (dendrogram) based on
 * community membership at the current epoch. Uses Canvas for performance.
 * Includes a K-slider to let users adjust cluster granularity visually.
 */
export default function DendrogramView() {
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const graphData = useGNNStore(s => s.graphData)
  const [numK, setNumK] = useState(4)

  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [dims, setDims] = useState({ width: 400, height: 300 })

  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]

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

  // Build dendrogram data from community predictions
  const dendroData = useMemo(() => {
    if (!snap?.node_predictions || !graphData) return null
    const preds = snap.node_predictions
    const numNodes = preds.length

    // Group nodes by community
    const communities = {}
    preds.forEach((c, i) => {
      if (!communities[c]) communities[c] = []
      communities[c].push(i)
    })

    const commIds = Object.keys(communities).sort((a, b) => a - b).slice(0, numK)
    return { communities, commIds, numNodes }
  }, [snap, graphData, numK])

  // Draw dendrogram on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !dendroData) return
    const ctx = canvas.getContext('2d')
    const { width, height } = dims
    const dpr = window.devicePixelRatio || 1

    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    const { communities, commIds } = dendroData
    const padding = { top: 40, bottom: 20, left: 20, right: 20 }
    const treeW = width - padding.left - padding.right
    const treeH = height - padding.top - padding.bottom

    // Root line at top
    const rootY = padding.top
    const rootX1 = padding.left
    const rootX2 = padding.left + treeW

    // Draw root horizontal line
    ctx.strokeStyle = '#475569'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(rootX1, rootY)
    ctx.lineTo(rootX2, rootY)
    ctx.stroke()

    // Each community gets an equal share of horizontal space
    const commWidth = treeW / Math.max(commIds.length, 1)
    const level1Y = rootY + treeH * 0.25
    const level2Y = rootY + treeH * 0.55
    const leafY = rootY + treeH * 0.85

    commIds.forEach((cid, ci) => {
      const cx = padding.left + ci * commWidth + commWidth / 2
      const color = COMMUNITY_COLORS[cid % COMMUNITY_COLORS.length]
      const nodes = communities[cid] || []

      // Vertical line from root to community level
      ctx.strokeStyle = '#334155'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(cx, rootY)
      ctx.lineTo(cx, level1Y)
      ctx.stroke()

      // Community cluster circle
      ctx.beginPath()
      ctx.arc(cx, level1Y, 8, 0, 2 * Math.PI)
      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'
      ctx.lineWidth = 1
      ctx.stroke()

      // Community label
      ctx.fillStyle = '#e2e8f0'
      ctx.font = 'bold 9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`C${cid}`, cx, level1Y - 12)

      // Node count badge
      ctx.fillStyle = '#94a3b8'
      ctx.font = '8px monospace'
      ctx.fillText(`${nodes.length} nodes`, cx, level1Y + 18)

      // Draw sub-branches to leaf nodes (show up to 8 per community)
      const displayNodes = nodes.slice(0, 8)
      const nodeSpacing = Math.min(commWidth * 0.8 / Math.max(displayNodes.length, 1), 14)
      const startX = cx - (displayNodes.length - 1) * nodeSpacing / 2

      // Vertical line to leaf level
      ctx.strokeStyle = color + '40'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx, level1Y + 8)
      ctx.lineTo(cx, level2Y)
      ctx.stroke()

      // Horizontal spread line
      if (displayNodes.length > 1) {
        const leftX = startX
        const rightX = startX + (displayNodes.length - 1) * nodeSpacing
        ctx.beginPath()
        ctx.moveTo(leftX, level2Y)
        ctx.lineTo(rightX, level2Y)
        ctx.stroke()
      }

      displayNodes.forEach((nodeId, ni) => {
        const nx = startX + ni * nodeSpacing

        // Vertical to leaf
        ctx.strokeStyle = color + '30'
        ctx.lineWidth = 0.8
        ctx.beginPath()
        ctx.moveTo(nx, level2Y)
        ctx.lineTo(nx, leafY)
        ctx.stroke()

        // Leaf node dot
        const isBridge = snap.bridge_nodes?.[nodeId]
        ctx.beginPath()
        ctx.arc(nx, leafY, isBridge ? 4 : 3, 0, 2 * Math.PI)
        ctx.fillStyle = isBridge ? '#ffffff' : color
        ctx.fill()
        if (isBridge) {
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1
          ctx.stroke()
        }
      })

      // Show excess count
      if (nodes.length > 8) {
        ctx.fillStyle = '#64748b'
        ctx.font = '7px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(`+${nodes.length - 8} more`, cx, leafY + 12)
      }
    })

    // (Title handled by PanelHeading in App.jsx)

  }, [dendroData, dims, epochInt, snap])

  if (!graphData || snapshots.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
        <div className="text-center">
          <div className="text-3xl mb-2 opacity-40">🌳</div>
          <p>Community hierarchy will appear during training</p>
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

      {/* K slider */}
      <div className="absolute bottom-3 right-3 z-10 bg-slate-900/90 backdrop-blur-md rounded-xl px-3 py-2 border border-slate-700/50">
        <div className="text-[8px] text-slate-500 uppercase tracking-wider font-bold mb-1">
          Communities K
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={2}
            max={8}
            value={numK}
            onChange={(e) => setNumK(parseInt(e.target.value))}
            className="w-20 h-1 accent-indigo-500"
          />
          <span className="text-xs font-bold text-indigo-400 font-mono w-4">{numK}</span>
        </div>
      </div>
    </div>
  )
}
