
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
import httpx
import logging
from app.api.v1.auth import User, get_current_active_user
from fastapi import Depends
from app.schemas.response import ApiResponse
from datetime import datetime

logger = logging.getLogger(__name__)

router = APIRouter()

import os

PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://kubeprom-prometheus.prometheus:9090")

@router.get("/query")
async def prometheus_query(
    query: str,
    time: Optional[str] = None,
    current_user: User = Depends(get_current_active_user)
):
    """
    Proxy a query to Prometheus.
    """
    params = {"query": query}
    if time:
        params["time"] = time
        
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{PROMETHEUS_URL}/api/v1/query", params=params, timeout=10.0)
            
            if response.status_code != 200:
                logger.error(f"Prometheus query failed: {response.text}")
                raise HTTPException(status_code=response.status_code, detail="Failed to query Prometheus")
            
            data = response.json()
            if data.get("status") != "success":
                 raise HTTPException(status_code=500, detail=data.get("error", "Unknown Prometheus error"))

            return ApiResponse(
                success=True,
                data=data.get("data"),
                timestamp=datetime.utcnow()
            )

    except httpx.RequestError as exc:
        logger.error(f"Connection error to Prometheus: {exc}")
        raise HTTPException(status_code=500, detail=f"Connection error to Prometheus: {str(exc)}")


@router.get("/query_range")
async def prometheus_query_range(
    query: str,
    start: str,
    end: str,
    step: str = "60s",
    current_user: User = Depends(get_current_active_user)
):
    """
    Proxy a range query to Prometheus.
    """
    params = {
        "query": query,
        "start": start,
        "end": end,
        "step": step
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{PROMETHEUS_URL}/api/v1/query_range", params=params, timeout=10.0)
            
            if response.status_code != 200:
                logger.error(f"Prometheus range query failed: {response.text}")
                raise HTTPException(status_code=response.status_code, detail="Failed to query Prometheus")
            
            data = response.json()
            if data.get("status") != "success":
                 raise HTTPException(status_code=500, detail=data.get("error", "Unknown Prometheus error"))

            return ApiResponse(
                success=True,
                data=data.get("data"),
                timestamp=datetime.utcnow()
            )

    except httpx.RequestError as exc:
         logger.error(f"Connection error to Prometheus: {exc}")
         raise HTTPException(status_code=500, detail=f"Connection error to Prometheus: {str(exc)}")
