import usePlayerStore from '../store/playerStore'

function IconButton({ children, onClick, title, disabled = false, primary = false }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`flex h-10 w-10 items-center justify-center rounded-2xl text-sm transition-all ${
        primary
          ? 'bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/25 hover:bg-cyan-300'
          : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
      } disabled:cursor-not-allowed disabled:opacity-35`}
    >
      {children}
    </button>
  )
}

export default function PlayerV2() {
  const {
    snapshots,
    currentEpochFloat,
    isPlaying,
    playbackSpeed,
    trainingDone,
    bestEpoch,
    totalEpochs,
    play,
    pause,
    seekTo,
    stepForward,
    stepBack,
    setSpeed,
  } = usePlayerStore()

  const disabled = !trainingDone || totalEpochs < 2
  const maxFloat = Math.max(0, totalEpochs - 1)
  const fillPct = totalEpochs <= 1 ? 0 : (currentEpochFloat / maxFloat) * 100
  const bestPct = totalEpochs <= 1 ? 0 : (bestEpoch / maxFloat) * 100

  return (
    <div className="border-t border-slate-800/80 bg-slate-950/92 px-4 py-3 backdrop-blur-md">
      <div className="mb-3 h-2 rounded-full bg-slate-800">
        <div className="relative h-full rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500" style={{ width: `${fillPct}%` }}>
          <div className="absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 translate-x-1/2 rounded-full border border-white/70 bg-white shadow-[0_0_18px_rgba(96,165,250,0.75)]" />
        </div>
        {trainingDone && totalEpochs > 1 && (
          <div
            className="relative -mt-2 text-[11px] text-yellow-300"
            style={{ left: `calc(${bestPct}% - 6px)` }}
            title={`Epoch tốt nhất: ${bestEpoch}`}
          >
            ★
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <IconButton onClick={() => seekTo(0)} title="Về đầu" disabled={disabled}>⏮</IconButton>
          <IconButton onClick={stepBack} title="Lùi 1 bước" disabled={disabled}>⏪</IconButton>
          <IconButton onClick={isPlaying ? pause : play} title={isPlaying ? 'Tạm dừng' : 'Phát'} disabled={disabled} primary>
            {isPlaying ? '⏸' : '▶'}
          </IconButton>
          <IconButton onClick={stepForward} title="Tiến 1 bước" disabled={disabled}>⏩</IconButton>
          <IconButton onClick={() => seekTo(maxFloat)} title="Về cuối" disabled={disabled}>⏭</IconButton>

          <div className="ml-3 rounded-xl border border-slate-700/50 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">
            Epoch: <span className="font-mono text-cyan-300">{currentEpochFloat.toFixed(1)}</span>
          </div>
          <div className="rounded-xl border border-slate-700/50 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">
            Tổng khung: <span className="font-mono text-slate-100">{snapshots.length}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-2xl border border-slate-700/50 bg-slate-900/65 p-1">
          {[0.25, 0.5, 1, 2, 4].map((speed) => (
            <button
              key={speed}
              onClick={() => setSpeed(speed)}
              disabled={disabled}
              className={`rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                playbackSpeed === speed ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              } disabled:opacity-40`}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
