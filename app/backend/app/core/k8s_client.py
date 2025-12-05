from kubernetes_asyncio import client, config
from app.config import settings
from app.core.cache import cache
from app.core.errors import K8sApiError
from typing import List, Any, Optional, Callable
import logging

logger = logging.getLogger(__name__)

class K8sClient:
    _initialized = False

    @classmethod
    async def initialize(cls):
        if not cls._initialized:
            try:
                if settings.k8s_in_cluster:
                    config.load_incluster_config()
                else:
                    await config.load_kube_config()
                cls._initialized = True
            except Exception as e:
                logger.error(f"Failed to load K8s config: {e}")
                raise K8sApiError(f"Failed to load K8s config: {str(e)}")

    @staticmethod
    @cache(ttl=settings.cache_ttl_namespaces)
    async def get_namespaces() -> List[Any]:
        await K8sClient.initialize()
        try:
            async with client.ApiClient() as api:
                v1 = client.CoreV1Api(api)
                ret = await v1.list_namespace()
                return ret.items
        except Exception as e:
            logger.error(f"Error listing namespaces: {e}")
            raise K8sApiError(f"Failed to list namespaces: {str(e)}")

    @staticmethod
    @cache(ttl=settings.cache_ttl_resources, key_builder=lambda kind, ns=None: f"resources:{kind}:{ns or 'all'}")
    async def get_resources(kind: str, namespace: str = None) -> List[Any]:
        await K8sClient.initialize()
        try:
            async with client.ApiClient() as api:
                # Map kind to API method
                # This is a simplified mapping, might need a proper discovery or mapping logic
                if kind.lower() == 'pod':
                    v1 = client.CoreV1Api(api)
                    if namespace:
                        ret = await v1.list_namespaced_pod(namespace)
                    else:
                        ret = await v1.list_pod_for_all_namespaces()
                elif kind.lower() == 'deployment':
                    apps_v1 = client.AppsV1Api(api)
                    if namespace:
                        ret = await apps_v1.list_namespaced_deployment(namespace)
                    else:
                        ret = await apps_v1.list_deployment_for_all_namespaces()
                elif kind.lower() == 'service':
                    v1 = client.CoreV1Api(api)
                    if namespace:
                        ret = await v1.list_namespaced_service(namespace)
                    else:
                        ret = await v1.list_service_for_all_namespaces()
                elif kind.lower() == 'configmap':
                    v1 = client.CoreV1Api(api)
                    if namespace:
                        ret = await v1.list_namespaced_config_map(namespace)
                    else:
                        ret = await v1.list_config_map_for_all_namespaces()
                elif kind.lower() == 'secret':
                    v1 = client.CoreV1Api(api)
                    if namespace:
                        ret = await v1.list_namespaced_secret(namespace)
                    else:
                        ret = await v1.list_secret_for_all_namespaces()
                elif kind.lower() == 'persistentvolumeclaim':
                    v1 = client.CoreV1Api(api)
                    if namespace:
                        ret = await v1.list_namespaced_persistent_volume_claim(namespace)
                    else:
                        ret = await v1.list_persistent_volume_claim_for_all_namespaces()
                elif kind.lower() == 'persistentvolume':
                    v1 = client.CoreV1Api(api)
                    ret = await v1.list_persistent_volume()
                elif kind.lower() == 'statefulset':
                    apps_v1 = client.AppsV1Api(api)
                    if namespace:
                        ret = await apps_v1.list_namespaced_stateful_set(namespace)
                    else:
                        ret = await apps_v1.list_stateful_set_for_all_namespaces()
                elif kind.lower() == 'daemonset':
                    apps_v1 = client.AppsV1Api(api)
                    if namespace:
                        ret = await apps_v1.list_namespaced_daemon_set(namespace)
                    else:
                        ret = await apps_v1.list_daemon_set_for_all_namespaces()
                else:
                    raise K8sApiError(f"Unsupported resource kind: {kind}")
                
                return ret.items
        except Exception as e:
            logger.error(f"Error getting {kind}: {e}")
            raise K8sApiError(f"Failed to get {kind}: {str(e)}")

    @staticmethod
    async def get_nodes() -> List[Any]:
        await K8sClient.initialize()
        try:
            async with client.ApiClient() as api:
                v1 = client.CoreV1Api(api)
                ret = await v1.list_node()
                return ret.items
        except Exception as e:
            logger.error(f"Error listing nodes: {e}")
            raise K8sApiError(f"Failed to list nodes: {str(e)}")

    @staticmethod
    async def get_node_metrics() -> List[Any]:
        await K8sClient.initialize()
        try:
            async with client.ApiClient() as api:
                custom_api = client.CustomObjectsApi(api)
                ret = await custom_api.list_cluster_custom_object(
                    group="metrics.k8s.io",
                    version="v1beta1",
                    plural="nodes"
                )
                return ret.get('items', [])
        except Exception as e:
            logger.warning(f"Error getting node metrics (Metrics Server might not be installed): {e}")
            return []

    @staticmethod
    async def watch_resource(kind: str, namespace: str = None, callback: Callable = None):
        await K8sClient.initialize()
        from kubernetes_asyncio import watch
        
        try:
            async with client.ApiClient() as api:
                w = watch.Watch()
                v1 = client.CoreV1Api(api)
                apps_v1 = client.AppsV1Api(api)
                
                func = None
                kwargs = {}
                
                if kind.lower() == 'pod':
                    if namespace:
                        func = v1.list_namespaced_pod
                        kwargs['namespace'] = namespace
                    else:
                        func = v1.list_pod_for_all_namespaces
                elif kind.lower() == 'deployment':
                    if namespace:
                        func = apps_v1.list_namespaced_deployment
                        kwargs['namespace'] = namespace
                    else:
                        func = apps_v1.list_deployment_for_all_namespaces
                
                if not func:
                    logger.warning(f"Watch not supported for kind: {kind}")
                    return

                logger.info(f"Starting watch for {kind} in {namespace or 'all namespaces'}")
                async for event in w.stream(func, **kwargs):
                    if callback:
                        try:
                            await callback(event)
                        except Exception as e:
                            logger.error(f"Error in watch callback: {e}")
        except Exception as e:
            logger.error(f"Error watching {kind}: {e}")
            # Don't raise here to avoid crashing the background task loop

