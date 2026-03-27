from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any
from pydantic import BaseModel

from database.mysql import get_db
from sqlalchemy import select, update
from database.models import Project, TrainingRun, Dataset
from services.project_service import create_project, list_projects, get_project, get_project_history, update_last_viewed
from services.snapshot_service import get_final_summary, get_all_snapshots, save_layout_positions
from services.cache_service import get_cached_run, cache_best_run

router = APIRouter(prefix="/projects", tags=["projects"])

class ProjectCreate(BaseModel):
    name: str
    description: str = None

@router.post("")
async def create_new_project(project: ProjectCreate, db: AsyncSession = Depends(get_db)):
    return await create_project(db, project.name, project.description)

@router.get("")
async def get_projects(db: AsyncSession = Depends(get_db)):
    # In a real app we'd use Pydantic response models, returning raw objects here for brevity/speed
    projects = await list_projects(db)
    return [{
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "last_viewed_at": p.last_viewed_at,
        "total_runs": p.total_runs
    } for p in projects]

@router.get("/{project_id}")
async def get_project_details(project_id: str, db: AsyncSession = Depends(get_db)):
    project = await get_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await update_last_viewed(db, project_id)
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description
    }

@router.get("/{project_id}/history")
async def get_history(project_id: str, db: AsyncSession = Depends(get_db)):
    runs = await get_project_history(db, project_id)
    return [{
        "id": r.id,
        "task_type": r.task_type,
        "model_type": r.model_type,
        "status": r.status,
        "best_epoch": r.best_epoch,
        "best_val_acc": r.best_val_acc,
        "best_auc": r.best_auc,
        "best_modularity": r.best_modularity,
        "created_at": r.created_at,
        "is_favorite": r.is_favorite
    } for r in runs]

@router.get("/runs/{run_id}/restore")
async def restore_run(run_id: str, db: AsyncSession = Depends(get_db)):
    """
    Fetch the lightweight visualization snapshot for instant UI restore
    Also fetches graph_json so the 3D visualizer can rebuild the network
    """
    data = await get_cached_run(run_id)
    if not data:
        raise HTTPException(status_code=404, detail="Run data not found")
        
    run_record = await db.scalar(select(TrainingRun).where(TrainingRun.id == run_id))
    if run_record:
        data['task_type'] = run_record.task_type
        data['model_type'] = run_record.model_type
        
        dataset_record = await db.scalar(select(Dataset).where(Dataset.id == run_record.dataset_id))
        if dataset_record:
            try:
                from main import load_dataset, build_graph_json
                # load_dataset takes name or id
                ds_name = dataset_record.id if dataset_record.source_type == 'upload' else dataset_record.name
                ds_data = load_dataset(ds_name)
                data['graph_json'] = build_graph_json(ds_data)
                data['ground_truth'] = ds_data.y.cpu().tolist()
            except Exception as e:
                print("Could not load graph for restore:", e)

    return data

@router.get("/runs/{run_id}/replay")
async def replay_run(run_id: str):
    """
    Fetch all historical epoch snapshots for video player replay
    """
    snapshots = await get_all_snapshots(run_id)
    if not snapshots:
        raise HTTPException(status_code=404, detail="No snapshots found for replay")
    return {"all_snapshots": snapshots}

@router.put("/runs/{run_id}/favorite")
async def toggle_favorite(run_id: str, is_favorite: bool, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import update
    await db.execute(update(TrainingRun).where(TrainingRun.id == run_id).values(is_favorite=is_favorite))
    await db.commit()
    
    # Update cache TTL
    await cache_best_run(run_id, is_favorite)
    return {"status": "success", "is_favorite": is_favorite}

@router.put("/runs/{run_id}/layout")
async def save_layout(run_id: str, payload: dict, db: AsyncSession = Depends(get_db)):
    """Save custom user node positions for the graph layout"""
    # Payload should contain {"positions": { "0": {"x": 10, "y": 20}, ... }}
    positions = payload.get("positions", {})
    
    # Save to MongoDB final_summary
    success = await save_layout_positions(run_id, positions)
    
    # Save to MySQL ui_config 
    await db.execute(update(TrainingRun).where(TrainingRun.id == run_id).values(ui_config={"layout": positions}))
    await db.commit()
    
    # Invalidate or re-save cache
    run_record = await db.scalar(select(TrainingRun).where(TrainingRun.id == run_id))
    if run_record:
        await cache_best_run(run_id, run_record.is_favorite)
        
    return {"status": "success", "saved": success}
