# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  GNN-INSIGHT — PROMPT: BACKEND + DATABASE CHO 4 NHIỆM VỤ ĐẦU TIÊN     ║
# ║  Task 1: Node Classification  · Task 2: Graph Classification           ║
# ║  Task 3: Link Prediction      · Task 4: Community Detection            ║
# ║  Stack: FastAPI + PyG + MySQL + MongoDB + Redis + Celery               ║
# ╚══════════════════════════════════════════════════════════════════════════╝
#
# PASTE TOÀN BỘ NỘI DUNG TỪ ===BEGIN=== ĐẾN ===END=== VÀO AI TOOL
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

===BEGIN===

Bạn là Senior Backend Developer. Build toàn bộ backend + database integration
cho GNN-INSIGHT — nền tảng train và visualize Graph Neural Networks.

Tech stack cố định:
- FastAPI + Uvicorn (Python 3.11, async)
- PyTorch 2.x + torch-geometric (PyG)
- MySQL 8 (SQLAlchemy async) — lưu metadata
- MongoDB 7 (motor async) — lưu epoch snapshots
- Redis 7 + Celery 5 — task queue
- scikit-learn — PCA, preprocessing
- pandas + openpyxl — parse user data

Yêu cầu: code 4 nhiệm vụ đầu tiên ĐẦY ĐỦ, không placeholder, không TODO.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PHẦN 0 — PROJECT STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```
backend/
├── app/
│   ├── main.py                     # FastAPI app entry point
│   ├── config.py                   # Settings (DB URLs, Redis, JWT secret)
│   ├── database/
│   │   ├── mysql.py                # SQLAlchemy async engine + session
│   │   └── mongodb.py              # Motor async client + collection helpers
│   ├── models/                     # SQLAlchemy ORM models (MySQL)
│   │   ├── user.py
│   │   ├── project.py
│   │   ├── dataset.py
│   │   └── training_run.py
│   ├── schemas/                    # Pydantic request/response schemas
│   │   ├── dataset.py
│   │   └── training.py
│   ├── routers/
│   │   ├── datasets.py             # Upload, configure, validate
│   │   └── training.py             # Start, cancel, get snapshots, WebSocket
│   ├── services/
│   │   ├── data_builder.py         # Build PyG Data từ user CSV/Excel
│   │   └── snapshot_service.py     # Lưu/đọc snapshots MongoDB
│   └── websocket/
│       └── manager.py              # WebSocket ConnectionManager
workers/
├── celery_app.py                   # Celery config
├── training_task.py                # Main Celery task dispatcher
├── models/
│   ├── gcn.py
│   ├── gat.py
│   └── graphsage.py
└── tasks/
    ├── task1_node_classification.py
    ├── task2_graph_classification.py
    ├── task3_link_prediction.py
    └── task4_community_detection.py
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PHẦN 1 — MYSQL SCHEMA (SQLAlchemy Async ORM)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```python
# app/database/mysql.py
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

engine = create_async_engine(settings.MYSQL_URL, echo=False, pool_size=10, max_overflow=20)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
```

```python
# app/models/dataset.py
import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Float, JSON, DateTime, ForeignKey, Enum, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.mysql import Base

class Dataset(Base):
    __tablename__ = "datasets"

    id:               Mapped[str]      = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id:       Mapped[str]      = mapped_column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name:             Mapped[str]      = mapped_column(String(120), nullable=False)
    source_type:      Mapped[str]      = mapped_column(Enum("upload", "builtin"), nullable=False)
    builtin_name:     Mapped[str|None] = mapped_column(String(50))
    nodes_file_path:  Mapped[str|None] = mapped_column(String(500))
    edges_file_path:  Mapped[str|None] = mapped_column(String(500))
    graphs_file_path: Mapped[str|None] = mapped_column(String(500))  # Task 2 only
    node_count:       Mapped[int|None] = mapped_column(Integer)
    edge_count:       Mapped[int|None] = mapped_column(Integer)
    graph_count:      Mapped[int|None] = mapped_column(Integer)      # Task 2 only
    feature_dim:      Mapped[int|None] = mapped_column(Integer)
    edge_feature_dim: Mapped[int|None] = mapped_column(Integer)      # Task 3,4
    num_classes:      Mapped[int|None] = mapped_column(Integer)
    # Column mapping config từ frontend TaskConfigurator
    column_mapping:   Mapped[dict]     = mapped_column(JSON, nullable=False)
    # {
    #   "node_id": "node_id",
    #   "features": ["age", "salary", "years_exp"],
    #   "label": "dept",
    #   "split": "split",
    #   "graph_id": null,              # Task 2,6
    #   "edge_source": "source",
    #   "edge_target": "target",
    #   "edge_weight": "weight",
    #   "edge_feats": ["freq", "type"],
    #   "edge_label": null             # Task 3
    # }
    file_size_mb:     Mapped[float]    = mapped_column(Float, default=0.0)
    is_validated:     Mapped[bool]     = mapped_column(Boolean, default=False)
    created_at:       Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

```python
# app/models/training_run.py
import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Float, JSON, DateTime, ForeignKey, Enum, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database.mysql import Base

class TrainingRun(Base):
    __tablename__ = "training_runs"

    id:            Mapped[str]      = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id:    Mapped[str]      = mapped_column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    dataset_id:    Mapped[str]      = mapped_column(String(36), ForeignKey("datasets.id"), nullable=False)
    model_type:    Mapped[str]      = mapped_column(Enum("gcn", "gat", "graphsage"), nullable=False)
    task_type:     Mapped[str]      = mapped_column(
        Enum("node_classification", "graph_classification", "link_prediction", "community_detection"),
        nullable=False
    )
    hyperparams:   Mapped[dict]     = mapped_column(JSON, nullable=False)
    # {
    #   "epochs": 200, "lr": 0.01, "hidden": 64,
    #   "dropout": 0.5, "layers": 2,
    #   "heads": 4,           # GAT only
    #   "num_communities": 4, # Task 4 only
    #   "sage_aggr": "mean"   # SAGE only: mean|max|lstm
    # }
    status:        Mapped[str]      = mapped_column(
        Enum("queued", "running", "done", "failed", "cancelled"),
        default="queued"
    )
    worker_id:     Mapped[str|None] = mapped_column(String(64))
    error_message: Mapped[str|None] = mapped_column(Text)
    best_epoch:    Mapped[int|None] = mapped_column(Integer)
    best_val_acc:  Mapped[float|None] = mapped_column(Float)   # Task 1,2,3
    best_auc:      Mapped[float|None] = mapped_column(Float)   # Task 3
    best_modularity: Mapped[float|None] = mapped_column(Float) # Task 4
    mongo_run_id:  Mapped[str|None] = mapped_column(String(64))  # MongoDB ObjectId
    started_at:    Mapped[datetime|None] = mapped_column(DateTime)
    finished_at:   Mapped[datetime|None] = mapped_column(DateTime)
    created_at:    Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PHẦN 2 — MONGODB SCHEMAS (4 TASK RIÊNG BIỆT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```python
# app/database/mongodb.py
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings

_client: AsyncIOMotorClient = None

def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(settings.MONGODB_URL)
    return _client

def get_db():
    return get_client()[settings.MONGODB_DB_NAME]

def runs_collection():
    return get_db()["training_runs"]
```

```python
# SCHEMA CHO COLLECTION training_runs
# (Khác nhau theo task_type — embedding trong document)

# ── TASK 1: NODE CLASSIFICATION ───────────────────────────────────
TASK1_SNAPSHOT_SCHEMA = {
    # Document level
    "_id": "ObjectId",
    "mysql_run_id": "str",
    "project_id": "str",
    "model": "gcn|gat|graphsage",
    "task": "node_classification",
    "hyperparams": {"epochs": 200, "lr": 0.01, "hidden": 64, "dropout": 0.5, "heads": 4},
    "graph_metadata": {
        "num_nodes": 2708,
        "num_edges": 5429,
        "num_features": 1433,
        "num_classes": 7,
        "class_names": ["Case_Based", "Genetic_Algorithms", "Neural_Networks", "..."],
        "train_size": 140,
        "val_size": 500,
        "test_size": 1000,
    },
    "epoch_snapshots": [
        {
            "epoch": 0,
            "train_loss": 1.9432,
            "val_loss": 1.9215,
            "train_acc": 0.1428,
            "val_acc": 0.1500,
            # PCA 2D của lớp ẩn cuối — list of [x, y], shape [N, 2]
            "embeddings_2d": [[0.12, -0.34], [0.56, 0.78], "..."],
            # Predicted class per node — shape [N]
            "node_predictions": [2, 4, 1, 0, 3, "..."],
            # max(softmax) per node — shape [N], range [0,1]
            "node_confidence": [0.34, 0.56, 0.71, "..."],
            # GAT ONLY: mean attention weight per edge — shape [E], range [0,1]
            "attention_weights": [0.23, 0.87, 0.12, "..."],
            # GCN ONLY: min hops to nearest labeled node — shape [N], integers
            "node_hops": [0, 1, 2, 1, "..."],
        }
    ],
    "best_epoch": 87,
    "final_metrics": {"test_acc": 0.8312},
    "status": "done",
    "created_at": "ISODate",
    "finished_at": "ISODate"
}

# ── TASK 2: GRAPH CLASSIFICATION ──────────────────────────────────
TASK2_SNAPSHOT_SCHEMA = {
    "_id": "ObjectId",
    "mysql_run_id": "str",
    "task": "graph_classification",
    "graph_metadata": {
        "num_graphs": 50,
        "avg_nodes_per_graph": 17.9,
        "avg_edges_per_graph": 19.8,
        "num_features": 7,
        "num_classes": 2,
        "class_names": ["non-toxic", "toxic"],
    },
    "epoch_snapshots": [
        {
            "epoch": 0,
            "train_loss": 0.693,
            "val_loss": 0.691,
            "train_acc": 0.50,
            "val_acc": 0.52,
            # Graph-level PCA 2D — list of [x, y], shape [G, 2]
            # Mỗi điểm = 1 đồ thị sau READOUT pooling
            "graph_embeddings_2d": [[0.1, 0.2], [-0.3, 0.5], "..."],
            # Predicted class per GRAPH — shape [G]
            "graph_predictions": [0, 1, 1, 0, "..."],
            # max(softmax) per graph — shape [G]
            "graph_confidence": [0.51, 0.78, 0.62, "..."],
            # Node contribution per graph — for Readout Monitor heatmap
            # shape [G][Ni] — Ni là số node của graph thứ i
            "node_contributions": [[0.3, 0.7, 0.5, "..."], [0.2, 0.9, "..."], "..."],
            # GAT ONLY: attention weights per edge, per graph
            # shape [G][Ei]
            "attention_weights_per_graph": [[0.3, 0.8, "..."], [0.5, "..."], "..."],
        }
    ],
    "best_epoch": 45,
    "final_metrics": {"test_acc": 0.76},
}

# ── TASK 3: LINK PREDICTION ───────────────────────────────────────
TASK3_SNAPSHOT_SCHEMA = {
    "_id": "ObjectId",
    "mysql_run_id": "str",
    "task": "link_prediction",
    "graph_metadata": {
        "num_nodes": 2708,
        "total_edges": 5429,
        "train_edges": 4343,       # 80%
        "test_pos_edges": 543,     # 10% hidden positive
        "test_neg_edges": 543,     # 10% negative samples
        "num_features": 1433,
    },
    "epoch_snapshots": [
        {
            "epoch": 0,
            "train_loss": 0.693,
            "val_loss": 0.689,
            # AUC-ROC score
            "auc": 0.512,
            # Average Precision score
            "ap": 0.489,
            # train_acc / val_acc (optional — threshold 0.5)
            "train_acc": 0.50,
            "val_acc": 0.51,
            # PCA 2D node embeddings — shape [N, 2]
            # Dùng để vẽ pair proximity view
            "embeddings_2d": [[0.12, -0.34], "..."],
            # Link scores cho test edges (positive + negative)
            # shape [test_pos + test_neg], values [0,1]
            "link_scores": [0.52, 0.48, 0.61, "..."],
            # Edge label: 1=positive, 0=negative — shape [test_pos + test_neg]
            "link_labels": [1, 1, 0, "..."],
            # Top-K predicted future links (not in train, score > 0.7)
            # list of [source_id, target_id, score]
            "top_k_predicted": [[0, 5, 0.89], [12, 34, 0.82], "..."],
            # GAT ONLY
            "attention_weights": [0.23, 0.87, "..."],
        }
    ],
    "best_epoch": 92,
    "final_metrics": {"auc": 0.9123, "ap": 0.8867},
}

# ── TASK 4: COMMUNITY DETECTION ───────────────────────────────────
TASK4_SNAPSHOT_SCHEMA = {
    "_id": "ObjectId",
    "mysql_run_id": "str",
    "task": "community_detection",
    "graph_metadata": {
        "num_nodes": 120,
        "num_edges": 450,
        "num_features": 16,
        "num_communities": 4,   # K target communities
        "has_ground_truth": True,
    },
    "epoch_snapshots": [
        {
            "epoch": 0,
            # Reconstruction loss (Graph Autoencoder) hoặc MI score (DGI)
            "train_loss": 0.693,
            "val_loss": 0.691,
            # Modularity Q score — range [-0.5, 1], >0.3 = good
            "modularity": 0.023,
            # Conductance (inter-community edge cut / volume) — thấp là tốt
            "conductance": 0.48,
            # Silhouette score nếu có ground truth — range [-1, 1]
            "silhouette": 0.12,
            # Community assignment per node — shape [N], integers
            "community_ids": [0, 0, 1, 2, 0, 3, "..."],
            # Bridge nodes: node_ids có kết nối cross-community nhiều
            "bridge_nodes": [15, 42, 78],
            # PCA 2D — shape [N, 2]
            "embeddings_2d": [[0.1, 0.2], "..."],
            # Centroid của mỗi community trong embedding space — shape [K, 2]
            "community_centroids": [[0.5, 0.3], [-0.2, 0.8], "..."],
            # Force layout positions tính từ backend — shape [N, 2]
            # (tùy chọn — nếu muốn pre-compute layout phía backend)
            "force_positions": [[100.5, 200.3], "..."],
            # GAT ONLY: attention per edge
            "attention_weights": [0.23, "..."],
            # Intra vs inter community edge scores
            "intra_edge_strength": [0.8, 0.3, "..."],  # shape [E]
        }
    ],
    "best_epoch": 67,
    "final_metrics": {"modularity": 0.512, "conductance": 0.18},
    "precomputed_clusters": {
        # Precompute clustering với K từ 2 đến 10 (cho slider K)
        "k_2": [0, 0, 1, 1, "..."],
        "k_3": [0, 1, 2, 0, "..."],
        "k_4": [0, 1, 2, 3, "..."],
    }
}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PHẦN 3 — DATA BUILDER (PyG Data từ user upload)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```python
# app/services/data_builder.py
"""
Build torch_geometric Data object từ:
  - nodes DataFrame (từ Excel/JSON)
  - edges DataFrame
  - column_mapping config từ frontend
  - task_type để quyết định label và masks
"""
import torch
import pandas as pd
import numpy as np
from dataclasses import dataclass
from typing import Optional
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.model_selection import train_test_split
from torch_geometric.data import Data

# ── Built-in datasets ─────────────────────────────────────────────
BUILTIN_DATASETS = {
    "cora": {
        "task": "node_classification",
        "description": "2708 nodes · 5429 edges · 7 classes · CS papers",
    },
    "citeseer": {
        "task": "node_classification",
        "description": "3327 nodes · 4732 edges · 6 classes",
    },
    "mutag": {
        "task": "graph_classification",
        "description": "188 molecular graphs · 2 classes (mutagenic/not)",
    },
    "proteins": {
        "task": "graph_classification",
        "description": "1113 protein graphs · 2 classes",
    },
}

def load_builtin(name: str, task_type: str) -> "DataBuildResult":
    """Load built-in datasets từ torch_geometric.datasets"""
    from torch_geometric.datasets import Planetoid, TUDataset

    if name in ("cora", "citeseer"):
        ds = Planetoid(root=f"/tmp/pyg/{name}", name=name.capitalize())
        data = ds[0]
        return DataBuildResult(
            data=data,
            num_nodes=data.num_nodes,
            num_edges=data.num_edges,
            num_features=data.num_node_features,
            num_classes=ds.num_classes,
            class_names=None,
            graph_list=None,
            task_metadata={
                "train_mask": data.train_mask,
                "val_mask": data.val_mask,
                "test_mask": data.test_mask,
            }
        )
    elif name in ("mutag", "proteins"):
        ds = TUDataset(root=f"/tmp/pyg/{name}", name=name.upper())
        return DataBuildResult(
            data=None,
            num_nodes=None,
            num_edges=None,
            num_features=ds.num_node_features,
            num_classes=ds.num_classes,
            class_names=None,
            graph_list=list(ds),
            task_metadata={}
        )

@dataclass
class DataBuildResult:
    data: Optional[Data]                # Single graph (Task 1, 3, 4)
    num_nodes: Optional[int]
    num_edges: Optional[int]
    num_features: int
    num_classes: Optional[int]
    class_names: Optional[list]
    graph_list: Optional[list]          # List of Data (Task 2)
    task_metadata: dict                 # task-specific extra info

    def to_info_dict(self) -> dict:
        return {
            "num_nodes": self.num_nodes,
            "num_edges": self.num_edges,
            "num_features": self.num_features,
            "num_classes": self.num_classes,
            "class_names": self.class_names,
            "num_graphs": len(self.graph_list) if self.graph_list else None,
        }


def build_pyg_data(
    nodes_df: pd.DataFrame,
    edges_df: pd.DataFrame,
    column_mapping: dict,
    task_type: str,
    graphs_df: Optional[pd.DataFrame] = None,
) -> DataBuildResult:
    """
    Main entry point — dispatch theo task_type.
    Trả về DataBuildResult chứa PyG Data object(s).
    """
    if task_type == "node_classification":
        return _build_node_classification(nodes_df, edges_df, column_mapping)
    elif task_type == "graph_classification":
        return _build_graph_classification(nodes_df, edges_df, column_mapping, graphs_df)
    elif task_type == "link_prediction":
        return _build_link_prediction(nodes_df, edges_df, column_mapping)
    elif task_type == "community_detection":
        return _build_community_detection(nodes_df, edges_df, column_mapping)
    else:
        raise ValueError(f"Unknown task_type: {task_type}")


# ── Shared helpers ────────────────────────────────────────────────
def _encode_features(df: pd.DataFrame, feat_cols: list) -> torch.Tensor:
    """Encode features: categorical → int, normalize với StandardScaler."""
    x_df = df[feat_cols].copy()
    for col in feat_cols:
        if x_df[col].dtype == object or x_df[col].dtype.name == 'category':
            x_df[col] = LabelEncoder().fit_transform(x_df[col].fillna("MISSING").astype(str))
    x_df = x_df.fillna(0)
    x_np = StandardScaler().fit_transform(x_df.values.astype(np.float32))
    return torch.tensor(x_np, dtype=torch.float)


def _build_edge_index(edges_df: pd.DataFrame, id2idx: dict,
                       src_col: str, tgt_col: str) -> tuple:
    """Build edge_index tensor. Trả về (edge_index, valid_mask)."""
    src = [id2idx.get(str(r[src_col]), -1) for _, r in edges_df.iterrows()]
    tgt = [id2idx.get(str(r[tgt_col]), -1) for _, r in edges_df.iterrows()]
    valid = [(s >= 0 and t >= 0) for s, t in zip(src, tgt)]
    src_v = [s for s, v in zip(src, valid) if v]
    tgt_v = [t for t, v in zip(tgt, valid) if v]
    edge_index = torch.tensor([src_v, tgt_v], dtype=torch.long)
    return edge_index, valid


def _auto_split_masks(N: int) -> tuple:
    """Tự chia 70/15/15 nếu không có cột split."""
    idx = list(range(N))
    tr, tmp = train_test_split(idx, test_size=0.30, random_state=42)
    va, te  = train_test_split(tmp, test_size=0.50, random_state=42)
    train_m, val_m, test_m = [torch.zeros(N, dtype=torch.bool) for _ in range(3)]
    train_m[tr] = True; val_m[va] = True; test_m[te] = True
    return train_m, val_m, test_m


# ── TASK 1: NODE CLASSIFICATION ───────────────────────────────────
def _build_node_classification(nodes_df, edges_df, cm) -> DataBuildResult:
    """
    cm (column_mapping) keys dùng:
      node_id, features (list), label, split (optional),
      edge_source, edge_target, edge_weight (optional)
    """
    N = len(nodes_df)
    node_ids = nodes_df[cm["node_id"]].tolist()
    id2idx   = {str(nid): i for i, nid in enumerate(node_ids)}

    # Node features
    x = _encode_features(nodes_df, cm["features"])

    # Edge index
    edge_index, _ = _build_edge_index(edges_df, id2idx, cm["edge_source"], cm["edge_target"])

    # Edge weight (optional)
    edge_weight = None
    if cm.get("edge_weight") and cm["edge_weight"] in edges_df.columns:
        edge_weight = torch.tensor(edges_df[cm["edge_weight"]].fillna(1.0).values.astype(np.float32))

    # Node labels
    le = LabelEncoder()
    raw_labels = nodes_df[cm["label"]].astype(str).tolist()
    y = torch.tensor(le.fit_transform(raw_labels), dtype=torch.long)
    class_names = list(le.classes_)
    num_classes = len(class_names)

    # Train/Val/Test masks
    if cm.get("split") and cm["split"] in nodes_df.columns:
        splits = nodes_df[cm["split"]].str.lower().str.strip()
        train_mask = torch.tensor(splits == "train", dtype=torch.bool)
        val_mask   = torch.tensor(splits == "val",   dtype=torch.bool)
        test_mask  = torch.tensor(splits == "test",  dtype=torch.bool)
        # Fallback nếu split column có giá trị khác
        if train_mask.sum() == 0:
            train_mask, val_mask, test_mask = _auto_split_masks(N)
    else:
        train_mask, val_mask, test_mask = _auto_split_masks(N)

    # Min-hops to labeled node (cho GCN wave animation)
    node_hops = _compute_min_hops(edge_index, train_mask, N)

    data = Data(
        x=x, edge_index=edge_index, y=y,
        train_mask=train_mask, val_mask=val_mask, test_mask=test_mask,
        edge_weight=edge_weight,
        num_nodes=N,
    )

    return DataBuildResult(
        data=data,
        num_nodes=N,
        num_edges=edge_index.shape[1],
        num_features=x.shape[1],
        num_classes=num_classes,
        class_names=class_names,
        graph_list=None,
        task_metadata={
            "node_hops": node_hops.tolist(),
            "train_mask": train_mask.tolist(),
            "val_mask": val_mask.tolist(),
            "test_mask": test_mask.tolist(),
        }
    )


def _compute_min_hops(edge_index: torch.Tensor, train_mask: torch.Tensor, N: int) -> torch.Tensor:
    """BFS từ tất cả training nodes. Trả về tensor [N] với min hop distance."""
    import collections
    adj = [[] for _ in range(N)]
    ei = edge_index.numpy()
    for s, t in zip(ei[0], ei[1]):
        adj[s].append(t); adj[t].append(s)
    hops = torch.full((N,), fill_value=999, dtype=torch.long)
    queue = collections.deque()
    for i in range(N):
        if train_mask[i]:
            hops[i] = 0
            queue.append(i)
    while queue:
        node = queue.popleft()
        for nbr in adj[node]:
            if hops[nbr] == 999:
                hops[nbr] = hops[node] + 1
                queue.append(nbr)
    return hops


# ── TASK 2: GRAPH CLASSIFICATION ──────────────────────────────────
def _build_graph_classification(nodes_df, edges_df, cm, graphs_df) -> DataBuildResult:
    """
    Cần cột graph_id trong nodes_df và edges_df.
    graphs_df: graph_id + label (có thể None nếu label trong nodes)
    """
    graph_id_col_node = cm.get("graph_id_node", "graph_id")
    graph_id_col_edge = cm.get("graph_id_edge", "graph_id")

    graph_ids = sorted(nodes_df[graph_id_col_node].unique())
    graph_label_map = {}

    if graphs_df is not None and cm.get("graph_label") in graphs_df.columns:
        le = LabelEncoder()
        graphs_df = graphs_df.copy()
        graphs_df["_label_enc"] = le.fit_transform(graphs_df[cm["graph_label"]].astype(str))
        graph_label_map = dict(zip(graphs_df[cm["graph_id_graph"]], graphs_df["_label_enc"]))
        class_names = list(le.classes_)
        num_classes = len(class_names)
    else:
        class_names = None
        num_classes = 2  # default

    graph_list = []
    for gid in graph_ids:
        gn = nodes_df[nodes_df[graph_id_col_node] == gid].reset_index(drop=True)
        ge = edges_df[edges_df[graph_id_col_edge] == gid].reset_index(drop=True)

        local_id = {str(r[cm["node_id"]]): i for i, (_, r) in enumerate(gn.iterrows())}
        x = _encode_features(gn, cm["features"])
        edge_index, _ = _build_edge_index(ge, local_id, cm["edge_source"], cm["edge_target"])

        label = graph_label_map.get(gid, 0)
        d = Data(x=x, edge_index=edge_index, y=torch.tensor([label], dtype=torch.long),
                 num_nodes=len(gn))
        d.graph_id = gid
        graph_list.append(d)

    # Train/val/test split theo graph
    total = len(graph_list)
    perm  = torch.randperm(total).tolist()
    n_tr  = int(total * 0.70); n_va = int(total * 0.15)
    train_g = set(perm[:n_tr])
    val_g   = set(perm[n_tr:n_tr+n_va])
    test_g  = set(perm[n_tr+n_va:])
    for i, d in enumerate(graph_list):
        d.split = "train" if i in train_g else ("val" if i in val_g else "test")

    return DataBuildResult(
        data=None,
        num_nodes=len(nodes_df),
        num_edges=len(edges_df),
        num_features=graph_list[0].x.shape[1] if graph_list else 0,
        num_classes=num_classes,
        class_names=class_names,
        graph_list=graph_list,
        task_metadata={
            "total_graphs": total,
            "train_graphs": len(train_g),
            "val_graphs": len(val_g),
            "test_graphs": len(test_g),
        }
    )


# ── TASK 3: LINK PREDICTION ───────────────────────────────────────
def _build_link_prediction(nodes_df, edges_df, cm) -> DataBuildResult:
    """
    Không cần label cho node.
    Hệ thống tự ẩn 20% edges làm test positive examples.
    Tạo negative samples (non-existing edges).
    """
    N = len(nodes_df)
    node_ids = nodes_df[cm["node_id"]].tolist()
    id2idx   = {str(nid): i for i, nid in enumerate(node_ids)}

    x = _encode_features(nodes_df, cm["features"])

    edge_index, valid_mask = _build_edge_index(
        edges_df, id2idx, cm["edge_source"], cm["edge_target"]
    )

    # Edge features (optional)
    edge_attr = None
    ef_cols = cm.get("edge_feats") or []
    if ef_cols:
        valid_edges = edges_df[[v for v in edges_df.index if valid_mask[v]]] if valid_mask else edges_df
        edge_attr = _encode_features(valid_edges, ef_cols) if len(ef_cols) > 0 else None

    # Edge label (optional — nếu user cung cấp)
    provided_label = None
    if cm.get("edge_label") and cm["edge_label"] in edges_df.columns:
        valid_vals = [v for v, m in zip(edges_df[cm["edge_label"]].tolist(), valid_mask) if m]
        provided_label = torch.tensor(valid_vals, dtype=torch.float)

    # Split edges: 80% train, 10% val, 10% test
    E = edge_index.shape[1]
    perm    = torch.randperm(E)
    n_test  = max(1, int(E * 0.1))
    n_val   = max(1, int(E * 0.1))
    n_train = E - n_test - n_val

    train_edge = edge_index[:, perm[:n_train]]
    val_edge   = edge_index[:, perm[n_train:n_train+n_val]]
    test_edge  = edge_index[:, perm[n_train+n_val:]]

    # Negative sampling — random pairs không có edge
    neg_edge = _sample_negative_edges(N, edge_index, n_test + n_val)
    val_neg  = neg_edge[:, :n_val]
    test_neg = neg_edge[:, n_val:]

    data = Data(
        x=x,
        edge_index=train_edge,      # training graph (không có test/val edges)
        full_edge_index=edge_index, # full graph cho visualization
        val_pos_edge=val_edge, val_neg_edge=val_neg,
        test_pos_edge=test_edge, test_neg_edge=test_neg,
        edge_attr=edge_attr,
        num_nodes=N,
    )

    return DataBuildResult(
        data=data,
        num_nodes=N,
        num_edges=n_train,
        num_features=x.shape[1],
        num_classes=None,
        class_names=None,
        graph_list=None,
        task_metadata={
            "train_edges": n_train,
            "val_edges": n_val,
            "test_edges": n_test,
            "total_edges": E,
        }
    )


def _sample_negative_edges(N: int, pos_edge: torch.Tensor, num_neg: int) -> torch.Tensor:
    """Sample negative edges (non-existing). Tránh duplicate với positive."""
    from torch_geometric.utils import negative_sampling
    return negative_sampling(pos_edge, num_nodes=N, num_neg_samples=num_neg)


# ── TASK 4: COMMUNITY DETECTION ───────────────────────────────────
def _build_community_detection(nodes_df, edges_df, cm) -> DataBuildResult:
    """
    Không cần label (unsupervised).
    label optional để verify sau.
    """
    N = len(nodes_df)
    node_ids = nodes_df[cm["node_id"]].tolist()
    id2idx   = {str(nid): i for i, nid in enumerate(node_ids)}

    x = _encode_features(nodes_df, cm["features"])
    edge_index, _ = _build_edge_index(
        edges_df, id2idx, cm["edge_source"], cm["edge_target"]
    )

    # Edge weight (optional — dùng trong community score)
    edge_weight = None
    if cm.get("edge_weight") and cm["edge_weight"] in edges_df.columns:
        edge_weight = torch.tensor(edges_df[cm["edge_weight"]].fillna(1.0).values.astype(np.float32))

    # Ground truth community (optional — để verify)
    ground_truth = None
    if cm.get("label") and cm["label"] in nodes_df.columns:
        ground_truth = torch.tensor(
            LabelEncoder().fit_transform(nodes_df[cm["label"]].astype(str)),
            dtype=torch.long
        )

    data = Data(
        x=x,
        edge_index=edge_index,
        edge_weight=edge_weight,
        ground_truth=ground_truth,
        num_nodes=N,
    )

    return DataBuildResult(
        data=data,
        num_nodes=N,
        num_edges=edge_index.shape[1],
        num_features=x.shape[1],
        num_classes=None,
        class_names=None,
        graph_list=None,
        task_metadata={
            "has_ground_truth": ground_truth is not None,
        }
    )
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PHẦN 4 — 3 GNN MODELS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```python
# workers/models/gcn.py
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import GCNConv

class GCN(nn.Module):
    def __init__(self, in_ch, hidden, out_ch, layers=2, dropout=0.5):
        super().__init__()
        dims = [in_ch] + [hidden] * (layers - 1) + [out_ch]
        self.convs = nn.ModuleList(
            [GCNConv(dims[i], dims[i+1]) for i in range(len(dims)-1)]
        )
        self.dropout = dropout

    def forward(self, x, edge_index, edge_weight=None, return_hidden=False):
        h = x
        for i, conv in enumerate(self.convs[:-1]):
            h = conv(h, edge_index, edge_weight)
            h = F.relu(h)
            h = F.dropout(h, p=self.dropout, training=self.training)
        hidden = h  # lớp ẩn cuối (trước layer cuối)
        out = self.convs[-1](h, edge_index, edge_weight)
        if return_hidden:
            return out, hidden
        return out

    def get_embedding(self, x, edge_index, edge_weight=None):
        """Lấy embedding (lớp ẩn cuối) — dùng cho visualization."""
        _, hidden = self.forward(x, edge_index, edge_weight, return_hidden=True)
        return hidden


# workers/models/gat.py
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import GATConv

class GAT(nn.Module):
    def __init__(self, in_ch, hidden, out_ch, heads=4, layers=2, dropout=0.6):
        super().__init__()
        self.heads = heads
        self.dropout = dropout
        self.convs = nn.ModuleList()
        # Layer 1: in_ch → hidden * heads (concat)
        self.convs.append(GATConv(in_ch, hidden, heads=heads, dropout=dropout, concat=True))
        # Middle layers
        for _ in range(layers - 2):
            self.convs.append(GATConv(hidden * heads, hidden, heads=heads, dropout=dropout, concat=True))
        # Final layer: → out_ch, heads=1, no concat
        self.convs.append(GATConv(hidden * heads, out_ch, heads=1, concat=False, dropout=dropout))

    def forward(self, x, edge_index, return_attention=False, return_hidden=False):
        h = F.dropout(x, p=self.dropout, training=self.training)
        last_attn = None
        for i, conv in enumerate(self.convs[:-1]):
            if return_attention and i == 0:
                # Lấy attention của layer đầu để visualize
                h, (edge_idx, attn) = conv(h, edge_index, return_attention_weights=True)
                last_attn = (edge_idx, attn)  # attn shape: [E, heads]
            else:
                h = conv(h, edge_index)
            h = F.elu(h)
            h = F.dropout(h, p=self.dropout, training=self.training)
        hidden = h
        out = self.convs[-1](h, edge_index)
        if return_attention and return_hidden:
            return out, hidden, last_attn
        if return_attention:
            return out, last_attn
        if return_hidden:
            return out, hidden
        return out

    def get_embedding(self, x, edge_index):
        _, hidden = self.forward(x, edge_index, return_hidden=True)
        return hidden

    def get_attention_weights(self, x, edge_index):
        """Trả về attention weights trung bình qua các heads."""
        _, (edge_idx, attn) = self.forward(x, edge_index, return_attention=True)
        # attn shape: [E, heads] → mean → [E]
        return edge_idx, attn.mean(dim=1)


# workers/models/graphsage.py
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import SAGEConv

class GraphSAGE(nn.Module):
    def __init__(self, in_ch, hidden, out_ch, layers=2, dropout=0.5, aggr="mean"):
        super().__init__()
        dims = [in_ch] + [hidden] * (layers - 1) + [out_ch]
        self.convs = nn.ModuleList(
            [SAGEConv(dims[i], dims[i+1], aggr=aggr) for i in range(len(dims)-1)]
        )
        self.dropout = dropout

    def forward(self, x, edge_index, return_hidden=False):
        h = x
        for conv in self.convs[:-1]:
            h = conv(h, edge_index)
            h = F.relu(h)
            h = F.dropout(h, p=self.dropout, training=self.training)
        hidden = h
        out = self.convs[-1](h, edge_index)
        if return_hidden:
            return out, hidden
        return out

    def get_embedding(self, x, edge_index):
        _, h = self.forward(x, edge_index, return_hidden=True)
        return h


def build_model(model_type: str, in_ch: int, out_ch: int, hp: dict):
    """Factory function — build model từ hyperparams dict."""
    hidden  = hp.get("hidden", 64)
    dropout = hp.get("dropout", 0.5)
    layers  = hp.get("layers", 2)
    if model_type == "gcn":
        return GCN(in_ch, hidden, out_ch, layers=layers, dropout=dropout)
    elif model_type == "gat":
        heads = hp.get("heads", 4)
        return GAT(in_ch, hidden, out_ch, heads=heads, layers=layers, dropout=dropout)
    elif model_type == "graphsage":
        aggr = hp.get("sage_aggr", "mean")
        return GraphSAGE(in_ch, hidden, out_ch, layers=layers, dropout=dropout, aggr=aggr)
    else:
        raise ValueError(f"Unknown model: {model_type}")
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PHẦN 5 — 4 TRAINING WORKERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```python
# workers/tasks/task1_node_classification.py
"""
Training worker cho Node Classification.
Hỗ trợ GCN, GAT, GraphSAGE.
Stream snapshot sau mỗi epoch qua Redis Pub/Sub.
"""
import json, redis, torch, numpy as np, torch.nn.functional as F
from sklearn.decomposition import PCA
from workers.models.gcn import GCN
from workers.models.gat import GAT
from workers.models.graphsage import GraphSAGE
from workers.models import build_model
from app.config import settings

r = redis.Redis.from_url(settings.REDIS_URL)


def run_node_classification(run_id: str, data, model_type: str, hp: dict,
                             task_meta: dict) -> list:
    """
    data: torch_geometric.data.Data object
    task_meta: {"node_hops": [...], "train_mask": [...], ...}
    Trả về list[dict] — tất cả snapshots để lưu MongoDB.
    """
    channel   = f"training:{run_id}"
    epochs    = hp.get("epochs", 200)
    lr        = hp.get("lr", 0.01)

    model     = build_model(model_type, data.num_node_features,
                            data.y.max().item() + 1, hp)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=5e-4)
    pca       = PCA(n_components=2)
    snapshots = []
    best_val  = 0.0
    best_epoch = 0

    # Precompute node_hops cho GCN wave animation
    node_hops = task_meta.get("node_hops")

    for epoch in range(epochs):
        # ── Train step ────────────────────────────────────────────
        model.train()
        optimizer.zero_grad()
        if model_type == "gat":
            out, _ = model(data.x, data.edge_index, return_attention=True)
        else:
            out = model(data.x, data.edge_index)
        loss = F.cross_entropy(out[data.train_mask], data.y[data.train_mask])
        loss.backward()
        optimizer.step()

        # ── Eval step ────────────────────────────────────────────
        model.eval()
        with torch.no_grad():
            if model_type == "gat":
                out, (edge_idx, attn) = model(data.x, data.edge_index, return_attention=True)
                attn_list = attn.cpu().tolist()  # [E]
            elif model_type == "gcn":
                out, hidden = model(data.x, data.edge_index, return_hidden=True)
                attn_list = None
            else:  # sage
                out, hidden = model(data.x, data.edge_index, return_hidden=True)
                attn_list = None

            hidden = model.get_embedding(data.x, data.edge_index).detach()

        # Metrics
        train_acc = _accuracy(out, data.y, data.train_mask)
        val_acc   = _accuracy(out, data.y, data.val_mask)
        val_loss  = F.cross_entropy(out[data.val_mask], data.y[data.val_mask]).item()

        if val_acc > best_val:
            best_val   = val_acc
            best_epoch = epoch
            torch.save(model.state_dict(), f"/tmp/best_model_{run_id}.pt")

        # Embeddings 2D (PCA)
        emb_2d = _pca_2d(hidden.cpu().numpy(), pca, fit=(epoch == 0))

        # Predictions & confidence
        probs = out.softmax(dim=1).detach()
        preds = probs.argmax(dim=1).cpu().tolist()
        confs = probs.max(dim=1).values.cpu().tolist()

        # Build snapshot
        snap = {
            "epoch":           epoch,
            "train_loss":      round(loss.item(), 6),
            "val_loss":        round(val_loss, 6),
            "train_acc":       round(train_acc, 6),
            "val_acc":         round(val_acc, 6),
            "embeddings_2d":   emb_2d,
            "node_predictions": preds,
            "node_confidence": confs,
            "attention_weights": attn_list,
            "node_hops":       node_hops,       # GCN wave
        }
        snapshots.append(snap)

        # Publish tới frontend qua Redis
        message = {
            "type":     "epoch_snapshot",
            "data":     snap,
            "progress": round((epoch + 1) / epochs, 4),
        }
        r.publish(channel, json.dumps(message))

        # Kiểm tra cancel signal
        if r.get(f"cancel:{run_id}"):
            r.publish(channel, json.dumps({"type": "cancelled"}))
            return snapshots, best_epoch, best_val

    # Done
    r.publish(channel, json.dumps({
        "type":       "training_complete",
        "best_epoch": best_epoch,
        "best_val_acc": round(best_val, 4),
    }))
    return snapshots, best_epoch, best_val


def _accuracy(out, y, mask):
    pred = out[mask].argmax(dim=1)
    return (pred == y[mask]).float().mean().item()


def _pca_2d(embeddings: np.ndarray, pca: PCA, fit: bool) -> list:
    if fit:
        result = pca.fit_transform(embeddings)
    else:
        result = pca.transform(embeddings)
    return result.round(6).tolist()
```

```python
# workers/tasks/task2_graph_classification.py
"""
Training worker cho Graph Classification.
Dùng Graph-level READOUT (mean/sum/max pooling).
"""
import json, redis, torch, numpy as np, torch.nn.functional as F
from sklearn.decomposition import PCA
from torch_geometric.data import DataLoader
from torch_geometric.nn import global_mean_pool, global_max_pool, global_add_pool
from workers.models import build_model
from app.config import settings

r = redis.Redis.from_url(settings.REDIS_URL)


def run_graph_classification(run_id: str, graph_list: list, model_type: str,
                              hp: dict) -> tuple:
    """
    graph_list: list of torch_geometric.data.Data
    Mỗi Data có: x, edge_index, y (graph label), split ("train"/"val"/"test")
    """
    channel = f"training:{run_id}"
    epochs  = hp.get("epochs", 100)
    lr      = hp.get("lr", 0.01)
    batch   = hp.get("batch_size", 32)

    # Chia theo split
    train_list = [d for d in graph_list if d.split == "train"]
    val_list   = [d for d in graph_list if d.split == "val"]
    test_list  = [d for d in graph_list if d.split == "test"]

    train_loader = DataLoader(train_list, batch_size=batch, shuffle=True)
    val_loader   = DataLoader(val_list,   batch_size=batch)

    in_ch   = graph_list[0].x.shape[1]
    out_ch  = max(d.y.item() for d in graph_list) + 1
    model   = build_model(model_type, in_ch, hp.get("hidden", 64), hp)

    # Thêm readout + classifier head
    readout_dim = hp.get("hidden", 64)
    classifier  = torch.nn.Linear(readout_dim, out_ch)
    optimizer   = torch.optim.Adam(
        list(model.parameters()) + list(classifier.parameters()), lr=lr
    )

    pca       = PCA(n_components=2)
    snapshots = []
    best_val  = 0.0
    best_epoch = 0
    pca_fitted = False

    for epoch in range(epochs):
        # ── Train ─────────────────────────────────────────────────
        model.train(); classifier.train()
        total_loss = 0
        for batch_data in train_loader:
            optimizer.zero_grad()
            node_out = _get_node_embeddings(model, model_type, batch_data)
            graph_emb = global_mean_pool(node_out, batch_data.batch)
            logits = classifier(graph_emb)
            loss = F.cross_entropy(logits, batch_data.y)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
        avg_loss = total_loss / len(train_loader)

        # ── Eval ──────────────────────────────────────────────────
        model.eval(); classifier.eval()
        with torch.no_grad():
            val_loss, val_acc, graph_preds, graph_confs, graph_embs_2d, node_contribs, attn_per_graph = \
                _eval_graph_classification(val_loader, model, classifier, model_type, pca, pca_fitted)
            pca_fitted = True

        if val_acc > best_val:
            best_val   = val_acc
            best_epoch = epoch

        snap = {
            "epoch":                  epoch,
            "train_loss":             round(avg_loss, 6),
            "val_loss":               round(val_loss, 6),
            "train_acc":              round(_train_acc_graphs(train_loader, model, classifier, model_type), 6),
            "val_acc":                round(val_acc, 6),
            "graph_embeddings_2d":    graph_embs_2d,    # [G_val, 2]
            "graph_predictions":      graph_preds,       # [G_val]
            "graph_confidence":       graph_confs,       # [G_val]
            "node_contributions":     node_contribs,     # [[N_i], ...]
            "attention_weights_per_graph": attn_per_graph,  # GAT only
        }
        snapshots.append(snap)
        r.publish(channel, json.dumps({"type": "epoch_snapshot", "data": snap,
                                        "progress": round((epoch+1)/epochs, 4)}))

        if r.get(f"cancel:{run_id}"):
            r.publish(channel, json.dumps({"type": "cancelled"}))
            return snapshots, best_epoch, best_val

    r.publish(channel, json.dumps({
        "type": "training_complete",
        "best_epoch": best_epoch,
        "best_val_acc": round(best_val, 4),
    }))
    return snapshots, best_epoch, best_val


def _get_node_embeddings(model, model_type, batch_data):
    if model_type == "gat":
        out, _ = model(batch_data.x, batch_data.edge_index, return_attention=True)
    elif model_type in ("gcn", "graphsage"):
        out = model(batch_data.x, batch_data.edge_index)
    return out


def _eval_graph_classification(loader, model, classifier, model_type, pca, pca_fitted):
    all_embs, all_preds, all_confs, all_contribs, all_attn = [], [], [], [], []
    total_loss = 0; correct = 0; total = 0

    for bd in loader:
        if model_type == "gat":
            node_out, (eidx, attn) = model(bd.x, bd.edge_index, return_attention=True)
        else:
            node_out = model(bd.x, bd.edge_index)
            attn = None

        graph_emb = global_mean_pool(node_out, bd.batch)
        logits    = classifier(graph_emb)
        total_loss += F.cross_entropy(logits, bd.y).item()

        probs = logits.softmax(dim=1)
        preds = probs.argmax(dim=1).tolist()
        confs = probs.max(dim=1).values.tolist()
        all_preds.extend(preds); all_confs.extend(confs)
        correct += sum(p == t for p, t in zip(preds, bd.y.tolist()))
        total   += len(preds)

        # Node contributions per graph (softmax of node embeddings norm)
        for gi in bd.batch.unique():
            mask = bd.batch == gi
            contrib = node_out[mask].norm(dim=1).softmax(dim=0).detach().tolist()
            all_contribs.append(contrib)
            if attn is not None:
                # Group attention per graph
                edge_mask = mask[eidx[0]] & mask[eidx[1]]
                all_attn.append(attn[edge_mask].mean(dim=1).tolist() if edge_mask.any() else [])
            else:
                all_attn.append(None)

        all_embs.append(graph_emb.detach().numpy())

    all_embs_np = np.vstack(all_embs)
    embs_2d = (pca.fit_transform(all_embs_np) if not pca_fitted else pca.transform(all_embs_np)).round(6).tolist()
    return total_loss / len(loader), correct / total, all_preds, all_confs, embs_2d, all_contribs, all_attn


def _train_acc_graphs(loader, model, classifier, model_type):
    correct = total = 0
    model.eval(); classifier.eval()
    with torch.no_grad():
        for bd in loader:
            out = _get_node_embeddings(model, model_type, bd)
            logits = classifier(global_mean_pool(out, bd.batch))
            preds = logits.argmax(dim=1)
            correct += (preds == bd.y).sum().item()
            total += len(bd.y)
    return correct / total if total > 0 else 0
```

```python
# workers/tasks/task3_link_prediction.py
"""
Training worker cho Link Prediction.
Dùng decoder dot product hoặc MLP để score cặp node.
Metrics: AUC-ROC, Average Precision.
"""
import json, redis, torch, numpy as np, torch.nn.functional as F
from sklearn.decomposition import PCA
from sklearn.metrics import roc_auc_score, average_precision_score
from torch_geometric.utils import negative_sampling
from workers.models import build_model
from app.config import settings

r = redis.Redis.from_url(settings.REDIS_URL)


class LinkDecoder(torch.nn.Module):
    """Dot product decoder: score(u,v) = sigmoid(z_u · z_v)"""
    def forward(self, z, edge_index):
        src = z[edge_index[0]]
        tgt = z[edge_index[1]]
        return (src * tgt).sum(dim=1)


def run_link_prediction(run_id: str, data, model_type: str, hp: dict) -> tuple:
    channel = f"training:{run_id}"
    epochs  = hp.get("epochs", 200)
    lr      = hp.get("lr", 0.01)

    model   = build_model(model_type, data.num_node_features,
                          hp.get("hidden", 64), hp)
    decoder = LinkDecoder()
    optimizer = torch.optim.Adam(
        list(model.parameters()) + list(decoder.parameters()), lr=lr
    )
    pca       = PCA(n_components=2)
    snapshots = []
    best_auc  = 0.0
    best_epoch = 0

    for epoch in range(epochs):
        # ── Train ─────────────────────────────────────────────────
        model.train()
        optimizer.zero_grad()

        # Lấy embedding
        if model_type == "gat":
            z_raw, _ = model(data.x, data.edge_index, return_attention=True)
        else:
            z_raw = model(data.x, data.edge_index)

        # Sample negative edges mỗi epoch (dynamic negative sampling)
        neg_edge = negative_sampling(
            data.edge_index, num_nodes=data.num_nodes,
            num_neg_samples=data.edge_index.shape[1]
        )

        # Positive và negative scores
        pos_score = decoder(z_raw, data.edge_index)
        neg_score = decoder(z_raw, neg_edge)

        # Binary cross-entropy loss
        pos_loss = -F.logsigmoid(pos_score).mean()
        neg_loss = -F.logsigmoid(-neg_score).mean()
        loss = pos_loss + neg_loss
        loss.backward()
        optimizer.step()

        # ── Eval ──────────────────────────────────────────────────
        model.eval()
        with torch.no_grad():
            if model_type == "gat":
                z, (edge_idx, attn) = model(data.x, data.edge_index, return_attention=True)
                attn_list = attn.cpu().tolist()
            else:
                z = model.get_embedding(data.x, data.edge_index)
                attn_list = None

            # Val AUC
            val_pos = decoder(z, data.val_pos_edge).sigmoid()
            val_neg = decoder(z, data.val_neg_edge).sigmoid()
            val_auc, val_ap = _compute_auc(val_pos, val_neg)

            # Test link scores (for visualization)
            test_pos = decoder(z, data.test_pos_edge).sigmoid()
            test_neg = decoder(z, data.test_neg_edge).sigmoid()
            link_scores  = torch.cat([test_pos, test_neg]).cpu().tolist()
            link_labels  = [1] * test_pos.shape[0] + [0] * test_neg.shape[0]

            # Top-K predicted links (score > 0.7, not in training)
            top_k = _get_top_k_predictions(z, decoder, data, k=20)

            # Embeddings 2D
            emb_2d = _pca_2d(z.cpu().numpy(), pca, fit=(epoch == 0))

        if val_auc > best_auc:
            best_auc = val_auc
            best_epoch = epoch

        snap = {
            "epoch":          epoch,
            "train_loss":     round(loss.item(), 6),
            "val_loss":       round((-F.logsigmoid(val_pos).mean() - F.logsigmoid(-val_neg).mean()).item(), 6),
            "train_acc":      round((pos_score.sigmoid() > 0.5).float().mean().item(), 4),
            "val_acc":        round(val_auc, 4),
            "auc":            round(val_auc, 4),
            "ap":             round(val_ap, 4),
            "embeddings_2d":  emb_2d,
            "link_scores":    [round(s, 4) for s in link_scores],
            "link_labels":    link_labels,
            "top_k_predicted": top_k,
            "attention_weights": attn_list,
        }
        snapshots.append(snap)
        r.publish(channel, json.dumps({"type": "epoch_snapshot", "data": snap,
                                        "progress": round((epoch+1)/epochs, 4)}))

        if r.get(f"cancel:{run_id}"):
            r.publish(channel, json.dumps({"type": "cancelled"}))
            return snapshots, best_epoch, best_auc

    r.publish(channel, json.dumps({
        "type": "training_complete",
        "best_epoch": best_epoch,
        "best_auc": round(best_auc, 4),
    }))
    return snapshots, best_epoch, best_auc


def _compute_auc(pos_scores: torch.Tensor, neg_scores: torch.Tensor):
    y_true  = [1] * pos_scores.shape[0] + [0] * neg_scores.shape[0]
    y_score = pos_scores.cpu().tolist() + neg_scores.cpu().tolist()
    try:
        auc = roc_auc_score(y_true, y_score)
        ap  = average_precision_score(y_true, y_score)
    except Exception:
        auc = ap = 0.5
    return auc, ap


def _get_top_k_predictions(z, decoder, data, k=20):
    """Sample 1000 random non-edge pairs và lấy top-K theo score."""
    N = data.num_nodes
    cands = negative_sampling(data.edge_index, num_nodes=N, num_neg_samples=1000)
    with torch.no_grad():
        scores = decoder(z, cands).sigmoid().cpu()
    topk_idx = scores.topk(min(k, len(scores))).indices
    return [
        [int(cands[0][i]), int(cands[1][i]), round(float(scores[i]), 4)]
        for i in topk_idx.tolist()
    ]


def _pca_2d(emb, pca, fit):
    result = pca.fit_transform(emb) if fit else pca.transform(emb)
    return result.round(6).tolist()
```

```python
# workers/tasks/task4_community_detection.py
"""
Training worker cho Community Detection.
Sử dụng Graph Autoencoder (GAE) — reconstruct adjacency matrix.
Sau đó cluster embeddings bằng K-Means.
Metrics: Modularity Q, Conductance, Silhouette (nếu có ground truth).
"""
import json, redis, torch, numpy as np, torch.nn.functional as F
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans
from torch_geometric.nn import GAE, VGAE, GCNConv
from workers.models.gcn import GCN
from workers.models.gat import GAT
from workers.models.graphsage import GraphSAGE
from app.config import settings

r = redis.Redis.from_url(settings.REDIS_URL)


class GCNEncoder(torch.nn.Module):
    """Encoder cho GAE — dùng 2 GCNConv layers."""
    def __init__(self, in_ch, hidden, out_ch):
        super().__init__()
        self.conv1 = GCNConv(in_ch, hidden)
        self.conv2 = GCNConv(hidden, out_ch)

    def forward(self, x, edge_index):
        h = self.conv1(x, edge_index).relu()
        return self.conv2(h, edge_index)


def run_community_detection(run_id: str, data, model_type: str, hp: dict) -> tuple:
    channel      = f"training:{run_id}"
    epochs       = hp.get("epochs", 200)
    lr           = hp.get("lr", 0.01)
    num_comm     = hp.get("num_communities", 4)
    hidden       = hp.get("hidden", 64)
    emb_dim      = hp.get("emb_dim", 16)  # embedding dimension cho clustering

    # Graph Autoencoder
    encoder = GCNEncoder(data.num_node_features, hidden, emb_dim)
    gae     = GAE(encoder)
    optimizer = torch.optim.Adam(gae.parameters(), lr=lr)

    pca       = PCA(n_components=2)
    snapshots = []
    best_mod  = -1.0
    best_epoch = 0

    edge_np = data.edge_index.numpy()  # dùng cho modularity computation

    for epoch in range(epochs):
        # ── Train ─────────────────────────────────────────────────
        gae.train()
        optimizer.zero_grad()
        z = gae.encode(data.x, data.edge_index)
        loss = gae.recon_loss(z, data.edge_index)
        if data.edge_weight is not None:
            # Weighted recon loss
            loss = _weighted_recon_loss(z, data.edge_index, data.edge_weight)
        loss.backward()
        optimizer.step()

        # ── Cluster embeddings ─────────────────────────────────────
        gae.eval()
        with torch.no_grad():
            z_eval = gae.encode(data.x, data.edge_index).cpu().numpy()

        # K-Means clustering trên embeddings
        km = KMeans(n_clusters=num_comm, n_init=10, random_state=epoch % 42)
        community_ids = km.fit_predict(z_eval).tolist()

        # ── Metrics ───────────────────────────────────────────────
        modularity  = _compute_modularity(community_ids, data.num_nodes, edge_np)
        conductance = _compute_conductance(community_ids, data.num_nodes, edge_np)
        silhouette  = 0.0
        if data.ground_truth is not None:
            from sklearn.metrics import silhouette_score
            try:
                silhouette = silhouette_score(z_eval, community_ids)
            except Exception:
                silhouette = 0.0

        if modularity > best_mod:
            best_mod   = modularity
            best_epoch = epoch

        # ── GAT attention ─────────────────────────────────────────
        attn_list = None
        if model_type == "gat":
            # Dùng separate GAT để lấy attention weights
            pass  # Implement nếu cần dual encoder

        # Bridge nodes
        bridge_nodes = _find_bridge_nodes(community_ids, data.num_nodes, edge_np)

        # PCA 2D
        emb_2d = _pca_2d(z_eval, pca, fit=(epoch == 0))

        # Community centroids
        centroids = km.cluster_centers_
        pca_centroids = pca.transform(centroids).round(4).tolist() if epoch > 0 else []

        # Precompute K=2..8 clusters (chỉ một số epoch để tiết kiệm)
        k_clusters = {}
        if epoch % 20 == 0 or epoch == epochs - 1:
            for k in range(2, min(9, data.num_nodes)):
                km_k = KMeans(n_clusters=k, n_init=5, random_state=42)
                k_clusters[f"k_{k}"] = km_k.fit_predict(z_eval).tolist()

        # Intra/Inter edge strengths
        intra_strength = _edge_community_strength(community_ids, data.num_nodes, edge_np)

        snap = {
            "epoch":               epoch,
            "train_loss":          round(loss.item(), 6),
            "val_loss":            round(loss.item(), 6),
            "train_acc":           round(modularity, 4),
            "val_acc":             round(modularity, 4),
            "modularity":          round(modularity, 4),
            "conductance":         round(conductance, 4),
            "silhouette":          round(silhouette, 4),
            "community_ids":       community_ids,
            "bridge_nodes":        bridge_nodes,
            "embeddings_2d":       emb_2d,
            "community_centroids": pca_centroids,
            "attention_weights":   attn_list,
            "intra_edge_strength": intra_strength,
            "k_clusters":          k_clusters,   # chỉ tại epoch chia hết 20
        }
        snapshots.append(snap)
        r.publish(channel, json.dumps({"type": "epoch_snapshot", "data": snap,
                                        "progress": round((epoch+1)/epochs, 4)}))

        if r.get(f"cancel:{run_id}"):
            r.publish(channel, json.dumps({"type": "cancelled"}))
            return snapshots, best_epoch, best_mod

    r.publish(channel, json.dumps({
        "type": "training_complete",
        "best_epoch": best_epoch,
        "best_modularity": round(best_mod, 4),
    }))
    return snapshots, best_epoch, best_mod


def _compute_modularity(community_ids: list, N: int, edge_np: np.ndarray) -> float:
    """Compute Modularity Q score."""
    m = edge_np.shape[1] / 2  # số cạnh undirected
    if m == 0: return 0.0
    degree = np.zeros(N)
    for s in edge_np[0]: degree[s] += 1
    Q = 0.0
    for s, t in zip(edge_np[0], edge_np[1]):
        if community_ids[s] == community_ids[t]:
            Q += 1 - (degree[s] * degree[t]) / (2 * m)
    return float(Q / (2 * m))


def _compute_conductance(community_ids: list, N: int, edge_np: np.ndarray) -> float:
    """Compute mean conductance across communities."""
    comm_set = set(community_ids)
    conductances = []
    for c in comm_set:
        in_c = set(i for i, ci in enumerate(community_ids) if ci == c)
        cut = sum(1 for s, t in zip(edge_np[0], edge_np[1]) if (s in in_c) != (t in in_c))
        vol = sum(1 for s in edge_np[0] if s in in_c)
        if vol > 0:
            conductances.append(cut / vol)
    return float(np.mean(conductances)) if conductances else 1.0


def _find_bridge_nodes(community_ids: list, N: int, edge_np: np.ndarray) -> list:
    """Node có cạnh sang ít nhất 2 community khác nhau → bridge node."""
    bridges = []
    for node in range(N):
        neighbors = [edge_np[1][i] for i, s in enumerate(edge_np[0]) if s == node]
        neighbor_comms = set(community_ids[nb] for nb in neighbors)
        if len(neighbor_comms) >= 2 and community_ids[node] in neighbor_comms:
            bridges.append(node)
    return bridges[:20]  # giới hạn 20 bridge nodes


def _edge_community_strength(community_ids: list, N: int, edge_np: np.ndarray) -> list:
    """1.0 = intra-community edge, 0.0 = inter-community edge."""
    return [
        1.0 if community_ids[s] == community_ids[t] else 0.0
        for s, t in zip(edge_np[0].tolist(), edge_np[1].tolist())
    ]


def _pca_2d(emb, pca, fit):
    result = pca.fit_transform(emb) if fit else pca.transform(emb)
    return result.round(6).tolist()


def _weighted_recon_loss(z, edge_index, edge_weight):
    """Weighted binary cross-entropy reconstruction loss."""
    pos_score = (z[edge_index[0]] * z[edge_index[1]]).sum(dim=1)
    loss = F.binary_cross_entropy_with_logits(pos_score, edge_weight.float())
    return loss
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PHẦN 6 — CELERY DISPATCHER + MONGODB SAVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```python
# workers/celery_app.py
from celery import Celery
from app.config import settings

celery_app = Celery(
    "gnn_insight",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["workers.training_task"],
)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Ho_Chi_Minh",
    task_track_started=True,
    worker_prefetch_multiplier=1,       # 1 task/worker cùng lúc
    task_acks_late=True,               # ack sau khi xong, tránh mất task
    task_reject_on_worker_lost=True,
    task_time_limit=1800,              # 30 phút max per task
    task_soft_time_limit=1700,
)


# workers/training_task.py
"""Main Celery task — load dataset, dispatch to task-specific worker."""
import asyncio, json, torch, pandas as pd
from datetime import datetime
from celery import Task
from workers.celery_app import celery_app
from app.services.data_builder import build_pyg_data, load_builtin
from app.config import settings
import motor.motor_asyncio as motor
import aiomysql
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker


@celery_app.task(bind=True, name="workers.training_task.run_training", max_retries=2)
def run_training(self: Task, run_id: str, run_config: dict):
    """
    run_config = {
        "project_id": str,
        "dataset_id": str,
        "dataset_source": "upload" | "builtin",
        "builtin_name": str,
        "nodes_path": str,       # nếu upload
        "edges_path": str,
        "column_mapping": dict,
        "model_type": str,
        "task_type": str,
        "hyperparams": dict,
        "user_id": str,
    }
    """
    import redis as redis_lib
    r = redis_lib.Redis.from_url(settings.REDIS_URL)
    channel = f"training:{run_id}"

    try:
        # Cập nhật MySQL: status = running
        _update_mysql_status(run_id, "running", worker_id=self.request.hostname)

        # Load data
        if run_config["dataset_source"] == "builtin":
            result = load_builtin(run_config["builtin_name"], run_config["task_type"])
        else:
            nodes_df = pd.read_excel(run_config["nodes_path"]) \
                if run_config["nodes_path"].endswith((".xlsx", ".xls")) \
                else pd.read_json(run_config["nodes_path"])
            edges_df = pd.read_excel(run_config["edges_path"]) \
                if run_config["edges_path"].endswith((".xlsx", ".xls")) \
                else pd.read_json(run_config["edges_path"])
            graphs_df = None
            if run_config.get("graphs_path"):
                graphs_df = pd.read_excel(run_config["graphs_path"]) \
                    if run_config["graphs_path"].endswith((".xlsx", ".xls")) \
                    else pd.read_json(run_config["graphs_path"])
            result = build_pyg_data(
                nodes_df, edges_df,
                run_config["column_mapping"],
                run_config["task_type"],
                graphs_df=graphs_df,
            )

        # Dispatch theo task
        task_type  = run_config["task_type"]
        model_type = run_config["model_type"]
        hp         = run_config["hyperparams"]

        if task_type == "node_classification":
            from workers.tasks.task1_node_classification import run_node_classification
            snapshots, best_epoch, best_metric = run_node_classification(
                run_id, result.data, model_type, hp, result.task_metadata
            )
            final_metrics = {"test_acc": best_metric}

        elif task_type == "graph_classification":
            from workers.tasks.task2_graph_classification import run_graph_classification
            snapshots, best_epoch, best_metric = run_graph_classification(
                run_id, result.graph_list, model_type, hp
            )
            final_metrics = {"test_acc": best_metric}

        elif task_type == "link_prediction":
            from workers.tasks.task3_link_prediction import run_link_prediction
            snapshots, best_epoch, best_metric = run_link_prediction(
                run_id, result.data, model_type, hp
            )
            final_metrics = {"auc": best_metric}

        elif task_type == "community_detection":
            from workers.tasks.task4_community_detection import run_community_detection
            snapshots, best_epoch, best_metric = run_community_detection(
                run_id, result.data, model_type, hp
            )
            final_metrics = {"modularity": best_metric}

        else:
            raise ValueError(f"Unknown task_type: {task_type}")

        # Lưu vào MongoDB
        mongo_id = _save_to_mongodb(run_id, run_config, result, snapshots, best_epoch, final_metrics)

        # Cập nhật MySQL: status = done
        _update_mysql_done(run_id, best_epoch, best_metric, mongo_id, final_metrics)

    except Exception as e:
        error_msg = str(e)
        r.publish(channel, json.dumps({"type": "training_failed", "error": error_msg}))
        _update_mysql_status(run_id, "failed", error_message=error_msg)
        raise self.retry(exc=e, countdown=30)


def _save_to_mongodb(run_id, config, result, snapshots, best_epoch, final_metrics) -> str:
    """Đồng bộ MongoDB save — dùng pymongo (sync) trong Celery worker."""
    from pymongo import MongoClient
    client = MongoClient(settings.MONGODB_URL)
    db     = client[settings.MONGODB_DB_NAME]

    doc = {
        "mysql_run_id":   run_id,
        "project_id":     config["project_id"],
        "model":          config["model_type"],
        "task":           config["task_type"],
        "hyperparams":    config["hyperparams"],
        "graph_metadata": result.to_info_dict(),
        "epoch_snapshots": snapshots,
        "best_epoch":     best_epoch,
        "final_metrics":  final_metrics,
        "status":         "done",
        "created_at":     datetime.utcnow(),
        "finished_at":    datetime.utcnow(),
    }
    insert_result = db["training_runs"].insert_one(doc)
    client.close()
    return str(insert_result.inserted_id)


def _update_mysql_status(run_id, status, worker_id=None, error_message=None):
    """Sync MySQL update via raw pymysql (in Celery worker context)."""
    import pymysql
    cfg = _parse_mysql_url(settings.MYSQL_URL)
    conn = pymysql.connect(**cfg)
    try:
        with conn.cursor() as cur:
            if status == "running":
                cur.execute(
                    "UPDATE training_runs SET status=%s, worker_id=%s, started_at=NOW() WHERE id=%s",
                    (status, worker_id, run_id)
                )
            elif status == "failed":
                cur.execute(
                    "UPDATE training_runs SET status=%s, error_message=%s, finished_at=NOW() WHERE id=%s",
                    (status, error_message, run_id)
                )
        conn.commit()
    finally:
        conn.close()


def _update_mysql_done(run_id, best_epoch, best_metric, mongo_id, final_metrics):
    import pymysql
    cfg = _parse_mysql_url(settings.MYSQL_URL)
    conn = pymysql.connect(**cfg)
    try:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE training_runs
                SET status='done', best_epoch=%s, best_val_acc=%s,
                    mongo_run_id=%s, finished_at=NOW()
                WHERE id=%s
            """, (best_epoch, best_metric, mongo_id, run_id))
        conn.commit()
    finally:
        conn.close()


def _parse_mysql_url(url: str) -> dict:
    """Parse mysql+aiomysql://user:pass@host/db → pymysql dict."""
    from urllib.parse import urlparse
    u = urlparse(url.replace("mysql+aiomysql://", "mysql://"))
    return {"host": u.hostname, "port": u.port or 3306,
            "user": u.username, "password": u.password,
            "database": u.path.lstrip("/"), "charset": "utf8mb4"}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PHẦN 7 — FASTAPI ENDPOINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```python
# app/routers/datasets.py
"""Upload, configure, validate dataset endpoint."""
import os, uuid, shutil
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.mysql import get_db
from app.models.dataset import Dataset
from app.auth.middleware import get_current_user
from app.services.data_builder import build_pyg_data
import pandas as pd

router = APIRouter(prefix="/api/datasets", tags=["datasets"])
UPLOAD_DIR = "/app/uploads"


@router.post("/upload")
async def upload_dataset(
    project_id:  str        = Form(...),
    name:        str        = Form(...),
    nodes_file:  UploadFile = File(...),
    edges_file:  UploadFile = File(...),
    graphs_file: UploadFile = File(None),
    db:          AsyncSession = Depends(get_db),
    user = Depends(get_current_user),
):
    """
    Upload nodes.xlsx + edges.xlsx (+ optional graphs.xlsx cho Task 2).
    Validate format, lưu file, tạo Dataset record.
    """
    # Validate file types
    allowed = (".xlsx", ".xls", ".json")
    for f in [nodes_file, edges_file] + ([graphs_file] if graphs_file else []):
        if not any(f.filename.endswith(ext) for ext in allowed):
            raise HTTPException(400, f"File {f.filename}: chỉ hỗ trợ {allowed}")

    # Kiểm tra storage quota
    # (TODO: sum storage_used_mb cho user, so sánh với storage_limit_mb)

    dataset_id = str(uuid.uuid4())
    save_dir   = os.path.join(UPLOAD_DIR, user.id, dataset_id)
    os.makedirs(save_dir, exist_ok=True)

    # Lưu files
    nodes_path = os.path.join(save_dir, "nodes" + os.path.splitext(nodes_file.filename)[1])
    edges_path = os.path.join(save_dir, "edges" + os.path.splitext(edges_file.filename)[1])
    graphs_path = None

    for file, path in [(nodes_file, nodes_path), (edges_file, edges_path)]:
        with open(path, "wb") as f:
            shutil.copyfileobj(file.file, f)

    if graphs_file:
        graphs_path = os.path.join(save_dir, "graphs" + os.path.splitext(graphs_file.filename)[1])
        with open(graphs_path, "wb") as f:
            shutil.copyfileobj(graphs_file.file, f)

    # Parse để lấy metadata
    nodes_df = _read_file(nodes_path)
    edges_df = _read_file(edges_path)

    # Tạo Dataset record
    dataset = Dataset(
        id=dataset_id,
        project_id=project_id,
        name=name,
        source_type="upload",
        nodes_file_path=nodes_path,
        edges_file_path=edges_path,
        graphs_file_path=graphs_path,
        node_count=len(nodes_df),
        edge_count=len(edges_df),
        feature_dim=len(nodes_df.columns) - 3,  # estimate trước mapping
        column_mapping={},  # sẽ update sau khi configure
        file_size_mb=round((os.path.getsize(nodes_path) + os.path.getsize(edges_path)) / 1e6, 2),
    )
    db.add(dataset)
    await db.commit()

    return {
        "ok": True,
        "dataset_id": dataset_id,
        "node_count": len(nodes_df),
        "edge_count": len(edges_df),
        "node_columns": list(nodes_df.columns),
        "edge_columns": list(edges_df.columns),
        "node_sample": nodes_df.head(5).to_dict("records"),
        "edge_sample": edges_df.head(5).to_dict("records"),
    }


@router.post("/configure")
async def configure_dataset(
    payload: dict,
    db:      AsyncSession = Depends(get_db),
    user     = Depends(get_current_user),
):
    """
    Nhận column_mapping từ frontend TaskConfigurator.
    Build PyG Data để validate, trả về graph_json cho Topology View.
    """
    dataset_id     = payload["dataset_id"]
    task_type      = payload["task_type"]
    column_mapping = payload["column_mapping"]

    # Load dataset record
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(404, "Dataset không tồn tại")

    # Parse files
    nodes_df   = _read_file(dataset.nodes_file_path)
    edges_df   = _read_file(dataset.edges_file_path)
    graphs_df  = _read_file(dataset.graphs_file_path) if dataset.graphs_file_path else None

    # Validate column_mapping
    _validate_mapping(nodes_df, edges_df, column_mapping, task_type)

    # Build PyG Data
    result = build_pyg_data(nodes_df, edges_df, column_mapping, task_type, graphs_df)

    # Cập nhật Dataset record
    dataset.column_mapping  = column_mapping
    dataset.node_count      = result.num_nodes or len(nodes_df)
    dataset.edge_count      = result.num_edges or len(edges_df)
    dataset.feature_dim     = result.num_features
    dataset.num_classes     = result.num_classes
    dataset.graph_count     = len(result.graph_list) if result.graph_list else None
    dataset.is_validated    = True
    await db.commit()

    # Build graph JSON cho frontend Topology View
    graph_json = _build_graph_json(result, column_mapping, nodes_df, edges_df)

    return {
        "ok":         True,
        "stats":      result.to_info_dict(),
        "graph_json": graph_json,
        "task_meta":  result.task_metadata,
    }


def _validate_mapping(nodes_df, edges_df, cm, task_type):
    errors = []
    # node_id phải tồn tại
    if cm.get("node_id") not in nodes_df.columns:
        errors.append(f"Cột node_id '{cm.get('node_id')}' không tồn tại trong nodes file")
    # features phải tồn tại
    for f in cm.get("features", []):
        if f not in nodes_df.columns:
            errors.append(f"Feature '{f}' không tồn tại")
    # label bắt buộc với task 1, 2
    if task_type in ("node_classification", "graph_classification"):
        if not cm.get("label") or cm["label"] not in nodes_df.columns:
            errors.append(f"Task {task_type} cần cột label")
    # graph_id bắt buộc với task 2
    if task_type == "graph_classification":
        if not cm.get("graph_id_node") or cm["graph_id_node"] not in nodes_df.columns:
            errors.append("Task Graph Classification cần cột graph_id trong nodes")
    # source/target
    for col, file_df, fname in [(cm.get("edge_source"), edges_df, "edges"), (cm.get("edge_target"), edges_df, "edges")]:
        if not col or col not in file_df.columns:
            errors.append(f"Cột edge '{col}' không tồn tại")
    if errors:
        raise HTTPException(400, {"errors": errors})


def _build_graph_json(result, cm, nodes_df, edges_df) -> dict:
    """Build graph JSON cho react-force-graph-2d."""
    if result.data is not None:
        N = result.num_nodes
        ei = result.data.edge_index.numpy()
        # Degree
        degree = [0] * N
        for s in ei[0]: degree[s] += 1
        for t in ei[1]: degree[t] += 1

        nodes = [
            {
                "id":         i,
                "label":      int(result.data.y[i]) if result.data.y is not None else -1,
                "inTrainSet": bool(result.data.train_mask[i]) if hasattr(result.data, "train_mask") else False,
                "degree":     degree[i],
            }
            for i in range(N)
        ]
        links = [{"source": int(ei[0][i]), "target": int(ei[1][i])} for i in range(ei.shape[1])]
        return {"nodes": nodes, "links": links}

    elif result.graph_list:
        # Task 2: trả về 1 graph đại diện (graph đầu tiên)
        sample = result.graph_list[0]
        N = sample.num_nodes
        ei = sample.edge_index.numpy()
        nodes = [{"id": i, "label": -1, "degree": 0} for i in range(N)]
        links = [{"source": int(ei[0][i]), "target": int(ei[1][i])} for i in range(ei.shape[1])]
        return {"nodes": nodes, "links": links, "is_sample": True, "total_graphs": len(result.graph_list)}

    return {"nodes": [], "links": []}


def _read_file(path: str) -> pd.DataFrame:
    if path.endswith((".xlsx", ".xls")):
        return pd.read_excel(path)
    return pd.read_json(path)
```

```python
# app/routers/training.py
"""Start training, cancel, get snapshots, WebSocket stream."""
import json
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import redis.asyncio as aioredis

from app.database.mysql import get_db
from app.database.mongodb import runs_collection
from app.models.training_run import TrainingRun
from app.models.dataset import Dataset
from app.auth.middleware import get_current_user, verify_jwt_ws
from app.websocket.manager import manager
from workers.training_task import run_training
from app.config import settings
import uuid
from datetime import datetime

router = APIRouter(prefix="/api", tags=["training"])


@router.post("/train")
async def start_training(
    payload: dict,
    db:      AsyncSession = Depends(get_db),
    user     = Depends(get_current_user),
):
    """
    payload = {
        "project_id": str,
        "dataset_id": str,
        "model_type": "gcn"|"gat"|"graphsage",
        "task_type": str,
        "hyperparams": {...}
    }
    Enqueue Celery task, trả về run_id ngay lập tức.
    """
    # Load dataset
    dataset = await db.get(Dataset, payload["dataset_id"])
    if not dataset:
        raise HTTPException(404, "Dataset không tồn tại")
    if not dataset.is_validated:
        raise HTTPException(400, "Dataset chưa được configure. Gọi /api/datasets/configure trước.")

    # Check concurrent runs (max 2 per user)
    running_q = await db.execute(
        select(TrainingRun).where(
            TrainingRun.status.in_(["queued", "running"]),
        ).limit(5)
    )
    # (TODO: filter theo user qua project_id FK)

    run_id = str(uuid.uuid4())

    # Tạo Training Run record
    run = TrainingRun(
        id=run_id,
        project_id=payload["project_id"],
        dataset_id=payload["dataset_id"],
        model_type=payload["model_type"],
        task_type=payload["task_type"],
        hyperparams=payload["hyperparams"],
        status="queued",
        created_at=datetime.utcnow(),
    )
    db.add(run)
    await db.commit()

    # Build run_config cho Celery task
    run_config = {
        "project_id":      payload["project_id"],
        "dataset_id":      payload["dataset_id"],
        "dataset_source":  dataset.source_type,
        "builtin_name":    dataset.builtin_name,
        "nodes_path":      dataset.nodes_file_path,
        "edges_path":      dataset.edges_file_path,
        "graphs_path":     dataset.graphs_file_path,
        "column_mapping":  dataset.column_mapping,
        "model_type":      payload["model_type"],
        "task_type":       payload["task_type"],
        "hyperparams":     payload["hyperparams"],
        "user_id":         str(user.id),
    }

    # Enqueue Celery task (non-blocking)
    run_training.apply_async(
        args=[run_id, run_config],
        task_id=run_id,  # task_id = run_id để dễ cancel
    )

    return {"run_id": run_id, "status": "queued"}


@router.delete("/runs/{run_id}")
async def cancel_training(
    run_id: str,
    db:     AsyncSession = Depends(get_db),
    user    = Depends(get_current_user),
):
    """Cancel training run. Worker check Redis key và dừng."""
    run = await db.get(TrainingRun, run_id)
    if not run:
        raise HTTPException(404)

    # Set cancel signal cho worker
    r = aioredis.from_url(settings.REDIS_URL)
    await r.set(f"cancel:{run_id}", "1", ex=300)
    await r.close()

    # Revoke Celery task
    from workers.celery_app import celery_app
    celery_app.control.revoke(run_id, terminate=True)

    run.status     = "cancelled"
    run.finished_at = datetime.utcnow()
    await db.commit()
    return {"ok": True, "status": "cancelled"}


@router.get("/runs/{run_id}/snapshots")
async def get_snapshots(
    run_id: str,
    db:     AsyncSession = Depends(get_db),
    user    = Depends(get_current_user),
):
    """Lấy toàn bộ snapshots từ MongoDB (sau khi training xong)."""
    run = await db.get(TrainingRun, run_id)
    if not run or not run.mongo_run_id:
        raise HTTPException(404, "Snapshots chưa có hoặc training chưa xong")

    from bson import ObjectId
    col = runs_collection()
    doc = await col.find_one({"_id": ObjectId(run.mongo_run_id)})
    if not doc:
        raise HTTPException(404, "MongoDB document không tìm thấy")

    return {
        "run_id":        run_id,
        "task_type":     run.task_type,
        "model_type":    run.model_type,
        "best_epoch":    run.best_epoch,
        "graph_metadata": doc.get("graph_metadata"),
        "snapshots":     doc.get("epoch_snapshots", []),
    }


# ── WebSocket ─────────────────────────────────────────────────────
@router.websocket("/ws/train/{run_id}")
async def websocket_training(
    websocket: WebSocket,
    run_id:    str,
    token:     str = Query(...),
):
    """
    WebSocket endpoint để stream epoch snapshots real-time.
    Frontend kết nối sau khi nhận run_id từ POST /api/train.
    """
    # Verify JWT từ query param (không thể dùng header với WS)
    user = await verify_jwt_ws(token)
    if not user:
        await websocket.close(code=4001)
        return

    await manager.connect(run_id, websocket)
    try:
        # Giữ connection mở — server push qua manager
        while True:
            import asyncio
            await asyncio.sleep(25)
            # Ping để giữ connection không timeout
            try:
                await websocket.send_json({"type": "ping"})
            except Exception:
                break
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(run_id)
```

```python
# app/websocket/manager.py
"""WebSocket ConnectionManager — subscribe Redis, forward to client."""
import json
import asyncio
import redis.asyncio as aioredis
from fastapi import WebSocket
from app.config import settings


class ConnectionManager:
    def __init__(self):
        self.active: dict[str, WebSocket] = {}

    async def connect(self, run_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active[run_id] = websocket
        # Bắt đầu background task subscribe Redis + forward
        asyncio.create_task(self._subscribe_and_forward(run_id, websocket))

    def disconnect(self, run_id: str):
        self.active.pop(run_id, None)

    async def _subscribe_and_forward(self, run_id: str, websocket: WebSocket):
        r = aioredis.from_url(settings.REDIS_URL)
        pubsub = r.pubsub()
        await pubsub.subscribe(f"training:{run_id}")

        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                try:
                    data = json.loads(message["data"])
                    await websocket.send_json(data)

                    # Dừng subscribe khi training xong hoặc thất bại
                    if data.get("type") in ("training_complete", "training_failed", "cancelled"):
                        break
                except Exception:
                    break  # Client đã disconnect
        finally:
            await pubsub.unsubscribe(f"training:{run_id}")
            await r.aclose()
            self.active.pop(run_id, None)


manager = ConnectionManager()
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PHẦN 8 — CONFIG + REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```python
# app/config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # MySQL
    MYSQL_URL: str = "mysql+aiomysql://root:password@mysql:3306/gnninsight"
    # MongoDB
    MONGODB_URL: str = "mongodb://mongo:27017"
    MONGODB_DB_NAME: str = "gnninsight"
    # Redis
    REDIS_URL: str = "redis://redis:6379/0"
    # JWT
    JWT_SECRET: str = "change-me-in-production-min-32-chars"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 15
    # Storage
    UPLOAD_DIR: str = "/app/uploads"
    MAX_FILE_SIZE_MB: int = 50

    class Config:
        env_file = ".env"

settings = Settings()
```

```
# requirements.txt (backend + workers)
fastapi==0.115.0
uvicorn[standard]==0.30.0
pydantic==2.8.0
pydantic-settings==2.4.0
sqlalchemy[asyncio]==2.0.35
aiomysql==0.2.0
pymysql==1.1.1
motor==3.5.1
pymongo==4.9.0
redis[asyncio]==5.0.8
celery[redis]==5.4.0
torch==2.4.0
torch-geometric==2.5.3
scikit-learn==1.5.2
pandas==2.2.2
openpyxl==3.1.5
numpy==1.26.4
python-jose[cryptography]==3.3.0
python-multipart==0.0.12
aiofiles==24.1.0
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PHẦN 9 — LUỒNG DỮ LIỆU CHO TỪNG TASK (TÓM TẮT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```
TASK 1 — NODE CLASSIFICATION
──────────────────────────────────────────────────────────────────────
Upload: nodes.xlsx (node_id, age, dept, label, split) + edges.xlsx (source, target, weight)
Configure: column_mapping = {node_id, features:[age], label:dept, split, edge_source, edge_target}
Build:     Data(x=[N,F], edge_index=[2,E], y=[N], train_mask, val_mask, test_mask)
Train:     GCN/GAT/SAGE → softmax → cross_entropy → backprop
Snapshot:  {epoch, loss, acc, embeddings_2d[N,2], node_predictions[N], node_confidence[N],
            attention_weights[E] (GAT), node_hops[N] (GCN)}
Metric:    Val Accuracy → best_val_acc trong MySQL

TASK 2 — GRAPH CLASSIFICATION
──────────────────────────────────────────────────────────────────────
Upload: nodes.xlsx (node_id, graph_id, features) + edges.xlsx (source, target, graph_id)
        + graphs.xlsx (graph_id, label)
Configure: column_mapping = {node_id, graph_id_node, features, edge_source, edge_target, graph_id_edge}
Build:     List[Data], mỗi Data là 1 mini graph với y=graph_label
Train:     GNN forward → global_mean_pool → Linear → cross_entropy
Snapshot:  {epoch, loss, acc, graph_embeddings_2d[G,2], graph_predictions[G],
            graph_confidence[G], node_contributions[G][Ni], attention_weights_per_graph[G][Ei]}
Metric:    Val Accuracy (graph-level)

TASK 3 — LINK PREDICTION
──────────────────────────────────────────────────────────────────────
Upload: nodes.xlsx (node_id, features) + edges.xlsx (source, target, weight)
Configure: column_mapping = {node_id, features, edge_source, edge_target, edge_weight}
           KHÔNG cần label — hệ thống tự ẩn 20% edges
Build:     Data với train_edge (80%), val_pos/neg edges (10%), test_pos/neg edges (10%)
Train:     GNN embed → dot product decode → binary cross-entropy
Snapshot:  {epoch, loss, auc, ap, embeddings_2d[N,2], link_scores[test_E],
            link_labels[test_E], top_k_predicted[[src,tgt,score],...],
            attention_weights[E] (GAT)}
Metric:    AUC-ROC → best_auc trong MySQL

TASK 4 — COMMUNITY DETECTION
──────────────────────────────────────────────────────────────────────
Upload: nodes.xlsx (node_id, features) + edges.xlsx (source, target, weight)
Configure: column_mapping = {node_id, features, edge_source, edge_target, edge_weight}
           label (optional) nếu có ground truth community để verify
Build:     Data(x, edge_index, edge_weight, ground_truth)
Train:     Graph Autoencoder → reconstruct adjacency → KMeans cluster embeddings
Snapshot:  {epoch, loss, modularity, conductance, silhouette, community_ids[N],
            bridge_nodes[list], embeddings_2d[N,2], community_centroids[K,2],
            intra_edge_strength[E], k_clusters{k_2:..., k_3:..., ...}}
Metric:    Modularity Q → best_modularity trong MySQL
```

===END===
