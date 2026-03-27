import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { forceCenter } from 'd3-force'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'

const GRAPH_LABELS = ['Dense Structure', 'Sparse Network']
const FEATURE_COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#3b82f6']

function MiniGraphSVG({ nodes, links, contributions, size = 100 }) {
    const padding = 15; const r = (size - padding * 2) / 2; const cx = size / 2; const cy = size / 2;
    const nodePos = useMemo(() => {
        const pos = {}; const n = nodes.length;
        nodes.forEach((node, i) => { const angle = (i / n) * Math.PI * 2 - Math.PI / 2; pos[node.id] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }; });
        return pos;
    }, [nodes, r, cx, cy]);
    return (
        <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} className="drop-shadow-lg">
            {links.map((link, i) => {
                const s = typeof link.source === 'object' ? link.source.id : link.source, t = typeof link.target === 'object' ? link.target.id : link.target;
                const p1 = nodePos[s], p2 = nodePos[t]; if (!p1 || !p2) return null;
                return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgba(148,163,184,0.1)" strokeWidth="0.8" />
            })}
            {nodes.map((node, i) => {
                const p = nodePos[node.id]; if (!p) return null;
                const weight = contributions ? (contributions[i] || 0) : 0.5, nodeFill = weight > 0.8 ? '#ffffff' : weight > 0.5 ? '#f59e0b' : '#3b82f6', nodeSize = 2.5 + weight * 4.5;
                return (
                    <g key={node.id}>
                        {weight > 0.7 && ( <circle cx={p.x} cy={p.y} r={nodeSize + 3} fill={nodeFill} opacity="0.15"><animate attributeName="r" values={`${nodeSize+2};${nodeSize+5};${nodeSize+2}`} dur="2s" repeatCount="indefinite" /></circle> )}
                        <circle cx={p.x} cy={p.y} r={nodeSize} fill={nodeFill} className="transition-all duration-500" />
                    </g>
                );
            })}
        </svg>
    )
}

export default function TaskTopology2() {
    const { snapshots, currentEpochFloat } = usePlayerStore()
    const taskData = useGNNStore((s) => s.taskData)
    const selectedGraphId = useGNNStore((s) => s.selectedGraphId)
    const setSelectedGraph = useGNNStore((s) => s.setSelectedGraph)
    const setSelectedNode = useGNNStore((s) => s.setSelectedNode)
    const [dims, setDims] = useState({ width: 600, height: 400 })
    const graphParentRef = useRef()
    const fgRefDetail = useRef();
    const graphs = taskData?.graphs || []
    
    useEffect(() => {
        if (!graphParentRef.current) return
        const ro = new ResizeObserver(([e]) => {
            const { width, height } = e.contentRect
            if (width > 0 && height > 0) setDims({ width, height })
        })
        ro.observe(graphParentRef.current)
        return () => ro.disconnect()
    }, [selectedGraphId])

    const detailGraphData = useMemo(() => {
        if (selectedGraphId === null || !graphs[selectedGraphId]) return null;
        const g = graphs[selectedGraphId];
        return { nodes: g.nodes.map(n => ({ ...n })), links: g.links.map(l => ({ ...l })) };
    }, [selectedGraphId, graphs]);

    useEffect(() => {
        if (selectedGraphId !== null && fgRefDetail.current && detailGraphData) {
            const fg = fgRefDetail.current;
            fg.d3Force('center', forceCenter(dims.width / 2, dims.height / 2));
            fg.d3ReheatSimulation();
            setTimeout(() => fg.zoomToFit(400, 80), 100);
        }
    }, [selectedGraphId, dims.width, dims.height, detailGraphData]);

    const epochInt = Math.floor(currentEpochFloat);
    const snap = snapshots[epochInt] || snapshots[snapshots.length - 1];
    const contributions = snap?.node_contributions || [];
    const predictions = snap?.graph_predictions || [];
    const confidenceScores = snap?.graph_confidences || [];

    const renderNodeDetail = useCallback((node, ctx, globalScale) => {
        const graphContribs = contributions[selectedGraphId] || [];
        const weight = graphContribs[node.index] || 0;
        const color = weight > 0.8 ? '#ffffff' : weight > 0.5 ? '#f59e0b' : '#3b82f6';
        const size = (4 + weight * 12) / Math.sqrt(globalScale);
        ctx.beginPath(); ctx.arc(node.x, node.y, size * 2.5, 0, 2 * Math.PI); ctx.fillStyle = weight > 0.5 ? `${color}22` : `${color}11`; ctx.fill();
        ctx.beginPath();
        ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();

        // 4. Node ID Label
        const fontSize = Math.max(7, 10 / Math.sqrt(globalScale));
        ctx.font = `bold ${fontSize}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = weight > 0.6 ? '#0f172a' : '#fff';
        ctx.fillText(`${node.id}`, node.x, node.y);

        // 5. Pulse Ring for high contributors
        if (weight > 0.7) {
            const pulse = (Math.sin(Date.now() / 200 + node.id) + 1) * 1.5;
            ctx.beginPath();
            ctx.arc(node.x, node.y, size + 2 + pulse, 0, 2 * Math.PI);
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 1 / globalScale;
            ctx.stroke();
        }
    }, [selectedGraphId, contributions]);

    const handleReset = () => {
        if (fgRefDetail.current) {
            fgRefDetail.current.zoomToFit(400, 80);
        }
    }

    if (!graphs.length) return null;

    if (selectedGraphId !== null && detailGraphData) {
        const g = graphs[selectedGraphId], pred = predictions[selectedGraphId], isCorrect = pred === g.groundTruth, conf = confidenceScores[selectedGraphId] || 0.5;
        return (
            <div className="w-full h-full relative flex flex-col bg-slate-950 overflow-hidden rounded-xl border border-white/5 shadow-2xl">
                {/* Panel Header */}
                <div className="flex items-center justify-between px-4 py-2 bg-slate-900/60 backdrop-blur-xl border-b border-white/5 z-20">
                    <div className="flex items-center gap-3">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]" />
                            Graph Class Analysis
                        </h3>
                        <div className="h-3 w-px bg-white/10" />
                        <span className="text-[9px] font-black text-slate-500 font-mono uppercase">ID #{selectedGraphId}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handleReset} className="w-6 h-6 flex items-center justify-center rounded bg-slate-800/50 text-slate-500 hover:text-white transition-all border border-slate-700/50 text-[10px]">⟳</button>
                        <button onClick={() => { setSelectedGraph(null); setSelectedNode(null); }} className="px-3 py-1 bg-slate-800/50 hover:bg-slate-700/50 text-[9px] font-black text-slate-300 uppercase tracking-widest rounded-md border border-white/5 transition-all">← Back</button>
                    </div>
                </div>

                <div ref={graphParentRef} className="flex-1 relative min-h-0 cursor-move">
                    <ForceGraph2D
                        ref={fgRefDetail}
                        width={dims.width}
                        height={dims.height}
                        graphData={detailGraphData}
                        nodeCanvasObject={renderNodeDetail}
                        nodeCanvasObjectMode={() => 'replace'}
                        linkColor={() => 'rgba(59, 130, 246, 0.15)'}
                        linkWidth={1.5}
                        backgroundColor="transparent"
                        enableNodeDrag={true}
                        onNodeClick={(node) => setSelectedNode(node.id)}
                    />

                    {/* Stats Overlay */}
                    <div className="absolute top-4 left-4 z-10 pointer-events-none flex flex-col gap-3 max-h-[calc(100%-40px)]">
                        <div className="bg-slate-900/80 backdrop-blur-xl border border-white/5 p-4 rounded-2xl shadow-2xl min-w-[220px] pointer-events-auto flex flex-col overflow-hidden">
                            <div className="flex justify-between items-start mb-2">
                                <h2 className="text-sm font-black text-white uppercase tracking-tight">{GRAPH_LABELS[g.groundTruth]}</h2>
                                <div className={`px-1.5 py-0.5 rounded text-[8px] font-black ${isCorrect ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{isCorrect ? 'CORRECT' : 'WRONG'}</div>
                            </div>
                            <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
                                <div>
                                    <div className="flex justify-between text-[8px] text-slate-500 font-black uppercase mb-1"><span>Confidence</span><span>{(conf * 100).toFixed(1)}%</span></div>
                                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden self-center"><div className={`h-full ${isCorrect ? 'bg-green-500' : 'bg-amber-500'}`} style={{ width: `${conf * 100}%` }} /></div>
                                </div>

                                <div className="mt-4 flex-1 overflow-hidden flex flex-col min-h-0">
                                    <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest block mb-3 border-l-2 border-amber-500 pl-2">
                                        Node Influence (Readout Units)
                                    </span>
                                    <div className="space-y-2 overflow-y-auto pr-2 custom-scrollbar min-h-0">
                                        {(contributions[selectedGraphId] || []).map((val, idx) => (
                                            <div key={idx} className="flex items-center justify-between bg-white/5 rounded-lg p-2 border border-white/5 hover:bg-white/10 transition-colors pointer-events-auto">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-mono text-slate-400">#{idx}</span>
                                                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: val > 0.8 ? '#fff' : val > 0.5 ? '#f59e0b' : '#3b82f6' }} />
                                                </div>
                                                <span className={`text-[10px] font-black font-mono ${val > 0.5 ? 'text-amber-400' : 'text-slate-400'}`}>
                                                    {(val * 100).toFixed(1)}%
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="w-full h-full overflow-y-auto p-6 bg-slate-950/20 backdrop-blur-sm custom-scrollbar">
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 max-w-[1600px] mx-auto">
                {graphs.slice(0, 50).map((g, i) => {
                    const pred = predictions[i], conf = confidenceScores[i] || 0, isCorrect = pred === g.groundTruth, hasResult = pred !== undefined;
                    return (
                        <div key={i} onClick={() => { setSelectedGraph(i); }}
                             className={`group relative bg-slate-900/20 backdrop-blur-md rounded-[2rem] border-2 transition-all duration-300 cursor-pointer
                                ${selectedGraphId === i ? 'border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.25)] scale-[1.02]' :
                                hasResult ? (isCorrect ? 'border-green-500/10 hover:border-green-400/30' : 'border-red-500/10 hover:border-red-400/30') : 'border-white/5 hover:border-blue-500/30'}`}>
                            <div className="h-32 p-4 relative group">
                                <MiniGraphSVG nodes={g.nodes} links={g.links} contributions={contributions[i]} size={120} />
                                {/* Confidence Overlay on Hover */}
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/60 rounded-t-[2rem] backdrop-blur-[2px]">
                                    <p className={`text-xl font-black font-mono ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                                        {(conf * 100).toFixed(0)}%
                                    </p>
                                </div>
                            </div>
                            <div className="p-3 bg-slate-900/40 rounded-b-[2rem] border-t border-white/5 flex items-center justify-between">
                                <div className="overflow-hidden"><p className="text-[10px] text-white font-black uppercase truncate leading-tight tracking-tight">{GRAPH_LABELS[g.groundTruth]}</p><p className="text-[7px] text-slate-500 font-bold font-mono">ID #{i}</p></div>
                                {hasResult && <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${isCorrect ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-500'}`}>{isCorrect ? '✓' : '✗'}</div>}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
