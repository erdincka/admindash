from fastapi import HTTPException
from typing import Any, Dict, Optional

class AppError(Exception):
    """Base error class for application"""
    def __init__(
        self, 
        message: str, 
        code: str = "INTERNAL_ERROR", 
        status_code: int = 500,
        details: Optional[Dict[str, Any]] = None
    ):
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details
        super().__init__(self.message)

class ResourceNotFound(AppError):
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message, 
            code="RESOURCE_NOT_FOUND", 
            status_code=404, 
            details=details
        )

class ValidationError(AppError):
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message, 
            code="VALIDATION_ERROR", 
            status_code=400, 
            details=details
        )

class K8sApiError(AppError):
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message, 
            code="K8S_API_ERROR", 
            status_code=502, 
            details=details
        )

class AuthenticationError(AppError):
    def __init__(self, message: str = "Authentication required"):
        super().__init__(
            message=message, 
            code="UNAUTHORIZED", 
            status_code=401
        )

class PermissionError(AppError):
    def __init__(self, message: str = "Permission denied"):
        super().__init__(
            message=message, 
            code="FORBIDDEN", 
            status_code=403
        )
