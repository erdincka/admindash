from fastapi import APIRouter, Depends, Query
from typing import List, Optional
from app.schemas.response import ApiResponse
from app.core.k8s_client import K8sClient
from app.dependencies import get_current_active_user
from app.schemas.user import User
from datetime import datetime

router = APIRouter()

SUPPORTED_KINDS = ['pod', 'deployment', 'service', 'configmap', 'secret', 'persistentvolumeclaim', 'persistentvolume', 'statefulset', 'daemonset', 'virtualservice']

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


def match_labels(resource_labels: dict, selector: dict) -> bool:
    """Check if resource matches selector"""
    if not selector:
        return False
    for k, v in selector.items():
        if resource_labels.get(k) != v:
            return False
    return True

@router.get("/{kind}/{namespace}/{name}/dependencies", response_model=ApiResponse[dict])
async def get_resource_dependencies(
    kind: str,
    namespace: str,
    name: str,
    current_user: User = Depends(get_current_active_user)
):
    """Get resource dependencies (upstream/downstream/related)"""
    from kubernetes_asyncio import client
    from app.core.errors import K8sApiError, ValidationError
    
    if kind.lower() not in SUPPORTED_KINDS:
        raise ValidationError(f"Unsupported resource kind: {kind}")
        
    try:
        await K8sClient.initialize()
        
        dependencies = {
            'upstream': [],
            'downstream': [],
            'related': []
        }
        
        async with client.ApiClient() as api:
            # First, get the resource itself to check its spec/metadata
            resource = None
            if kind == 'pod':
                resource = await client.CoreV1Api(api).read_namespaced_pod(name, namespace)
            elif kind == 'deployment':
                resource = await client.AppsV1Api(api).read_namespaced_deployment(name, namespace)
            elif kind == 'service':
                resource = await client.CoreV1Api(api).read_namespaced_service(name, namespace)
            elif kind == 'replicaset':
                resource = await client.AppsV1Api(api).read_namespaced_replica_set(name, namespace)
            elif kind == 'persistentvolumeclaim':
                resource = await client.CoreV1Api(api).read_namespaced_persistent_volume_claim(name, namespace)
            
            if not resource:
                # Fallback for other kinds or if lookup failed (should be caught by API exception usually)
                return ApiResponse(success=True, data=dependencies, timestamp=datetime.utcnow())

            # Convert to dict for easier access (use sanitize to ensure camelCase keys which the logic below expects)
            res_dict = api.sanitize_for_serialization(resource)
            metadata = res_dict.get('metadata', {})
            spec = res_dict.get('spec', {})
            
            # 1. UPSTREAM: Check OwnerReferences
            owner_refs = metadata.get('ownerReferences') or []
            for ref in owner_refs:
                dependencies['upstream'].append({
                    'kind': ref['kind'].lower(),
                    'name': ref['name'],
                    'namespace': namespace # Owners are usually in same namespace
                })
                
            # 2. Kind-specific logic
            
            # SERVICE -> PODS (Downstream)
            if kind == 'service':
                selector = spec.get('selector')
                if selector:
                    # Find pods matching selector
                    all_pods = await client.CoreV1Api(api).list_namespaced_pod(namespace)
                    for pod in all_pods.items:
                        pod_labels = pod.metadata.labels or {}
                        if match_labels(pod_labels, selector):
                            dependencies['downstream'].append({
                                'kind': 'pod',
                                'name': pod.metadata.name,
                                'namespace': namespace,
                                'status': pod.status.phase
                            })

            # DEPLOYMENT -> REPLICASETS (Downstream)
            elif kind == 'deployment':
                # Find matching ReplicaSets
                selector = spec.get('selector', {}).get('matchLabels')
                if selector:
                    all_rs = await client.AppsV1Api(api).list_namespaced_replica_set(namespace)
                    for rs in all_rs.items:
                        rs_labels = rs.metadata.labels or {}
                        # Check owner ref pointing to this deployment (safer than just selector for RS)
                        is_owned = False
                        for ref in (rs.metadata.owner_references or []):
                            if ref.kind == 'Deployment' and ref.name == name:
                                is_owned = True
                                break
                        
                        if is_owned:
                             dependencies['downstream'].append({
                                'kind': 'replicaset',
                                'name': rs.metadata.name,
                                'namespace': namespace,
                                'replicas': f"{rs.status.ready_replicas or 0}/{rs.status.replicas}"
                            })

            # REPLICASET -> PODS (Downstream)
            elif kind == 'replicaset':
                 # Find matching Pods
                selector = spec.get('selector', {}).get('matchLabels')
                if selector:
                     all_pods = await client.CoreV1Api(api).list_namespaced_pod(namespace)
                     for pod in all_pods.items:
                        # Check owner ref pointing to this RS
                        is_owned = False
                        for ref in (pod.metadata.owner_references or []):
                            if ref.kind == 'ReplicaSet' and ref.name == name:
                                is_owned = True
                                break
                        if is_owned:
                             dependencies['downstream'].append({
                                'kind': 'pod',
                                'name': pod.metadata.name,
                                'namespace': namespace,
                                'status': pod.status.phase
                            })

            # POD -> VOLUMES/SECRETS/CONFIGMAPS (Related)
            elif kind == 'pod':
                # Check ServiceAccount
                sa_name = spec.get('serviceAccountName')
                if sa_name and sa_name != 'default':
                    dependencies['related'].append({
                        'kind': 'serviceaccount',
                        'name': sa_name,
                        'namespace': namespace,
                        'relation': 'serviceAccount'
                    })
                
                # Check ImagePullSecrets
                pull_secrets = spec.get('imagePullSecrets') or []
                for secret in pull_secrets:
                    if secret.get('name'):
                        dependencies['related'].append({
                            'kind': 'secret',
                            'name': secret['name'],
                            'namespace': namespace,
                            'relation': 'imagePullSecret'
                        })
                volumes = spec.get('volumes') or []
                for vol in volumes:
                    if 'persistentVolumeClaim' in vol and vol['persistentVolumeClaim']:
                        claim_name = vol['persistentVolumeClaim'].get('claimName')
                        if claim_name:
                            dependencies['related'].append({
                                'kind': 'persistentvolumeclaim',
                                'name': claim_name,
                                'namespace': namespace,
                                'relation': 'volume'
                            })
                    elif 'configMap' in vol and vol['configMap']:
                         cm_name = vol['configMap'].get('name')
                         if cm_name:
                             dependencies['related'].append({
                                'kind': 'configmap',
                                'name': cm_name,
                                'namespace': namespace,
                                'relation': 'volume'
                            })
                    elif 'secret' in vol and vol['secret']:
                         sec_name = vol['secret'].get('secretName')
                         if sec_name:
                             dependencies['related'].append({
                                'kind': 'secret',
                                'name': sec_name,
                                'namespace': namespace,
                                'relation': 'volume'
                            })
                
                # Check env vars for secrets/configmaps (including initContainers)
                containers = (spec.get('containers') or []) + (spec.get('initContainers') or [])
                for c in containers:
                    # Check envFrom
                    for env_from in (c.get('envFrom') or []):
                        if 'configMapRef' in env_from and env_from['configMapRef']:
                            cm_name = env_from['configMapRef'].get('name')
                            if cm_name:
                                dependencies['related'].append({
                                    'kind': 'configmap',
                                    'name': cm_name,
                                    'namespace': namespace,
                                    'relation': 'envFrom'
                                })
                        elif 'secretRef' in env_from and env_from['secretRef']:
                            sec_name = env_from['secretRef'].get('name')
                            if sec_name:
                                dependencies['related'].append({
                                    'kind': 'secret',
                                    'name': sec_name,
                                    'namespace': namespace,
                                    'relation': 'envFrom'
                                })

                    for env in (c.get('env') or []):
                         if 'valueFrom' in env and env['valueFrom']:
                             vf = env['valueFrom']
                             if 'configMapKeyRef' in vf and vf['configMapKeyRef']:
                                 cm_name = vf['configMapKeyRef'].get('name')
                                 if cm_name:
                                     dependencies['related'].append({
                                        'kind': 'configmap',
                                        'name': cm_name,
                                        'namespace': namespace,
                                        'relation': 'env'
                                    })
                             elif 'secretKeyRef' in vf and vf['secretKeyRef']:
                                 sec_name = vf['secretKeyRef'].get('name')
                                 if sec_name:
                                     dependencies['related'].append({
                                        'kind': 'secret',
                                        'name': sec_name,
                                        'namespace': namespace,
                                        'relation': 'env'
                                    })

            # PVC -> PV (Related/Upstream)
            elif kind == 'persistentvolumeclaim':
                pv_name = spec.get('volumeName')
                if pv_name:
                     dependencies['related'].append({
                        'kind': 'persistentvolume',
                        'name': pv_name,
                        'namespace': '', # PVs are cluster-scoped
                        'relation': 'bound-pv'
                    })

        return ApiResponse(
            success=True,
            data=dependencies,
            timestamp=datetime.utcnow()
        )

    except client.exceptions.ApiException as e:
        if e.status == 404:
             from app.core.errors import ResourceNotFound
             raise ResourceNotFound(f"{kind} '{name}' not found")
        raise K8sApiError(f"Failed to get dependencies: {str(e)}")
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Error getting dependencies: {e}", exc_info=True)
        raise K8sApiError(f"Error resolving dependencies: {str(e)}")

@router.get("/{kind}/{namespace}/{name}/events", response_model=ApiResponse[List[dict]])
async def get_resource_events(
    kind: str,
    namespace: str,
    name: str,
    current_user: User = Depends(get_current_active_user)
):
    """Get events for a specific resource"""
    from kubernetes_asyncio import client
    from app.core.errors import K8sApiError, ValidationError
    
    try:
        await K8sClient.initialize()
        async with client.ApiClient() as api:
            v1 = client.CoreV1Api(api)
            # Fetch events for this specific resource using field_selector
            field_selector = f"involvedObject.name={name}"
            events_list = await v1.list_namespaced_event(namespace, field_selector=field_selector)
            
            # Filter
            related_events = []
            target_kind = kind.lower()
            
            import logging
            logger = logging.getLogger(__name__)
            logger.info(f"Found {len(events_list.items)} events for {kind}/{name} in {namespace}")

            for event in events_list.items:
                obj = event.involved_object
                # Check match. obj.kind is usually CamelCase (Pod).
                if obj and obj.name == name and obj.kind and obj.kind.lower() == target_kind:
                    related_events.append({
                        'type': event.type,
                        'reason': event.reason,
                        'message': event.message,
                        'count': event.count,
                        'first_timestamp': event.first_timestamp,
                        'last_timestamp': event.last_timestamp or event.event_time or event.first_timestamp,
                        'source': event.source.component if event.source else None
                    })
                else:
                    logger.debug(f"Skipping event {event.metadata.name}: obj.name={obj.name if obj else 'None'}, obj.kind={obj.kind if obj else 'None'}")
            
            # Sort by last_timestamp desc
            related_events.sort(
                key=lambda x: x['last_timestamp'] or x['first_timestamp'] or datetime.min, 
                reverse=True
            )
            
            return ApiResponse(
                success=True,
                data=related_events,
                timestamp=datetime.utcnow()
            )
            
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Error getting events: {e}", exc_info=True)
        raise K8sApiError(f"Failed to get events: {str(e)}")

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
            elif kind == 'virtualservice':
                api_instance = client.CustomObjectsApi(api)
                # Try v1beta1 first, then v1alpha3
                try:
                    resource = await api_instance.get_namespaced_custom_object(
                        group="networking.istio.io",
                        version="v1beta1",
                        namespace=namespace,
                        plural="virtualservices",
                        name=name
                    )
                except client.exceptions.ApiException as e:
                    if e.status == 404:
                         resource = await api_instance.get_namespaced_custom_object(
                            group="networking.istio.io",
                            version="v1alpha3",
                            namespace=namespace,
                            plural="virtualservices",
                            name=name
                        )
                    else:
                        raise e
            else:
                raise ValidationError(f"Unsupported kind for describe: {kind}")
            
            # Convert to dict if it's a model object
            if hasattr(resource, 'to_dict'):
                resource_dict = resource.to_dict()
            else:
                resource_dict = resource
                
            # Clean up metadata
            if 'metadata' in resource_dict:
                metadata = resource_dict['metadata']
                if 'managedFields' in metadata:
                    del metadata['managedFields']
            
            # Dump to YAML
            yaml_content = yaml.dump(resource_dict, default_flow_style=False)
            
            return ApiResponse(
                success=True,
                data=yaml_content,
                timestamp=datetime.utcnow()
            )
            
    except client.exceptions.ApiException as e:
        if e.status == 404:
            raise ResourceNotFound(f"{kind} '{name}' not found in namespace '{namespace}'")
        logger.error(f"K8s API error: {e}", exc_info=True)
        raise K8sApiError(f"Failed to describe resource: {str(e)}")
    except Exception as e:
        logger.error(f"Error describing resource: {e}", exc_info=True)
        raise K8sApiError(f"Failed to describe resource: {str(e)}")

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

@router.delete("/{kind}/{namespace}/{name}", response_model=ApiResponse[dict])
async def delete_resource(
    kind: str,
    namespace: str,
    name: str,
    current_user: User = Depends(get_current_active_user)
):
    """Delete a Kubernetes resource"""
    from kubernetes_asyncio import client
    from app.core.errors import K8sApiError, ResourceNotFound, ValidationError
    import logging

    logger = logging.getLogger(__name__)
    
    if kind.lower() not in SUPPORTED_KINDS:
         raise ValidationError(f"Unsupported resource kind: {kind}")

    try:
        await K8sClient.initialize()
        
        async with client.ApiClient() as api:
            if kind == 'pod':
                await client.CoreV1Api(api).delete_namespaced_pod(name, namespace)
            elif kind == 'deployment':
                await client.AppsV1Api(api).delete_namespaced_deployment(name, namespace)
            elif kind == 'service':
                await client.CoreV1Api(api).delete_namespaced_service(name, namespace)
            elif kind == 'configmap':
                await client.CoreV1Api(api).delete_namespaced_config_map(name, namespace)
            elif kind == 'secret':
                await client.CoreV1Api(api).delete_namespaced_secret(name, namespace)
            elif kind == 'persistentvolumeclaim':
                await client.CoreV1Api(api).delete_namespaced_persistent_volume_claim(name, namespace)
            elif kind == 'persistentvolume':
                await client.CoreV1Api(api).delete_persistent_volume(name)
            elif kind == 'statefulset':
                await client.AppsV1Api(api).delete_namespaced_stateful_set(name, namespace)
            elif kind == 'daemonset':
                await client.AppsV1Api(api).delete_namespaced_daemon_set(name, namespace)
            elif kind == 'virtualservice':
                custom_api = client.CustomObjectsApi(api)
                # Try v1beta1 first
                try:
                    await custom_api.delete_namespaced_custom_object(
                        group="networking.istio.io",
                        version="v1beta1",
                        namespace=namespace,
                        plural="virtualservices",
                        name=name
                    )
                except client.exceptions.ApiException as e:
                     if e.status == 404:
                         # Maybe it's v1alpha3 or maybe it really doesn't exist. 
                         # Try v1alpha3
                         await custom_api.delete_namespaced_custom_object(
                            group="networking.istio.io",
                            version="v1alpha3",
                            namespace=namespace,
                            plural="virtualservices",
                            name=name
                        )
                     else:
                         raise e
            else:
                # Should be caught by SUPPORTED_KINDS check, but safety net
                raise K8sApiError(f"Delete not implemented for kind: {kind}")
            
            logger.info(f"Deleted {kind}/{namespace}/{name}")
            
            return ApiResponse(
                success=True,
                data={'deleted': True, 'kind': kind, 'namespace': namespace, 'name': name},
                message=f"Resource {kind}/{namespace}/{name} deleted successfully",
                timestamp=datetime.utcnow()
            )
            
    except client.exceptions.ApiException as e:
        if e.status == 404:
            raise ResourceNotFound(f"{kind} '{name}' not found in namespace '{namespace}'")
        logger.error(f"K8s API error deleting resource: {e}", exc_info=True)
        raise K8sApiError(f"Failed to delete resource: {str(e)}")
    except Exception as e:
        logger.error(f"Error deleting resource: {e}", exc_info=True)
        raise K8sApiError(f"Failed to delete resource: {str(e)}")
