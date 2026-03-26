import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { easeInOutCubic, interpolateSnapshots } from '../../engine/interpolate'

const GRAPH_LABELS = ['Dense Structure', 'Sparse Network']
const CORRECT_COLOR = '#22c55e'
const WRONG_COLOR = '#ef4444'
const FEATURE_COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#3b82f6']

function MiniGraphSVG({ nodes, links, contributions, size = 100 }) {
    const padding = 15;
    const r = (size - padding * 2) / 2;
    const cx = size / 2;
    const cy = size / 2;
    
    const nodePos = useMemo(() => {
        const pos = {};
        const n = nodes.length;
        nodes.forEach((node, i) => {
            const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
            pos[node.id] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
        });
        return pos;
    }, [nodes, r, cx, cy]);

    return (
        <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} className="drop-shadow-lg">
            {links.map((link, i) => {
                const s = typeof link.source === 'object' ? link.source.id : link.source;
                const t = typeof link.target === 'object' ? link.target.id : link.target;
                const p1 = nodePos[s], p2 = nodePos[t];
                if (!p1 || !p2) return null;
                return (
                    <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} 
                          stroke="rgba(148,163,184,0.1)" strokeWidth="0.8" />
                );
            })}
            {nodes.map((node, i) => {
                const p = nodePos[node.id];
                if (!p) return null;
                const weight = contributions ? (contributions[i] || 0) : 0.5;
                
                const nodeFill = weight > 0.8 ? '#ffffff' : weight > 0.5 ? '#f59e0b' : '#3b82f6';
                const nodeSize = 2.5 + weight * 4.5;

                return (
                    <g key={node.id}>
                        {weight > 0.7 && (
                            <circle cx={p.x} cy={p.y} r={nodeSize + 3} fill={nodeFill} opacity="0.15">
                                <animate attributeName="r" values={`${nodeSize+2};${nodeSize+5};${nodeSize+2}`} dur="2s" repeatCount="indefinite" />
                            </circle>
                        )}
                        <circle cx={p.x} cy={p.y} r={nodeSize} fill={nodeFill} className="transition-all duration-500" />
                    </g>
                );
            })}
        </svg>
    )
}

export default function TaskTopology2() {
    const { snapshots, currentEpochFloat, isPlaying } = usePlayerStore()
    const taskData = useGNNStore((s) => s.taskData)
    const [selectedGraphIdx, setSelectedGraphIdx] = useState(null)
    const fgRefDetail = useRef();

    const graphs = taskData?.graphs || []
    
    const detailGraphData = useMemo(() => {
        if (selectedGraphIdx === null || !graphs[selectedGraphIdx]) return null;
        const g = graphs[selectedGraphIdx];
        // Ensure stable refs for D3
        return { 
            nodes: g.nodes.map(n => ({ ...n })), 
            links: g.links.map(l => ({ ...l })) 
        };
    }, [selectedGraphIdx, graphs]);

    const epochInt = Math.floor(currentEpochFloat);
    const snap = snapshots[epochInt] || snapshots[snapshots.length - 1];

    const contributions = snap?.node_contributions || [];
    const predictions = snap?.graph_predictions || [];
    const confidenceScores = snap?.graph_confidences || [];

    // High-performance Canvas Redraw
    const renderNodeDetail = useCallback((node, ctx, globalScale) => {
        if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;

        const graphContribs = contributions[selectedGraphIdx] || [];
        const weight = graphContribs[node.index] || 0;
        
        const color = weight > 0.8 ? '#ffffff' : weight > 0.5 ? '#f59e0b' : '#3b82f6';
        const size = (4 + weight * 12) / Math.sqrt(globalScale);
        
        // 1. Bloom Layer
        ctx.save();
        const glowR = size * 3;
        const grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowR);
        grad.addColorStop(0, weight > 0.5 ? `${color}44` : `${color}22`);
        grad.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(node.x, node.y, glowR, 0, 2 * Math.PI);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();

        // 2. Core
        ctx.beginPath();
        ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();

        // 3. Pulse Ring for high contributors
        if (weight > 0.7) {
            const pulse = (Math.sin(Date.now() / 200 + node.id) + 1) * 1.5;
            ctx.beginPath();
            ctx.arc(node.x, node.y, size + 2 + pulse, 0, 2 * Math.PI);
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 1 / globalScale;
            ctx.stroke();
        }

        // 4. Node ID
        const fontSize = Math.max(7, 10 / Math.sqrt(globalScale));
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = weight > 0.6 ? '#0f172a' : '#fff';
        ctx.fillText(`${node.id}`, node.x, node.y);
    }, [selectedGraphIdx, contributions]);

    useEffect(() => {
        if (selectedGraphIdx !== null && fgRefDetail.current) {
            const fg = fgRefDetail.current;
            fg.d3Force('charge').strength(-100).distanceMax(250);
            fg.d3Force('link').distance(40);
            fg.d3Force('center').strength(0.1);
            fg.d3ReheatSimulation();
        }
    }, [selectedGraphIdx]);

    if (!graphs.length) return null;

    if (selectedGraphIdx !== null && detailGraphData) {
        const g = graphs[selectedGraphIdx]
        const pred = predictions[selectedGraphIdx]
        const isCorrect = pred === g.groundTruth
        const conf = confidenceScores[selectedGraphIdx] || 0.5

        return (
            <div className="w-full h-full relative bg-slate-950 overflow-hidden">
                {/* Overlay UI */}
                <div className="absolute top-4 left-4 z-20 flex flex-col gap-4 pointer-events-none">
                    <button onClick={() => setSelectedGraphIdx(null)}
                            className="pointer-events-auto px-4 py-2 rounded-xl text-[11px] font-black tracking-widest bg-slate-900/40 text-slate-300 hover:bg-slate-800/60 transition-all border border-slate-800/50 backdrop-blur-xl shadow-2xl uppercase">
                        ← Exit Analysis
                    </button>
                    
                    <div className="bg-slate-900/60 backdrop-blur-2xl border border-white/5 p-5 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] min-w-[260px]">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h2 className="text-xl font-black text-white leading-tight uppercase tracking-tight">{GRAPH_LABELS[g.groundTruth]}</h2>
                                <p className="text-[10px] text-slate-500 font-bold font-mono">ID: #{selectedGraphIdx} | {g.numNodes}n / {g.numEdges}e</p>
                            </div>
                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${isCorrect ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                                <span className="text-lg font-black">{isCorrect ? '✓' : '✗'}</span>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between items-end mb-1.5">
                                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Model Confidence</span>
                                    <span className={`text-xs font-black font-mono ${conf > 0.8 ? 'text-green-400' : 'text-amber-400'}`}>{(conf * 100).toFixed(1)}%</span>
                                </div>
                                <div className="h-2 w-full bg-slate-800/50 rounded-full overflow-hidden border border-white/5">
                                    <div className={`h-full transition-all duration-700 ${isCorrect ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${conf * 100}%` }} />
                                </div>
                            </div>

                            <div className="pt-2">
                                <span className="text-[9px] text-slate-500 uppercase font-black tracking-widest block mb-3 border-l-2 border-amber-500 pl-2">
                                    Readout Contributors
                                </span>
                                {(() => {
                                    const contribs = contributions[selectedGraphIdx] || [];
                                    const topNodes = contribs
                                        .map((val, idx) => ({ id: idx, val }))
                                        .sort((a, b) => b.val - a.val)
                                        .slice(0, 3);
                                    
                                    return topNodes.map((node, i) => (
                                        <div key={i} className="flex items-center justify-between mb-2 last:mb-0">
                                            <div className="flex items-center gap-3">
                                                <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-slate-800/80 text-[10px] font-black text-slate-100 border border-white/5">
                                                    {node.id}
                                                </div>
                                                <div className="h-1.5 w-20 bg-slate-800/50 rounded-full overflow-hidden">
                                                    <div className="h-full bg-amber-500 shadow-[0_0_10px_#f59e0b]" style={{ width: `${node.val * 100}%` }} />
                                                </div>
                                            </div>
                                            <span className="text-[10px] font-black font-mono text-amber-500">{(node.val * 100).toFixed(0)}%</span>
                                        </div>
                                    ));
                                })()}
                            </div>
                        </div>
                    </div>
                </div>

                <ForceGraph2D
                    ref={fgRefDetail}
                    graphData={detailGraphData}
                    nodeCanvasObject={renderNodeDetail}
                    nodeCanvasObjectMode={() => 'replace'}
                    linkColor={() => 'rgba(59, 130, 246, 0.15)'}
                    linkWidth={1.5}
                    backgroundColor="transparent"
                    onEngineStop={() => {
                        if (fgRefDetail.current) fgRefDetail.current.zoomToFit(400, 80);
                    }}
                />
            </div>
        )
    }

    return (
        <div className="w-full h-full overflow-y-auto p-8 bg-slate-950 custom-scrollbar">
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8 max-w-[1600px] mx-auto">
                {graphs.slice(0, 50).map((g, i) => {
                    const pred = predictions[i]
                    const conf = confidenceScores[i] || 0
                    const isCorrect = pred === g.groundTruth
                    const hasResult = pred !== undefined
                    
                    return (
                        <div key={i} onClick={() => setSelectedGraphIdx(i)}
                             className={`group relative bg-slate-900/20 backdrop-blur-md rounded-[2rem] border-2 transition-all duration-500 cursor-pointer 
                                        hover:scale-[1.04] hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)]
                                        ${hasResult 
                                            ? (isCorrect ? 'border-green-500/20 hover:border-green-500/50' : 'border-red-500/20 hover:border-red-500/50') 
                                            : 'border-white/5 hover:border-white/10'}`}>
                            
                            {/* Classification Badge */}
                            {hasResult && (
                                <div className={`absolute -top-3 -right-3 w-8 h-8 rounded-full flex items-center justify-center border-2 border-slate-950 shadow-xl z-20 
                                                ${isCorrect ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                                    <span className="text-sm font-black">{isCorrect ? '✓' : '✗'}</span>
                                </div>
                            )}

                            <div className="h-44 p-6 relative">
                                <MiniGraphSVG nodes={g.nodes} links={g.links} contributions={contributions[i]} />
                                
                                {/* Confidence Overlay on Hover */}
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/60 rounded-t-[2rem] backdrop-blur-[2px]">
                                    <div className="text-center">
                                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-tighter mb-1">Confidence</p>
                                        <p className={`text-2xl font-black font-mono ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                                            {(conf * 100).toFixed(0)}%
                                        </p>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="p-4 bg-slate-900/40 rounded-b-[2rem] border-t border-white/5 flex items-center justify-between">
                                <div className="overflow-hidden">
                                    <p className="text-[11px] text-white font-black uppercase truncate tracking-tight">{GRAPH_LABELS[g.groundTruth]}</p>
                                    <p className="text-[8px] text-slate-500 font-bold font-mono">GRAPH #{i}</p>
                                </div>
                                <div className="text-right">
                                    <span className="text-[9px] text-slate-500 font-black px-2 py-0.5 rounded-full bg-white/5 uppercase">N:{g.numNodes}</span>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

