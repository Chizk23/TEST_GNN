import { describe, it, expect } from 'vitest'
import { buildHoverSummary } from './nodeHoverSummary'

// Mock data helpers
const mockGraphData = (numNodes = 10, numLinks = 15) => ({
  nodes: Array.from({ length: numNodes }, (_, i) => ({ id: i })),
  links: Array.from({ length: numLinks }, (_, i) => ({
    source: { id: i % numNodes },
    target: { id: (i + 1) % numNodes }
  }))
})

describe('buildHoverSummary', () => {
  describe('Task 1: Node Classification', () => {
    it('should return null if nodeId is null', () => {
      const result = buildHoverSummary(1, null, {}, mockGraphData())
      expect(result).toBeNull()
    })

    it('should return null if no snapshot', () => {
      const result = buildHoverSummary(1, 0, null, mockGraphData())
      expect(result).toBeNull()
    })

    it('should return summary with pred/confidence/gt', () => {
      const snapshot = {
        node_predictions: { 0: 2, 1: 1, 2: 0 },
        node_confidence: { 0: 0.95, 1: 0.72, 2: 0.58 }
      }
      const groundTruth = { 0: 2, 1: 1, 2: 0 }
      const graph = mockGraphData()

      const result = buildHoverSummary(1, 0, snapshot, graph, groundTruth)

      expect(result).not.toBeNull()
      expect(result.title).toContain('Node #0')
      expect(result.chips.length).toBeGreaterThan(0)

      // Should have ID, Degree, GT Class, Pred Class, Confidence chips
      const labels = result.chips.map((c) => c.label)
      expect(labels).toContain('ID')
      expect(labels).toContain('Degree')
      expect(labels).toContain('GT Class')
      expect(labels).toContain('Pred Class')
      expect(labels).toContain('Confidence')

      // Correct prediction → '✓ Correct' chip
      const correctChip = result.chips.find((c) => c.label.includes('✓') || c.label.includes('✗'))
      expect(correctChip).toBeDefined()
      expect(correctChip.tone).toBe('success') // because pred === gt
    })

    it('should mark incorrect predictions', () => {
      const snapshot = {
        node_predictions: { 0: 1 }, // Wrong
        node_confidence: { 0: 0.55 }
      }
      const groundTruth = { 0: 0 } // GT is 0, pred is 1

      const result = buildHoverSummary(1, 0, snapshot, mockGraphData(), groundTruth)

      const wrongChip = result.chips.find((c) => c.label.includes('✗'))
      expect(wrongChip).toBeDefined()
      expect(wrongChip.tone).toBe('error')
    })
  })

  describe('Task 2: Graph Classification', () => {
    it('should return graph node summary', () => {
      const snapshot = {
        node_attention: { 0: 0.75, 1: 0.45 }
      }
      const graph = mockGraphData(10, 20)

      const result = buildHoverSummary(2, 0, snapshot, graph)

      expect(result).not.toBeNull()
      expect(result.title).toContain('Graph Node #0')

      const labels = result.chips.map((c) => c.label)
      expect(labels).toContain('ID')
      expect(labels).toContain('Degree')
      expect(labels).toContain('Attention α')
      expect(labels).toContain('Graph Density')
    })

    it('should handle missing attention', () => {
      const result = buildHoverSummary(2, 0, {}, mockGraphData())

      expect(result).not.toBeNull()
      const labels = result.chips.map((c) => c.label)
      expect(labels).toContain('ID')
      expect(labels).toContain('Degree')
      expect(labels).toContain('Graph Density')
      expect(labels).not.toContain('Attention α') // No attention data
    })
  })

  describe('Task 3: Link Prediction', () => {
    it('should return link pred summary with pos/neg edges', () => {
      const snapshot = {
        positive_edges: [[0, 1], [1, 2], [0, 3]],
        negative_edges: [[2, 3], [0, 4]]
      }
      const graph = mockGraphData(5, 8)

      const result = buildHoverSummary(3, 0, snapshot, graph)

      expect(result).not.toBeNull()
      expect(result.title).toContain('Link Pred Node #0')

      const labels = result.chips.map((c) => c.label)
      expect(labels).toContain('ID')
      expect(labels).toContain('Pos Edges')
      expect(labels).toContain('Neg Edges')
    })

    it('should calculate avg edge score', () => {
      const snapshot = {
        positive_edges: [[0, 1, 0.8]],
        negative_edges: [[0, 2, 0.2]]
      }
      const graph = mockGraphData(3, 2)

      const result = buildHoverSummary(3, 0, snapshot, graph)

      expect(result).not.toBeNull()
      const scoreChip = result.chips.find((c) => c.label === 'Avg Score')
      expect(scoreChip).toBeDefined()
      // (0.8 + 0.2) / 2 = 0.5
      expect(scoreChip.value).toBe('0.500')
    })
  })

  describe('Task 4: Community Detection', () => {
    it('should return community summary', () => {
      const snapshot = {
        community_labels: { 0: 2, 1: 0, 2: 1 },
        bridge_strength: { 0: 0.15, 1: 0.8, 2: 0.05 }
      }
      const graph = mockGraphData(3, 4)

      const result = buildHoverSummary(4, 0, snapshot, graph)

      expect(result).not.toBeNull()
      expect(result.title).toContain('Community Node #0')

      const labels = result.chips.map((c) => c.label)
      expect(labels).toContain('ID')
      expect(labels).toContain('Community')
      expect(labels).toContain('Bridge Strength')

      // Community label
      const commChip = result.chips.find((c) => c.label === 'Community')
      expect(commChip.value).toBe('C2')

      // Bridge strength > 0.3 → warning tone
      const bridgeChip = result.chips.find((c) => c.label === 'Bridge Strength')
      expect(bridgeChip.tone).toBe('warning')
    })

    it('should mark low bridge strength', () => {
      const snapshot = {
        community_labels: { 0: 0 },
        bridge_strength: { 0: 0.05 } // Low
      }
      const graph = mockGraphData(2, 1)

      const result = buildHoverSummary(4, 0, snapshot, graph)

      const bridgeChip = result.chips.find((c) => c.label === 'Bridge Strength')
      expect(bridgeChip.tone).toBe('success') // Low bridge → not a bridge
    })
  })

  describe('Task 5: Node Embedding KNN', () => {
    it('should return embedding summary with KNN distance', () => {
      const snapshot = {
        knn_distances: { 0: [0.123, 0.456, 0.789] },
        node_classes: { 0: 2 }
      }
      const graph = mockGraphData(3, 3)

      const result = buildHoverSummary(5, 0, snapshot, graph)

      expect(result).not.toBeNull()
      expect(result.title).toContain('Embedding Node #0')

      const labels = result.chips.map((c) => c.label)
      expect(labels).toContain('ID')
      expect(labels).toContain('Top-1 KNN Dist')
      expect(labels).toContain('Class')

      // Check KNN distance value
      const knnChip = result.chips.find((c) => c.label === 'Top-1 KNN Dist')
      expect(knnChip.value).toBe('0.1230')
      expect(knnChip.tone).toBe('success') // < 0.5
    })

    it('should mark high KNN distance', () => {
      const snapshot = {
        knn_distances: { 0: [0.8] }
      }
      const graph = mockGraphData(2, 1)

      const result = buildHoverSummary(5, 0, snapshot, graph)

      const knnChip = result.chips.find((c) => c.label === 'Top-1 KNN Dist')
      expect(knnChip.tone).toBe('warning') // >= 0.5
    })
  })

  describe('Task 6: Graph Generation', () => {
    it('should return graph gen summary with role', () => {
      const snapshot = {
        graph_roles: { 0: 'hub', 1: 'bridge', 2: 'leaf', 3: 'isolated' },
        validity_flags: { 0: true, 1: true, 2: false, 3: true }
      }
      const graph = mockGraphData(4, 5)

      const result = buildHoverSummary(6, 0, snapshot, graph)

      expect(result).not.toBeNull()
      expect(result.title).toContain('GenGraph Node #0')

      const labels = result.chips.map((c) => c.label)
      expect(labels).toContain('ID')
      expect(labels).toContain('Role')

      // Hub role → success tone
      const roleChip = result.chips.find((c) => c.label === 'Role')
      expect(roleChip.value).toBe('Hub')
      expect(roleChip.tone).toBe('success')

      // Valid flag
      const validChip = result.chips.find((c) => c.label.includes('✓'))
      expect(validChip).toBeDefined()
      expect(validChip.tone).toBe('success')
    })

    it('should mark invalid nodes', () => {
      const snapshot = {
        graph_roles: { 0: 'isolated' },
        validity_flags: { 0: false }
      }
      const graph = mockGraphData(2, 1)

      const result = buildHoverSummary(6, 0, snapshot, graph)

      const roleChip = result.chips.find((c) => c.label === 'Role')
      expect(roleChip.value).toBe('Isolated')
      expect(roleChip.tone).toBe('error')

      const validChip = result.chips.find((c) => c.label.includes('⚠'))
      expect(validChip).toBeDefined()
      expect(validChip.tone).toBe('warning')
    })
  })

  describe('Edge cases', () => {
    it('should return null for invalid taskId', () => {
      const result = buildHoverSummary(99, 0, {}, mockGraphData())
      expect(result).toBeNull()
    })

    it('should return null if node not in graphData', () => {
      const graph = mockGraphData(3, 2)
      const result = buildHoverSummary(1, 999, { node_predictions: { 999: 1 } }, graph)
      expect(result).toBeNull()
    })

    it('should handle nodeId = 0 correctly', () => {
      const graph = mockGraphData(5, 5)
      const snapshot = { node_predictions: { 0: 1 } }

      const result = buildHoverSummary(1, 0, snapshot, graph)

      expect(result).not.toBeNull()
      expect(result.title).toContain('Node #0')
    })
  })
})
