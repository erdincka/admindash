from fastapi import APIRouter, Depends, Query
from typing import List, Optional
from app.schemas.response import ApiResponse
from app.core.k8s_client import K8sClient
from app.dependencies import get_current_active_user
from app.schemas.user import User
from datetime import datetime
from kubernetes_asyncio import client
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/virtualservices", response_model=ApiResponse[List[dict]])
async def list_virtualservices(
    namespace: Optional[str] = Query(None),
    current_user: User = Depends(get_current_active_user)
):
    """List Istio VirtualServices"""
    try:
        await K8sClient.initialize()
        
        async with client.ApiClient() as api:
            custom_api = client.CustomObjectsApi(api)
            
            if namespace:
                vs_list = await custom_api.list_namespaced_custom_object(
                    group="networking.istio.io",
                    version="v1beta1",
                    namespace=namespace,
                    plural="virtualservices"
                )
            else:
                vs_list = await custom_api.list_cluster_custom_object(
                    group="networking.istio.io",
                    version="v1beta1",
                    plural="virtualservices"
                )
            
            return ApiResponse(
                success=True,
                data=vs_list.get('items', []),
                timestamp=datetime.utcnow()
            )
    except Exception as e:
        logger.error(f"Error listing VirtualServices: {e}")
        from app.core.errors import K8sApiError
        raise K8sApiError(f"Failed to list VirtualServices: {str(e)}")

@router.post("/virtualservices", response_model=ApiResponse[dict])
async def create_virtualservice(
    vs_data: dict,
    current_user: User = Depends(get_current_active_user)
):
    """Create an Istio VirtualService and AuthorizationPolicy"""
    try:
        await K8sClient.initialize()
        
        namespace = vs_data.get('namespace')
        service_name = vs_data.get('service_name')
        hostname = vs_data.get('hostname')
        domain = vs_data.get('domain')
        labels = vs_data.get('labels', {})
        
        if not all([namespace, service_name, hostname, domain]):
            from app.core.errors import ValidationError
            raise ValidationError("namespace, service_name, hostname, and domain are required")
        
        async with client.ApiClient() as api:
            custom_api = client.CustomObjectsApi(api)
            
            # Create VirtualService
            virtualservice_body = {
                "apiVersion": "networking.istio.io/v1beta1",
                "kind": "VirtualService",
                "metadata": {
                    "name": f"{hostname}-vs",
                    "namespace": namespace,
                    "labels": labels,
                },
                "spec": {
                    "gateways": ["istio-system/ezaf-gateway"],
                    "hosts": [f"{hostname}.{domain}"],
                    "http": [
                        {
                            "match": [
                                {"uri": {"prefix": "/"}},
                                {"uri": {"exact": "/"}},
                            ],
                            "rewrite": {"uri": "/"},
                            "route": [
                                {
                                    "destination": {
                                        "host": f"{service_name}.{namespace}.svc.cluster.local"
                                    }
                                }
                            ],
                        }
                    ],
                },
            }
            
            try:
                vs_result = await custom_api.create_namespaced_custom_object(
                    group="networking.istio.io",
                    version="v1beta1",
                    namespace=namespace,
                    plural="virtualservices",
                    body=virtualservice_body
                )
                logger.info(f"VirtualService {hostname}-vs created")
            except client.exceptions.ApiException as e:
                if e.status == 409:
                    logger.warning(f"VirtualService {hostname}-vs already exists")
                else:
                    raise
            
            # Create AuthorizationPolicy
            authpolicy_body = {
                "apiVersion": "security.istio.io/v1beta1",
                "kind": "AuthorizationPolicy",
                "metadata": {
                    "name": f"{hostname}-auth-policy",
                    "namespace": "istio-system",
                },
                "spec": {
                    "action": "CUSTOM",
                    "provider": {"name": "oauth2-proxy"},
                    "rules": [
                        {"to": [{"operation": {"hosts": [f"{hostname}.{domain}"]}}]}
                    ],
                    "selector": {"matchLabels": {"istio": "ingressgateway"}},
                },
            }
            
            try:
                auth_result = await custom_api.create_namespaced_custom_object(
                    group="security.istio.io",
                    version="v1beta1",
                    namespace="istio-system",
                    plural="authorizationpolicies",
                    body=authpolicy_body
                )
                logger.info(f"AuthorizationPolicy {hostname}-auth-policy created")
            except client.exceptions.ApiException as e:
                if e.status == 409:
                    logger.warning(f"AuthorizationPolicy {hostname}-auth-policy already exists")
                else:
                    raise
            
            return ApiResponse(
                success=True,
                data={
                    "virtualservice": f"{hostname}-vs",
                    "authpolicy": f"{hostname}-auth-policy",
                    "url": f"https://{hostname}.{domain}"
                },
                message=f"VirtualService created for {hostname}.{domain}",
                timestamp=datetime.utcnow()
            )
            
    except Exception as e:
        logger.error(f"Error creating VirtualService: {e}")
        from app.core.errors import K8sApiError
        raise K8sApiError(f"Failed to create VirtualService: {str(e)}")

@router.get("/services", response_model=ApiResponse[List[dict]])
async def list_services(
    namespace: str = Query(...),
    current_user: User = Depends(get_current_active_user)
):
    """List Kubernetes Services in a namespace"""
    try:
        await K8sClient.initialize()
        
        async with client.ApiClient() as api:
            core_v1 = client.CoreV1Api(api)
            
            services = await core_v1.list_namespaced_service(namespace=namespace)
            
            result = []
            for svc in services.items:
                ports = []
                if svc.spec.ports:
                    ports = [{"name": p.name, "port": p.port} for p in svc.spec.ports]
                
                result.append({
                    "name": svc.metadata.name,
                    "namespace": svc.metadata.namespace,
                    "ports": ports,
                    "labels": svc.metadata.labels or {}
                })
            
            return ApiResponse(
                success=True,
                data=result,
                timestamp=datetime.utcnow()
            )
            
    except Exception as e:
        logger.error(f"Error listing Services: {e}")
        from app.core.errors import K8sApiError
        raise K8sApiError(f"Failed to list Services: {str(e)}")
