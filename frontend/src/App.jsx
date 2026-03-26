import { useEffect, useCallback, useState } from 'react'
import useGNNStore from './store/useGNNStore'
import usePlayerStore from './store/playerStore'
import useWebSocket from './hooks/useWebSocket'
import TopologyView from './components/TopologyView/TopologyView'
import TaskTopology2 from './components/TopologyView/TaskTopology2'
import TaskTopology3 from './components/TopologyView/TaskTopology3'
import TaskTopology4 from './components/TopologyView/TaskTopology4'
import TaskTopology5 from './components/TopologyView/TaskTopology5'
import TaskTopology6 from './components/TopologyView/TaskTopology6'
import EmbeddingView from './components/EmbeddingView/EmbeddingView'
import MetricsChart from './components/MetricsChart/MetricsChart'
import NodeInfoPanel from './components/TopologyView/NodeInfoPanel'
import Player from './components/Player/Player'
import TaskSelector from './components/TaskSelector'
import ModelSelector from './components/ModelSelector'
import TrainingControls from './components/TrainingControls'
import ConfigPanel from './components/ConfigPanel/ConfigPanel'
import InductiveDemo from './components/TopologyView/InductiveDemo'
import ExportToolbar from './components/ExportToolbar'
import ReadoutMonitor from './components/TopologyView/ReadoutMonitor'
import ROCMonitor from './components/TopologyView/ROCMonitor'
import ModularityMonitor from './components/TopologyView/ModularityMonitor'
import DendrogramView from './components/TopologyView/DendrogramView'
import EmbeddingSpaceB from './components/TopologyView/EmbeddingSpaceB'
import StructurePreservation from './components/TopologyView/StructurePreservation'
import LatentSpaceView from './components/TopologyView/LatentSpaceView'
import ValidityMonitor from './components/TopologyView/ValidityMonitor'
import PairProximityView from './components/TopologyView/PairProximityView'
import LinkMetricsPanel from './components/TopologyView/LinkMetricsPanel'
import { ErrorBoundary } from './components/ErrorBoundary'
import DataInputView from './components/UploadPanel/DataInputView'

// Route to task-specific topology component
function TopologyRouter() {
  const selectedTask = useGNNStore((s) => s.selectedTask)
  switch (selectedTask) {
    case 1: return <TopologyView />
    case 2: return <TaskTopology2 />
    case 3: return <TaskTopology3 />
    case 4: return <TaskTopology4 />
    case 5: return <TaskTopology5 />
    case 6: return <TaskTopology6 />
    default: return <TopologyView />
  }
}

// Route embedding view — task-specific views
function EmbeddingRouter() {
  const selectedTask = useGNNStore((s) => s.selectedTask)
  if (selectedTask === 3) return <PairProximityView />
  if (selectedTask === 4) return <DendrogramView />
  if (selectedTask === 5) return <EmbeddingSpaceB />
  if (selectedTask === 6) return <LatentSpaceView />
  return <EmbeddingView />
}

// Node info only for tasks with node-level data
function InfoRouter() {
  const selectedTask = useGNNStore((s) => s.selectedTask)
  if (selectedTask === 1) return <NodeInfoPanel />
  if (selectedTask === 2) return <ReadoutMonitor />
  if (selectedTask === 3) return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0"><ROCMonitor /></div>
      <div className="border-t border-slate-800/50 flex-1 min-h-0"><LinkMetricsPanel /></div>
    </div>
  )
  if (selectedTask === 4) return <ModularityMonitor />
  if (selectedTask === 5) return <StructurePreservation />
  if (selectedTask === 6) return <ValidityMonitor />
  return <NodeInfoPanel />
}


function App() {
  const mockMode = useGNNStore((s) => s.mockMode)
  const setMockMode = useGNNStore((s) => s.setMockMode)
  const setConfigOpen = useGNNStore((s) => s.setConfigOpen)
  const snapshots = usePlayerStore((s) => s.snapshots)
  const currentEpoch = usePlayerStore((s) => s.currentEpoch)
  const selectedTask = useGNNStore((s) => s.selectedTask)
  const snapshot = snapshots[currentEpoch]

  const [isDataInputOpen, setIsDataInputOpen] = useState(false)

  // WebSocket for live backend training
  const { connect, disconnect } = useWebSocket()

  // Listen for live training start events from TrainingControls
  useEffect(() => {
    const handler = (e) => {
      disconnect()
      connect(e.detail)
    }
    window.addEventListener('gnn:start-training', handler)
    return () => window.removeEventListener('gnn:start-training', handler)
  }, [connect, disconnect])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
      
      const { 
        isPlaying, play, pause, stepBack, stepForward, 
        currentEpochFloat, snapshots 
      } = usePlayerStore.getState()

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          isPlaying ? pause() : play()
          break
        case 'ArrowLeft':
          e.preventDefault()
          stepBack()
          break
        case 'ArrowRight':
          e.preventDefault()
          stepForward()
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const valAcc = snapshot ? (snapshot.val_acc * 100).toFixed(1) : '--'
  const trainLoss = snapshot ? snapshot.train_loss.toFixed(3) : '--'

  const taskLabels = {
    1: 'Topology',
    2: 'Classification Grid',
    3: 'Link Prediction',
    4: 'Communities',
    5: 'Embedding Heatmap',
    6: 'Generation',
  }

  return (
    <div className="h-screen flex flex-col bg-slate-950 overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-slate-900/80 border-b border-slate-800/50">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
            GNN-INSIGHT
          </h1>
          <div className="w-px h-5 bg-slate-700" />
          <TaskSelector />
          <ModelSelector />
          <InductiveDemo />
        </div>

        <div className="flex items-center gap-3">
          {snapshots.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="bg-slate-800/50 rounded px-2 py-0.5 text-[10px]">
                <span className="text-slate-500">Val Acc </span>
                <span className="text-blue-400 font-semibold">{valAcc}%</span>
              </div>
              <div className="bg-slate-800/50 rounded px-2 py-0.5 text-[10px]">
                <span className="text-slate-500">Loss </span>
                <span className="text-orange-400 font-semibold">{trainLoss}</span>
              </div>
            </div>
          )}

          <ExportToolbar />

          <button
            onClick={() => setIsDataInputOpen(true)}
            className="px-2 py-1 rounded text-[10px] font-medium transition-all bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg"
          >
            📁 Load Data
          </button>

          <button
            onClick={() => setMockMode(!mockMode)}
            className={`px-2 py-1 rounded text-[10px] font-medium transition-all
              ${mockMode
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-slate-800 text-slate-500 border border-slate-700'
              }`}
          >
            {mockMode ? '🧪 Mock' : '🔌 Live'}
          </button>

          <button
            onClick={() => setConfigOpen(true)}
            className="w-7 h-7 flex items-center justify-center rounded-lg
                       bg-slate-800 hover:bg-slate-700 text-slate-400 text-sm transition-all"
          >
            ⚙
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 grid grid-cols-[3fr_2fr] grid-rows-2 gap-px bg-slate-800/30 overflow-hidden">
        {/* Topology View */}
        <div className="bg-slate-950 relative overflow-hidden">
          <div className="panel-header absolute top-2 left-2 z-10 bg-slate-950/70 rounded px-1.5">
            {taskLabels[selectedTask] || 'Topology View'}
          </div>
          <ErrorBoundary>
            <TopologyRouter />
          </ErrorBoundary>
        </div>

        {/* Embedding View */}
        <div className="bg-slate-950 relative overflow-hidden">
          <div className="panel-header absolute top-2 left-2 z-10 bg-slate-950/70 rounded px-1.5">
            Embedding Space
          </div>
          <ErrorBoundary>
            <EmbeddingRouter />
          </ErrorBoundary>
        </div>

        {/* Metrics Chart */}
        <div className="bg-slate-950 relative overflow-hidden">
          <div className="panel-header absolute top-2 left-2 z-10 bg-slate-950/70 rounded px-1.5">
            Metrics
          </div>
          <ErrorBoundary>
            <MetricsChart />
          </ErrorBoundary>
        </div>

        {/* Info Panel */}
        <div className="bg-slate-950 border-l border-slate-800/30 overflow-hidden">
          <div className="panel-header pt-2 pl-3">Node Info</div>
          <ErrorBoundary>
            <InfoRouter />
          </ErrorBoundary>
        </div>
      </main>

      <Player />
      <TrainingControls />
      <ConfigPanel />
      
      {isDataInputOpen && <DataInputView onClose={() => setIsDataInputOpen(false)} />}
    </div>
  )
}

export default App
