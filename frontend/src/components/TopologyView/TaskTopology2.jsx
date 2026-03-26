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
        <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`}>
            {links.map((link, i) => {
                const s = typeof link.source === 'object' ? link.source.id : link.source;
                const t = typeof link.target === 'object' ? link.target.id : link.target;
                const p1 = nodePos[s], p2 = nodePos[t];
                if (!p1 || !p2) return null;
                return (
                    <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} 
                          stroke="rgba(148,163,184,0.15)" strokeWidth="1" />
                );
            })}
            {nodes.map((node, i) => {
                const p = nodePos[node.id];
                if (!p) return null;
                const weight = contributions ? (contributions[i] || 0) : 0.5;
                
                // THERMAL HEATMAP LOGIC
                const nodeFill = weight > 0.8 ? '#ffffff' : weight > 0.5 ? '#f59e0b' : '#6366f1';
                const nodeSize = 2 + weight * 5;

                return (
                    <g key={node.id}>
                        {weight > 0.7 && (
                            <circle cx={p.x} cy={p.y} r={nodeSize + 3} fill="#fbbf24" opacity="0.2">
                                <animate attributeName="r" values={`${nodeSize+2};${nodeSize+6};${nodeSize+2}`} dur="2s" repeatCount="indefinite" />
                            </circle>
                        )}
                        <circle cx={p.x} cy={p.y} r={nodeSize} fill={nodeFill} />
                    </g>
                );
            })}
        </svg>
    )
}

export default function TaskTopology2() {
    const { snapshots, currentEpochFloat } = usePlayerStore()
    const taskData = useGNNStore((s) => s.taskData)
    const [selectedGraphIdx, setSelectedGraphIdx] = useState(null)
    const fgRefDetail = useRef();

    const graphs = taskData?.graphs || []
    
    // Stable graph data for the detail view to prevent jittering
    const detailGraphData = useMemo(() => {
        if (selectedGraphIdx === null || !graphs[selectedGraphIdx]) return null;
        const g = graphs[selectedGraphIdx];
        return { nodes: [...g.nodes], links: [...g.links] };
    }, [selectedGraphIdx, graphs]);

    const contributions = useMemo(() => {
        const epochInt = Math.floor(currentEpochFloat);
        return snapshots[epochInt]?.node_contributions || [];
    }, [snapshots, currentEpochFloat]);

    const predictions = useMemo(() => {
        const epochInt = Math.floor(currentEpochFloat);
        return snapshots[epochInt]?.graph_predictions || [];
    }, [snapshots, currentEpochFloat]);

    // High-performance Canvas Redraw
    const renderNodeDetail = useCallback((node, ctx, globalScale) => {
        if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;

        const graphContribs = contributions[selectedGraphIdx] || [];
        const weight = graphContribs[node.index] || 0;
        
        const color = weight > 0.8 ? '#ffffff' : weight > 0.5 ? '#f59e0b' : '#6366f1';
        const size = (4 + weight * 14) / Math.sqrt(globalScale);
        
        // 1. Bloom Layer
        try {
            const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, size * 3);
            gradient.addColorStop(0, weight > 0.5 ? `${color}66` : '#6366f122');
            gradient.addColorStop(1, 'transparent');
            ctx.beginPath();
            ctx.arc(node.x, node.y, size * 3, 0, 2 * Math.PI);
            ctx.fillStyle = gradient;
            ctx.fill();
        } catch (e) {}

        // 2. Core
        ctx.beginPath();
        ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();

        // 3. Animated Pulse Ring
        if (weight > 0.7) {
            const pulse = Math.sin(currentEpochFloat * 5 + node.id) * 2;
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = Math.max(0.5, (2 + pulse) / globalScale);
            ctx.stroke();
        }

        // 4. Node ID Label (Center of node)
        const fontSize = Math.max(8, 11 / Math.sqrt(globalScale));
        ctx.font = `bold ${fontSize}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = weight > 0.5 ? '#ffffff' : '#cbd5e1';
        ctx.fillText(`${node.id}`, node.x, node.y);
    }, [selectedGraphIdx, contributions, currentEpochFloat]);

    useEffect(() => {
        if (selectedGraphIdx !== null && fgRefDetail.current) {
            const fg = fgRefDetail.current;
            fg.d3Force('charge').strength(-70).distanceMax(250);
            fg.d3Force('link').distance(35);
            fg.d3Force('center').strength(0.15);
            fg.d3ReheatSimulation();
        }
    }, [selectedGraphIdx]);

    if (!graphs.length) return null;

    if (selectedGraphIdx !== null && detailGraphData) {
        const g = graphs[selectedGraphIdx]
        const pred = predictions[selectedGraphIdx]
        const isCorrect = pred === g.groundTruth
        return (
            <div className="w-full h-full relative bg-slate-950">
                <div className="absolute top-4 left-4 z-20 flex flex-col gap-3">
                    <button onClick={() => setSelectedGraphIdx(null)}
                            className="px-4 py-2 rounded-xl text-[11px] font-bold bg-slate-900/80 text-slate-300 hover:bg-slate-800 transition-all border border-slate-700 backdrop-blur-md">
                        ← RETURN TO LAB
                    </button>
                    
                    <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 p-4 rounded-2xl shadow-2xl min-w-[220px]">
                        <h2 className="text-xl font-bold text-white mb-1">{GRAPH_LABELS[g.groundTruth]}</h2>
                        <div className={`text-[11px] font-bold mb-4 ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                            {isCorrect ? '✓ CORRECT CLASSIFICATION' : '✗ MISCLASSIFIED'}
                        </div>

                        <div className="space-y-3">
                            <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest border-b border-slate-800 pb-1 block">
                                Top Contributors (Readout)
                            </span>
                            {(() => {
                                const contribs = contributions[selectedGraphIdx] || [];
                                const topNodes = contribs
                                    .map((val, idx) => ({ id: idx, val }))
                                    .sort((a, b) => b.val - a.val)
                                    .slice(0, 3);
                                
                                return topNodes.map((node, i) => (
                                    <div key={i} className="flex items-center justify-between group">
                                        <div className="flex items-center gap-2">
                                            <div className="w-5 h-5 rounded-full flex items-center justify-center bg-slate-800 text-[9px] font-bold text-slate-300 border border-slate-700">
                                                #{node.id}
                                            </div>
                                            <div className="h-1.5 w-16 bg-slate-800 rounded-full overflow-hidden">
                                                <div className="h-full bg-amber-500 shadow-[0_0_8px_#f59e0b]" style={{ width: `${node.val * 100}%` }} />
                                            </div>
                                        </div>
                                        <span className="text-[10px] font-mono text-amber-400 font-bold">{(node.val * 100).toFixed(1)}%</span>
                                    </div>
                                ));
                            })()}
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-5 pt-3 border-t border-slate-800/50">
                            <div className="text-center">
                                <span className="text-[8px] text-slate-500 block">NODES</span>
                                <span className="text-xs font-bold text-slate-200">{g.numNodes}</span>
                            </div>
                            <div className="text-center">
                                <span className="text-[8px] text-slate-500 block">EDGES</span>
                                <span className="text-xs font-bold text-slate-200">{g.numEdges}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <ForceGraph2D
                    ref={fgRefDetail}
                    graphData={detailGraphData}
                    nodeCanvasObject={renderNodeDetail}
                    nodeCanvasObjectMode={() => 'replace'}
                    linkColor={() => 'rgba(99, 102, 241, 0.2)'}
                    linkWidth={2}
                    linkDirectionalParticles={2}
                    linkDirectionalParticleWidth={2}
                    linkDirectionalParticleSpeed={0.006}
                    linkDirectionalParticleColor={() => '#6366f1'}
                    backgroundColor="transparent"
                    onEngineStop={() => {
                        if (fgRefDetail.current) fgRefDetail.current.zoomToFit(400, 50);
                    }}
                />
            </div>
        )
    }

    return (
        <div className="w-full h-full overflow-y-auto p-6 bg-slate-950 custom-scrollbar">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {graphs.slice(0, 50).map((g, i) => {
                    const pred = predictions[i]
                    const isCorrect = pred === g.groundTruth
                    const hasResult = pred !== undefined
                    const borderColor = hasResult ? (isCorrect ? CORRECT_COLOR : WRONG_COLOR) : '#1e293b'

                    return (
                        <div key={i} onClick={() => setSelectedGraphIdx(i)}
                             className="group relative bg-slate-900/30 rounded-2xl border-2 transition-all duration-300 cursor-pointer hover:scale-[1.05]"
                             style={{ borderColor: hasResult ? borderColor : '#1e293b' }}>
                            <div className="h-36 p-4">
                                <MiniGraphSVG nodes={g.nodes} links={g.links} contributions={contributions[i]} />
                            </div>
                            <div className="p-3 bg-slate-900/60 rounded-b-2xl border-t border-slate-800/30">
                                <span className="text-[10px] text-slate-200 font-black">{GRAPH_LABELS[g.groundTruth] || 'UNIT'}</span>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
