from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, desc
from database.models import Project, TrainingRun, Dataset
from typing import List, Optional

async def create_project(db: AsyncSession, name: str, description: str = None) -> Project:
    project = Project(name=name, description=description)
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project

async def list_projects(db: AsyncSession) -> List[Project]:
    result = await db.execute(
        select(Project)
        .where(Project.is_archived == False)
        .order_by(desc(Project.last_viewed_at))
    )
    return result.scalars().all()

async def get_project(db: AsyncSession, project_id: str) -> Optional[Project]:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalars().first()
    return project

async def get_project_history(db: AsyncSession, project_id: str) -> List[TrainingRun]:
    result = await db.execute(
        select(TrainingRun)
        .where(TrainingRun.project_id == project_id)
        .order_by(desc(TrainingRun.created_at))
    )
    return result.scalars().all()

async def update_last_viewed(db: AsyncSession, project_id: str):
    from datetime import datetime
    await db.execute(
        update(Project)
        .where(Project.id == project_id)
        .values(last_viewed_at=datetime.utcnow())
    )
    await db.commit()
