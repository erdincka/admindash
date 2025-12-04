from fastapi import APIRouter, Depends
from typing import List
from app.schemas.response import ApiResponse
from app.core.k8s_client import K8sClient
from app.dependencies import get_current_active_user
from app.schemas.user import User
from app.core.errors import K8sApiError
from datetime import datetime
from kubernetes_asyncio import client
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("", response_model=ApiResponse[List[dict]])
async def list_charts(
    current_user: User = Depends(get_current_active_user)
):
    """List Helm charts (releases) by finding Helm secrets"""
    try:
        await K8sClient.initialize()
        
        async with client.ApiClient() as api:
            v1 = client.CoreV1Api(api)
            
            # Helm 3 stores releases as secrets with type helm.sh/release.v1
            secrets = await v1.list_secret_for_all_namespaces()
            
            charts = []
            for secret in secrets.items:
                if secret.type == 'helm.sh/release.v1':
                    # Extract chart info from secret name and labels
                    name = secret.metadata.name
                    namespace = secret.metadata.namespace
                    labels = secret.metadata.labels or {}
                    
                    charts.append({
                        'name': labels.get('name', name),
                        'namespace': namespace,
                        'version': labels.get('version', 'unknown'),
                        'status': labels.get('status', 'unknown'),
                        'created_at': secret.metadata.creation_timestamp.isoformat() if secret.metadata.creation_timestamp else None
                    })
            
            return ApiResponse(
                success=True,
                data=charts,
                timestamp=datetime.utcnow()
            )
            
    except Exception as e:
        logger.error(f"Error listing charts: {e}")
        raise K8sApiError(f"Failed to list charts: {str(e)}")

@router.delete("/{name}", response_model=ApiResponse[dict])
async def delete_chart(
    name: str,
    namespace: str = "default",
    current_user: User = Depends(get_current_active_user)
):
    """Delete a Helm chart (uninstall release)"""
    try:
        await K8sClient.initialize()
        
        async with client.ApiClient() as api:
            v1 = client.CoreV1Api(api)
            
            # Find and delete all secrets related to this release
            secrets = await v1.list_namespaced_secret(namespace)
            deleted_count = 0
            
            for secret in secrets.items:
                if secret.type == 'helm.sh/release.v1':
                    labels = secret.metadata.labels or {}
                    if labels.get('name') == name:
                        await v1.delete_namespaced_secret(
                            name=secret.metadata.name,
                            namespace=namespace
                        )
                        deleted_count += 1
            
            if deleted_count == 0:
                from app.core.errors import ResourceNotFound
                raise ResourceNotFound(f"Helm release {name} not found in namespace {namespace}")
            
            logger.info(f"Deleted {deleted_count} Helm release secrets for {name}")
            
            return ApiResponse(
                success=True,
                data={"deleted": True, "secrets_removed": deleted_count},
                message=f"Helm release {name} deleted",
                timestamp=datetime.utcnow()
            )
            
    except Exception as e:
        logger.error(f"Error deleting chart: {e}")
        raise K8sApiError(f"Failed to delete chart: {str(e)}")
