from fastapi import APIRouter, Depends
from app.schemas.user import User
from app.dependencies import get_current_active_user

router = APIRouter()

@router.get("/me", response_model=User)
async def read_users_me(current_user: User = Depends(get_current_active_user)):
    """
    Get current user information
    """
    return current_user
