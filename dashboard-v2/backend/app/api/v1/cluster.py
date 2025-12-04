from fastapi import APIRouter, HTTPException
from app.core.k8s_client import K8sClient
from pydantic import BaseModel
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

class ClusterMetrics(BaseModel):
    health_score: int
    cpu_usage_percent: int
    memory_usage_percent: int
    active_pods: int
    total_pods: int

def parse_cpu(quantity: str) -> float:
    """Convert CPU quantity to cores."""
    try:
        if quantity.endswith('m'):
            return float(quantity[:-1]) / 1000
        elif quantity.endswith('n'):
            return float(quantity[:-1]) / 10**9
        return float(quantity)
    except ValueError:
        logger.error(f"Failed to parse CPU quantity: {quantity}")
        return 0.0

def parse_memory(quantity: str) -> float:
    """Convert memory quantity to bytes."""
    try:
        if quantity.endswith('Ki'):
            return float(quantity[:-2]) * 1024
        if quantity.endswith('Mi'):
            return float(quantity[:-2]) * 1024 * 1024
        if quantity.endswith('Gi'):
            return float(quantity[:-2]) * 1024 * 1024 * 1024
        if quantity.endswith('Ti'):
            return float(quantity[:-2]) * 1024 * 1024 * 1024 * 1024
        return float(quantity)
    except ValueError:
        logger.error(f"Failed to parse memory quantity: {quantity}")
        return 0.0

@router.get("/metrics", response_model=ClusterMetrics)
async def get_cluster_metrics():
    try:
        # Fetch data in parallel could be better, but sequential is fine for now
        nodes = await K8sClient.get_nodes()
        metrics = await K8sClient.get_node_metrics()
        pods = await K8sClient.get_resources("pod")

        # Calculate Health (based on Node Ready status)
        total_nodes = len(nodes)
        ready_nodes = 0
        total_cpu_capacity = 0.0
        total_memory_capacity = 0.0

        for node in nodes:
            # Check Ready condition
            for condition in node.status.conditions:
                if condition.type == 'Ready' and condition.status == 'True':
                    ready_nodes += 1
                    break
            
            # Sum capacities
            total_cpu_capacity += parse_cpu(node.status.capacity['cpu'])
            total_memory_capacity += parse_memory(node.status.capacity['memory'])

        health_score = int((ready_nodes / total_nodes * 100) if total_nodes > 0 else 0)

        # Calculate Usage
        total_cpu_usage = 0.0
        total_memory_usage = 0.0

        if metrics:
            for node_metric in metrics:
                total_cpu_usage += parse_cpu(node_metric['usage']['cpu'])
                total_memory_usage += parse_memory(node_metric['usage']['memory'])
        
        cpu_usage_percent = int((total_cpu_usage / total_cpu_capacity * 100) if total_cpu_capacity > 0 else 0)
        memory_usage_percent = int((total_memory_usage / total_memory_capacity * 100) if total_memory_capacity > 0 else 0)

        # Calculate Pods
        total_pods_count = len(pods)
        active_pods_count = sum(1 for p in pods if p.status.phase in ['Running', 'Pending'])

        return ClusterMetrics(
            health_score=health_score,
            cpu_usage_percent=cpu_usage_percent,
            memory_usage_percent=memory_usage_percent,
            active_pods=active_pods_count,
            total_pods=total_pods_count
        )

    except Exception as e:
        logger.error(f"Failed to get cluster metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))
