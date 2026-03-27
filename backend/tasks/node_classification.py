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
            
            # Overall accuracy for the entire graph
            overall_acc = (pred == data.y).float().mean()

        # ── PCA Reduction ───────────────────────────────────────────────────
        emb_np = embedding_eval.cpu().numpy()
        pca = PCA(n_components=2)
        emb_2d = pca.fit_transform(emb_np).tolist()

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

        # ── Build Snapshot ──────────────────────────────────────────────────
        snapshot = {
            'epoch': epoch,
            'node_predictions': pred.cpu().tolist(),
            'embeddings_2d': emb_2d,
            'attention_weights': attn_data,
            'train_loss': float(loss.item()),
            'val_loss': float(val_loss.item()),
            'train_acc': float(train_acc.item()),
            'val_acc': float(val_acc.item()),
            'overall_acc': float(overall_acc.item()),
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
