from motor.motor_asyncio import AsyncIOMotorClient
import os

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "gnn_insight")

_client: AsyncIOMotorClient = None

def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(MONGODB_URL)
    return _client

def get_db():
    return get_client()[MONGODB_DB_NAME]

def runs_collection():
    return get_db()["training_runs"]

async def init_mongodb():
    db = get_db()
    # Create indexes for faster queries
    await db["training_runs"].create_index([("mysql_run_id", 1)], unique=True)
    await db["training_runs"].create_index([("project_id", 1)])
