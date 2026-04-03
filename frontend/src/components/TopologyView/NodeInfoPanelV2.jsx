import { useMemo } from 'react'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { CLASS_COLORS, CLASS_NAMES } from '../../utils/colors'

const resolveId = (value) => (typeof value === 'object' && value !== null ? value.id : value)

export default function NodeInfoPanelV2() {
  const selectedNodeId = useGNNStore((s) => s.selectedNodeId)
  const groundTruth = useGNNStore((s) => s.groundTruth)
  const graphData = useGNNStore((s) => s.graphData)
  const selectedModel = useGNNStore((s) => s.selectedModel)
  const setSelectedNode = useGNNStore((s) => s.setSelectedNode)
  const { snapshots, currentEpochFloat } = usePlayerStore()

  const currentEpoch = Math.floor(currentEpochFloat)
  const snapshot = snapshots[currentEpoch]

  const probs = useMemo(() => {
    if (selectedNodeId === null || !snapshot?.node_predictions) return null
    const pred = snapshot.node_predictions[selectedNodeId]
    if (pred === undefined) return null
    const classCount = CLASS_COLORS.length
    const values = Array.from({ length: classCount }, (_, idx) => (idx === pred ? 0.68 : 0.32 / Math.max(1, classCount - 1)))
    return values
  }, [selectedNodeId, snapshot])

  const topNeighbors = useMemo(() => {
    if (selectedNodeId === null || !graphData) return []
    const neighbors = []
    graphData.links.forEach((link, idx) => {
      const src = resolveId(link.source)
      const tgt = resolveId(link.target)
      if (src === selectedNodeId) {
        neighbors.push({ id: tgt, weight: snapshot?.attention_weights?.[idx] ?? 0 })
      }
      if (tgt === selectedNodeId) {
        neighbors.push({ id: src, weight: snapshot?.attention_weights?.[idx] ?? 0 })
      }
    })
    return neighbors.sort((a, b) => b.weight - a.weight).slice(0, 8)
  }, [selectedNodeId, graphData, snapshot])

  if (selectedNodeId === null || !snapshot || !groundTruth) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center text-slate-500">
        <div className="mb-3 text-3xl opacity-50">◎</div>
        <p className="text-sm leading-6">Bấm vào một nút ở đồ thị để xem thông tin chi tiết.</p>
      </div>
    )
  }

  const gt = groundTruth[selectedNodeId]
  const pred = snapshot.node_predictions[selectedNodeId]
  const node = graphData?.nodes?.find((item) => item.id === selectedNodeId)
  const isCorrect = gt === pred

  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Nút đang chọn</div>
          <h3 className="text-lg font-semibold text-white">Nút #{selectedNodeId}</h3>
        </div>
        <button
          onClick={() => setSelectedNode(null)}
          className="rounded-xl border border-slate-700/50 bg-slate-900/70 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
        >
          Bỏ chọn
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-700/40 bg-slate-900/70 p-4">
          <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">Nhãn thật</div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: CLASS_COLORS[gt] }} />
            <span className="text-sm text-slate-100">{CLASS_NAMES[gt] || `Lớp ${gt}`}</span>
          </div>
        </div>
        <div className={`rounded-2xl border p-4 ${isCorrect ? 'border-emerald-500/30 bg-emerald-500/8' : 'border-red-500/30 bg-red-500/8'}`}>
          <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">Dự đoán hiện tại</div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: CLASS_COLORS[pred] }} />
            <span className={`text-sm ${isCorrect ? 'text-emerald-300' : 'text-red-300'}`}>
              {CLASS_NAMES[pred] || `Lớp ${pred}`} {isCorrect ? 'đúng' : 'sai'}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-700/40 bg-slate-900/70 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Bậc nút</div>
          <div className="mt-1 text-lg font-semibold text-white">{node?.degree || 0}</div>
        </div>
        <div className="rounded-2xl border border-slate-700/40 bg-slate-900/70 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Tập dữ liệu</div>
          <div className="mt-1 text-lg font-semibold text-white">{node?.inTrainSet ? 'Train' : 'Kiểm tra'}</div>
        </div>
        <div className="rounded-2xl border border-slate-700/40 bg-slate-900/70 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Epoch</div>
          <div className="mt-1 text-lg font-semibold text-white">{currentEpoch}</div>
        </div>
      </div>

      {probs && (
        <div className="mt-4 rounded-2xl border border-slate-700/40 bg-slate-900/70 p-4">
          <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-slate-500">Phân bố xác suất</div>
          <div className="space-y-2">
            {probs.map((value, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <span className="w-12 text-slate-400">{`Lớp ${idx}`}</span>
                <div className="h-2 flex-1 rounded-full bg-slate-800">
                  <div className="h-full rounded-full" style={{ width: `${value * 100}%`, backgroundColor: CLASS_COLORS[idx] }} />
                </div>
                <span className="w-12 text-right font-mono text-slate-300">{(value * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-slate-700/40 bg-slate-900/70 p-4">
        <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-slate-500">
          {selectedModel === 'GAT' ? 'Hàng xóm được chú ý nhiều nhất' : 'Các nút lân cận'}
        </div>
        {topNeighbors.length === 0 ? (
          <div className="text-sm text-slate-500">Chưa có dữ liệu hàng xóm để hiển thị.</div>
        ) : (
          <div className="space-y-2">
            {topNeighbors.map((neighbor) => {
              const neighborClass = groundTruth?.[neighbor.id]
              const neighborColor = neighborClass !== undefined ? CLASS_COLORS[neighborClass] : '#64748b'
              const neighborPred = snapshot?.node_predictions?.[neighbor.id]
              const neighborCorrect = neighborClass !== undefined && neighborClass === neighborPred
              return (
                <button
                  key={neighbor.id}
                  onClick={() => setSelectedNode(neighbor.id)}
                  className="flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-all hover:scale-[1.01] hover:shadow-md"
                  style={{
                    borderColor: `${neighborColor}30`,
                    backgroundColor: `${neighborColor}0A`,
                  }}
                >
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm"
                    style={{ backgroundColor: neighborColor }}
                  >
                    {neighbor.id}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-200">Nút {neighbor.id}</span>
                      {neighborClass !== undefined && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ backgroundColor: `${neighborColor}20`, color: neighborColor }}>
                          {CLASS_NAMES[neighborClass] || `Lớp ${neighborClass}`}
                        </span>
                      )}
                    </div>
                    {selectedModel === 'GAT' && (
                      <div className="mt-1.5 h-1.5 rounded-full bg-slate-800">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(6, neighbor.weight * 100)}%`, backgroundColor: neighborColor }} />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {neighborCorrect !== undefined && (
                      <span className={`text-[10px] ${neighborCorrect ? 'text-emerald-400' : 'text-red-400'}`}>
                        {neighborCorrect ? '✓' : '✗'}
                      </span>
                    )}
                    {selectedModel === 'GAT' && <span className="text-xs font-mono" style={{ color: neighborColor }}>{(neighbor.weight * 100).toFixed(1)}%</span>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
