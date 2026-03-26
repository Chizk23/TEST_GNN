import asyncio
import json
import traceback
import numpy as np
import sys
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from api.user_loader import router as user_loader_router

try:
    import torch
    import torch.nn.functional as F
    from sklearn.decomposition import PCA
    from models.gcn import GCNModel
    from models.gat import GATModel
    from models.graphsage import GraphSAGEModel
    from data.loaders import load_cora, load_citeseer, load_csv, get_available_datasets
    from tasks.node_classification import run_node_classification
    from tasks.graph_classification import run_graph_classification
    from tasks.link_prediction import run_link_prediction
    from tasks.community_detection import run_community_detection
    from tasks.graph_embedding import run_graph_embedding

    HAS_TORCH = True
except ImportError as e:
    HAS_TORCH = False
    print(f"Warning: ML modules not found ({e}). Running in API-only mode (No training/PyTorch).", file=sys.stderr)

app = FastAPI(title="GNN-Insight Backend")

app.include_router(user_loader_router, prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global stop flag and model cache
_stop_training = False
LAST_TRAINED_MODELS = {}


def stop_flag():
    return _stop_training


def build_model(config, data=None, num_features=None, num_classes=None):
    model_type = config.get('model', 'GCN')
    hidden = config.get('hidden', 64)
    dropout = config.get('dropout', 0.5)
    
    if data is not None:
        num_features = data.x.size(1)
        num_classes = int(data.y.max().item()) + 1
    elif num_features is None or num_classes is None:
        # Default fallback for Cora
        num_features = 1433
        num_classes = 7

    if model_type == 'GCN':
        return GCNModel(num_features, hidden, num_classes, dropout)
    elif model_type == 'GAT':
        heads = config.get('heads', 4)
        return GATModel(num_features, hidden, num_classes, heads, dropout)
    elif model_type == 'SAGE':
        return GraphSAGEModel(num_features, hidden, num_classes, dropout)
    else:
        return GCNModel(num_features, hidden, num_classes, dropout)


def load_dataset(name):
    if name == 'cora':
        return load_cora()
    elif name == 'citeseer':
        return load_citeseer()
    else:
        return load_cora()


def build_graph_json(data):
    """Convert PyG data to JSON-serializable graph structure."""
    edge_index = data.edge_index.cpu().numpy()
    num_nodes = data.x.size(0)
    degrees = np.zeros(num_nodes)
    links = []

    for i in range(edge_index.shape[1]):
        src, tgt = int(edge_index[0, i]), int(edge_index[1, i])
        if src < tgt:
            links.append({'source': src, 'target': tgt})
        degrees[src] += 1

    nodes = [{
        'id': i,
        'degree': int(degrees[i]),
        'groundTruth': int(data.y[i].item()),
        'inTrainSet': bool(data.train_mask[i].item()),
    } for i in range(num_nodes)]

    return {'nodes': nodes, 'links': links}


@app.websocket("/ws/train")
async def train_websocket(websocket: WebSocket):
    global _stop_training
    await websocket.accept()

    try:
        config = await websocket.receive_json()
        _stop_training = False

        if not HAS_TORCH:
            await websocket.send_json({
                'type': 'error',
                'message': 'Backend is running in lightweight API mode (PyTorch not installed). Real training disabled.'
            })
            return

        task_id = config.get('task', 1)

        # ── Task 2: Graph Classification ───────────────────────────────────
        if task_id == 2:
            epoch_snapshots = await run_graph_classification(config, websocket, stop_flag)
            await websocket.send_json({
                'type': 'training_complete',
                'all_snapshots': epoch_snapshots,
            })
            return

        # ── Task 3: Link Prediction ────────────────────────────────────────
        if task_id == 3:
            dataset_name = config.get('dataset', 'cora')
            data = load_dataset(dataset_name)
            model_type = config.get('model', 'GCN')
            epoch_snapshots = await run_link_prediction(
                config, data, model_type, websocket, stop_flag
            )
            await websocket.send_json({
                'type': 'training_complete',
                'all_snapshots': epoch_snapshots,
            })
            return

        # ── Task 4: Community Detection ────────────────────────────────────
        if task_id == 4:
            dataset_name = config.get('dataset', 'cora')
            data = load_dataset(dataset_name)
            model_type = config.get('model', 'GCN')
            epoch_snapshots = await run_community_detection(
                config, data, model_type, websocket, stop_flag
            )
            await websocket.send_json({
                'type': 'training_complete',
                'all_snapshots': epoch_snapshots,
            })
            return

        # ── Task 5: Graph Embedding ────────────────────────────────────────
        if task_id == 5:
            dataset_name = config.get('dataset', 'cora')
            data = load_dataset(dataset_name)
            model_type = config.get('model', 'GCN')
            
            # Send graph structure to frontend first
            graph_json = build_graph_json(data)
            await websocket.send_json({
                'type': 'graph_data',
                'data': {
                    'graphData': graph_json,
                    'groundTruth': data.y.cpu().tolist(),
                },
            })

            epoch_snapshots = await run_graph_embedding(
                config, data, model_type, websocket, stop_flag
            )
            await websocket.send_json({
                'type': 'training_complete',
                'all_snapshots': epoch_snapshots,
            })
            return

        # ── Task 1 (default): Node Classification ─────────────────────────
        dataset_name = config.get('dataset', 'cora')
        data = load_dataset(dataset_name)
        model = build_model(config, data)
        optimizer = torch.optim.Adam(
            model.parameters(),
            lr=config.get('lr', 0.01),
            weight_decay=5e-4,
        )

        # Send graph structure to frontend
        graph_json = build_graph_json(data)
        await websocket.send_json({
            'type': 'graph_data',
            'data': {
                'graphData': graph_json,
                'groundTruth': data.y.cpu().tolist(),
            },
        })

        epoch_snapshots = await run_node_classification(
            config, data, model, optimizer, websocket, stop_flag
        )

        # ── Save model for inductive prediction ───────────────────────────
        LAST_TRAINED_MODELS['node_classification'] = {
            'state_dict': model.state_dict(),
            'config': config,
            'num_features': data.x.size(1),
            'num_classes': int(data.y.max().item()) + 1
        }

        await websocket.send_json({
            'type': 'training_complete',
            'all_snapshots': epoch_snapshots,
        })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({
                'type': 'error',
                'message': str(e),
                'traceback': traceback.format_exc(),
            })
        except Exception:
            pass


@app.get("/api/datasets")
def list_datasets():
    if not HAS_TORCH: return ["Mock Data"]
    return get_available_datasets()


@app.post("/api/stop")
def stop_current_training():
    global _stop_training
    _stop_training = True
    return {"status": "stopping"}


@app.post("/api/upload")
async def upload_csv(nodes: UploadFile = File(...), edges: UploadFile = File(...)):
    import tempfile
    import os

    with tempfile.TemporaryDirectory() as tmpdir:
        nodes_path = os.path.join(tmpdir, 'nodes.csv')
        edges_path = os.path.join(tmpdir, 'edges.csv')

        with open(nodes_path, 'wb') as f:
            f.write(await nodes.read())
        with open(edges_path, 'wb') as f:
            f.write(await edges.read())

        if not HAS_TORCH:
            return {"error": "PyTorch is not installed in the backend"}

        data = load_csv(nodes_path, edges_path)
        return {
            'num_nodes': data.x.size(0),
            'num_edges': data.edge_index.size(1),
            'num_features': data.x.size(1),
            'num_classes': int(data.y.max().item()) + 1,
        }


@app.post("/api/inductive-predict")
async def inductive_predict(payload: dict):
    """
    Real inductive prediction for a new node.
    Uses weights from the last trained model in the current session.
    """
    features = payload.get('features', [])
    model_info = LAST_TRAINED_MODELS.get('node_classification')

    if not model_info or not HAS_TORCH:
        # Fallback to random if no model trained yet
        import random
        num_classes = model_info.get('num_classes', 7) if model_info else 7
        probs = [random.random() for _ in range(num_classes)]
        total = sum(probs)
        probs = [p / total for p in probs]
        return {
            'predicted_class': probs.index(max(probs)),
            'probabilities': probs,
            'is_mock': True
        }

    # Prepare features
    x = torch.tensor([features], dtype=torch.float)
    
    # Reconstruct model
    config = model_info['config']
    model = build_model(
        config, 
        num_features=model_info['num_features'], 
        num_classes=model_info['num_classes']
    )
    model.load_state_dict(model_info['state_dict'])
    model.eval()

    with torch.no_grad():
        # For inductive prediction of a single isolated node:
        # We simulate the edge_index as a self-loop since we don't have neighbor info
        # in this simple CSV upload demo for single node prediction.
        edge_index = torch.tensor([[0], [0]], dtype=torch.long)
        logits, _ = model(x, edge_index)
        probs = F.softmax(logits, dim=1).squeeze().tolist()
        pred = int(logits.argmax(dim=1).item())

    return {
        'predicted_class': pred,
        'probabilities': probs,
        'is_mock': False
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
