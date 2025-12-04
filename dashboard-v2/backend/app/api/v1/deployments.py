from fastapi import APIRouter, Depends
from typing import List, Optional
from app.schemas.deployment import DeploymentCreate, DeploymentResponse
from app.schemas.response import ApiResponse
from app.services.deployment_service import DeploymentService
from app.dependencies import get_current_active_user
from app.schemas.user import User
from datetime import datetime

router = APIRouter()

@router.post("", response_model=ApiResponse[DeploymentResponse])
async def create_deployment(
    deployment: DeploymentCreate,
    current_user: User = Depends(get_current_active_user)
):
    """Create a new deployment"""
    result = await DeploymentService.create_deployment(deployment)
    return ApiResponse(
        success=True,
        data=result,
        message=f"Deployment {deployment.name} created successfully",
        timestamp=datetime.utcnow()
    )

@router.get("", response_model=ApiResponse[List[DeploymentResponse]])
async def list_deployments(
    namespace: Optional[str] = None,
    current_user: User = Depends(get_current_active_user)
):
    """List deployments"""
    result = await DeploymentService.list_deployments(namespace)
    return ApiResponse(
        success=True,
        data=result,
        timestamp=datetime.utcnow()
    )

@router.get("/{name}", response_model=ApiResponse[DeploymentResponse])
async def get_deployment(
    name: str,
    namespace: str = "default",
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific deployment"""
    deployments = await DeploymentService.list_deployments(namespace)
    deployment = next((d for d in deployments if d.name == name), None)
    
    if not deployment:
        from app.core.errors import ResourceNotFound
        raise ResourceNotFound(f"Deployment {name} not found")
    
    return ApiResponse(
        success=True,
        data=deployment,
        timestamp=datetime.utcnow()
    )

@router.delete("/{name}", response_model=ApiResponse[dict])
async def delete_deployment(
    name: str,
    namespace: str = "default",
    current_user: User = Depends(get_current_active_user)
):
    """Delete a deployment"""
    await DeploymentService.delete_deployment(name, namespace)
    return ApiResponse(
        success=True,
        data={"deleted": True},
        message=f"Deployment {name} deleted successfully",
        timestamp=datetime.utcnow()
    )

@router.post("/validate", response_model=ApiResponse[dict])
async def validate_deployment(
    deployment: DeploymentCreate,
    current_user: User = Depends(get_current_active_user)
):
    """Validate deployment configuration without creating it"""
    # Basic validation is done by Pydantic
    # Additional custom validation can be added here
    return ApiResponse(
        success=True,
        data={"valid": True},
        message="Deployment configuration is valid",
        timestamp=datetime.utcnow()
    )
