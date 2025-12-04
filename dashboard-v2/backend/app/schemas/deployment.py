from pydantic import BaseModel, Field, field_validator
from typing import Optional, Dict, List
import re

class ResourceRequirements(BaseModel):
    cpu_request: Optional[str] = Field(None, description="CPU request (e.g., '100m', '1')")
    cpu_limit: Optional[str] = Field(None, description="CPU limit")
    memory_request: Optional[str] = Field(None, description="Memory request (e.g., '128Mi', '1Gi')")
    memory_limit: Optional[str] = Field(None, description="Memory limit")
    gpu: Optional[int] = Field(None, description="Number of GPUs")

class VolumeMount(BaseModel):
    name: str
    mount_path: str
    read_only: bool = False

class DeploymentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=63)
    namespace: str = Field(default="default")
    image: str = Field(..., description="Container image")
    port: Optional[int] = Field(None, ge=1, le=65535)
    replicas: int = Field(default=1, ge=0, le=10)
    
    # Service exposure
    expose_service: bool = Field(default=False)
    service_type: str = Field(default="ClusterIP")  # ClusterIP, NodePort, LoadBalancer
    
    # Resources
    resources: Optional[ResourceRequirements] = None
    
    # Environment variables
    env_vars: Dict[str, str] = Field(default_factory=dict)
    
    # Command override
    command: Optional[List[str]] = None
    args: Optional[List[str]] = None
    
    # Volume mounts
    volume_mounts: List[VolumeMount] = Field(default_factory=list)
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not re.match(r'^[a-z0-9]([-a-z0-9]*[a-z0-9])?$', v):
            raise ValueError('Name must be lowercase alphanumeric with hyphens')
        return v
    
    @field_validator('service_type')
    @classmethod
    def validate_service_type(cls, v: str) -> str:
        if v not in ['ClusterIP', 'NodePort', 'LoadBalancer']:
            raise ValueError('Invalid service type')
        return v

class DeploymentResponse(BaseModel):
    name: str
    namespace: str
    replicas: int
    available_replicas: int
    created_at: str
    image: str
    status: str
