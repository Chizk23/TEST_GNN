"""
Task 1: Node Classification
Trains GCN/GAT/GraphSAGE on a node classification dataset.
Streams epoch snapshots via WebSocket.
"""
import asyncio
import numpy as np
import torch
import torch.nn.functional as F
from sklearn.decomposition import PCA


def compute_feature_importance(model, x, edge_index, device):
    """
    Compute per-node feature importance using gradient-based attribution.
    Identifies which input features contributed most to each node's prediction.
    """
    x_attr = x.clone().detach().requires_grad_(True).to(device)
    
    with torch.enable_grad():
        logits = model(x_attr, edge_index)[0]
        pred_probs = torch.softmax(logits, dim=1)
    
    importances = []
    for node_id in range(x.size(0)):
        pred_class = logits[node_id].argmax().item()
        score = pred_probs[node_id, pred_class]
        
        if x_attr.grad is not None:
            x_attr.grad.zero_()
        
        score.backward(retain_graph=True)
        
        node_importance = x_attr.grad[node_id].abs().cpu().tolist() if x_attr.grad is not None else [0.0] * x.size(1)
        top_features = sorted(enumerate(node_importance), key=lambda idx_val: idx_val[1], reverse=True)[:5]
        
        importances.append({
            'node_id': node_id,
            'importance': node_importance,
            'top_features': [[int(idx), float(val)] for idx, val in top_features]
        })
    
    return importances


def analyze_gradient_flow(model):
    """
    Track gradient magnitude through layers to identify vanishing/exploding gradients.
    """
    gradient_stats = {}
    
    for name, param in model.named_parameters():
        if param.grad is not None:
            grad_norm = param.grad.data.norm().item()
            param_norm = param.data.norm().item()
            gradient_stats[name] = {
                'grad_norm': float(grad_norm),
                'param_norm': float(param_norm),
                'grad_ratio': float(grad_norm / (param_norm + 1e-8)),
                'is_vanishing': bool(grad_norm < 1e-6),
                'is_exploding': bool(grad_norm > 100.0)
            }
    
    return gradient_stats


async def run_node_classification(config, data, model, optimizer, websocket, stop_flag):
    """
    Main training loop for node classification.
    Streams one snapshot per epoch via WebSocket.
    """
    epochs = config.get('epochs', 100)
    epoch_snapshots = []

    for epoch in range(epochs):
        if stop_flag():
            break

        # ── Training Step ──────────────────────────────────────────────────
        model.train()
        optimizer.zero_grad()
        outputs = model(data.x, data.edge_index)
        out, embedding = outputs[0], outputs[1]

        loss = F.cross_entropy(out[data.train_mask], data.y[data.train_mask])
        loss.backward()
        optimizer.step()

        # ── Evaluation ─────────────────────────────────────────────────────
        model.eval()
        with torch.no_grad():
            eval_outputs = model(data.x, data.edge_index)
            out_eval, embedding_eval = eval_outputs[0], eval_outputs[1]

            val_loss = F.cross_entropy(out_eval[data.val_mask], data.y[data.val_mask])
            pred = out_eval.argmax(dim=1)
            val_acc = (pred[data.val_mask] == data.y[data.val_mask]).float().mean()
            train_acc = (pred[data.train_mask] == data.y[data.train_mask]).float().mean()

        # ── PCA Reduction ───────────────────────────────────────────────────
        emb_np = embedding_eval.cpu().numpy()
        pca = PCA(n_components=2)
        emb_2d = pca.fit_transform(emb_np).tolist()

        # ── Dirichlet Energy (oversmoothing metric) ───────────────────
        # D = (1/|E|) * sum_{(i,j) in E} ||h_i - h_j||^2
        # Small D → oversmoothed (all nodes same embedding)
        try:
            row, col = data.edge_index
            diff = embedding_eval[row] - embedding_eval[col]
            dirichlet_energy = float((diff ** 2).sum(dim=1).mean().item())
        except Exception as e:
            print("Dirichlet Energy Error:", e)
            dirichlet_energy = 0.0

        # ── Attention Weights (GAT only) ────────────────────────────────────
        attn_data = None
        if len(eval_outputs) > 2 and eval_outputs[2] is not None:
            attn_raw = eval_outputs[2].cpu().numpy()
            # Normalize to [0, 1] per-edge
            attn_min, attn_max = attn_raw.min(), attn_raw.max()
            if attn_max > attn_min:
                attn_data = ((attn_raw - attn_min) / (attn_max - attn_min)).tolist()
            else:
                attn_data = attn_raw.tolist()

        # ── Explainability Data ─────────────────────────────────────────────
        
        # 1. Softmax probabilities per node (real confidence, not hardcoded)
        probs = F.softmax(out_eval, dim=1)
        node_probabilities = probs.cpu().tolist()
        
        # 2. Confidence score (max probability per node)
        node_confidence = probs.max(dim=1).values.cpu().tolist()
        
        # 3. Correctness flag (prediction == ground truth)
        node_correctness = (pred == data.y).cpu().tolist()
        
        # 4. Neighbor context (majority neighbor class per node)
        try:
            edge_index_np = data.edge_index.cpu().numpy()
            num_nodes = data.x.size(0)
            pred_list = pred.cpu().tolist()
            
            # Build adjacency list
            neighbors = [[] for _ in range(num_nodes)]
            for i in range(edge_index_np.shape[1]):
                src, tgt = int(edge_index_np[0, i]), int(edge_index_np[1, i])
                if src != tgt:  # Skip self-loops
                    neighbors[src].append(tgt)
                    neighbors[tgt].append(src)
            
            # Compute majority neighbor class
            from collections import Counter
            neighbor_majority = []
            neighbor_agreement = []
            
            for node_id in range(num_nodes):
                if len(neighbors[node_id]) == 0:
                    neighbor_majority.append({'majority_class': -1, 'majority_ratio': 0.0, 'total_neighbors': 0})
                    neighbor_agreement.append(0)
                    continue
                
                # Count classes among neighbors
                neighbor_classes = {}
                for neighbor_id in neighbors[node_id]:
                    neighbor_class = pred_list[neighbor_id]
                    neighbor_classes[neighbor_class] = neighbor_classes.get(neighbor_class, 0) + 1
                
                # Find majority
                majority_class = max(neighbor_classes.keys(), key=lambda k: neighbor_classes[k])
                majority_count = neighbor_classes[majority_class]
                majority_ratio = majority_count / len(neighbors[node_id])
                
                neighbor_majority.append({
                    'majority_class': int(majority_class),
                    'majority_ratio': float(majority_ratio),
                    'total_neighbors': len(neighbors[node_id])
                })
                
                # Check if this node agrees with its neighbors' majority
                node_pred = pred_list[node_id]
                agrees = 1 if node_pred == majority_class else 0
                neighbor_agreement.append(agrees)
        except Exception as e:
            print(f"Neighbor context computation failed: {e}")
            neighbor_majority = [{'majority_class': -1, 'majority_ratio': 0.0, 'total_neighbors': 0}] * data.x.size(0)

        # ── Phase 2: Feature Importance & Gradient Flow ────────────────────
        feature_importance_data = None
        gradient_flow_data = None
        
        try:
            # Compute feature importance (gradient-based attribution)
            feature_importance_data = compute_feature_importance(model, data.x, data.edge_index, data.x.device)
        except Exception as e:
            print(f"Feature importance computation failed: {e}")
            feature_importance_data = []
        
        try:
            # Analyze gradient flow through layers
            gradient_flow_data = analyze_gradient_flow(model)
        except Exception as e:
            print(f"Gradient flow analysis failed: {e}")
            gradient_flow_data = {}

        # ── Build Snapshot ──────────────────────────────────────────────────
        snapshot = {
            'epoch': epoch,
            'node_predictions': pred.cpu().tolist(),
            'node_probabilities': node_probabilities,
            'node_confidence': node_confidence,
            'node_correctness': node_correctness,
            'neighbor_majority': neighbor_majority,
            'neighbor_agreement': neighbor_agreement,
            'embeddings_2d': emb_2d,
            'attention_weights': attn_data,
            'train_loss': float(loss.item()),
            'val_loss': float(val_loss.item()),
            'train_acc': float(train_acc.item()),
            'val_acc': float(val_acc.item()),
            'dirichlet_energy': dirichlet_energy,
            'feature_importance': feature_importance_data,
            'gradient_flow': gradient_flow_data,
        }
        epoch_snapshots.append(snapshot)

        # ── Stream to Frontend ──────────────────────────────────────────────
        await websocket.send_json({
            'type': 'epoch_snapshot',
            'data': snapshot,
            'progress': (epoch + 1) / epochs,
        })

        # Small yield to keep WebSocket responsive
        await asyncio.sleep(0.005)

    return epoch_snapshots
