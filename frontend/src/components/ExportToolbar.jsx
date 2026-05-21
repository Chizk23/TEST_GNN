import { useCallback, useState, useRef, useEffect } from 'react'
import html2canvas from 'html2canvas'
import useGNNStore from '../store/useGNNStore'
import usePlayerStore from '../store/playerStore'

const PANEL_OPTIONS = [
    { id: 'topology', label: 'Topology View' },
    { id: 'embedding', label: 'Embedding Space' },
    { id: 'metrics', label: 'Metrics Chart' },
    { id: 'info', label: 'Info Panel' },
    { id: 'main-grid', label: 'All Panels' },
]

function capturePanelPNG(panelId) {
    const el = document.querySelector(`[data-export-id="${panelId}"]`)
    if (!el) return Promise.reject(new Error(`Panel "${panelId}" not found`))

    // For embedding panels containing Plotly, try Plotly.toImage first
    const plotlyEl = el.querySelector('.js-plotly-plot')
    if (plotlyEl && window.Plotly) {
        return window.Plotly.toImage(plotlyEl, {
            format: 'png',
            width: plotlyEl.clientWidth * 2,
            height: plotlyEl.clientHeight * 2,
            scale: 2,
        })
    }

    return html2canvas(el, {
        backgroundColor: '#020617',
        scale: 2,
        useCORS: true,
        logging: false,
    }).then((canvas) => canvas.toDataURL('image/png'))
}

function downloadDataURL(dataURL, filename) {
    const a = document.createElement('a')
    a.href = dataURL
    a.download = filename
    a.click()
}

export default function ExportToolbar() {
    const snapshots = usePlayerStore((s) => s.snapshots)
    const graphData = useGNNStore((s) => s.graphData)
    const [open, setOpen] = useState(false)
    const [busy, setBusy] = useState(null)
    const menuRef = useRef(null)

    useEffect(() => {
        if (!open) return
        const handleClick = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false)
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [open])

    const handleExportPanel = useCallback(async (panelId, label) => {
        setBusy(panelId)
        try {
            const dataURL = await capturePanelPNG(panelId)
            const ts = new Date().toISOString().replace(/[:.]/g, '-')
            downloadDataURL(dataURL, `gnn-${panelId}-${ts}.png`)
        } catch (err) {
            console.error('Export failed:', err)
            alert(`Export failed for ${label}: ${err.message}`)
        } finally {
            setBusy(null)
            setOpen(false)
        }
    }, [])

    const handleExportJSON = useCallback(() => {
        const data = {
            graphData,
            snapshots,
            exported_at: new Date().toISOString(),
        }
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `gnn-insight-${Date.now()}.json`
        a.click()
        URL.revokeObjectURL(url)
        setOpen(false)
    }, [snapshots, graphData])

    if (snapshots.length === 0) return null

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => setOpen((v) => !v)}
                className="px-2 py-1 rounded text-[10px] font-medium
                   bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200
                   transition-all flex items-center gap-1"
                title="Export charts & data"
            >
                <span>Export</span>
                <svg
                    className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {open && (
                <div className="absolute right-0 mt-1 w-48 bg-slate-900 border border-slate-700
                                rounded-lg shadow-xl shadow-black/40 z-50 py-1 text-[11px]">
                    <div className="px-3 py-1.5 text-[9px] uppercase tracking-wider text-slate-500 font-semibold">
                        Export as PNG
                    </div>
                    {PANEL_OPTIONS.map(({ id, label }) => (
                        <button
                            key={id}
                            onClick={() => handleExportPanel(id, label)}
                            disabled={busy !== null}
                            className="w-full text-left px-3 py-1.5 text-slate-300
                                       hover:bg-slate-800 hover:text-white transition-colors
                                       disabled:opacity-40 disabled:cursor-wait
                                       flex items-center gap-2"
                        >
                            {busy === id ? (
                                <span className="inline-block w-3 h-3 border-2 border-blue-400
                                                 border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <span className="text-slate-500">📷</span>
                            )}
                            {label}
                        </button>
                    ))}

                    <div className="border-t border-slate-700/60 my-1" />

                    <div className="px-3 py-1.5 text-[9px] uppercase tracking-wider text-slate-500 font-semibold">
                        Export data
                    </div>
                    <button
                        onClick={handleExportJSON}
                        className="w-full text-left px-3 py-1.5 text-slate-300
                                   hover:bg-slate-800 hover:text-white transition-colors
                                   flex items-center gap-2"
                    >
                        <span className="text-slate-500">💾</span>
                        Snapshots JSON
                    </button>
                </div>
            )}
        </div>
    )
}
