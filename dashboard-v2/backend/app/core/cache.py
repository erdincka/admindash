import json
from functools import wraps
from typing import Any, Callable, Optional
from app.core.redis_client import get_redis

def serialize(obj: Any) -> Any:
    """Serialize object to JSON-compatible format"""
    if hasattr(obj, 'to_dict'):
        return obj.to_dict()
    if hasattr(obj, 'model_dump'):
        return obj.model_dump(mode='json')
    if isinstance(obj, list):
        return [serialize(item) for item in obj]
    if hasattr(obj, 'isoformat'):
        return obj.isoformat()
    return obj

def cache(ttl: int = 60, key_builder: Optional[Callable] = None):
    """
    Async cache decorator using Redis.
    
    Args:
        ttl: Time to live in seconds
        key_builder: Optional function to generate cache key from args
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate cache key
            if key_builder:
                cache_key = key_builder(*args, **kwargs)
            else:
                # Default key generation: func_name:arg1:arg2...
                key_parts = [func.__name__]
                # Skip 'self' or 'cls' if it's a method (heuristic)
                start_idx = 1 if args and hasattr(args[0], '__class__') else 0
                key_parts.extend([str(arg) for arg in args[start_idx:]])
                key_parts.extend([f"{k}={v}" for k, v in sorted(kwargs.items())])
                cache_key = ":".join(key_parts)
            
            try:
                redis = await get_redis()
                
                # Try to get from cache
                cached_value = await redis.get(cache_key)
                if cached_value:
                    return json.loads(cached_value)
                
                # Call function
                result = await func(*args, **kwargs)
                
                # Serialize and cache
                serialized = serialize(result)
                await redis.set(cache_key, json.dumps(serialized), ex=ttl)
                
                return result # Return original object on first call
                
            except Exception as e:
                # If cache fails, just execute function
                # logging.warning(f"Cache error: {e}")
                return await func(*args, **kwargs)
                
        return wrapper
    return decorator
