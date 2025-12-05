from pydantic import BaseModel, EmailStr
from typing import Optional, List

class User(BaseModel):
    username: str
    email: EmailStr
    groups: List[str] = []
    
    class Config:
        from_attributes = True
