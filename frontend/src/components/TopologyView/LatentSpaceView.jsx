import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import usePlayerStore from '../../store/playerStore'

export default function LatentSpaceView() {
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]

  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const canvasParentRef = useRef(null)
  const [dims, setDims] = useState({ width: 400, height: 300 })
  const [selectedPts, setSelectedPts] = useState([])
  const [interpT, setInterpT] = useState(0.5)

  const latentPoints = snap?.latent_points || []

  useEffect(() => {
    if (!canvasParentRef.current) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      if (width > 0 && height > 0) setDims({ width, height })
    })
    ro.observe(canvasParentRef.current)
    return () => ro.disconnect()
  }, [])

  const scaleInfo = useMemo(() => {
    if (latentPoints.length === 0) return null
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    latentPoints.forEach(([x, y]) => {
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    })
    const pad = 35; const rangeX = maxX - minX || 1; const rangeY = maxY - minY || 1
    return { minX, maxX, minY, maxY, rangeX, rangeY, pad }
  }, [latentPoints])

  const toCanvas = useCallback((pt) => {
    if (!scaleInfo) return [0, 0]
    const { minX, rangeX, minY, rangeY, pad } = scaleInfo
    return [ pad + ((pt[0] - minX) / rangeX) * (dims.width - pad * 2), pad + ((pt[1] - minY) / rangeY) * (dims.height - pad * 2) ]
  }, [scaleInfo, dims])

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas || !scaleInfo) return
    const ctx = canvas.getContext('2d'), { width, height } = dims, dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr; canvas.height = height * dpr; ctx.scale(dpr, dpr); ctx.clearRect(0, 0, width, height)

    latentPoints.forEach((pt, i) => {
      const [cx, cy] = toCanvas(pt), isSelected = selectedPts.includes(i)
      if (isSelected) {
        ctx.beginPath(); ctx.arc(cx, cy, 10, 0, 2 * Math.PI); ctx.fillStyle = 'rgba(99, 102, 241, 0.15)'; ctx.fill(); ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 2; ctx.stroke()
      }
      ctx.beginPath(); ctx.arc(cx, cy, isSelected ? 5 : 3.5, 0, 2 * Math.PI); ctx.fillStyle = isSelected ? '#a5b4fc' : '#475569'; ctx.fill()
    })

    if (selectedPts.length === 2) {
      const [aIdx, bIdx] = selectedPts, [ax, ay] = toCanvas(latentPoints[aIdx]), [bx, by] = toCanvas(latentPoints[bIdx])
      ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([])
      const ix = ax + (bx - ax) * interpT, iy = ay + (by - ay) * interpT
      ctx.beginPath(); ctx.arc(ix, iy, 6, 0, 2 * Math.PI); ctx.fillStyle = '#f97316'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke()
      ctx.fillStyle = '#3b82f6'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.fillText('A', ax, ay - 14); ctx.fillText('B', bx, by - 14)
      ctx.fillStyle = '#f97316'; ctx.fillText(`z(t)`, ix, iy - 14)
    }
  }, [latentPoints, dims, selectedPts, interpT, scaleInfo, toCanvas])

  useEffect(() => { drawCanvas() }, [drawCanvas])

  const handleClick = useCallback((e) => {
    if (!scaleInfo || latentPoints.length === 0) return
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    let closestIdx = -1, closestDist = 20
    latentPoints.forEach((pt, i) => { const [cx, cy] = toCanvas(pt); const d = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2); if (d < closestDist) { closestDist = d; closestIdx = i } })
    if (closestIdx === -1) return
    setSelectedPts(prev => {
      if (prev.includes(closestIdx)) return prev.filter(x => x !== closestIdx)
      if (prev.length >= 2) return [prev[1], closestIdx]
      return [...prev, closestIdx]
    })
  }, [latentPoints, scaleInfo, toCanvas])

  if (latentPoints.length === 0) {
    return ( <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 text-[10px] font-black uppercase tracking-widest bg-slate-950/20 backdrop-blur-sm rounded-xl"><div className="text-3xl mb-4 opacity-30">🌌</div>Latent space hidden during training</div> )
  }

  return (
    <div ref={containerRef} className="relative flex flex-col h-full bg-slate-950/20 backdrop-blur-sm rounded-xl border border-slate-800/40 overflow-hidden">
        {/* Panel Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-slate-900/50 border-b border-slate-800/50 backdrop-blur-md z-20">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_#6366f1]" />
                Generator Latent Space
            </h3>
            <div className="text-[9px] font-black text-slate-500 font-mono uppercase tracking-tighter">
                EPOCH <span className="text-white">{epochInt}</span>
            </div>
        </div>

        <div ref={canvasParentRef} className="flex-1 relative min-h-0 bg-slate-950/40">
            <canvas ref={canvasRef} style={{ width: dims.width, height: dims.height, cursor: 'crosshair' }} className="w-full h-full" onClick={handleClick} />
            {selectedPts.length === 2 ? (
                <div className="absolute bottom-4 left-4 right-4 z-10 bg-slate-900/90 backdrop-blur-md rounded-2xl px-5 py-3 border border-indigo-500/20 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex items-center gap-4">
                        <span className="text-[10px] text-blue-400 font-black">START</span>
                        <input type="range" min={0} max={1} step={0.01} value={interpT} onChange={(e) => setInterpT(parseFloat(e.target.value))} className="flex-1 h-1.5 rounded-full accent-orange-500 bg-slate-800 appearance-none cursor-pointer" />
                        <span className="text-[10px] text-blue-400 font-black">END</span>
                        <div className="w-10 text-right"><span className="text-[10px] text-orange-400 font-black font-mono">{(interpT * 100).toFixed(0)}%</span></div>
                    </div>
                </div>
            ) : (
                <div className="absolute bottom-4 left-4 text-[7px] font-black text-slate-600 uppercase tracking-widest pointer-events-none bg-slate-950/40 px-3 py-1.5 rounded-full border border-white/5">
                    Click 2 points to interpolate latent vectors
                </div>
            )}
        </div>
    </div>
  )
}
