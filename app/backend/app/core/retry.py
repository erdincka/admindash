import asyncio
import logging
from functools import wraps
from typing import Callable, Type, Tuple, Union

logger = logging.getLogger(__name__)

def retry(
    max_attempts: int = 3,
    backoff_factor: float = 1.0,
    exceptions: Union[Type[Exception], Tuple[Type[Exception], ...]] = Exception,
    on_retry: Callable = None
):
    """
    Decorator for retrying async functions with exponential backoff.
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            attempt = 1
            while True:
                try:
                    return await func(*args, **kwargs)
                except exceptions as e:
                    if attempt >= max_attempts:
                        logger.error(f"Function {func.__name__} failed after {max_attempts} attempts")
                        raise e
                    
                    wait_time = backoff_factor * (2 ** (attempt - 1))
                    
                    if on_retry:
                        on_retry(attempt, wait_time, e)
                    else:
                        logger.warning(
                            f"Attempt {attempt} failed for {func.__name__}: {str(e)}. "
                            f"Retrying in {wait_time}s..."
                        )
                    
                    await asyncio.sleep(wait_time)
                    attempt += 1
        return wrapper
    return decorator
