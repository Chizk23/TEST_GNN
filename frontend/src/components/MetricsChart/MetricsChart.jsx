import React, { useMemo } from 'react'
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, ReferenceDot, ReferenceArea
} from 'recharts'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { easeInOutCubic, lerp } from '../../engine/interpolate'

export default function MetricsChart() {
    const { snapshots, currentEpochFloat, currentEpoch } = usePlayerStore()
    const selectedModel = useGNNStore((s) => s.selectedModel)
    const selectedTask = useGNNStore((s) => s.selectedTask)
    
    const epochInt = Math.floor(currentEpochFloat)
    const t = easeInOutCubic(currentEpochFloat - epochInt)

    const { chartData, bestEpoch, tipData } = useMemo(() => {
        if (snapshots.length === 0) return { chartData: [], bestEpoch: 0, tipData: null }
        const sliced = snapshots.slice(0, currentEpoch + 2)

        let bestPrimary = -1, bestEp = 0
        const data = sliced.map((s, i) => {
            // Task 3: use AUC as primary; Task 4: use modularity_q
            const primary = selectedTask === 3 ? (s.auc || 0.5) : selectedTask === 4 ? (s.modularity_q || 0) : s.val_acc
            if (primary > bestPrimary) { bestPrimary = primary; bestEp = i }
            let sage_val_acc = null
            if (selectedModel === 'SAGE' && selectedTask !== 3 && selectedTask !== 4) {
                 let count = 0, sum = 0
                 for(let j = Math.max(0, i - 4); j <= i; j++) { sum += sliced[j].val_acc; count++ }
                 sage_val_acc = +(sum / count).toFixed(4)
            }
            return {
                epoch: s.epoch,
                train_loss: +s.train_loss.toFixed(4),
                val_loss: +s.val_loss.toFixed(4),
                train_acc: +(s.train_acc || 0).toFixed(4),
                val_acc: +(s.val_acc || 0).toFixed(4),
                auc: +((s.auc || 0.5)).toFixed(4),
                modularity_q: +((s.modularity_q || 0)).toFixed(4),
                sage_val_acc,
            }
        })
        
        let tipData = null
        if (snapshots[epochInt] && snapshots[epochInt + 1]) {
            const sA = snapshots[epochInt], sB = snapshots[epochInt + 1]
            let sA_sage = null, sB_sage = null
            if (selectedModel === 'SAGE') {
                sA_sage = data[epochInt]?.sage_val_acc || sA.val_acc
                sB_sage = data[epochInt + 1]?.sage_val_acc || sB.val_acc
            }
            tipData = {
                epoch: currentEpochFloat,
                train_loss: lerp(sA.train_loss, sB.train_loss, t),
                val_loss: lerp(sA.val_loss, sB.val_loss, t),
                train_acc: lerp(sA.train_acc || 0, sB.train_acc || 0, t),
                val_acc: lerp(sA.val_acc || 0, sB.val_acc || 0, t),
                auc: lerp(sA.auc || 0.5, sB.auc || 0.5, t),
                modularity_q: lerp(sA.modularity_q || 0, sB.modularity_q || 0, t),
                sage_val_acc: selectedModel === 'SAGE' ? lerp(sA_sage, sB_sage, t) : null
            }
        } else if (snapshots[epochInt]) {
            tipData = { ...data[epochInt], epoch: currentEpochFloat }
        }
        return { chartData: data, bestEpoch: bestEp, tipData }
    }, [snapshots, currentEpoch, currentEpochFloat, epochInt, t, selectedTask, selectedModel])

    const overfitZones = useMemo(() => {
        if (chartData.length < 3 || selectedTask === 3 || selectedTask === 4) return []
        const zones = []
        let zoneStart = null
        for (let i = 0; i < chartData.length; i++) {
            const gap = chartData[i].train_acc - chartData[i].val_acc
            if (gap > 0.1) { if (zoneStart === null) zoneStart = chartData[i].epoch }
            else { if (zoneStart !== null) { zones.push({ x1: zoneStart, x2: chartData[i - 1].epoch }); zoneStart = null } }
        }
        if (zoneStart !== null) zones.push({ x1: zoneStart, x2: chartData[chartData.length - 1].epoch })
        return zones
    }, [chartData, selectedTask])

    const taskMetaConfig = {
        3: { label: 'Link Prediction', primaryKey: 'auc', primaryColor: '#a855f7', primaryName: 'AUC-ROC', dotColor: '#a855f7', refColor: '#a855f7' },
        4: { label: 'Community Detection', primaryKey: 'modularity_q', primaryColor: '#06b6d4', primaryName: 'Modularity Q', dotColor: '#06b6d4', refColor: '#06b6d4' },
    }
    const metaConfig = taskMetaConfig[selectedTask]

    if (chartData.length === 0) {
        return (
            <div className="w-full h-full flex items-center justify-center text-slate-600 text-[10px] font-bold uppercase tracking-widest bg-slate-950/20 backdrop-blur-sm rounded-xl">
                Waiting for metrics...
            </div>
        )
    }

    // Task-specific chart for Task 3 (AUC) and Task 4 (Modularity Q)
    if (metaConfig) {
        return (
            <div className="relative flex flex-col h-full bg-slate-950/20 backdrop-blur-sm rounded-xl border border-slate-800/40 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 bg-slate-900/50 border-b border-slate-800/50 backdrop-blur-md z-20">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: metaConfig.primaryColor, boxShadow: `0 0 8px ${metaConfig.primaryColor}` }} />
                        {metaConfig.label} — {metaConfig.primaryName}
                    </h3>
                    <div className="flex gap-4">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-0.5" style={{ backgroundColor: metaConfig.primaryColor }} />
                            <span className="text-[7px] text-slate-500 font-black uppercase">{metaConfig.primaryName}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-0.5 bg-[#ef4444]" />
                            <span className="text-[7px] text-slate-500 font-black uppercase">Loss</span>
                        </div>
                    </div>
                </div>
                <div className="flex-1 p-2 pt-4">
                    <ResponsiveContainer width="100%" height="95%">
                        <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(30, 41, 59, 0.4)" />
                            <XAxis dataKey="epoch" stroke="#334155" tick={{ fill: '#475569', fontSize: 8 }} />
                            <YAxis stroke="#334155" tick={{ fill: '#475569', fontSize: 8 }} domain={[0, 'auto']} />
                            <Tooltip contentStyle={{ backgroundColor: '#0f172aE6', border: '1px solid #334155', borderRadius: '8px', fontSize: '10px', color: '#e2e8f0', backdropFilter: 'blur(8px)' }} />
                            <ReferenceLine x={bestEpoch} stroke={metaConfig.refColor} strokeDasharray="5 5" strokeWidth={1} label={{ value: 'BEST', position: 'top', fill: metaConfig.refColor, fontSize: 8, fontWeight: 'black' }} />
                            <Line isAnimationActive={false} type="monotone" dataKey="train_loss" stroke="#ef4444" strokeWidth={1.5} dot={false} name="Train Loss" />
                            <Line isAnimationActive={false} type="monotone" dataKey={metaConfig.primaryKey} stroke={metaConfig.primaryColor} strokeWidth={2.5} dot={false} name={metaConfig.primaryName} />
                            {tipData && (
                                <>
                                    <ReferenceDot x={tipData.epoch} y={tipData.train_loss} r={3} fill="#ef4444" stroke="none" />
                                    <ReferenceDot x={tipData.epoch} y={tipData[metaConfig.primaryKey]} r={4} fill={metaConfig.dotColor} stroke="#fff" strokeWidth={1.5} />
                                </>
                            )}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        )
    }

    return (
        <div className="relative flex flex-col h-full bg-slate-950/20 backdrop-blur-sm rounded-xl border border-slate-800/40 overflow-hidden">
            {/* Panel Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-slate-900/50 border-b border-slate-800/50 backdrop-blur-md z-20">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]" />
                    Learning Dynamics
                </h3>
                <div className="flex gap-4">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-0.5 bg-[#22c55e]" />
                        <span className="text-[7px] text-slate-500 font-black uppercase">Accuracy</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-0.5 bg-[#ef4444]" />
                        <span className="text-[7px] text-slate-500 font-black uppercase">Loss</span>
                    </div>
                </div>
            </div>

            <div className="flex-1 p-2 pt-4">
                <ResponsiveContainer width="100%" height="95%">
                    <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(30, 41, 59, 0.4)" />
                        <XAxis dataKey="epoch" stroke="#334155" tick={{ fill: '#475569', fontSize: 8 }} />
                        <YAxis stroke="#334155" tick={{ fill: '#475569', fontSize: 8 }} domain={[0, 'auto']} />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#0f172aE6', border: '1px solid #334155', borderRadius: '8px', fontSize: '10px', color: '#e2e8f0', backdropFilter: 'blur(8px)' }}
                        />
                        <ReferenceLine x={bestEpoch} stroke="#22c55e" strokeDasharray="5 5" strokeWidth={1} label={{ value: `BEST`, position: 'top', fill: '#22c55e', fontSize: 8, fontWeight: 'black' }} />
                        {overfitZones.map((zone, i) => (
                            <ReferenceArea key={`overfit-${i}`} x1={zone.x1} x2={zone.x2} fill="#f97316" fillOpacity={0.05} stroke="#f97316" strokeOpacity={0.2} strokeDasharray="3 3" />
                        ))}
                        <Line isAnimationActive={false} type="monotone" dataKey="train_loss" stroke="#ef4444" strokeWidth={1.5} dot={false} name="Train Loss" />
                        <Line isAnimationActive={false} type="monotone" dataKey="val_loss" stroke="#fb923c" strokeWidth={1.5} dot={false} name="Val Loss" />
                        <Line isAnimationActive={false} type="monotone" dataKey="train_acc" stroke="#22c55e" strokeWidth={1.5} dot={false} name="Train Acc" />
                        {selectedModel === 'SAGE' ? (
                            <>
                               <Line isAnimationActive={false} type="monotone" dataKey="val_acc" stroke="rgba(59,130,246,0.1)" strokeWidth={1.0} dot={false} name="Val Acc (Raw)" />
                               <Line isAnimationActive={false} type="monotone" dataKey="sage_val_acc" stroke="#f97316" strokeWidth={2.0} dot={false} name="Val Acc (5-avg)" />
                            </>
                        ) : (
                            <Line isAnimationActive={false} type="monotone" dataKey="val_acc" stroke="#3b82f6" strokeWidth={1.5} dot={false} name="Val Acc" />
                        )}
                        {tipData && (
                            <>
                                <ReferenceDot x={tipData.epoch} y={tipData.train_loss} r={3} fill="#ef4444" stroke="none" />
                                <ReferenceDot x={tipData.epoch} y={tipData.val_loss} r={3} fill="#fb923c" stroke="none" />
                                <ReferenceDot x={tipData.epoch} y={tipData.train_acc} r={3} fill="#22c55e" stroke="none" />
                                {selectedModel === 'SAGE' ? (
                                    <>
                                      <ReferenceDot x={tipData.epoch} y={tipData.val_acc} r={2} fill="rgba(59,130,246,0.2)" stroke="none" />
                                      {tipData.sage_val_acc && <ReferenceDot x={tipData.epoch} y={tipData.sage_val_acc} r={4} fill="#f97316" stroke="#fff" strokeWidth={1.5} />}
                                    </>
                                ) : (
                                    <ReferenceDot x={tipData.epoch} y={tipData.val_acc} r={3} fill="#3b82f6" stroke="none" />
                                )}
                            </>
                        )}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}
