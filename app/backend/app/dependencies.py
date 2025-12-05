from fastapi import Depends
from app.core.auth import get_user_from_headers
from app.schemas.user import User

# Re-export the auth dependency for easier imports
get_current_user = get_user_from_headers

async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Validate that the user is active. 
    For now, just returns the user, but can be extended to check DB/status.
    """
    return current_user
