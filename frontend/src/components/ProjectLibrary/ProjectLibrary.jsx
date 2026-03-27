import React, { useEffect } from 'react'
import useGNNStore from '../../store/useGNNStore'
import './ProjectLibrary.scss'

export default function ProjectLibrary() {
  const { 
    libraryOpen, 
    setLibraryOpen, 
    projects, 
    fetchProjects, 
    loadProjectHistory, 
    projectHistory, 
    activeProject,
    restoreRun,
    isLoadingHistory
  } = useGNNStore()

  useEffect(() => {
    if (libraryOpen) {
      fetchProjects()
    }
  }, [libraryOpen])

  if (!libraryOpen) return null

  return (
    <div className="project-library-overlay shadow-2xl">
      <div className="project-library-container bg-slate-900 border-l border-slate-700/50 flex flex-col h-full">
        {/* Header */}
        <div className="p-4 border-b border-slate-800/50 flex justify-between items-center bg-slate-950/50">
          <div>
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <span className="text-indigo-400">📚</span> Project Library
            </h2>
            <p className="text-[10px] text-slate-500 mt-1">
              Restore and replay historical training runs
            </p>
          </div>
          <button 
            onClick={() => setLibraryOpen(false)}
            className="w-6 h-6 rounded flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left Column: Projects List */}
          <div className="w-1/2 border-r border-slate-800/50 overflow-y-auto p-2 bg-slate-950/20 custom-scrollbar">
            {isLoadingHistory && projects.length === 0 ? (
              <div className="text-center p-4 text-xs text-slate-500 animate-pulse">Loading library...</div>
            ) : projects.length === 0 ? (
              <div className="text-center p-8 text-xs text-slate-600">
                <div className="text-2xl mb-2">📭</div>
                No projects saved yet.<br/>Run a training session to create one.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {projects.map(p => (
                  <div 
                    key={p.id}
                    onClick={() => loadProjectHistory(p.id)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all duration-200
                      ${activeProject === p.id 
                        ? 'bg-indigo-500/10 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.1)]' 
                        : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600'
                      }`}
                  >
                    <div className="text-xs font-semibold text-slate-200 truncate">{p.name}</div>
                    <div className="text-[10px] text-slate-500 mt-1 truncate">{p.description}</div>
                    <div className="flex items-center gap-3 mt-2 text-[9px] text-slate-400 font-medium">
                      <span className="bg-slate-900 px-1.5 py-0.5 rounded">{p.total_runs} runs</span>
                      <span>{new Date(p.last_viewed_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: History List */}
          <div className="w-1/2 overflow-y-auto p-2 bg-slate-950/40 custom-scrollbar relative">
            {!activeProject ? (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-600">
                Select a project to view history
              </div>
            ) : isLoadingHistory && projectHistory.length === 0 ? (
               <div className="text-center p-4 text-xs text-slate-500 animate-pulse">Loading history...</div>
            ) : projectHistory.length === 0 ? (
              <div className="text-center p-8 text-xs text-slate-600">No training runs found.</div>
            ) : (
              <div className="flex flex-col gap-2 relative z-10">
                {projectHistory.map(run => (
                  <div key={run.id} className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 group relative">
                    
                    {run.is_favorite && (
                      <div className="absolute -top-1.5 -right-1.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[9px] px-1 rounded shadow-lg backdrop-blur-md">
                        ★
                      </div>
                    )}

                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-[11px] font-bold text-slate-300">
                          Task {run.task_type} • <span className="text-blue-400">{run.model_type}</span>
                        </div>
                        <div className="text-[9px] text-slate-500 mt-0.5">
                          {new Date(run.created_at).toLocaleString()}
                        </div>
                      </div>
                      
                      {run.best_val_acc > 0 && (
                        <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                          {(run.best_val_acc * 100).toFixed(1)}% Acc
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-3 flex gap-2">
                       <button 
                         onClick={(e) => { e.stopPropagation(); restoreRun(run.id); }}
                         className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-medium py-1.5 rounded transition-colors shadow-lg shadow-indigo-500/20"
                       >
                         ⚡ Restore Preview
                       </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
