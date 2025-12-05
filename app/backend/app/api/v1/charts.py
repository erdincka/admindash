from fastapi import APIRouter, Depends, Query
from typing import List, Optional
from pydantic import BaseModel
from app.schemas.response import ApiResponse
from app.core.k8s_client import K8sClient
from app.dependencies import get_current_active_user
from app.schemas.user import User
from app.core.errors import K8sApiError, ValidationError
from datetime import datetime
from kubernetes_asyncio import client
import logging
import subprocess
import asyncio

logger = logging.getLogger(__name__)

router = APIRouter()

class HelmInstallRequest(BaseModel):
    name: str
    chart: str  # Chart name or URL
    namespace: str = "default"
    repo_url: Optional[str] = None
    repo_name: Optional[str] = None
    version: Optional[str] = None
    values: Optional[dict] = None
    create_namespace: bool = True

class HelmUpgradeRequest(BaseModel):
    chart: str
    namespace: str = "default"
    version: Optional[str] = None
    values: Optional[dict] = None

@router.get("", response_model=ApiResponse[List[dict]])
async def list_charts(
    current_user: User = Depends(get_current_active_user)
):
    """List installed Helm releases across all namespaces"""
    try:
        # Use helm list to get all installed releases
        cmd = ["helm", "list", "--all-namespaces", "--output", "json"]
        
        logger.info(f"Listing Helm releases: {' '.join(cmd)}")
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            logger.error(f"Helm list failed: {error_msg}")
            raise K8sApiError(f"Helm list failed: {error_msg}")
        
        output = stdout.decode()
        
        # Parse JSON output
        import json
        releases_data = json.loads(output) if output.strip() else []
        
        # Transform to our format
        releases = []
        for release in releases_data:
            # Extract chart name and version from chart field (format: chart-version)
            chart_full = release.get('chart', '')
            chart_name = chart_full
            chart_version = 'unknown'
            
            # Try to split chart-version
            if chart_full:
                # Chart format is usually "name-version"
                # We need to find the last hyphen that separates name from version
                parts = chart_full.rsplit('-', 1)
                if len(parts) == 2:
                    chart_name = parts[0]
                    chart_version = parts[1]
            
            releases.append({
                'name': release.get('name', ''),
                'namespace': release.get('namespace', ''),
                'chart': chart_name,
                'revision': release.get('revision', 0),
                'version': chart_version,
                'app_version': release.get('app_version', 'unknown'),
                'status': release.get('status', 'unknown'),
                'updated': release.get('updated', ''),
            })
        
        # Sort by namespace and name
        releases.sort(key=lambda x: (x['namespace'], x['name']))
        
        return ApiResponse(
            success=True,
            data=releases,
            timestamp=datetime.utcnow()
        )
        
    except Exception as e:
        logger.error(f"Error listing releases: {e}", exc_info=True)
        raise K8sApiError(f"Failed to list releases: {str(e)}")

@router.post("/install", response_model=ApiResponse[dict])
async def install_chart(
    request: HelmInstallRequest,
    current_user: User = Depends(get_current_active_user)
):
    """Install a Helm chart"""
    try:
        # Validate inputs
        if not request.name or not request.chart:
            raise ValidationError("Name and chart are required")
        
        # Build helm install command
        cmd = ["helm", "install", request.name, request.chart]
        
        # Add namespace
        cmd.extend(["--namespace", request.namespace])
        
        # Create namespace if requested
        if request.create_namespace:
            cmd.append("--create-namespace")
        
        # Add repo if provided
        if request.repo_url and request.repo_name:
            # Add repo first
            add_repo_cmd = ["helm", "repo", "add", request.repo_name, request.repo_url]
            logger.info(f"Adding Helm repo: {' '.join(add_repo_cmd)}")
            
            add_result = await asyncio.create_subprocess_exec(
                *add_repo_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            await add_result.communicate()
            
            # Update repos
            update_cmd = ["helm", "repo", "update"]
            update_result = await asyncio.create_subprocess_exec(
                *update_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            await update_result.communicate()
        
        # Add version if specified
        if request.version:
            cmd.extend(["--version", request.version])
        
        # Add values if provided
        if request.values:
            import tempfile
            import yaml
            import os
            
            # Write values to temp file
            with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
                yaml.dump(request.values, f)
                values_file = f.name
            
            try:
                cmd.extend(["--values", values_file])
                
                logger.info(f"Installing Helm chart: {' '.join(cmd)}")
                
                # Execute helm install
                process = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                
                stdout, stderr = await process.communicate()
                
                if process.returncode != 0:
                    error_msg = stderr.decode() if stderr else "Unknown error"
                    logger.error(f"Helm install failed: {error_msg}")
                    raise K8sApiError(f"Helm install failed: {error_msg}")
                
                output = stdout.decode()
                logger.info(f"Helm install successful: {output}")
                
                return ApiResponse(
                    success=True,
                    data={
                        "installed": True,
                        "name": request.name,
                        "namespace": request.namespace,
                        "output": output
                    },
                    message=f"Helm chart {request.name} installed successfully",
                    timestamp=datetime.utcnow()
                )
            finally:
                # Clean up temp file
                if os.path.exists(values_file):
                    os.unlink(values_file)
        else:
            logger.info(f"Installing Helm chart: {' '.join(cmd)}")
            
            # Execute helm install
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await process.communicate()
            
            if process.returncode != 0:
                error_msg = stderr.decode() if stderr else "Unknown error"
                logger.error(f"Helm install failed: {error_msg}")
                raise K8sApiError(f"Helm install failed: {error_msg}")
            
            output = stdout.decode()
            logger.info(f"Helm install successful: {output}")
            
            return ApiResponse(
                success=True,
                data={
                    "installed": True,
                    "name": request.name,
                    "namespace": request.namespace,
                    "output": output
                },
                message=f"Helm chart {request.name} installed successfully",
                timestamp=datetime.utcnow()
            )
            
    except ValidationError as ve:
        raise
    except Exception as e:
        logger.error(f"Error installing chart: {e}", exc_info=True)
        raise K8sApiError(f"Failed to install chart: {str(e)}")

@router.put("/{name}/upgrade", response_model=ApiResponse[dict])
async def upgrade_chart(
    name: str,
    request: HelmUpgradeRequest,
    current_user: User = Depends(get_current_active_user)
):
    """Upgrade a Helm chart"""
    try:
        # Build helm upgrade command
        cmd = ["helm", "upgrade", name, request.chart]
        
        # Add namespace
        cmd.extend(["--namespace", request.namespace])
        
        # Add version if specified
        if request.version:
            cmd.extend(["--version", request.version])
        
        # Add values if provided
        if request.values:
            import tempfile
            import yaml
            import os
            
            with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
                yaml.dump(request.values, f)
                values_file = f.name
            
            try:
                cmd.extend(["--values", values_file])
                
                logger.info(f"Upgrading Helm chart: {' '.join(cmd)}")
                
                process = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                
                stdout, stderr = await process.communicate()
                
                if process.returncode != 0:
                    error_msg = stderr.decode() if stderr else "Unknown error"
                    logger.error(f"Helm upgrade failed: {error_msg}")
                    raise K8sApiError(f"Helm upgrade failed: {error_msg}")
                
                output = stdout.decode()
                logger.info(f"Helm upgrade successful: {output}")
                
                return ApiResponse(
                    success=True,
                    data={
                        "upgraded": True,
                        "name": name,
                        "namespace": request.namespace,
                        "output": output
                    },
                    message=f"Helm chart {name} upgraded successfully",
                    timestamp=datetime.utcnow()
                )
            finally:
                if os.path.exists(values_file):
                    os.unlink(values_file)
        else:
            logger.info(f"Upgrading Helm chart: {' '.join(cmd)}")
            
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await process.communicate()
            
            if process.returncode != 0:
                error_msg = stderr.decode() if stderr else "Unknown error"
                logger.error(f"Helm upgrade failed: {error_msg}")
                raise K8sApiError(f"Helm upgrade failed: {error_msg}")
            
            output = stdout.decode()
            logger.info(f"Helm upgrade successful: {output}")
            
            return ApiResponse(
                success=True,
                data={
                    "upgraded": True,
                    "name": name,
                    "namespace": request.namespace,
                    "output": output
                },
                message=f"Helm chart {name} upgraded successfully",
                timestamp=datetime.utcnow()
            )
            
    except Exception as e:
        logger.error(f"Error upgrading chart: {e}", exc_info=True)
        raise K8sApiError(f"Failed to upgrade chart: {str(e)}")

@router.delete("/{name}", response_model=ApiResponse[dict])
async def delete_chart(
    name: str,
    namespace: str = "default",
    current_user: User = Depends(get_current_active_user)
):
    """Delete a Helm chart (uninstall release)"""
    try:
        # Use helm uninstall command
        cmd = ["helm", "uninstall", name, "--namespace", namespace]
        
        logger.info(f"Uninstalling Helm chart: {' '.join(cmd)}")
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            logger.error(f"Helm uninstall failed: {error_msg}")
            raise K8sApiError(f"Helm uninstall failed: {error_msg}")
        
        output = stdout.decode()
        logger.info(f"Helm uninstall successful: {output}")
        
        return ApiResponse(
            success=True,
            data={"deleted": True, "name": name, "namespace": namespace},
            message=f"Helm release {name} deleted",
            timestamp=datetime.utcnow()
        )
        
    except Exception as e:
        logger.error(f"Error deleting chart: {e}", exc_info=True)
        raise K8sApiError(f"Failed to delete chart: {str(e)}")
