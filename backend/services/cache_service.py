from database.redis_client import cache_best_snapshot, get_cached_snapshot
from services.snapshot_service import get_final_summary
import json

async def cache_best_run(mysql_run_id: str, is_favorite: bool = False):
    """
    Fetches the final_summary from MongoDB and caches it in Redis.
    Called when a run finishes or is marked as favorite.
    """
    summary_doc = await get_final_summary(mysql_run_id)
    if summary_doc:
        data_to_cache = {
            "run_id": mysql_run_id,
            "best_epoch": summary_doc.get("best_epoch"),
            "final_summary": summary_doc.get("final_summary", {})
        }
        await cache_best_snapshot(mysql_run_id, data_to_cache, is_favorite)

async def get_cached_run(mysql_run_id: str):
    """
    Attempts to fetch the visualization data from Redis first.
    If it misses, goes to MongoDB and caches it.
    """
    cached_data = await get_cached_snapshot(mysql_run_id)
    if cached_data:
        return cached_data
        
    # Cache miss, get from Mongo
    summary_doc = await get_final_summary(mysql_run_id)
    if summary_doc:
        data_to_cache = {
            "run_id": mysql_run_id,
            "best_epoch": summary_doc.get("best_epoch"),
            "final_summary": summary_doc.get("final_summary", {})
        }
        await cache_best_snapshot(mysql_run_id, data_to_cache, is_favorite=False)
        return data_to_cache
        
    return None
