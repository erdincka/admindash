from fastapi import Header, HTTPException, Depends
from typing import Optional
from app.config import settings
from app.schemas.user import User

async def get_user_from_headers(
    x_forwarded_user: Optional[str] = Header(None, alias="X-Forwarded-User"),
    x_forwarded_email: Optional[str] = Header(None, alias="X-Forwarded-Email"),
    x_forwarded_groups: Optional[str] = Header(None, alias="X-Forwarded-Groups"),
) -> User:
    """
    Extract user information from OAuth2-Proxy headers.
    In development mode, returns a mock user if headers are missing.
    """
    if settings.environment == "development" and not x_forwarded_email:
        return User(
            username="dev_user",
            email="dev@example.com",
            groups=["admin", "developers"]
        )
    
    if not x_forwarded_email:
        raise HTTPException(status_code=401, detail="Authentication required")
        
    groups = x_forwarded_groups.split(",") if x_forwarded_groups else []
    
    return User(
        username=x_forwarded_user or x_forwarded_email.split("@")[0],
        email=x_forwarded_email,
        groups=groups
    )
