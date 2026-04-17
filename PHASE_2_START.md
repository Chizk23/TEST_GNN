# PHASE 2: VISUALIZATION FEATURES - STARTING NOW

## Overview
Phase 2 adds 4 major visualization features to improve understanding of GNN model behavior:

1. **Feature Importance Visualization** - Which features matter most
2. **Gradient Flow Visualization** - How gradients propagate through the network
3. **Attention Weight Visualization** - GAT attention mechanisms
4. **Advanced Projections** - UMAP & t-SNE dimensionality reduction

**Estimated Time**: 8-10 hours  
**Complexity**: Medium  
**Risk**: Low (non-breaking additions)  

---

## FEATURE 1: Feature Importance Visualization

### Backend: `backend/tasks/node_classification.py`

**What to add**:
- Compute feature importance scores using gradient-based attribution
- For each node, identify which input features contributed most to its prediction

**Code to add (after line ~150)**:
```python
# ─ Feature Importance (Gradient-based Attribution) ────────────────────
def compute_feature_importance(model, x, edge_index, device):
    """Compute per-feature importance using gradients."""
    x = x.clone().detach().requires_grad_(True).to(device)
    
    # Forward pass
    logits = model(x, edge_index)
    pred_probs = torch.softmax(logits, dim=1)
    
    # Compute attribution for each node's predicted class
    importances = []
    for node_id in range(x.size(0)):
        pred_class = logits[node_id].argmax().item()
        score = pred_probs[node_id, pred_class]
        
        # Backward pass
        if x.grad is not None:
            x.grad.zero_()
        score.backward(retain_graph=True)
        
        # Gradient magnitude = importance
        node_importance = x.grad[node_id].abs().cpu().tolist() if x.grad is not None else [0] * x.size(1)
        importances.append({
            'node_id': node_id,
            'importance': node_importance,
            'top_features': sorted(enumerate(node_importance), key=lambda x: x[1], reverse=True)[:5]
        })
    
    return importances
```

**Data to include in snapshot**:
```python
snapshot['feature_importance'] = compute_feature_importance(model, x, edge_index, device)
```

### Frontend: New Component `FeatureImportancePanel.jsx`

**Create**: `frontend/src/components/Visualization/FeatureImportancePanel.jsx`

```jsx
import React, { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export default function FeatureImportancePanel({ snapshot }) {
  const [selectedNode, setSelectedNode] = useState(0)
  
  if (!snapshot?.feature_importance) {
    return <div className="text-slate-400 p-4">No feature importance data</div>
  }
  
  const nodeData = snapshot.feature_importance[selectedNode]
  if (!nodeData) return null
  
  const chartData = nodeData.top_features.map(([featureIdx, importance]) => ({
    feature: `F${featureIdx}`,
    importance: Number(importance.toFixed(4))
  }))
  
  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
      <h3 className="text-sm font-bold text-slate-300 mb-3">Feature Importance (Node {selectedNode})</h3>
      
      <input 
        type="range" 
        min="0" 
        max={snapshot.feature_importance.length - 1}
        value={selectedNode}
        onChange={(e) => setSelectedNode(Number(e.target.value))}
        className="w-full mb-4"
      />
      
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData}>
          <XAxis dataKey="feature" stroke="#94a3b8" />
          <YAxis stroke="#94a3b8" />
          <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }} />
          <Bar dataKey="importance" fill="#3b82f6" radius={4} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

---

## FEATURE 2: Gradient Flow Visualization

### Backend: `backend/tasks/node_classification.py`

**What to add**:
- Track gradient magnitude at each layer
- Identify vanishing/exploding gradients

**Code to add**:
```python
# ─ Gradient Flow Analysis ──────────────────────────────────────────
def analyze_gradient_flow(model, loss, device):
    """Track gradient magnitude through layers."""
    gradient_stats = {}
    
    for name, param in model.named_parameters():
        if param.grad is not None:
            grad_norm = param.grad.data.norm().item()
            param_norm = param.data.norm().item()
            gradient_stats[name] = {
                'grad_norm': grad_norm,
                'param_norm': param_norm,
                'grad_ratio': grad_norm / (param_norm + 1e-8),
                'is_vanishing': grad_norm < 1e-6,
                'is_exploding': grad_norm > 100.0
            }
    
    return gradient_stats
```

### Frontend: New Component `GradientFlowPanel.jsx`

**Create**: `frontend/src/components/Visualization/GradientFlowPanel.jsx`

```jsx
import React from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export default function GradientFlowPanel({ snapshot }) {
  const gradientFlow = snapshot?.gradient_flow
  
  if (!gradientFlow) {
    return <div className="text-slate-400 p-4">No gradient flow data</div>
  }
  
  const chartData = Object.entries(gradientFlow).map(([layer, stats]) => ({
    layer: layer.replace('module.', '').substring(0, 20),
    gradNorm: Number(stats.grad_norm.toFixed(4)),
    paramNorm: Number(stats.param_norm.toFixed(4))
  }))
  
  const hasVanishing = Object.values(gradientFlow).some(s => s.is_vanishing)
  const hasExploding = Object.values(gradientFlow).some(s => s.is_exploding)
  
  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
      <h3 className="text-sm font-bold text-slate-300 mb-2">Gradient Flow Analysis</h3>
      
      {(hasVanishing || hasExploding) && (
        <div className={`text-xs p-2 rounded mb-3 ${hasVanishing ? 'bg-yellow-900/30 text-yellow-300' : 'bg-red-900/30 text-red-300'}`}>
          {hasVanishing && '⚠ Vanishing gradients detected'}
          {hasExploding && '⚠ Exploding gradients detected'}
        </div>
      )}
      
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData}>
          <XAxis dataKey="layer" stroke="#94a3b8" fontSize={10} />
          <YAxis stroke="#94a3b8" />
          <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }} />
          <Legend />
          <Line type="monotone" dataKey="gradNorm" stroke="#ef4444" dot={false} />
          <Line type="monotone" dataKey="paramNorm" stroke="#3b82f6" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

---

## FEATURE 3: GAT Attention Weights

### Update Backend: Use existing attention weights

The backend already captures attention weights! Just ensure they're in the snapshot:
```python
# Already in snapshot:
snapshot['attention_weights'] = attn_data
```

### Frontend: New Component `AttentionVisualization.jsx`

**Create**: `frontend/src/components/Visualization/AttentionVisualization.jsx`

```jsx
import React, { useState } from 'react'
import { AlertCircle } from 'lucide-react'

export default function AttentionVisualization({ snapshot, graphData }) {
  const [selectedNode, setSelectedNode] = useState(0)
  const [selectedHead, setSelectedHead] = useState(0)
  
  if (!snapshot?.attention_weights || !graphData?.edges) {
    return (
      <div className="text-slate-400 p-4 flex items-center gap-2">
        <AlertCircle size={16} /> No attention data (Graph Attention Networks only)
      </div>
    )
  }
  
  const attnWeights = snapshot.attention_weights
  const numHeads = attnWeights.length || 1
  const headData = attnWeights[selectedHead] || {}
  const nodeAttention = headData[selectedNode] || []
  
  // Build visualization: node → neighbors with attention weights
  const neighborWeights = []
  if (graphData.edges && graphData.edges.length > 0) {
    const edges = graphData.edges
    const outgoingEdges = edges.filter(e => e[0] === selectedNode)
    
    outgoingEdges.forEach(([src, tgt]) => {
      const weight = nodeAttention[tgt] || 0
      neighborWeights.push({
        target: tgt,
        weight: Number((weight * 100).toFixed(2)),
        isHighlight: weight > 0.3
      })
    })
  }
  
  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-4 space-y-3">
      <h3 className="text-sm font-bold text-slate-300">Attention Weights (GAT)</h3>
      
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-slate-400 block mb-1">Node</label>
          <input 
            type="range" 
            min="0" 
            max={Object.keys(headData).length - 1}
            value={selectedNode}
            onChange={(e) => setSelectedNode(Number(e.target.value))}
            className="w-full"
          />
          <span className="text-xs text-slate-300">Node {selectedNode}</span>
        </div>
        
        <div>
          <label className="text-xs text-slate-400 block mb-1">Head</label>
          <input 
            type="range" 
            min="0" 
            max={numHeads - 1}
            value={selectedHead}
            onChange={(e) => setSelectedHead(Number(e.target.value))}
            className="w-full"
          />
          <span className="text-xs text-slate-300">Head {selectedHead}</span>
        </div>
      </div>
      
      <div className="max-h-40 overflow-y-auto">
        {neighborWeights.map((nw, i) => (
          <div key={i} className="flex items-center gap-2 py-1">
            <span className="text-xs text-slate-400 w-12">→ {nw.target}</span>
            <div className="flex-1 bg-slate-700 rounded h-5 overflow-hidden">
              <div 
                className={`h-full transition-all ${nw.isHighlight ? 'bg-blue-500' : 'bg-slate-600'}`}
                style={{ width: nw.weight + '%' }}
              />
            </div>
            <span className="text-xs text-slate-300 w-8 text-right">{nw.weight}%</span>
          </div>
        ))}
        {neighborWeights.length === 0 && <p className="text-xs text-slate-500">No outgoing edges</p>}
      </div>
    </div>
  )
}
```

---

## FEATURE 4: UMAP & t-SNE Projections

### Backend: Add dimensionality reduction

**Install packages**:
```bash
pip install umap-learn scikit-learn
```

**Add to `backend/requirements.txt`**:
```
umap-learn>=0.5.0
scikit-learn>=1.0.0
```

**Backend computation**:
```python
def compute_advanced_projections(embeddings_2d, embeddings_full):
    """Compute UMAP and t-SNE projections."""
    from umap import UMAP
    from sklearn.manifold import TSNE
    
    # UMAP
    umap_reducer = UMAP(n_components=2, n_neighbors=15, metric='euclidean')
    umap_proj = umap_reducer.fit_transform(embeddings_full)
    
    # t-SNE (slower, only if < 1000 nodes)
    tsne_proj = None
    if embeddings_full.shape[0] < 1000:
        tsne = TSNE(n_components=2, random_state=42, perplexity=min(30, embeddings_full.shape[0]//3))
        tsne_proj = tsne.fit_transform(embeddings_full)
    
    return {
        'umap': umap_proj.tolist(),
        'tsne': tsne_proj.tolist() if tsne_proj is not None else None
    }

# In snapshot:
snapshot['projections'] = compute_advanced_projections(
    emb_2d, 
    data.x.cpu().numpy()
)
```

### Frontend: Projection selector

**Update**: `frontend/src/components/EmbeddingView/EmbeddingView.jsx`

Add toggle to switch between PCA (current 2D) vs UMAP vs t-SNE:
```jsx
const [projectionType, setProjectionType] = useState('pca') // 'pca', 'umap', 'tsne'

const getProjectionData = () => {
  const snapshot = playerStore.currentSnapshot || {}
  
  switch(projectionType) {
    case 'umap': return snapshot.projections?.umap || snapshot.embeddings_2d
    case 'tsne': return snapshot.projections?.tsne || snapshot.embeddings_2d
    default: return snapshot.embeddings_2d
  }
}
```

---

## Implementation Order

1. **Backend Feature Importance** (30 min) - Add gradient-based attribution
2. **Frontend Feature Importance** (30 min) - Create FeatureImportancePanel.jsx
3. **Backend Gradient Flow** (30 min) - Add gradient analysis
4. **Frontend Gradient Flow** (30 min) - Create GradientFlowPanel.jsx
5. **Update existing Attention** (30 min) - Use already-computed attention data
6. **Frontend Attention Panel** (1 hr) - Create AttentionVisualization.jsx
7. **Backend Projections** (1 hr) - Add UMAP/t-SNE computation
8. **Frontend Projection Selector** (1 hr) - Add toggle in EmbeddingView
9. **Integration & Testing** (1-2 hrs) - Wire everything together

**Total**: 8-10 hours

---

## Files to Create/Modify

### Create (3 files):
- `frontend/src/components/Visualization/FeatureImportancePanel.jsx`
- `frontend/src/components/Visualization/GradientFlowPanel.jsx`
- `frontend/src/components/Visualization/AttentionVisualization.jsx`

### Modify (4 files):
- `backend/tasks/node_classification.py` - Add feature importance & gradient flow
- `backend/tasks/graph_classification.py` - Same for Task 2
- `backend/requirements.txt` - Add umap-learn
- `frontend/src/components/EmbeddingView/EmbeddingView.jsx` - Projection selector

---

## Ready to start Phase 2?

Type: `CONTINUE PHASE 2` to start implementing these features.
