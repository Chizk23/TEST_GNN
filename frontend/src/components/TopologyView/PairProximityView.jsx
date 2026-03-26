import React, { useRef, useEffect, useState, useCallback } from 'react'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { CLASS_COLORS } from '../../utils/colors'

export default function PairProximityView() {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [dims, setDims] = useState({ width: 400, height: 300 })
  const [hoveredNode, setHoveredNode] = useState(null)
  const selectedNodeId = useGNNStore(s => s.selectedNodeId)
  const [showNegative, setShowNegative] = useState(true)
  const [showPositive, setShowPositive] = useState(true)

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0 })

  const graphDataRef = useRef(null)
  const snapshotsRef = useRef([])
  const taskDataRef = useRef(null)
  const epochRef = useRef(0)
  const [dataReady, setDataReady] = useState(false)

  useEffect(() => {
    const unsub = useGNNStore.subscribe((state) => {
      if (state.graphData?.nodes?.length > 0) {
        graphDataRef.current = state.graphData
        setDataReady(true)
      }
      if (state.taskData?.testEdges) taskDataRef.current = state.taskData
    })
    const state = useGNNStore.getState()
    if (state.graphData?.nodes?.length > 0) {
      graphDataRef.current = state.graphData
      setDataReady(true)
    }
    if (state.taskData?.testEdges) taskDataRef.current = state.taskData
    return unsub
  }, [])

  useEffect(() => {
    const unsub = usePlayerStore.subscribe((state) => {
      if (state.snapshots.length > 0) snapshotsRef.current = state.snapshots
      epochRef.current = Math.max(0, Math.min(
        snapshotsRef.current.length - 1,
        Math.floor(state.currentEpochFloat)
      ))
      drawCanvas()
    })
    return unsub
  }, [dims, hoveredNode, selectedNodeId, zoom, pan, showNegative, showPositive])

  // Auto-focus when training is done
  const trainingDone = usePlayerStore(s => s.trainingDone)
  useEffect(() => {
    if (trainingDone) {
      setZoom(1.1)
      setPan({ x: dims.width * 0.05, y: dims.height * 0.05 })
    }
  }, [trainingDone, dims.width, dims.height])

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      if (width > 0 && height > 0) setDims({ width, height })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const graphData = graphDataRef.current
    const snapshots = snapshotsRef.current
    const taskData = taskDataRef.current
    const epochInt = epochRef.current

    if (!canvas || !graphData || snapshots.length === 0) return

    const ctx = canvas.getContext('2d')
    const { width, height } = dims
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    const snap = snapshots[epochInt]
    if (!snap?.embeddings_2d) return

    const emb = snap.embeddings_2d
    const testEdges = taskData?.testEdges || []
    const scores = snap.edge_scores || []

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    emb.forEach(([x, y]) => {
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    })
    const rangeX = (maxX - minX) || 1
    const rangeY = (maxY - minY) || 1
    const pad = 40

    const sx = (x) => (pad + ((x - minX) / rangeX) * (width - pad * 2)) * zoom + pan.x
    const sy = (y) => (pad + ((y - minY) / rangeY) * (height - pad * 2)) * zoom + pan.y

    // Background grid
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.4)'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    const cx0 = sx((minX + maxX) / 2), cy0 = sy((minY + maxY) / 2)
    ctx.moveTo(cx0, 0); ctx.lineTo(cx0, height)
    ctx.moveTo(0, cy0); ctx.lineTo(width, cy0)
    ctx.stroke()

    const posEdges = testEdges.filter(e => e.exists)
    const negEdges = testEdges.filter(e => !e.exists)

    const drawEdge = (e, i) => {
      const p1 = emb[e.source], p2 = emb[e.target]
      if (!p1 || !p2) return
      const score = scores[i] ?? 0.5
      const isHov = hoveredNode === e.source || hoveredNode === e.target || selectedNodeId === e.source || selectedNodeId === e.target
      const dimmed = (hoveredNode !== null || selectedNodeId !== null) && !isHov
      ctx.beginPath(); ctx.moveTo(sx(p1[0]), sy(p1[1])); ctx.lineTo(sx(p2[0]), sy(p2[1]))
      if (e.exists) {
        ctx.strokeStyle = dimmed ? 'rgba(59, 130, 246, 0.03)' : isHov ? `rgba(96, 165, 250, 0.9)` : `rgba(59, 130, 246, ${0.12 + score * 0.3})`
        ctx.setLineDash([]); ctx.lineWidth = isHov ? 3 : 1.2 + score * 1.5
      } else {
        ctx.strokeStyle = dimmed ? 'rgba(239, 68, 68, 0.02)' : isHov ? `rgba(248, 113, 113, 0.8)` : `rgba(239, 68, 68, ${0.05 + (1 - score) * 0.15})`
        ctx.setLineDash([4, 4]); ctx.lineWidth = isHov ? 2.5 : 0.8
      }
      ctx.stroke()
      ctx.setLineDash([])

      if (isHov) {
        const mx = (sx(p1[0]) + sx(p2[0])) / 2, my = (sy(p1[1]) + sy(p2[1])) / 2
        const label = `${(score * 100).toFixed(0)}%`
        ctx.fillStyle = '#0f172aEE'; const tw = ctx.measureText(label).width + 8
        ctx.beginPath(); ctx.roundRect(mx - tw / 2, my - 9, tw, 18, 4); ctx.fill()
        ctx.fillStyle = e.exists ? '#60a5fa' : '#f87171'; ctx.font = 'bold 9px monospace'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, mx, my)
      }
    }

    if (showPositive) posEdges.forEach((e, i) => drawEdge(e, testEdges.indexOf(e)))
    if (showNegative) negEdges.forEach((e, i) => drawEdge(e, testEdges.indexOf(e)))

    emb.forEach(([x, y], i) => {
      const cx = sx(x), cy = sy(y)
      const node = graphData.nodes[i]
      const gt = node?.groundTruth ?? (i % 7)
      const color = CLASS_COLORS[gt] || '#64748b'
      const isSel = selectedNodeId === i
      const isHov = hoveredNode === i || isSel
      const isTestNode = testEdges.some(e => e.source === i || e.target === i)
      const dimmed = (hoveredNode !== null || selectedNodeId !== null) && !isHov && !isTestNode
      const r = (isHov ? 8 : isTestNode ? 5.5 : 3.5) * Math.sqrt(zoom)

      if ((isTestNode || isHov) && !dimmed) {
        ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, 2 * Math.PI); ctx.fillStyle = isHov ? 'rgba(255,255,255,0.08)' : color + '12'; ctx.fill()
      }
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.fillStyle = isTestNode ? color : '#334155'
      ctx.globalAlpha = dimmed ? 0.2 : 1; ctx.fill(); ctx.globalAlpha = 1
      if (isTestNode || isHov) {
        ctx.strokeStyle = isHov ? '#fff' : 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; ctx.stroke()
      }
      if (isTestNode || isHov || zoom > 2.5) {
        ctx.font = `bold ${isHov ? 9 : 7}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillStyle = '#fff'; ctx.globalAlpha = dimmed ? 0.2 : 1; ctx.fillText(`${i}`, cx, cy); ctx.globalAlpha = 1
      }
    })

    if (zoom !== 1) {
      ctx.fillStyle = '#475569'; ctx.font = '7px monospace'; ctx.textAlign = 'right'; ctx.fillText(`ZOOM ${zoom.toFixed(1)}X`, width - 10, height - 10)
    }
  }, [dims, hoveredNode, zoom, pan, showNegative, showPositive])

  useEffect(() => { if (dataReady) drawCanvas() }, [dataReady, drawCanvas])

  const getNodeAt = useCallback((mx, my) => {
    const emb = snapshotsRef.current[epochRef.current]?.embeddings_2d
    if (!emb) return null
    let minXv = Infinity, maxXv = -Infinity, minYv = Infinity, maxYv = -Infinity
    emb.forEach(([x, y]) => {
      if (x < minXv) minXv = x; if (x > maxXv) maxXv = x
      if (y < minYv) minYv = y; if (y > maxYv) maxYv = y
    })
    const rangeX = (maxXv - minXv) || 1, rangeY = (maxYv - minYv) || 1, pad = 40
    const { width, height } = dims
    let closestIdx = null, closestDist = 15
    emb.forEach(([x, y], i) => {
      const cx = (pad + ((x - minXv) / rangeX) * (width - pad * 2)) * zoom + pan.x
      const cy = (pad + ((y - minYv) / rangeY) * (height - pad * 2)) * zoom + pan.y
      const d = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2)
      if (d < closestDist) { closestDist = d; closestIdx = i }
    })
    return closestIdx
  }, [dims, zoom, pan])

  const handleMouseMove = useCallback((e) => {
    if (dragRef.current.dragging) {
      setPan({
        x: dragRef.current.startPanX + (e.clientX - dragRef.current.startX),
        y: dragRef.current.startPanY + (e.clientY - dragRef.current.startY),
      })
      return
    }
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    setHoveredNode(getNodeAt(e.clientX - rect.left, e.clientY - rect.top))
  }, [getNodeAt])

  const handleMouseDown = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const nodeIdx = getNodeAt(e.clientX - rect.left, e.clientY - rect.top)
    
    // Always allow dragging if not clicking specifically on a node's center hit area
    // Or just always allow it with left mouse button for simplicity
    if (e.button === 0) {
      dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, startPanX: pan.x, startPanY: pan.y }
    }
  }, [pan, getNodeAt])

  const handleMouseUp = useCallback(() => { dragRef.current.dragging = false }, [])
  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setZoom(z => Math.max(0.5, Math.min(8, z + delta)))
  }, [])

  if (!dataReady || snapshotsRef.current.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-500 text-[10px] bg-slate-950/20 backdrop-blur-sm rounded-xl">
        <p className="animate-pulse">Waiting for training snapshots...</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative flex flex-col h-full bg-slate-950/20 backdrop-blur-sm rounded-xl border border-slate-800/40 overflow-hidden">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/50 border-b border-slate-800/50 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]" />
            Pair Proximity
          </h3>
          <div className="h-3 w-px bg-white/10" />
          <span className="text-[9px] font-black text-slate-500 font-mono">
            EPOCH <span className="text-white">{epochRef.current}</span>
          </span>
        </div>
        
        <div className="flex items-center gap-2">
            <div className="flex bg-slate-950/50 rounded-lg p-0.5 border border-slate-800/50">
                <button
                onClick={() => setShowPositive(!showPositive)}
                className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase transition-all
                    ${showPositive ? 'text-blue-400' : 'text-slate-600'}`}
                >
                POS
                </button>
                <div className="w-px h-2 bg-white/10 self-center mx-1" />
                <button
                onClick={() => setShowNegative(!showNegative)}
                className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase transition-all
                    ${showNegative ? 'text-red-400' : 'text-slate-600'}`}
                >
                NEG
                </button>
            </div>
            <button
                onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}
                className="w-6 h-6 flex items-center justify-center rounded bg-slate-800/50 text-slate-400 hover:text-white transition-all border border-slate-700/50"
            >
                ⟳
            </button>
        </div>
      </div>

      <div className="flex-1 relative cursor-crosshair active:cursor-grabbing min-h-0">
        <canvas
            ref={canvasRef}
            style={{ width: dims.width, height: dims.height - 40 }}
            className="w-full h-full"
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { setHoveredNode(null); dragRef.current.dragging = false }}
            onWheel={handleWheel}
        />

        {/* Subtle Legend */}
        <div className="absolute bottom-3 left-4 flex gap-4 pointer-events-none opacity-50 hover:opacity-100 transition-opacity">
            <div className="flex items-center gap-1.5 font-mono text-[7px] font-black text-slate-500 uppercase">
                <div className="w-3 h-0.5 bg-blue-500 rounded-full" />
                Positive
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[7px] font-black text-slate-500 uppercase">
                <div className="w-3 border-t border-dashed border-red-500" />
                Negative
            </div>
        </div>

        {/* Interaction Hint */}
        <div className="absolute bottom-3 right-4 text-[7px] font-black text-slate-600 uppercase tracking-tighter pointer-events-none bg-slate-950/40 px-2 py-1 rounded">
            Drag to Pan · Scroll to Zoom
        </div>

        {/* Hovered node info */}
        {hoveredNode !== null && (
          <div className="absolute top-4 left-4 bg-slate-900/90 backdrop-blur-md rounded-lg px-3 py-2 border border-slate-700/40 z-10 shadow-2xl animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="text-[10px] text-white font-black mb-1 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                NODE {hoveredNode}
            </div>
            <div className="space-y-1">
              {(taskDataRef.current?.testEdges || []).filter(e => e.source === hoveredNode || e.target === hoveredNode).slice(0, 5).map((e, i) => (
                <div key={i} className={`text-[8px] font-mono font-bold flex items-center gap-2 ${e.exists ? 'text-blue-400' : 'text-red-400'}`}>
                  {e.exists ? '●' : '○'} → Node {e.source === hoveredNode ? e.target : e.source}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
