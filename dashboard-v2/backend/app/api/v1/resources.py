from fastapi import APIRouter, Depends, Query
from typing import List, Optional
from app.schemas.response import ApiResponse
from app.core.k8s_client import K8sClient
from app.dependencies import get_current_active_user
from app.schemas.user import User
from datetime import datetime

router = APIRouter()

SUPPORTED_KINDS = ['pod', 'deployment', 'service', 'configmap', 'secret', 'persistentvolumeclaim', 'persistentvolume', 'statefulset', 'daemonset']

@router.get("/{kind}", response_model=ApiResponse[List[dict]])
async def list_resources(
    kind: str,
    namespace: Optional[str] = Query(None),
    current_user: User = Depends(get_current_active_user)
):
    """List resources of a specific kind"""
    if kind.lower() not in SUPPORTED_KINDS:
        from app.core.errors import ValidationError
        raise ValidationError(f"Unsupported resource kind: {kind}. Supported: {', '.join(SUPPORTED_KINDS)}")
    
    resources = await K8sClient.get_resources(kind, namespace)
    
    # Convert to dict format
    result = []
    for resource in resources:
        resource_dict = resource.to_dict() if hasattr(resource, 'to_dict') else resource
        
        # Extract common fields for easier display
        metadata = resource_dict.get('metadata', {})
        status = resource_dict.get('status', {})
        
        result.append({
            'name': metadata.get('name'),
            'namespace': metadata.get('namespace'),
            'created_at': metadata.get('creation_timestamp'),
            'labels': metadata.get('labels', {}),
            'annotations': metadata.get('annotations', {}),
            'status': status,
            'full_data': resource_dict
        })
    
    return ApiResponse(
        success=True,
        data=result,
        timestamp=datetime.utcnow()
    )

@router.get("/{kind}/{namespace}/{name}", response_model=ApiResponse[dict])
async def get_resource(
    kind: str,
    namespace: str,
    name: str,
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific resource"""
    if kind.lower() not in SUPPORTED_KINDS:
        from app.core.errors import ValidationError
        raise ValidationError(f"Unsupported resource kind: {kind}")
    
    resources = await K8sClient.get_resources(kind, namespace)
    
    # Find the specific resource
    resource = next((r for r in resources if r.metadata.name == name), None)
    
    if not resource:
        from app.core.errors import ResourceNotFound
        raise ResourceNotFound(f"{kind} {name} not found in namespace {namespace}")
    
    resource_dict = resource.to_dict() if hasattr(resource, 'to_dict') else resource
    
    return ApiResponse(
        success=True,
        data=resource_dict,
        timestamp=datetime.utcnow()
    )
