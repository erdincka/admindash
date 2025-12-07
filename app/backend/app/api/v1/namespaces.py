from fastapi import APIRouter, Depends
from typing import List
from app.schemas.response import ApiResponse
from app.core.k8s_client import K8sClient
from datetime import datetime

router = APIRouter()


@router.get("", response_model=ApiResponse[List[dict]])
async def list_namespaces():
    """List all namespaces"""
    namespaces = await K8sClient.get_namespaces()

    result = [
        {
            "name": ns.metadata.name,
            "status": ns.status.phase if ns.status else "Unknown",
            "created_at": (
                ns.metadata.creation_timestamp.isoformat()
                if ns.metadata.creation_timestamp
                else None
            ),
        }
        for ns in namespaces
    ]

    return ApiResponse(success=True, data=result, timestamp=datetime.utcnow())
