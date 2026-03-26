import React, { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import usePlayerStore from '../../store/playerStore'

/**
 * StructurePreservation — Info panel for Task 5
 * Shows k-NN preservation rate and Link reconstruction AUC over epochs
 */
export default function StructurePreservation() {
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]

  const historyData = useMemo(() => {
    return snapshots.slice(0, epochInt + 1).map((s, i) => ({
      epoch: i,
      knn: (s.knn_preservation ?? 0) * 100,
      auc: (s.link_recon_auc ?? 0) * 100,
    }))
  }, [snapshots, epochInt])

  const knnVal = snap?.knn_preservation ?? 0
  const aucVal = snap?.link_recon_auc ?? 0

  if (snapshots.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 text-[10px] p-4">
        <div className="text-3xl mb-3 opacity-40 animate-pulse">📏</div>
        <p className="text-center">Structure preservation metrics<br/>will appear during training</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col p-3 text-xs overflow-auto bg-slate-950">
      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
        Structure Preservation
      </h3>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-slate-900/80 rounded-lg px-2 py-2 text-center border border-slate-800/50">
          <span className="text-[8px] text-slate-500 block uppercase tracking-wider font-bold">k-NN Pres.</span>
          <span className={`text-lg font-black font-mono ${knnVal > 0.7 ? 'text-green-400' : 'text-yellow-400'}`}>
            {(knnVal * 100).toFixed(1)}%
          </span>
        </div>
        <div className="bg-slate-900/80 rounded-lg px-2 py-2 text-center border border-slate-800/50">
          <span className="text-[8px] text-slate-500 block uppercase tracking-wider font-bold">Link AUC</span>
          <span className={`text-lg font-black font-mono ${aucVal > 0.8 ? 'text-green-400' : 'text-yellow-400'}`}>
            {(aucVal * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Charts */}
      <div className="flex-1 min-h-[120px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={historyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="epoch" tick={{ fill: '#475569', fontSize: 8 }} />
            <YAxis domain={[0, 100]} tick={{ fill: '#475569', fontSize: 8 }} unit="%" />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 10 }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(val) => `${val.toFixed(1)}%`}
            />
            <ReferenceLine y={80} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity={0.3} />
            <Line type="monotone" dataKey="knn" stroke="#3b82f6" strokeWidth={2.5} dot={false} name="k-NN Preservation" />
            <Line type="monotone" dataKey="auc" stroke="#a855f7" strokeWidth={2.5} dot={false} name="Link Recon AUC" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[8px] text-slate-600 italic mt-2">
        k-NN measures local neighborhood preservation; Link AUC measures ability to reconstruct graph edges from embeddings.
      </p>
    </div>
  )
}
