---
name: XAI GNN Streamlit Workflow
description: Specialized workflows for Graph Neural Networks and Explainable AI within Streamlit.
---

# XAI GNN Streamlit Skill

This skill optimizes the development of AI projects focusing on GNNs and their interpretability.

## Core Libraries
- **GNNs**: PyTorch Geometric (`torch_geometric`), NetworkX.
- **XAI**: GNNExplainer, Captum, SHAP, Integrated Gradients.
- **Visualization**: Plotly, Streamlit-AgGrid, Pyvis.

## Execution Workflow

1. **Model Loading**: Use `@st.cache_resource` for loading heavy GNN models.
2. **Interactive Visualization**:
    - Use `pyvis` for interactive graph explores.
    - Use `Integrated Gradients` to highlight node/edge importance.
3. **XAI Reports**:
    - Generate local explanations for specific nodes.
    - Compare model confidence vs. explanation strength.

## Example Visualization Pattern

```python
import streamlit as st
import torch
from torch_geometric.explain import Explainer, GNNExplainer

def explain_node(model, data, node_index):
    explainer = Explainer(
        model=model,
        algorithm=GNNExplainer(epochs=200),
        explanation_type='model',
        node_mask_type='object',
        edge_mask_type='object',
        model_config=dict(
            mode='multiclass_classification',
            task_level='node',
            return_type='log_probs',
        ),
    )
    explanation = explainer(data.x, data.edge_index, index=node_index)
    return explanation
```
