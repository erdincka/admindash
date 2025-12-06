
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
import httpx
import os
import stat
import xml.etree.ElementTree as ET
from app.api.v1.auth import get_current_active_user
from app.api.v1.auth import User
from app.schemas.response import ApiResponse
from datetime import datetime
import logging
import base64
import mimetypes

logger = logging.getLogger(__name__)

router = APIRouter()

class BrowseRequest(BaseModel):
    namespace: str
    resource_name: str
    path: Optional[str] = ""

class FileItem(BaseModel):
    name: str
    type: str  # 'file' or 'folder'
    size: Optional[int] = 0
    last_modified: Optional[str] = None
    permissions: Optional[str] = None

class FSListRequest(BaseModel):
    path: str = "/"

class FSReadRequest(BaseModel):
    path: str

class FileContent(BaseModel):
    content: Optional[str] = None
    base64_content: Optional[str] = None
    mime_type: Optional[str] = None
    size: int

@router.post("/browse", response_model=ApiResponse[List[FileItem]])
async def browse_storage(
    request: BrowseRequest,
    current_user: User = Depends(get_current_active_user)
):
    """Browse S3 storage"""
    
    # 1. Read Auth Token
    token_path = "/etc/secrets/ezua/.auth_token"
    if not os.path.exists(token_path):
        logger.warning(f"Auth token file not found at {token_path}")
        # Fallback for local development or if file missing
        if os.getenv("AUTH_TOKEN"):
            logger.info("Using AUTH_TOKEN environment variable")
            token = os.getenv("AUTH_TOKEN")
        else:
            logger.warning("AUTH_TOKEN environment variable not found")
            token = "dummy-token"
    else:
        with open(token_path, "r") as f:
            logger.info(f"Reading auth token from {token_path}")
            token = f.read().strip()

    # 2. Construct Endpoint
    # Format: http://<resource.name>-service.<resource.namespace>.svc.cluster.local:30000
    endpoint = f"http://{request.resource_name}-service.{request.namespace}.svc.cluster.local:30000"
    
    # 3. Make Request to S3
    # Use list-type=2 for modern list parsing
    params = {
        "list-type": "2",
        "delimiter": "/",
        "prefix": request.path
    }
    
    headers = {
        "Authorization": f"Bearer {token}"
    }

    try:
        async with httpx.AsyncClient(verify=False) as client:
            response = await client.get(endpoint, params=params, headers=headers, timeout=10.0)
            
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=f"S3 Error: {response.text}")
            
            # 4. Parse XML
            root = ET.fromstring(response.text)
            
            files = []
            
            # Helper to strip namespace
            def get_tag(elem):
                return elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag

            # Parse CommonPrefixes (Folders)
            # Try with and without namespace
            for prefix in root.findall(".//{http://s3.amazonaws.com/doc/2006-03-01/}CommonPrefixes") + root.findall(".//CommonPrefixes"):
                p = prefix.find("{http://s3.amazonaws.com/doc/2006-03-01/}Prefix") or prefix.find("Prefix")
                if p is not None and p.text:
                    name = p.text
                    # Strip the current prefix from name for display
                    display_name = name[len(request.path):]
                    files.append(FileItem(name=display_name, type="folder"))

            # Parse Contents (Files)
            for content in root.findall(".//{http://s3.amazonaws.com/doc/2006-03-01/}Contents") + root.findall(".//Contents"):
                key = content.find("{http://s3.amazonaws.com/doc/2006-03-01/}Key") or content.find("Key")
                size = content.find("{http://s3.amazonaws.com/doc/2006-03-01/}Size") or content.find("Size")
                last_mod = content.find("{http://s3.amazonaws.com/doc/2006-03-01/}LastModified") or content.find("LastModified")
                
                if key is not None and key.text:
                    name = key.text
                    # Skip the folder itself if specific key matches prefix exactly
                    if name == request.path:
                        continue
                        
                    display_name = name[len(request.path):]
                    files.append(FileItem(
                        name=display_name, 
                        type="file",
                        size=int(size.text) if size is not None else 0,
                        last_modified=last_mod.text if last_mod is not None else None
                    ))

            # Deduplicate (since we merged namespaced and non-namespaced logic roughly)
            unique_files = {f.name: f for f in files}.values()
            
            return ApiResponse(
                success=True,
                data=list(unique_files),
                timestamp=datetime.utcnow()
            )

    except httpx.RequestError as exc:
        raise HTTPException(status_code=500, detail=f"Connection error: {str(exc)}")
    except ET.ParseError:
        raise HTTPException(status_code=500, detail="Failed to parse S3 response")

@router.post("/fs/list", response_model=ApiResponse[List[FileItem]])
async def list_filesystem(
    request: FSListRequest,
    current_user: User = Depends(get_current_active_user)
):
    """List files in the local filesystem"""
    path = request.path
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Path not found")
    
    if not os.path.isdir(path):
        raise HTTPException(status_code=400, detail="Path is not a directory")

    files = []
    try:
        with os.scandir(path) as it:
            for entry in it:
                try:
                    stat_res = entry.stat()
                    files.append(FileItem(
                        name=entry.name,
                        type="folder" if entry.is_dir() else "file",
                        size=stat_res.st_size,
                        last_modified=datetime.fromtimestamp(stat_res.st_mtime).isoformat(),
                        permissions=stat.filemode(stat_res.st_mode)
                    ))
                except OSError:
                    # Skip permission denied or other errors
                    continue
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Failed to list directory: {str(e)}")

    # Sort: folders first, then files, alphabetical
    files.sort(key=lambda x: (x.type == 'file', x.name.lower()))
    
    return ApiResponse(
        success=True,
        data=files,
        timestamp=datetime.utcnow()
    )

@router.post("/fs/read", response_model=ApiResponse[FileContent])
async def read_filesystem(
    request: FSReadRequest,
    current_user: User = Depends(get_current_active_user)
):
    """Read file content from the local filesystem"""
    path = request.path
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    
    if not os.path.isfile(path):
        raise HTTPException(status_code=400, detail="Path is not a file")

    try:
        mime_type, _ = mimetypes.guess_type(path)
        size = os.path.getsize(path)
        
        # Determine if text or binary
        is_text = False
        if mime_type:
            if mime_type.startswith("text/") or mime_type in ["application/json", "application/javascript", "application/xml"]:
                is_text = True
        
        # Fallback check for common code extensions if mime is None
        if not mime_type:
            if path.endswith(('.py', '.ts', '.tsx', '.js', '.jsx', '.go', '.rs', '.yaml', '.yml', '.md', '.log', '.sh', '.conf')):
                 is_text = True
                 mime_type = "text/plain" # approximation

        if is_text:
            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                return ApiResponse(
                    success=True,
                    data=FileContent(content=content, mime_type=mime_type or "text/plain", size=size),
                    timestamp=datetime.utcnow()
                )
            except UnicodeDecodeError:
                # Fallback to binary if not valid utf-8
                is_text = False
        
        # Binary reading
        with open(path, "rb") as f:
            content = f.read()
        
        return ApiResponse(
            success=True,
            data=FileContent(
                base64_content=base64.b64encode(content).decode('utf-8'), 
                mime_type=mime_type or "application/octet-stream", 
                size=size
            ),
            timestamp=datetime.utcnow()
        )

    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {str(e)}")
