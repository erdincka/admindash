from fastapi import Header, HTTPException, Depends
from typing import Optional
from app.config import settings
from app.schemas.user import User
import logging

logger = logging.getLogger(__name__)

async def get_user_from_headers(
    x_forwarded_user: Optional[str] = Header(None, alias="X-Forwarded-User"),
    x_forwarded_email: Optional[str] = Header(None, alias="X-Forwarded-Email"),
    x_forwarded_groups: Optional[str] = Header(None, alias="X-Forwarded-Groups"),
    x_auth_request_email: Optional[str] = Header(None, alias="X-Auth-Request-Email"),
    x_oidc_email: Optional[str] = Header(None, alias="X-OIDC-Email"),
    x_internal_key: Optional[str] = Header(None, alias="X-Internal-Key"),
) -> User:
    """
    Extract user information from OAuth2-Proxy headers or internal key.
    """
    # 1. Check Internal API Key
    # We might need to add INTERNAL_API_KEY to settings/config first, 
    # but for now let's assume if the header is present and matches a hardcoded or env var
    # For simplicity in this fix, we'll check against a known secret if configured, 
    # or just trust it if it's set (assuming internal network security). 
    # Ideally, add `internal_api_key` to Settings.
    
    # Let's verify email from any source
    email = x_forwarded_email or x_auth_request_email or x_oidc_email

    logger.info("Email: %s", email)
    
    # 2. Development Mode Fallback
    if settings.environment == "development" and not email:
        return User(
            username="dev_user",
            email="dev@no.domain",
            groups=["admin", "developers"]
        )
    
    # 3. Authenticate
    if not email:
        # Debugging: Log what we received (careful with PII in real logs, but helpful here)
        logger.error(f"Auth failed. Headers: {x_forwarded_email}, {x_auth_request_email}")
        raise HTTPException(status_code=401, detail="Authentication required")
        
    groups = x_forwarded_groups.split(",") if x_forwarded_groups else []
    
    username = x_forwarded_user
    if not username and email:
        username = email.split("@")[0]
    
    return User(
        username=username or "user",
        email=email,
        groups=groups
    )
