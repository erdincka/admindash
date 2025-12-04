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
                
                # Build container spec
                container = client.V1Container(
                    name=deployment.name,
                    image=deployment.image,
                    ports=[client.V1ContainerPort(container_port=deployment.port)] if deployment.port else None,
                    env=[client.V1EnvVar(name=k, value=v) for k, v in deployment.env_vars.items()] if deployment.env_vars else None,
                    command=deployment.command,
                    args=deployment.args,
                )
                
                # Add resource requirements
                if deployment.resources:
                    requests = {}
                    limits = {}
                    
                    if deployment.resources.cpu_request:
                        requests['cpu'] = deployment.resources.cpu_request
                    if deployment.resources.memory_request:
                        requests['memory'] = deployment.resources.memory_request
                    if deployment.resources.cpu_limit:
                        limits['cpu'] = deployment.resources.cpu_limit
                    if deployment.resources.memory_limit:
                        limits['memory'] = deployment.resources.memory_limit
                    if deployment.resources.gpu:
                        limits['nvidia.com/gpu'] = str(deployment.resources.gpu)
                    
                    container.resources = client.V1ResourceRequirements(
                        requests=requests if requests else None,
                        limits=limits if limits else None
                    )
                
                # Add volume mounts
                if deployment.volume_mounts:
                    container.volume_mounts = [
                        client.V1VolumeMount(
                            name=vm.name,
                            mount_path=vm.mount_path,
                            read_only=vm.read_only
                        ) for vm in deployment.volume_mounts
                    ]
                
                # Build deployment spec
                deployment_spec = client.V1Deployment(
                    api_version="apps/v1",
                    kind="Deployment",
                    metadata=client.V1ObjectMeta(
                        name=deployment.name,
                        namespace=deployment.namespace
                    ),
                    spec=client.V1DeploymentSpec(
                        replicas=deployment.replicas,
                        selector=client.V1LabelSelector(
                            match_labels={"app": deployment.name}
                        ),
                        template=client.V1PodTemplateSpec(
                            metadata=client.V1ObjectMeta(
                                labels={"app": deployment.name}
                            ),
                            spec=client.V1PodSpec(
                                containers=[container]
                            )
                        )
                    )
                )
                
                # Create deployment
                result = await apps_v1.create_namespaced_deployment(
                    namespace=deployment.namespace,
                    body=deployment_spec
                )
                
                # Create service if requested
                if deployment.expose_service and deployment.port:
                    service_spec = client.V1Service(
                        api_version="v1",
                        kind="Service",
                        metadata=client.V1ObjectMeta(
                            name=deployment.name,
                            namespace=deployment.namespace
                        ),
                        spec=client.V1ServiceSpec(
                            selector={"app": deployment.name},
                            ports=[client.V1ServicePort(
                                port=deployment.port,
                                target_port=deployment.port
                            )],
                            type=deployment.service_type
                        )
                    )
                    
                    await core_v1.create_namespaced_service(
                        namespace=deployment.namespace,
                        body=service_spec
                    )
                
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
