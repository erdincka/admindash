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

@router.get("/pod/{namespace}/{name}/logs", response_model=ApiResponse[str])
async def get_pod_logs(
    namespace: str,
    name: str,
    container: Optional[str] = Query(None),
    tail_lines: Optional[int] = Query(100),
    current_user: User = Depends(get_current_active_user)
):
    """Get logs from a pod"""
    from kubernetes_asyncio import client
    from app.core.errors import K8sApiError, ResourceNotFound
    import logging
    
    logger = logging.getLogger(__name__)
    
    try:
        await K8sClient.initialize()
        async with client.ApiClient() as api:
            v1 = client.CoreV1Api(api)
            
            # If no container specified, get the first one
            if not container:
                try:
                    pod = await v1.read_namespaced_pod(name, namespace)
                    if pod.spec.containers:
                        container = pod.spec.containers[0].name
                    else:
                        raise ResourceNotFound(f"No containers found in pod {name}")
                except client.exceptions.ApiException as e:
                    if e.status == 404:
                        raise ResourceNotFound(f"Pod {name} not found in namespace {namespace}")
                    raise
            
            # Get logs
            try:
                logs = await v1.read_namespaced_pod_log(
                    name=name,
                    namespace=namespace,
                    container=container,
                    tail_lines=tail_lines
                )
                
                return ApiResponse(
                    success=True,
                    data=logs,
                    message=f"Retrieved {tail_lines} lines from {container}",
                    timestamp=datetime.utcnow()
                )
            except client.exceptions.ApiException as e:
                if e.status == 400:
                    # Pod might not be running yet
                    raise K8sApiError(f"Cannot get logs: {e.reason}")
                raise
                
    except Exception as e:
        logger.error(f"Error getting pod logs: {e}", exc_info=True)
        raise K8sApiError(f"Failed to get pod logs: {str(e)}")

@router.get("/{kind}/{namespace}/{name}/describe", response_model=ApiResponse[str])
async def describe_resource(
    kind: str,
    namespace: str,
    name: str,
    current_user: User = Depends(get_current_active_user)
):
    """Get detailed description of a resource (YAML format)"""
    from kubernetes_asyncio import client
    from app.core.errors import K8sApiError, ResourceNotFound, ValidationError
    import yaml
    import logging
    
    logger = logging.getLogger(__name__)
    
    if kind.lower() not in SUPPORTED_KINDS:
        raise ValidationError(f"Unsupported resource kind: {kind}")
    
    try:
        await K8sClient.initialize()
        async with client.ApiClient() as api:
            # Get the appropriate API based on kind
            if kind == 'pod':
                api_instance = client.CoreV1Api(api)
                resource = await api_instance.read_namespaced_pod(name, namespace)
            elif kind == 'deployment':
                api_instance = client.AppsV1Api(api)
                resource = await api_instance.read_namespaced_deployment(name, namespace)
            elif kind == 'service':
                api_instance = client.CoreV1Api(api)
                resource = await api_instance.read_namespaced_service(name, namespace)
            elif kind == 'configmap':
                api_instance = client.CoreV1Api(api)
                resource = await api_instance.read_namespaced_config_map(name, namespace)
            elif kind == 'secret':
                api_instance = client.CoreV1Api(api)
                resource = await api_instance.read_namespaced_secret(name, namespace)
            elif kind == 'persistentvolumeclaim':
                api_instance = client.CoreV1Api(api)
                resource = await api_instance.read_namespaced_persistent_volume_claim(name, namespace)
            elif kind == 'persistentvolume':
                api_instance = client.CoreV1Api(api)
                resource = await api_instance.read_persistent_volume(name)
            elif kind == 'statefulset':
                api_instance = client.AppsV1Api(api)
                resource = await api_instance.read_namespaced_stateful_set(name, namespace)
            elif kind == 'daemonset':
                api_instance = client.AppsV1Api(api)
                resource = await api_instance.read_namespaced_daemon_set(name, namespace)
            else:
                raise ValidationError(f"Unsupported resource kind: {kind}")
            
            # Convert to dict and then to YAML
            resource_dict = resource.to_dict() if hasattr(resource, 'to_dict') else resource
            yaml_output = yaml.dump(resource_dict, default_flow_style=False, sort_keys=False)
            
            return ApiResponse(
                success=True,
                data=yaml_output,
                message=f"Retrieved {kind}/{name}",
                timestamp=datetime.utcnow()
            )
            
    except client.exceptions.ApiException as e:
        if e.status == 404:
            raise ResourceNotFound(f"{kind} {name} not found in namespace {namespace}")
        logger.error(f"Kubernetes API error: {e}", exc_info=True)
        raise K8sApiError(f"Failed to describe {kind}: {e.reason}")
    except Exception as e:
        logger.error(f"Error describing resource: {e}", exc_info=True)
        raise K8sApiError(f"Failed to describe {kind}: {str(e)}")

@router.post("/apply", response_model=ApiResponse[dict])
async def apply_yaml(
    yaml_content: dict,
    current_user: User = Depends(get_current_active_user)
):
    """Apply a YAML manifest to the cluster"""
    import yaml
    from kubernetes_asyncio import client, utils
    from app.core.errors import ValidationError, K8sApiError
    import logging
    
    logger = logging.getLogger(__name__)
    
    try:
        # Initialize K8s client
        await K8sClient.initialize()
        
        # Parse YAML content
        yaml_str = yaml_content.get('yaml', '')
        if not yaml_str:
            raise ValidationError("YAML content is required")
        
        # Parse and validate YAML
        try:
            manifests = list(yaml.safe_load_all(yaml_str))
        except yaml.YAMLError as e:
            logger.error(f"YAML parsing error: {e}")
            raise ValidationError(f"Invalid YAML format: {str(e)}")
        
        # Filter out None values (empty documents)
        manifests = [m for m in manifests if m is not None]
        
        if not manifests:
            raise ValidationError("No valid Kubernetes resources found in YAML")
        
        logger.info(f"Parsed {len(manifests)} manifest(s) from YAML")
        
        results = []
        async with client.ApiClient() as api:
            for idx, manifest in enumerate(manifests):
                try:
                    # Validate manifest has required fields
                    if not isinstance(manifest, dict):
                        raise ValidationError(f"Manifest {idx + 1} must be a dictionary")
                    
                    if 'apiVersion' not in manifest:
                        raise ValidationError(f"Manifest {idx + 1} missing 'apiVersion' field")
                    
                    if 'kind' not in manifest:
                        raise ValidationError(f"Manifest {idx + 1} missing 'kind' field")
                    
                    if 'metadata' not in manifest or 'name' not in manifest.get('metadata', {}):
                        raise ValidationError(f"Manifest {idx + 1} missing 'metadata.name' field")
                    
                    kind = manifest.get('kind', 'Unknown')
                    metadata = manifest.get('metadata', {})
                    name = metadata.get('name', 'unknown')
                    namespace = metadata.get('namespace', 'default')
                    
                    logger.info(f"Applying {kind}/{name} in namespace {namespace}")
                    
                    # Use kubernetes utils to create from dict
                    try:
                        # Create the resource using utils.create_from_dict
                        created_objects = await utils.create_from_dict(
                            api,
                            manifest,
                            namespace=namespace,
                            verbose=True
                        )
                        
                        logger.info(f"Successfully created {kind}/{name} in namespace {namespace}")
                        
                        results.append({
                            'kind': kind,
                            'name': name,
                            'namespace': namespace,
                            'status': 'created',
                            'message': f"Successfully created {kind}/{name}"
                        })
                        
                    except client.exceptions.ApiException as e:
                        error_msg = f"Kubernetes API error: {e.reason}"
                        if e.status == 409:
                            error_msg = f"{kind}/{name} already exists"
                            logger.warning(error_msg)
                            results.append({
                                'kind': kind,
                                'name': name,
                                'namespace': namespace,
                                'status': 'exists',
                                'message': error_msg
                            })
                        else:
                            logger.error(f"Failed to create {kind}/{name}: {e}")
                            results.append({
                                'kind': kind,
                                'name': name,
                                'namespace': namespace,
                                'status': 'error',
                                'message': error_msg
                            })
                    
                except ValidationError as ve:
                    logger.error(f"Validation error for manifest {idx + 1}: {ve}")
                    results.append({
                        'kind': manifest.get('kind', 'unknown'),
                        'name': manifest.get('metadata', {}).get('name', 'unknown'),
                        'namespace': manifest.get('metadata', {}).get('namespace', 'default'),
                        'status': 'error',
                        'message': str(ve)
                    })
                except Exception as e:
                    logger.error(f"Unexpected error applying manifest {idx + 1}: {e}", exc_info=True)
                    results.append({
                        'kind': manifest.get('kind', 'unknown'),
                        'name': manifest.get('metadata', {}).get('name', 'unknown'),
                        'namespace': manifest.get('metadata', {}).get('namespace', 'default'),
                        'status': 'error',
                        'message': f"Unexpected error: {str(e)}"
                    })
        
        created_count = len([r for r in results if r['status'] == 'created'])
        exists_count = len([r for r in results if r['status'] == 'exists'])
        failed_count = len([r for r in results if r['status'] == 'error'])
        
        logger.info(f"Apply results: {created_count} created, {exists_count} already exist, {failed_count} failed")
        
        return ApiResponse(
            success=failed_count == 0,
            data={
                'created': created_count,
                'exists': exists_count,
                'failed': failed_count,
                'total': len(results),
                'results': results
            },
            message=f"Applied {len(results)} resource(s): {created_count} created, {exists_count} already exist, {failed_count} failed",
            timestamp=datetime.utcnow()
        )
        
    except ValidationError as ve:
        logger.error(f"Validation error: {ve}")
        raise
    except Exception as e:
        logger.error(f"Error applying YAML: {e}", exc_info=True)
        raise K8sApiError(f"Failed to apply YAML: {str(e)}")
