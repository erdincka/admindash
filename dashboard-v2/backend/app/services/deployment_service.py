from kubernetes_asyncio import client
from app.schemas.deployment import DeploymentCreate, DeploymentResponse
from app.core.k8s_client import K8sClient
from app.core.errors import K8sApiError, ValidationError
from typing import List
import logging

logger = logging.getLogger(__name__)

class DeploymentService:
    
    @staticmethod
    async def create_deployment(deployment: DeploymentCreate) -> DeploymentResponse:
        """Create a new deployment"""
        await K8sClient.initialize()
        
        try:
            async with client.ApiClient() as api:
                apps_v1 = client.AppsV1Api(api)
                core_v1 = client.CoreV1Api(api)

                # Determine Namespace
                namespace = "default" if deployment.is_public else (deployment.user_namespace or deployment.namespace)

                # Labels & Annotations
                selector_labels = {
                    "app.kubernetes.io/name": deployment.name,
                    "app.kubernetes.io/instance": deployment.name,
                }
                labels = {
                    **selector_labels,
                    "hpe-ezua/app": deployment.name,
                    "hpe-ezua/type": "vendor-service",
                    "app.kubernetes.io/managed-by": "Helm",
                    "app.kubernetes.io/version": "v0.0.1",
                    "helm.sh/chart": f"{deployment.name}-0.0.1",
                }
                annotations = {
                    "meta.helm.sh/release-name": deployment.name,
                    "meta.helm.sh/release-namespace": namespace,
                }

                if deployment.is_shared_volume:
                    labels["add-external-df-volume"] = "true"
                if not deployment.is_public:
                    labels["add-user-info-config"] = "true"
                
                env_vars = [client.V1EnvVar(name=k, value=v) for k, v in deployment.env_vars.items()] if deployment.env_vars else []

                if deployment.is_sso:
                    annotations["hpe-ezua/add-auth-token"] = "true"
                    env_vars.append(client.V1EnvVar(name="OIDC_CLIENT_ID", value="${OIDC_CLIENT_ID}"))
                    env_vars.append(client.V1EnvVar(name="OIDC_CLIENT_SECRET", value="${OIDC_CLIENT_SECRET}"))
                    env_vars.append(client.V1EnvVar(name="domain", value="${OIDC_DOMAIN}"))

                # Volumes & Mounts
                volumes = []
                volume_mounts = []
                
                # Custom volume mounts from request
                if deployment.volume_mounts:
                    for vm in deployment.volume_mounts:
                        volume_mounts.append(client.V1VolumeMount(name=vm.name, mount_path=vm.mount_path, read_only=vm.read_only))
                        # Note: This assumes the volume definition exists or is handled elsewhere. 
                        # For simplicity, we'll assume standard PVCs or ConfigMaps are used, but the reference code hardcodes specific volumes.

                if deployment.is_user_volume or deployment.is_shared_volume:
                    volumes.append(client.V1Volume(
                        name="datasources",
                        csi=client.V1CSIVolumeSource(driver="csi.ezdata.io", read_only=True)
                    ))
                    volume_mounts.append(client.V1VolumeMount(name="datasources", mount_path="/mnt/datasources"))

                if deployment.is_user_volume:
                    volumes.append(client.V1Volume(
                        name="user-pvc",
                        persistent_volume_claim=client.V1PersistentVolumeClaimVolumeSource(claim_name="user-pvc")
                    ))
                    volume_mounts.append(client.V1VolumeMount(name="user-pvc", mount_path="/mnt/user"))

                if deployment.is_shared_volume:
                    volumes.append(client.V1Volume(
                        name="kubeflow-shared-pvc",
                        persistent_volume_claim=client.V1PersistentVolumeClaimVolumeSource(claim_name="kubeflow-shared-pvc")
                    ))
                    volume_mounts.append(client.V1VolumeMount(name="kubeflow-shared-pvc", mount_path="/mnt/shared"))

                # Resources
                requests = {}
                limits = {}
                if deployment.resources:
                    if deployment.resources.cpu_request: requests['cpu'] = deployment.resources.cpu_request
                    if deployment.resources.memory_request: requests['memory'] = deployment.resources.memory_request
                    if deployment.resources.cpu_limit: limits['cpu'] = deployment.resources.cpu_limit
                    if deployment.resources.memory_limit: limits['memory'] = deployment.resources.memory_limit
                
                # Default resources if not specified
                if not requests: requests = {"cpu": "100m", "memory": "128Mi"}
                if not limits: limits = {"cpu": "1000m", "memory": "1Gi"}

                if deployment.is_gpu or (deployment.resources and deployment.resources.gpu):
                    labels["hpe-ezua/resource-type"] = "gpu"
                    limits["nvidia.com/gpu"] = "1"
                    requests["nvidia.com/gpu"] = "1"

                # Build container spec
                container = client.V1Container(
                    name=deployment.name,
                    image=deployment.image,
                    ports=[client.V1ContainerPort(container_port=deployment.port)] if deployment.port else None,
                    env=env_vars if env_vars else None,
                    command=deployment.command,
                    args=deployment.args,
                    resources=client.V1ResourceRequirements(requests=requests, limits=limits),
                    volume_mounts=volume_mounts if volume_mounts else None,
                    security_context=client.V1SecurityContext(run_as_non_root=False, run_as_user=0) if deployment.run_as_root else None
                )
                
                # Build deployment spec
                deployment_spec = client.V1Deployment(
                    api_version="apps/v1",
                    kind="Deployment",
                    metadata=client.V1ObjectMeta(
                        name=f"{deployment.name}-deployment", # Naming convention from reference
                        namespace=namespace,
                        labels=labels,
                        annotations=annotations
                    ),
                    spec=client.V1DeploymentSpec(
                        replicas=deployment.replicas,
                        selector=client.V1LabelSelector(match_labels=selector_labels),
                        template=client.V1PodTemplateSpec(
                            metadata=client.V1ObjectMeta(labels=selector_labels),
                            spec=client.V1PodSpec(
                                containers=[container],
                                volumes=volumes if volumes else None,
                                priority_class_name="vendor-gpu" if deployment.is_gpu else None
                            )
                        )
                    )
                )
                
                # Create deployment
                result = await apps_v1.create_namespaced_deployment(
                    namespace=namespace,
                    body=deployment_spec
                )
                
                # Create service if requested
                if deployment.expose_service and deployment.port:
                    # Get domain from cluster config
                    domain = None
                    try:
                        config_map = await core_v1.read_namespaced_config_map(
                            name="ezua-cluster-config",
                            namespace="ezua-system"
                        )
                        domain = config_map.data.get("cluster.domainName") if config_map.data else None
                    except Exception as e:
                        logger.warning(f"Could not retrieve domain from cluster config: {e}")
                        domain = "no.domain"  # Fallback domain
                    
                    service_spec = client.V1Service(
                        api_version="v1",
                        kind="Service",
                        metadata=client.V1ObjectMeta(
                            name=deployment.name,
                            namespace=namespace,
                            labels=selector_labels
                        ),
                        spec=client.V1ServiceSpec(
                            selector=selector_labels,
                            ports=[client.V1ServicePort(
                                port=deployment.port,
                                target_port=deployment.port,
                                name="http"
                            )],
                            type=deployment.service_type
                        )
                    )
                    
                    try:
                        await core_v1.create_namespaced_service(
                            namespace=namespace,
                            body=service_spec
                        )
                        logger.info(f"Service {deployment.name} created in namespace {namespace}")
                    except client.exceptions.ApiException as e:
                        if e.status != 409:  # Ignore if exists
                            raise e
                        logger.info(f"Service {deployment.name} already exists")
                    
                    # Create VirtualService for Istio
                    if domain:
                        custom_api = client.CustomObjectsApi(api)
                        
                        # Create VirtualService
                        virtualservice_body = {
                            "apiVersion": "networking.istio.io/v1alpha3",
                            "kind": "VirtualService",
                            "metadata": {
                                "name": f"{deployment.name}-vs",
                                "namespace": namespace,
                                "labels": labels,
                            },
                            "spec": {
                                "gateways": ["istio-system/ezaf-gateway"],
                                "hosts": [f"{deployment.name}.{domain}"],
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
                                                    "host": f"{deployment.name}.{namespace}.svc.cluster.local"
                                                }
                                            }
                                        ],
                                    }
                                ],
                            },
                        }
                        
                        try:
                            await custom_api.create_namespaced_custom_object(
                                group="networking.istio.io",
                                version="v1alpha3",
                                namespace=namespace,
                                plural="virtualservices",
                                body=virtualservice_body
                            )
                            logger.info(f"VirtualService {deployment.name}-vs created")
                        except client.exceptions.ApiException as e:
                            if e.status != 409:
                                logger.warning(f"Failed to create VirtualService: {e}")
                            else:
                                logger.info(f"VirtualService {deployment.name}-vs already exists")
                        
                        # Create AuthorizationPolicy
                        authpolicy_body = {
                            "apiVersion": "security.istio.io/v1beta1",
                            "kind": "AuthorizationPolicy",
                            "metadata": {
                                "name": f"{deployment.name}-auth-policy",
                                "namespace": "istio-system",
                            },
                            "spec": {
                                "action": "CUSTOM",
                                "provider": {"name": "oauth2-proxy"},
                                "rules": [
                                    {"to": [{"operation": {"hosts": [f"{deployment.name}.{domain}"]}}]}
                                ],
                                "selector": {"matchLabels": {"istio": "ingressgateway"}},
                            },
                        }
                        
                        try:
                            await custom_api.create_namespaced_custom_object(
                                group="security.istio.io",
                                version="v1beta1",
                                namespace="istio-system",
                                plural="authorizationpolicies",
                                body=authpolicy_body
                            )
                            logger.info(f"AuthorizationPolicy {deployment.name}-auth-policy created")
                        except client.exceptions.ApiException as e:
                            if e.status != 409:
                                logger.warning(f"Failed to create AuthorizationPolicy: {e}")
                            else:
                                logger.info(f"AuthorizationPolicy {deployment.name}-auth-policy already exists")
                
                return DeploymentResponse(
                    name=result.metadata.name,
                    namespace=result.metadata.namespace,
                    replicas=result.spec.replicas,
                    available_replicas=result.status.available_replicas or 0,
                    created_at=result.metadata.creation_timestamp.isoformat(),
                    image=deployment.image,
                    status="Created"
                )
                
        except client.exceptions.ApiException as e:
            logger.error(f"K8s API error creating deployment: {e}")
            if e.status == 409:
                raise ValidationError(f"Deployment {deployment.name} already exists")
            raise K8sApiError(f"Failed to create deployment: {e.reason}")
        except Exception as e:
            logger.error(f"Error creating deployment: {e}")
            raise K8sApiError(f"Failed to create deployment: {str(e)}")
    
    @staticmethod
    async def list_deployments(namespace: str = None) -> List[DeploymentResponse]:
        """List deployments"""
        try:
            deployments = await K8sClient.get_resources('deployment', namespace)
            
            return [
                DeploymentResponse(
                    name=d.metadata.name,
                    namespace=d.metadata.namespace,
                    replicas=d.spec.replicas,
                    available_replicas=d.status.available_replicas or 0,
                    created_at=d.metadata.creation_timestamp.isoformat(),
                    image=d.spec.template.spec.containers[0].image if d.spec.template.spec.containers else "",
                    status="Running" if d.status.available_replicas == d.spec.replicas else "Pending"
                ) for d in deployments
            ]
        except Exception as e:
            logger.error(f"Error listing deployments: {e}")
            raise K8sApiError(f"Failed to list deployments: {str(e)}")
    
    @staticmethod
    async def delete_deployment(name: str, namespace: str = "default"):
        """Delete a deployment"""
        await K8sClient.initialize()
        
        try:
            async with client.ApiClient() as api:
                apps_v1 = client.AppsV1Api(api)
                
                await apps_v1.delete_namespaced_deployment(
                    name=name,
                    namespace=namespace
                )
                
                logger.info(f"Deleted deployment {name} in {namespace}")
                
        except client.exceptions.ApiException as e:
            if e.status == 404:
                raise ValidationError(f"Deployment {name} not found")
            raise K8sApiError(f"Failed to delete deployment: {e.reason}")
        except Exception as e:
            logger.error(f"Error deleting deployment: {e}")
            raise K8sApiError(f"Failed to delete deployment: {str(e)}")
