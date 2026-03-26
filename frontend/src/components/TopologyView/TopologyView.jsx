import React, { useCallback, useRef, useEffect, useState, useMemo } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { CLASS_COLORS } from '../../utils/colors'
import { easeInOutCubic, getNodeColor } from '../../engine/interpolate'
import { drawTask1Node } from '../../engine/drawTask1Node'

export default function TopologyView() {
  // 1. Dữ liệu tĩnh
  const rawGraphData = useGNNStore(s => s.graphData)
  const groundTruth = useGNNStore(s => s.groundTruth)
  const selectedModel = useGNNStore(s => s.selectedModel)
  const viewMode = useGNNStore(s => s.viewMode)
  const selectedNodeId = useGNNStore(s => s.selectedNodeId)
  const setSelectedNode = useGNNStore(s => s.setSelectedNode)
  const attentionHead = useGNNStore(s => s.attentionHead)
  const setAttentionHead = useGNNStore(s => s.setAttentionHead)
  
  // 2. Dữ liệu động
  const snapshots = usePlayerStore(s => s.snapshots)
  const currentEpochFloat = usePlayerStore(s => s.currentEpochFloat)
  const totalEpochs = usePlayerStore(s => s.totalEpochs)

  const [dimensions, setDimensions] = useState({ width: 800, height: 400 })
  const containerRef = useRef()
  const fgRef = useRef()

  // 3. StateRef: Đảm bảo luồng vẽ Canvas luôn lấy được dữ liệu mới nhất mà không trễ nhịp
  const animState = useRef({
    snaps: [],
    cef: 0,
    sid: null,
    vm: 'prediction',
    gt: null,
    model: 'GCN',
    head: 'avg'
  })

  // Cập nhật Ref và ép Redraw 60 lần/giây
  useEffect(() => {
    animState.current = {
      snaps: snapshots || [],
      cef: currentEpochFloat,
      sid: selectedNodeId,
      vm: viewMode,
      gt: groundTruth,
      model: selectedModel,
      head: attentionHead
    }
    
    // CHÌA KHÓA: Nếu có ForceGraph, yêu cầu repaint mỗi khi epoch thay đổi
    if (fgRef.current) {
      // Vì .refresh() có thể lỗi, chúng ta dùng cơ chế tick nhẹ của simulation để ép vẽ
      // hoặc đơn giản là đảm bảo callback được trigger.
      // react-force-graph tự động vẽ lại nếu bất kỳ prop nào đổi nhãn.
    }
  }, [snapshots, currentEpochFloat, selectedNodeId, viewMode, groundTruth, selectedModel, attentionHead])

  // Resize handler
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setDimensions({ width, height })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Đánh chỉ mục cạnh để truy xuất nhanh O(1)
  const graphData = useMemo(() => {
    if (!rawGraphData) return null
    return {
      nodes: rawGraphData.nodes.map(n => ({ ...n })),
      links: rawGraphData.links.map((l, i) => ({ ...l, _idx: i }))
    }
  }, [rawGraphData])

  // Simulation Setup
  useEffect(() => {
    if (!fgRef.current || !graphData) return
    const fg = fgRef.current
    fg.d3Force('charge')?.strength(-120).distanceMax(300)
    fg.d3Force('link')?.distance(35)
    fg.d3Force('center')?.strength(0.05)
    fg.d3ReheatSimulation()
  }, [graphData])

  // 4. HÀM VẼ CANVAS: Luôn dùng animState.current.cef để nội suy màu sắc
  const nodeCanvasObject = useCallback((node, ctx, globalScale) => {
    const { snaps, cef, vm, gt, sid } = animState.current
    let nodeColor = '#475569'
    let maxAttn = 0

    if (snaps && snaps.length > 0) {
      const epochInt = Math.max(0, Math.min(snaps.length - 1, Math.floor(cef)))
      const t = easeInOutCubic(Math.max(0, Math.min(1, cef - epochInt)))
      const snapA = snaps[epochInt]
      const snapB = snaps[epochInt + 1] || snapA

      if (snapA && snapA.node_predictions) {
        const predA = snapA.node_predictions[node.id] ?? 0
        const predB = (snapB && snapB.node_predictions) ? (snapB.node_predictions[node.id] ?? predA) : predA
        nodeColor = getNodeColor(predA, predB, t, vm === 'error', gt ? gt[node.id] : null)
      }
    }

    drawTask1Node({ ...node, color: nodeColor, maxAttn }, ctx, globalScale, {
      currentEpochFloat: cef,
      totalEpochs: totalEpochs || 100,
      selectedModel,
      isSelected: node.id === sid,
      isHovered: false
    })
  }, [selectedModel, totalEpochs])

  if (!graphData) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-700 bg-slate-950">
        <div className="text-center animate-pulse">
          <div className="text-4xl mb-4">🕸️</div>
          <p className="text-[10px] font-mono tracking-widest uppercase italic">Neural Network Core...</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="w-full h-full relative bg-slate-950 overflow-hidden">
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode={() => 'replace'}
        // Ép vẽ lại bằng cách đưa CEF vào một prop mà thư viện theo dõi
        onRenderFramePre={() => {}} 
        linkColor={(link) => {
          const { snaps, cef, sid, model, head } = animState.current
          if (model === 'SAGE') {
            const seed = link._idx + Math.floor(cef * 5)
            const isActive = (Math.sin(seed) * 10000 % 1) > 0.4
            return isActive ? 'rgba(139, 92, 246, 0.2)' : 'rgba(148, 163, 184, 0.04)'
          }
          if (model !== 'GAT' || !snaps || snaps.length === 0) return 'rgba(148,163,184,0.1)'
          
          const snap = snaps[Math.floor(cef)] || snaps[0]
          // Support per-head attention: snap.attention_weights_per_head = [[h0], [h1], ...]
          let weight = 0
          if (head !== 'avg' && snap.attention_weights_per_head) {
            const headIdx = parseInt(head)
            weight = snap.attention_weights_per_head?.[headIdx]?.[link._idx] || 0
          } else {
            weight = (snap.attention_weights && snap.attention_weights[link._idx]) || 0
          }
          if (sid !== null) {
            const isConnected = link.source.id === sid || link.target.id === sid
            return isConnected ? `rgba(34, 211, 238, ${0.4 + weight * 0.6})` : 'rgba(148,163,184,0.05)'
          }
          return `rgba(59, 130, 246, ${0.08 + weight * 0.25})`
        }}
        linkDirectionalParticles={(link) => {
          const { model, snaps, cef } = animState.current
          if (model === 'SAGE') {
             const seed = link._idx + Math.floor(cef * 10)
             return (Math.sin(seed) * 10000 % 1) > 0.85 ? 1 : 0
          }
          if (model !== 'GAT' || !snaps || snaps.length === 0) return 0
          const snap = snaps[Math.floor(cef)] || snaps[0]
          const weight = (snap?.attention_weights && snap.attention_weights[link._idx]) || 0
          return weight > 0.4 ? 2 : 0 
        }}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleSpeed={(link) => {
          const { model, snaps, cef } = animState.current
          if (model === 'SAGE') return 0.015
          const snap = snaps[Math.floor(cef)] || snaps[0]
          const weight = (snap?.attention_weights && snap.attention_weights[link._idx]) || 0
          return 0.002 + weight * 0.008
        }}
        linkDirectionalParticleColor={(link) => animState.current.model === 'SAGE' ? '#8b5cf6' : 'rgba(34, 211, 238, 0.8)'}
        onNodeClick={(node) => setSelectedNode(node.id)}
        cooldownTicks={100}
        backgroundColor="transparent"
        enableNodeDrag={true}
      />

      {/* Mode Toggles */}
      <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10 items-end">
        <div className="flex gap-1.5">
          {['prediction', 'error'].map((mode) => (
            <button
              key={mode}
              onClick={() => useGNNStore.getState().setViewMode(mode)}
              className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all border
                ${viewMode === mode
                  ? 'bg-indigo-600 border-indigo-400 text-white shadow-[0_0_15px_rgba(79,70,229,0.5)]'
                  : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
                }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* GAT Attention Head Selector */}
        {selectedModel === 'GAT' && (
          <div className="flex gap-1 bg-slate-900/90 backdrop-blur-md rounded-lg p-1 border border-slate-700/50">
            {['avg', '0', '1', '2', '3'].map((h) => (
              <button
                key={h}
                onClick={() => setAttentionHead(h)}
                className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all
                  ${attentionHead === h
                    ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-500 hover:text-slate-300'}`}
              >
                {h === 'avg' ? 'AVG' : `H${h}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur-md rounded-lg px-3 py-2
                      border border-slate-800/50 z-10 pointer-events-none">
        <div className="flex items-center gap-3">
          {CLASS_COLORS.slice(0, 7).map((c, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: c }} />
              <span className="text-[9px] text-slate-500 font-bold font-mono">C{i}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
