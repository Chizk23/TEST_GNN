import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Float, JSON, DateTime, ForeignKey, Enum, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database.mysql import Base

class Project(Base):
    __tablename__ = "projects"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=True)
    last_viewed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    total_runs: Mapped[int] = mapped_column(Integer, default=0)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Dataset(Base):
    __tablename__ = "datasets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    source_type: Mapped[str] = mapped_column(String(20), nullable=False) # upload, builtin
    column_mapping: Mapped[dict] = mapped_column(JSON, nullable=False)
    file_hash: Mapped[str] = mapped_column(String(128), nullable=True) # Check if same file was uploaded
    node_count: Mapped[int] = mapped_column(Integer, nullable=True)
    edge_count: Mapped[int] = mapped_column(Integer, nullable=True)
    feature_dim: Mapped[int] = mapped_column(Integer, nullable=True)
    num_classes: Mapped[int] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class TrainingRun(Base):
    __tablename__ = "training_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    dataset_id: Mapped[str] = mapped_column(String(36), ForeignKey("datasets.id"), nullable=False)
    
    task_type: Mapped[int] = mapped_column(Integer, nullable=False) # 1 to 6
    model_type: Mapped[str] = mapped_column(String(20), nullable=False) # GCN, GAT, SAGE
    hyperparams: Mapped[dict] = mapped_column(JSON, nullable=False)
    
    status: Mapped[str] = mapped_column(String(20), default="queued") # queued, running, done, failed
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    ui_config: Mapped[dict] = mapped_column(JSON, nullable=True) # Selected filters, layout
    
    best_epoch: Mapped[int] = mapped_column(Integer, nullable=True)
    best_val_acc: Mapped[float] = mapped_column(Float, nullable=True)
    best_auc: Mapped[float] = mapped_column(Float, nullable=True)
    best_modularity: Mapped[float] = mapped_column(Float, nullable=True)
    
    mongo_run_id: Mapped[str] = mapped_column(String(64), nullable=True) # ID in MongoDB
    column_mapping_snapshot: Mapped[dict] = mapped_column(JSON, nullable=True) # Safe copy from dataset
    
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
