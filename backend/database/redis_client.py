import redis.asyncio as redis
import os
import json

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

_redis_pool = None

async def init_redis():
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = redis.from_url(REDIS_URL, decode_responses=True)

async def get_redis():
    if _redis_pool is None:
        await init_redis()
    return _redis_pool

async def cache_best_snapshot(run_id: str, data: dict, is_favorite: bool = False):
    r = await get_redis()
    # 7 days for favorites, 1 day for standard
    ttl = 7 * 24 * 3600 if is_favorite else 24 * 3600
    await r.setex(f"best_run:{run_id}", ttl, json.dumps(data))

async def get_cached_snapshot(run_id: str):
    r = await get_redis()
    data = await r.get(f"best_run:{run_id}")
    if data:
        return json.loads(data)
    return None
