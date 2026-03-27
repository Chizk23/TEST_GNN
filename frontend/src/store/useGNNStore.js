import { create } from 'zustand'
import usePlayerStore from './playerStore'

const useGNNStore = create((set, get) => ({
  // ─── Config ──────────────────────────────────────────────────
  selectedTask: 1,
  selectedModel: 'GCN',
  mockMode: true,
  hyperparams: {
    epochs: 100,
    lr: 0.01,
    hidden: 64,
    dropout: 0.5,
    heads: 4,
    aggregator: 'mean',
    dataset: 'cora',
  },

  // ─── Training state ──────────────────────────────────────────
  isTraining: false,
  trainingProgress: 0,

  // ─── Graph data ──────────────────────────────────────────────
  graphData: null,
  groundTruth: null,
  trainMask: null,
  taskData: null,

  // ─── Selection / UI ──────────────────────────────────────────
  selectedNodeId: null,
  selectedGraphId: null,
  hoveredGraphId: null,
  viewMode: 'prediction',
  attentionHead: 'avg',
  configOpen: false,
  libraryOpen: false,

  // ─── Persistence / History ───────────────────────────────────
  projects: [],
  activeProject: null,
  projectHistory: [],
  isLoadingHistory: false,
  dataVersion: 0,

  // ─── Actions: Config ─────────────────────────────────────────
  setTask: (task) => {
    // Clear playback snapshots to prevent mismatched state
    usePlayerStore.getState().loadSnapshots([])

    set((s) => ({
      selectedTask: task,
      isTraining: false,
      trainingProgress: 0,
      selectedNodeId: null,
      selectedGraphId: null,
      graphData: null,
      groundTruth: null,
      trainMask: null,
      taskData: null,
      activeProject: null,
      dataVersion: s.dataVersion + 1,
    }))
  },
  setSelectedTask: (task) => get().setTask(task),
  setModel: (model) => {
    // Clear snapshots
    usePlayerStore.getState().loadSnapshots([])

    set((s) => ({
      selectedModel: model,
      isTraining: false,
      trainingProgress: 0,
      graphData: null,
      groundTruth: null,
      trainMask: null,
      taskData: null,
      selectedNodeId: null,
      dataVersion: s.dataVersion + 1,
    }))
  },
  setMockMode: (mode) => set((s) => ({ mockMode: mode, dataVersion: s.dataVersion + 1 })),
  setHyperparams: (params) => set((s) => ({ hyperparams: { ...s.hyperparams, ...params } })),

  // ─── Actions: Data ───────────────────────────────────────────
  setGraphData: (gd) => set((s) => ({ graphData: gd, dataVersion: s.dataVersion + 1 })),
  setGroundTruth: (gt) => set({ groundTruth: gt }),
  setTrainMask: (mask) => set({ trainMask: mask }),
  setTaskData: (td) => set((s) => ({ taskData: td, dataVersion: s.dataVersion + 1 })),

  setSelectedNode: (id) => set({ selectedNodeId: id }),
  setSelectedGraph: (id) => set({ selectedGraphId: id }),

  addInductiveNode: (newNode) => {
    const { graphData } = get()
    if (!graphData) return

    const flavoredNode = {
      ...newNode,
      x: -500,
      y: -500,
      fx: null,
      fy: null,
      isInductive: true,
      degree: newNode.links.length
    }

    const newLinks = newNode.links.map((targetId, i) => ({
      source: newNode.id,
      target: targetId,
      _idx: graphData.links.length + i,
      isInductive: true
    }))

    set({
      graphData: {
        nodes: [...graphData.nodes, flavoredNode],
        links: [...graphData.links, ...newLinks]
      },
      selectedNodeId: newNode.id
    })
  },

  // ─── Actions: UI ─────────────────────────────────────────────
  setHoveredGraph: (id) => set({ hoveredGraphId: id }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setAttentionHead: (head) => set({ attentionHead: head }),
  setConfigOpen: (open) => set({ configOpen: open }),
  setLibraryOpen: (open) => set({ libraryOpen: open }),
  setTraining: (isTraining, progress) => {
    if (isTraining) {
      set({ isTraining, trainingProgress: progress ?? 0 })
    } else {
      // Keep final progress or reset to 1 if done
      set({ isTraining, trainingProgress: progress ?? 0 })
    }
  },

  // ─── Actions: History / Persistence API ──────────────────────
  fetchProjects: async () => {
    try {
      set({ isLoadingHistory: true })
      const res = await fetch('http://localhost:8000/api/projects')
      const data = await res.json()
      set({ projects: data, isLoadingHistory: false })
    } catch (err) {
      console.error("Failed to fetch projects", err)
      set({ isLoadingHistory: false })
    }
  },
  
  loadProjectHistory: async (projectId) => {
    try {
      set({ isLoadingHistory: true })
      const res = await fetch(`http://localhost:8000/api/projects/${projectId}/history`)
      const history = await res.json()
      set({ projectHistory: history, activeProject: projectId, isLoadingHistory: false })
    } catch (err) {
      console.error("Failed to load history", err)
      set({ isLoadingHistory: false })
    }
  },

  restoreRun: async (runId) => {
    try {
      set({ isLoadingHistory: true })
      const res = await fetch(`http://localhost:8000/api/runs/${runId}/restore`)
      const data = await res.json()
      if (data && data.final_summary) {
        set({ 
          libraryOpen: false, 
          isLoadingHistory: false,
          trainingProgress: 100, // Jump to end for restored views
          selectedTask: data.task_type || get().selectedTask,
          selectedModel: data.model_type || get().selectedModel,
        })
        
        if (data.graph_json) {
          set({ graphData: data.graph_json, groundTruth: data.ground_truth })
        }
        
        // Load the snapshot into the player so it actually visually shows
        usePlayerStore.getState().loadSnapshots([{
            ...data.final_summary,
            epoch: data.best_epoch
        }])
        
        return data.final_summary
      }
    } catch (err) {
      console.error("Failed to restore run", err)
      set({ isLoadingHistory: false })
    }
  }
}))

export default useGNNStore
