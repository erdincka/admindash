from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
import logging
import logging.config
from app.core.errors import AppError
from app.schemas.response import ApiResponse, ErrorDetail

# Define logging configuration
LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {
        "health_filter": {
            "()": "app.main.EndpointFilter",
        },
    },
    "handlers": {
        "default": {
            "formatter": "default",
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stderr",
        },
        "access": {
            "formatter": "access",
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stdout",
            "filters": ["health_filter"],
        },
    },
    "formatters": {
        "default": {
            "()": "uvicorn.logging.DefaultFormatter",
            "fmt": "%(levelprefix)s %(message)s",
            "use_colors": None,
        },
        "access": {
            "()": "uvicorn.logging.AccessFormatter",
            "fmt": '%(levelprefix)s %(client_addr)s - "%(request_line)s" %(status_code)s',
        },
    },
    "loggers": {
        "uvicorn": {"handlers": ["default"], "level": "INFO"},
        "uvicorn.error": {"level": "INFO"},
        "uvicorn.access": {
            "handlers": ["access"],
            "level": "INFO",
            "propagate": False,
        },
        "app": {
            "handlers": ["default"],
            "level": "DEBUG",
            "propagate": False,
        },
    },
}

# Filter out /health endpoint logs
class EndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return record.getMessage().find("GET /health") == -1

from app.config import settings
from app.api.v1 import auth, deployments, namespaces, resources, charts, cluster, storage, monitoring
from app.api.websocket import socket_app

app = FastAPI(
    title="AI Essentials Dashboard API",
    version="2.0.0",
    description="Kubernetes Dashboard API for HPE AI Essentials"
)

@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    return JSONResponse(
        status_code=exc.status_code,
        content=ApiResponse(
            success=False,
            error=ErrorDetail(
                code=exc.code,
                message=exc.message,
                details=exc.details
            ),
            timestamp=datetime.utcnow()
        ).model_dump(mode='json')
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logging.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content=ApiResponse(
            success=False,
            error=ErrorDetail(
                code="INTERNAL_ERROR",
                message="An unexpected error occurred"
            ),
            timestamp=datetime.utcnow()
        ).model_dump(mode='json')
    )

@app.on_event("startup")
async def startup_event():
    # Apply logging configuration
    logging.config.dictConfig(LOGGING_CONFIG)

# CORS middleware for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Socket.IO app
app.mount("/socket.io", socket_app)

app.include_router(auth.router, prefix=f"{settings.api_prefix}/auth", tags=["auth"])
app.include_router(deployments.router, prefix=f"{settings.api_prefix}/deployments", tags=["deployments"])
app.include_router(namespaces.router, prefix=f"{settings.api_prefix}/namespaces", tags=["namespaces"])
app.include_router(resources.router, prefix=f"{settings.api_prefix}/resources", tags=["resources"])
app.include_router(charts.router, prefix=f"{settings.api_prefix}/charts", tags=["charts"])
app.include_router(cluster.router, prefix=f"{settings.api_prefix}/cluster", tags=["cluster"])
app.include_router(storage.router, prefix=f"{settings.api_prefix}/storage", tags=["storage"])
app.include_router(monitoring.router, prefix=f"{settings.api_prefix}/monitoring", tags=["monitoring"])

from app.api.v1 import virtualservices
app.include_router(virtualservices.router, prefix=f"{settings.api_prefix}/virtualservices", tags=["virtualservices"])


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "version": "2.0.0",
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }

@app.get("/api/v1/health")
async def api_health():
    """API v1 health check endpoint"""
    return {
        "success": True,
        "data": {
            "status": "healthy",
            "api_version": "v1"
        },
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "AI Essentials Dashboard API v1",
        "docs": "/docs",
        "health": "/health"
    }
