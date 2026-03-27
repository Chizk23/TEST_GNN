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

from contextlib import asynccontextmanager
from database.mysql import init_db, AsyncSessionLocal
from database.mongodb import init_mongodb
from database.redis_client import init_redis
from api.projects import router as projects_router
from database.models import Project, Dataset, TrainingRun
from sqlalchemy import select
from services.snapshot_service import save_training_run
from services.cache_service import cache_best_run
import uuid

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Init datastores
    await init_db()
    await init_mongodb()
    await init_redis()
    
    # Ensure default project exists
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Project).where(Project.name == "Default Project"))
        if not result.scalars().first():
            from services.project_service import create_project
            await create_project(session, "Default Project", "Auto-generated project for backward compatibility.")
    yield

app = FastAPI(title="GNN-Insight Backend", lifespan=lifespan)

app.include_router(user_loader_router, prefix="/api")
app.include_router(projects_router, prefix="/api")

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

async def _save_run_results(config: dict, task_type: int, model_type: str, epoch_snapshots: list):
    project_id = config.get("project_id")
    dataset_id = config.get("dataset_id")
    
    async with AsyncSessionLocal() as session:
        if not project_id:
            result = await session.execute(select(Project).where(Project.name == "Default Project"))
            proj = result.scalars().first()
            project_id = proj.id if proj else str(uuid.uuid4())
            
        if not dataset_id:
            result = await session.execute(select(Dataset).where(Dataset.project_id == project_id))
            ds = result.scalars().first()
            if not ds:
                ds = Dataset(project_id=project_id, name=config.get('dataset', 'cora'), source_type="builtin", column_mapping={})
                session.add(ds)
                await session.commit()
                await session.refresh(ds)
            dataset_id = ds.id
            
        best_epoch = epoch_snapshots[-1].get("epoch", 0) if epoch_snapshots else 0
        best_acc = max([s.get("val_acc", 0) for s in epoch_snapshots], default=0.0)
        best_auc = max([s.get("auc", 0) for s in epoch_snapshots], default=0.0)
        best_mod = max([s.get("modularity", 0) for s in epoch_snapshots], default=0.0)
            
        run_record = TrainingRun(
            project_id=project_id,
            dataset_id=dataset_id,
            task_type=task_type,
            model_type=model_type,
            hyperparams=config,
            status="done",
            best_epoch=best_epoch,
            best_val_acc=best_acc,
            best_auc=best_auc,
            best_modularity=best_mod
        )
        session.add(run_record)
        await session.commit()
        await session.refresh(run_record)
        run_id = run_record.id

    try:
        await save_training_run(run_id, project_id, epoch_snapshots, best_epoch)
        await cache_best_run(run_id)
    except Exception as e:
        print(f"Warning: Failed to save to MongoDB/Redis: {e}")
        
    return run_id



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
            model_type = config.get('model', 'GCN') # Define model_type for this task
            epoch_snapshots = await run_graph_classification(config, websocket, stop_flag)
            await _save_run_results(config, task_id, model_type, epoch_snapshots)
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
            await _save_run_results(config, task_id, model_type, epoch_snapshots)
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
            await _save_run_results(config, task_id, model_type, epoch_snapshots)
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
            await _save_run_results(config, task_id, model_type, epoch_snapshots)
            await websocket.send_json({
                'type': 'training_complete',
                'all_snapshots': epoch_snapshots,
            })
            return

        # ── Task 6: Graph Generation ───────────────────────────────────────
        if task_id == 6:
            dataset_name = config.get('dataset', 'cora')
            data = load_dataset(dataset_name)
            model_type = config.get('model', 'GCN')
            
            # Send graph structure so the frontend has context
            graph_json = build_graph_json(data)
            await websocket.send_json({
                'type': 'graph_data',
                'data': {
                    'graphData': graph_json,
                    'groundTruth': data.y.cpu().tolist(),
                },
            })
            # Reuse graph_embedding backend as a generative autoencoder stub
            epoch_snapshots = await run_graph_embedding(
                config, data, model_type, websocket, stop_flag
            )
            await _save_run_results(config, task_id, model_type, epoch_snapshots)
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

        await _save_run_results(config, 1, config.get('model', 'GCN'), epoch_snapshots)
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
