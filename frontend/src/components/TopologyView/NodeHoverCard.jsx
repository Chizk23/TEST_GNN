import { useEffect, useState } from 'react'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { buildHoverSummary } from '../../utils/nodeHoverSummary'

/**
 * NodeHoverCard
 * 
 * Displays task-aware hover information in a fixed card at the top-right of the canvas.
 * - Reads hoveredNodeId from store
 * - Fetches current snapshot + graphData
 * - Uses buildHoverSummary to generate task-specific content
 * - Hidden when hoveredNodeId is null
 */
export default function NodeHoverCard() {
  const selectedTask = useGNNStore((s) => s.selectedTask)
  const hoveredNodeId = useGNNStore((s) => s.hoveredNodeId)
  const selectedNodeId = useGNNStore((s) => s.selectedNodeId)
  const graphData = useGNNStore((s) => s.graphData)
  const groundTruth = useGNNStore((s) => s.groundTruth)
  
  const snapshots = usePlayerStore((s) => s.snapshots)
  const currentEpoch = usePlayerStore((s) => s.currentEpoch)

  const [summary, setSummary] = useState(null)

  // Recompute summary whenever hover state or data changes
  useEffect(() => {
    if (!hoveredNodeId && hoveredNodeId !== 0) {
      setSummary(null)
      return
    }

    // Get current snapshot
    const currentSnapshot = snapshots[currentEpoch] || null

    // Build summary
    const newSummary = buildHoverSummary(
      selectedTask,
      hoveredNodeId,
      currentSnapshot,
      graphData,
      groundTruth
    )

    setSummary(newSummary)
  }, [hoveredNodeId, selectedTask, graphData, groundTruth, snapshots, currentEpoch])

  if (!summary) return null

  // Pin selected node hint
  const isPinned = selectedNodeId === hoveredNodeId
  const pinHint = isPinned ? '📌 Pinned to Inspector' : '👁️ Hover — Click to pin'

  return (
    <div className="absolute top-4 right-4 z-40 pointer-events-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 w-80 shadow-xl">
        {/* Title */}
        <div className="text-sm font-bold text-slate-100 mb-3">
          {summary.title}
        </div>

        {/* Chips (quick fields) */}
        <div className="flex flex-wrap gap-2 mb-4">
          {summary.chips.map((chip, idx) => (
            <Chip key={idx} chip={chip} />
          ))}
        </div>

        {/* Rows (additional info) */}
        {summary.rows.length > 0 && (
          <div className="space-y-1 border-t border-slate-700 pt-2">
            {summary.rows.map((row, idx) => (
              <div key={idx} className="text-xs text-slate-400">
                <span className="text-slate-500">{row.label}</span>{' '}
                {row.value}
              </div>
            ))}
          </div>
        )}

        {/* Pin hint */}
        <div className="mt-3 text-xs text-slate-400 text-center">
          {pinHint}
        </div>
      </div>
    </div>
  )
}

/**
 * Chip component for displaying quick fields
 */
function Chip({ chip }) {
  const toneStyles = {
    neutral: 'bg-slate-700 text-slate-100',
    info: 'bg-blue-900 text-blue-100',
    success: 'bg-green-900 text-green-100',
    warning: 'bg-amber-900 text-amber-100',
    error: 'bg-red-900 text-red-100'
  }

  const style = toneStyles[chip.tone] || toneStyles.neutral

  return (
    <div className={`${style} rounded px-2 py-1 text-xs font-medium`}>
      {chip.label}
      {chip.value && <span className="text-xs opacity-80"> {chip.value}</span>}
    </div>
  )
}
