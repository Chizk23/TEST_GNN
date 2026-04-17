import React, { useMemo, useState } from 'react'
import { Eye, Network } from 'lucide-react'

export default function AttentionVisualization({ data, epoch }) {
  const [selectedHead, setSelectedHead] = useState(0)

  if (!data?.attention_weights) {
    return (
      <div className="p-6 rounded-lg border border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2 mb-4">
          <Eye className="w-5 h-5 text-indigo-600" />
          <h3 className="font-semibold text-gray-800">Attention Weights</h3>
        </div>
        <p className="text-sm text-gray-600">Attention data not available for this model</p>
      </div>
    )
  }

  const heads = useMemo(() => {
    if (Array.isArray(data.attention_weights)) {
      return data.attention_weights
    }
    return Object.values(data.attention_weights || {})
  }, [data.attention_weights])

  if (!heads || heads.length === 0) {
    return (
      <div className="p-6 rounded-lg border border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2 mb-4">
          <Eye className="w-5 h-5 text-indigo-600" />
          <h3 className="font-semibold text-gray-800">Attention Weights</h3>
        </div>
        <p className="text-sm text-gray-600">No attention weights recorded</p>
      </div>
    )
  }

  const currentHead = heads[selectedHead] || {}
  const headStats = useMemo(() => {
    if (!currentHead.weights) return null

    const weights = currentHead.weights
    const flat = weights.flat()
    return {
      mean: flat.reduce((a, b) => a + b, 0) / flat.length,
      max: Math.max(...flat),
      min: Math.min(...flat),
      std: Math.sqrt(
        flat.reduce((sq, n) => sq + Math.pow(n - (flat.reduce((a, b) => a + b, 0) / flat.length), 2), 0) /
          flat.length
      ),
    }
  }, [currentHead])

  return (
    <div className="p-6 rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2 mb-4">
        <Eye className="w-5 h-5 text-indigo-600" />
        <h3 className="font-semibold text-gray-800">Attention Weights (Epoch {epoch})</h3>
        <Network className="w-4 h-4 text-indigo-500 ml-auto" />
      </div>

      {heads.length > 1 && (
        <div className="mb-4">
          <label className="text-sm text-gray-700 block mb-2">Select Head:</label>
          <div className="flex gap-2 flex-wrap">
            {heads.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedHead(idx)}
                className={`px-3 py-1 rounded text-sm font-medium transition ${
                  selectedHead === idx
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Head {idx + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      {headStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 p-3 bg-indigo-50 rounded">
          <div>
            <p className="text-xs text-gray-600">Mean</p>
            <p className="font-semibold text-indigo-700">{headStats.mean.toFixed(4)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600">Std Dev</p>
            <p className="font-semibold text-indigo-700">{headStats.std.toFixed(4)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600">Min</p>
            <p className="font-semibold text-indigo-700">{headStats.min.toFixed(4)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600">Max</p>
            <p className="font-semibold text-indigo-700">{headStats.max.toFixed(4)}</p>
          </div>
        </div>
      )}

      {currentHead.weights && (
        <div className="mt-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Weight Distribution</h4>
          <div className="space-y-2">
            {currentHead.weights.slice(0, 10).map((row, rowIdx) => (
              <div key={rowIdx} className="flex items-center gap-1">
                <span className="text-xs text-gray-500 w-8 text-right">{rowIdx}</span>
                <div className="flex gap-0.5">
                  {row.slice(0, 10).map((val, colIdx) => (
                    <div
                      key={`${rowIdx}-${colIdx}`}
                      className="w-4 h-4 border border-gray-300 rounded"
                      style={{
                        backgroundColor: `rgba(99, 102, 241, ${Math.min(val, 1)})`,
                      }}
                      title={`${val.toFixed(3)}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">Showing first 10×10 of attention weights</p>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          Attention pattern from {heads.length} head(s) - models like GAT learn where to focus
        </p>
      </div>
    </div>
  )
}
