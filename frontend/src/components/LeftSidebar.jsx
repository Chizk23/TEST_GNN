import React, { useState } from 'react'
import useGNNStore from '../store/useGNNStore'
import usePlayerStore from '../store/playerStore'
import TaskSelectorV2 from './TaskSelectorV2'
import ModelSelectorV2 from './ModelSelectorV2'

/**
 * LeftSidebar — Vertical sidebar with:
 * 1. Task Selection (1-6 grid or list)
 * 2. Model Selection (dropdown or radio)
 * 3. Run Controls (Train, Reset, Load)
 * 4. Quick Stats (Epoch, Progress)
 * 
 * Layout: Fixed left column, task icons/buttons on top,
 * model dropdown in middle, run controls at bottom.
 */
export default function LeftSidebar() {
  const selectedTask = useGNNStore(s => s.selectedTask)
  const selectedModel = useGNNStore(s => s.selectedModel)
  const isTraining = useGNNStore(s => s.isTraining)
  const trainingProgress = useGNNStore(s => s.trainingProgress)
  
  const { currentEpochFloat } = usePlayerStore()
  const currentEpoch = Math.floor(currentEpochFloat)
  
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={`
        flex flex-col gap-4 p-4 bg-slate-900/40 border-r border-white/5
        transition-all duration-300 overflow-y-auto
        ${collapsed ? 'w-16' : 'w-64'}
      `}
      style={{ minHeight: '100vh' }}
    >
      {/* Header: Logo + Collapse Toggle */}
      <div className="flex items-center justify-between">
        {!collapsed && (
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">
            Graph Neural Network
          </h2>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg hover:bg-slate-800/50 transition-colors text-slate-500 hover:text-slate-300"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            {collapsed ? (
              <path fillRule="evenodd" d="M12 5a1 1 0 110-2 1 1 0 010 2zM7.5 5a1 1 0 110-2 1 1 0 010 2zm5 4a1 1 0 110-2 1 1 0 010 2zM7.5 9a1 1 0 110-2 1 1 0 010 2zm5 4a1 1 0 110-2 1 1 0 010 2zM7.5 13a1 1 0 110-2 1 1 0 010 2z" clipRule="evenodd" />
            ) : (
              <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            )}
          </svg>
        </button>
      </div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-slate-700 via-slate-700/40 to-transparent" />

      {/* Task Selection Section */}
      <div className="flex flex-col gap-2">
        {!collapsed && (
          <span className="text-nano uppercase font-black text-slate-500 tracking-ultra px-1">
            Task
          </span>
        )}
        <TaskSelectorV2 />
      </div>

      {/* Model Selection Section */}
      <div className="flex flex-col gap-2">
        {!collapsed && (
          <span className="text-nano uppercase font-black text-slate-500 tracking-ultra px-1">
            Model
          </span>
        )}
        <ModelSelectorV2 />
      </div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-slate-700 via-slate-700/40 to-transparent" />

      {/* Quick Stats */}
      {!collapsed && (
        <div className="flex flex-col gap-2 bg-slate-950/50 rounded-xl p-3 border border-slate-700/30">
          <div className="flex justify-between items-center">
            <span className="text-nano text-slate-500 font-black uppercase tracking-ultra">Epoch</span>
            <span className="text-sm font-mono font-bold text-cyan-400">{currentEpoch}</span>
          </div>
          {isTraining && (
            <div className="flex flex-col gap-1">
              <span className="text-nano text-slate-500 font-black uppercase tracking-ultra">Progress</span>
              <div className="w-full h-1.5 bg-slate-800/60 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-300"
                  style={{ width: `${(trainingProgress / 100) * 100}%` }}
                />
              </div>
              <span className="text-nano text-slate-600 font-mono">{trainingProgress.toFixed(0)}%</span>
            </div>
          )}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Footer: Help or Status */}
      {!collapsed && (
        <div className="text-nano text-slate-600 text-center py-3 border-t border-slate-700/30">
          <p className="leading-relaxed">
            Hover nodes on the right canvas to see details
          </p>
        </div>
      )}
    </aside>
  )
}
