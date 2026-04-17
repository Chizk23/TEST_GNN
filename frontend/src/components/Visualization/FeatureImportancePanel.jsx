import React, { useMemo } from 'react'
import { BarChart3, TrendingUp } from 'lucide-react'

export default function FeatureImportancePanel({ data, epoch }) {
  if (!data?.feature_importance || data.feature_importance.length === 0) {
    return (
      <div className="p-6 rounded-lg border border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-800">Feature Importance</h3>
        </div>
        <p className="text-sm text-gray-600">No feature importance data available</p>
      </div>
    )
  }

  // Aggregate feature importance across all nodes
  const aggregatedImportance = useMemo(() => {
    const importance = {}
    data.feature_importance.forEach((nodeData) => {
      nodeData.importance.forEach((val, idx) => {
        if (!importance[idx]) importance[idx] = { sum: 0, count: 0 }
        importance[idx].sum += val
        importance[idx].count += 1
      })
    })

    return Object.entries(importance)
      .map(([featureIdx, { sum, count }]) => ({
        feature: `F${featureIdx}`,
        index: parseInt(featureIdx),
        importance: sum / count,
      }))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 10)
  }, [data.feature_importance])

  const maxImportance = aggregatedImportance[0]?.importance || 1

  return (
    <div className="p-6 rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-5 h-5 text-blue-600" />
        <h3 className="font-semibold text-gray-800">Feature Importance (Epoch {epoch})</h3>
        <TrendingUp className="w-4 h-4 text-green-600 ml-auto" />
      </div>

      <div className="space-y-3">
        {aggregatedImportance.map((item) => (
          <div key={item.index} className="flex items-center gap-3">
            <div className="w-12 text-sm font-mono text-gray-600">{item.feature}</div>
            <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-300"
                style={{
                  width: `${(item.importance / maxImportance) * 100}%`,
                }}
              />
            </div>
            <div className="w-16 text-right text-sm text-gray-600">
              {item.importance.toFixed(3)}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          Aggregated importance across {data.feature_importance.length} nodes
        </p>
      </div>
    </div>
  )
}
