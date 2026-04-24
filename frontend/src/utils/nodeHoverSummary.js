/**
 * nodeHoverSummary.js
 * 
 * Task-aware helper to build hover card summary for each task.
 * Pure function: no DOM, no store — just snapshot + graph + taskId.
 */

/**
 * @param {number} taskId - 1..6
 * @param {number|null} nodeId - Node ID being hovered
 * @param {Object|null} snapshot - Current snapshot or null
 * @param {Object|null} graphData - { nodes, links } or null
 * @param {Array|null} groundTruth - Ground truth labels or null
 * @returns {Object|null} { title, chips: [], rows: [] } or null if no data
 */
export function buildHoverSummary(
  taskId,
  nodeId,
  snapshot,
  graphData,
  groundTruth
) {
  if (!nodeId && nodeId !== 0) return null
  if (!graphData || !graphData.nodes) return null

  const node = graphData.nodes.find((n) => n.id === nodeId)
  if (!node) return null

  const degree = graphData.links.filter(
    (l) => l.source.id === nodeId || l.target.id === nodeId
  ).length

  switch (taskId) {
    case 1:
      return buildTask1Summary(node, degree, snapshot, groundTruth)
    case 2:
      return buildTask2Summary(node, degree, snapshot, graphData)
    case 3:
      return buildTask3Summary(node, degree, snapshot, graphData)
    case 4:
      return buildTask4Summary(node, degree, snapshot, graphData)
    case 5:
      return buildTask5Summary(node, degree, snapshot, graphData)
    case 6:
      return buildTask6Summary(node, degree, snapshot, graphData)
    default:
      return null
  }
}

// ═══════════════════════════════════════════════════════════════════
// Task 1: Node Classification
// ═══════════════════════════════════════════════════════════════════

function buildTask1Summary(node, degree, snapshot, groundTruth) {
  if (!snapshot || !snapshot.node_predictions) return null

  const pred = snapshot.node_predictions[node.id]
  const conf = snapshot.node_confidence?.[node.id] ?? null
  const gtLabel = groundTruth?.[node.id] ?? null

  const chips = [
    { label: 'ID', value: `#${node.id}`, tone: 'neutral' },
    { label: 'Degree', value: String(degree), tone: 'neutral' },
  ]

  if (gtLabel !== null) {
    chips.push({
      label: 'GT Class',
      value: String(gtLabel),
      tone: 'info'
    })
  }

  if (pred !== undefined) {
    chips.push({
      label: 'Pred Class',
      value: String(pred),
      tone: 'success'
    })

    const isCorrect = gtLabel !== null && gtLabel === pred
    if (gtLabel !== null) {
      chips.push({
        label: isCorrect ? '✓ Correct' : '✗ Wrong',
        value: '',
        tone: isCorrect ? 'success' : 'error'
      })
    }
  }

  if (conf !== null) {
    chips.push({
      label: 'Confidence',
      value: `${(conf * 100).toFixed(1)}%`,
      tone: conf > 0.8 ? 'success' : conf > 0.6 ? 'warning' : 'error'
    })
  }

  const rows = []
  rows.push({
    label: 'Hover info:',
    value: 'Click to pin → full Inspector'
  })

  return { title: `Node #${node.id}`, chips, rows }
}

// ═══════════════════════════════════════════════════════════════════
// Task 2: Graph Classification (node in drill-down)
// ═══════════════════════════════════════════════════════════════════

function buildTask2Summary(node, degree, snapshot, graphData) {
  // Task 2 hover shows node degree + optional attention info if available
  const chips = [
    { label: 'ID', value: `#${node.id}`, tone: 'neutral' },
    { label: 'Degree', value: String(degree), tone: 'neutral' },
  ]

  // If we have attention scores per node
  if (snapshot && snapshot.node_attention) {
    const attn = snapshot.node_attention[node.id]
    if (attn !== undefined) {
      chips.push({
        label: 'Attention α',
        value: `${(attn * 100).toFixed(1)}%`,
        tone: attn > 0.5 ? 'success' : 'warning'
      })
    }
  }

  // Graph density context
  const density = graphData.links.length / (graphData.nodes.length * (graphData.nodes.length - 1))
  chips.push({
    label: 'Graph Density',
    value: `${(density * 100).toFixed(2)}%`,
    tone: 'info'
  })

  const rows = []
  rows.push({
    label: 'Hover info:',
    value: 'Click to pin → full Inspector'
  })

  return { title: `Graph Node #${node.id}`, chips, rows }
}

// ═══════════════════════════════════════════════════════════════════
// Task 3: Link Prediction
// ═══════════════════════════════════════════════════════════════════

function buildTask3Summary(node, degree, snapshot, graphData) {
  const chips = [
    { label: 'ID', value: `#${node.id}`, tone: 'neutral' },
    { label: 'Degree', value: String(degree), tone: 'neutral' },
  ]

  // Count pos/neg edges from snapshot
  if (snapshot && snapshot.positive_edges && snapshot.negative_edges) {
    const posCount = snapshot.positive_edges.filter(
      (e) => e[0] === node.id || e[1] === node.id
    ).length
    const negCount = snapshot.negative_edges.filter(
      (e) => e[0] === node.id || e[1] === node.id
    ).length

    chips.push({
      label: 'Pos Edges',
      value: String(posCount),
      tone: 'success'
    })
    chips.push({
      label: 'Neg Edges',
      value: String(negCount),
      tone: 'error'
    })

    // Avg edge score
    const allEdges = [...snapshot.positive_edges, ...snapshot.negative_edges]
    const nodeEdges = allEdges.filter(
      (e) => e[0] === node.id || e[1] === node.id
    )
    if (nodeEdges.length > 0) {
      const avgScore =
        nodeEdges.reduce((sum, e) => sum + (e[2] ?? 0.5), 0) / nodeEdges.length
      chips.push({
        label: 'Avg Score',
        value: `${avgScore.toFixed(3)}`,
        tone: avgScore > 0.6 ? 'success' : 'warning'
      })
    }
  }

  const rows = []
  rows.push({
    label: 'Hover info:',
    value: 'Click to pin → full Inspector'
  })

  return { title: `Link Pred Node #${node.id}`, chips, rows }
}

// ═══════════════════════════════════════════════════════════════════
// Task 4: Community Detection
// ═══════════════════════════════════════════════════════════════════

function buildTask4Summary(node, degree, snapshot, graphData) {
  const chips = [
    { label: 'ID', value: `#${node.id}`, tone: 'neutral' },
    { label: 'Degree', value: String(degree), tone: 'neutral' },
  ]

  // Community label from snapshot
  if (snapshot && snapshot.community_labels) {
    const communityId = snapshot.community_labels[node.id]
    if (communityId !== undefined) {
      chips.push({
        label: 'Community',
        value: `C${communityId}`,
        tone: 'info'
      })
    }
  }

  // Bridge strength if available
  if (snapshot && snapshot.bridge_strength) {
    const strength = snapshot.bridge_strength[node.id]
    if (strength !== undefined) {
      chips.push({
        label: 'Bridge Strength',
        value: `${strength.toFixed(3)}`,
        tone: strength > 0.3 ? 'warning' : 'success'
      })
    }
  }

  const rows = []
  rows.push({
    label: 'Hover info:',
    value: 'Click to pin → full Inspector'
  })

  return { title: `Community Node #${node.id}`, chips, rows }
}

// ═══════════════════════════════════════════════════════════════════
// Task 5: Node Embedding KNN
// ═══════════════════════════════════════════════════════════════════

function buildTask5Summary(node, degree, snapshot, graphData) {
  const chips = [
    { label: 'ID', value: `#${node.id}`, tone: 'neutral' },
    { label: 'Degree', value: String(degree), tone: 'neutral' },
  ]

  // Top-1 KNN distance
  if (snapshot && snapshot.knn_distances) {
    const dist = snapshot.knn_distances[node.id]
    if (dist !== undefined && dist.length > 0) {
      chips.push({
        label: 'Top-1 KNN Dist',
        value: `${dist[0].toFixed(4)}`,
        tone: dist[0] < 0.5 ? 'success' : 'warning'
      })
    }
  }

  // Class if labeled
  if (snapshot && snapshot.node_classes) {
    const cls = snapshot.node_classes[node.id]
    if (cls !== undefined) {
      chips.push({
        label: 'Class',
        value: String(cls),
        tone: 'info'
      })
    }
  }

  const rows = []
  rows.push({
    label: 'Hover info:',
    value: 'Click to pin → full Inspector'
  })

  return { title: `Embedding Node #${node.id}`, chips, rows }
}

// ═══════════════════════════════════════════════════════════════════
// Task 6: Graph Generation (mini graph role)
// ═══════════════════════════════════════════════════════════════════

function buildTask6Summary(node, degree, snapshot, graphData) {
  const chips = [
    { label: 'ID', value: `#${node.id}`, tone: 'neutral' },
    { label: 'Degree', value: String(degree), tone: 'neutral' },
  ]

  // Graph role (isolated, hub, bridge, leaf, regular)
  if (snapshot && snapshot.graph_roles) {
    const role = snapshot.graph_roles[node.id]
    if (role) {
      let roleTone = 'neutral'
      if (role === 'hub') roleTone = 'success'
      if (role === 'bridge') roleTone = 'warning'
      if (role === 'isolated') roleTone = 'error'

      chips.push({
        label: 'Role',
        value: role.charAt(0).toUpperCase() + role.slice(1),
        tone: roleTone
      })
    }
  }

  // Validity flag if available
  if (snapshot && snapshot.validity_flags) {
    const valid = snapshot.validity_flags[node.id]
    if (valid !== undefined) {
      chips.push({
        label: valid ? '✓ Valid' : '⚠ Invalid',
        value: '',
        tone: valid ? 'success' : 'warning'
      })
    }
  }

  const rows = []
  rows.push({
    label: 'Hover info:',
    value: 'Click to pin → full Inspector'
  })

  return { title: `GenGraph Node #${node.id}`, chips, rows }
}
