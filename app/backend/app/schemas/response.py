from pydantic import BaseModel
from typing import Generic, TypeVar, Optional, Any, Dict
from datetime import datetime

T = TypeVar("T")

class ErrorDetail(BaseModel):
    code: str
    message: str
    details: Optional[Dict[str, Any]] = None

class ApiResponse(BaseModel, Generic[T]):
    success: bool
    data: Optional[T] = None
    error: Optional[ErrorDetail] = None
    message: Optional[str] = None
    timestamp: datetime = datetime.utcnow()
