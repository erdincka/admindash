from redis import asyncio as aioredis
from app.config import settings
from typing import Optional

class RedisClient:
    _instance: Optional[aioredis.Redis] = None

    @classmethod
    def get_instance(cls) -> aioredis.Redis:
        if cls._instance is None:
            cls._instance = aioredis.Redis(
                host=settings.redis_host,
                port=settings.redis_port,
                db=settings.redis_db,
                decode_responses=True
            )
        return cls._instance

    @classmethod
    async def close(cls):
        if cls._instance:
            await cls._instance.close()
            cls._instance = None

async def get_redis() -> aioredis.Redis:
    return RedisClient.get_instance()
