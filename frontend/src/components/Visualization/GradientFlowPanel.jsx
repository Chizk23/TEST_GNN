import React, { useMemo } from 'react'
import { Activity, AlertTriangle, CheckCircle2 } from 'lucide-react'

export default function GradientFlowPanel({ data, epoch }) {
  if (!data?.gradient_flow || Object.keys(data.gradient_flow).length === 0) {
    return (
      <div className="p-6 rounded-lg border border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-purple-600" />
          <h3 className="font-semibold text-gray-800">Gradient Flow</h3>
        </div>
        <p className="text-sm text-gray-600">No gradient flow data available</p>
      </div>
    )
  }

  const layers = useMemo(() => {
    return Object.entries(data.gradient_flow)
      .map(([name, stats]) => ({
        name: name.replace('weight', 'W').replace('bias', 'b'),
        ...stats,
      }))
      .sort((a, b) => {
        // Sort by layer depth (first appearance in model)
        const aOrder = a.name.match(/\d+/)?.[0] || '0'
        const bOrder = b.name.match(/\d+/)?.[0] || '0'
        return parseInt(aOrder) - parseInt(bOrder)
      })
  }, [data.gradient_flow])

  const hasIssues = useMemo(() => {
    return layers.some((l) => l.is_vanishing || l.is_exploding)
  }, [layers])

  const getStatusColor = (layer) => {
    if (layer.is_exploding) return 'red'
    if (layer.is_vanishing) return 'orange'
    return 'green'
  }

  return (
    <div className="p-6 rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-5 h-5 text-purple-600" />
        <h3 className="font-semibold text-gray-800">Gradient Flow (Epoch {epoch})</h3>
        {hasIssues && (
          <AlertTriangle className="w-4 h-4 text-orange-500 ml-auto" />
        )}
      </div>

      {hasIssues && (
        <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded">
          <p className="text-sm text-orange-800">
            Gradient flow issues detected. Check the table below.
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-3 text-gray-600 font-semibold">Layer</th>
              <th className="text-right py-2 px-3 text-gray-600 font-semibold">Grad Norm</th>
              <th className="text-right py-2 px-3 text-gray-600 font-semibold">Ratio</th>
              <th className="text-center py-2 px-3 text-gray-600 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {layers.map((layer, idx) => {
              const statusColor = getStatusColor(layer)
              const statusBg = {
                red: 'bg-red-100',
                orange: 'bg-orange-100',
                green: 'bg-green-100',
              }[statusColor]

              const statusText = {
                red: 'text-red-700',
                orange: 'text-orange-700',
                green: 'text-green-700',
              }[statusColor]

              const statusLabel = layer.is_exploding
                ? 'Exploding'
                : layer.is_vanishing
                  ? 'Vanishing'
                  : 'Healthy'

              return (
                <tr
                  key={idx}
                  className="border-b border-gray-100 hover:bg-gray-50 transition"
                >
                  <td className="py-3 px-3 text-gray-800 font-mono text-xs">
                    {layer.name}
                  </td>
                  <td className="text-right py-3 px-3 text-gray-700">
                    {layer.grad_norm.toExponential(2)}
                  </td>
                  <td className="text-right py-3 px-3 text-gray-700">
                    {layer.grad_ratio.toExponential(2)}
                  </td>
                  <td className="text-center py-3 px-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${statusBg} ${statusText}`}
                    >
                      {statusLabel === 'Healthy' ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <AlertTriangle className="w-3 h-3" />
                      )}
                      {statusLabel}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          Monitoring {layers.length} parameter layers for training stability
        </p>
      </div>
    </div>
  )
}
