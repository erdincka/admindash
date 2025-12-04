import socketio
import asyncio
import logging
from app.core.k8s_client import K8sClient

logger = logging.getLogger(__name__)

# Create Socket.IO server
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',  # Configure based on settings in production
    logger=True,
    engineio_logger=False
)

# Active watch tasks
watch_tasks = {}

@sio.event
async def connect(sid, environ):
    logger.info(f"Client connected: {sid}")
    await sio.emit('connection', {'status': 'connected'}, room=sid)

@sio.event
async def disconnect(sid):
    logger.info(f"Client disconnected: {sid}")
    # Cancel any watch tasks for this client
    if sid in watch_tasks:
        for task in watch_tasks[sid]:
            task.cancel()
        del watch_tasks[sid]

@sio.event
async def subscribe_resources(sid, data):
    """
    Subscribe to resource updates
    data: {'kind': 'pod', 'namespace': 'default'}
    """
    kind = data.get('kind')
    namespace = data.get('namespace')
    
    if not kind:
        await sio.emit('error', {'message': 'kind is required'}, room=sid)
        return
    
    logger.info(f"Client {sid} subscribing to {kind} in {namespace or 'all namespaces'}")
    
    # Create room name
    room = f"{kind}:{namespace or 'all'}"
    await sio.enter_room(sid, room)
    
    # Start watch task if not already running
    watch_key = f"{kind}:{namespace}"
    if watch_key not in watch_tasks:
        task = asyncio.create_task(watch_and_emit(kind, namespace, room))
        if sid not in watch_tasks:
            watch_tasks[sid] = []
        watch_tasks[sid].append(task)
    
    await sio.emit('subscribed', {'kind': kind, 'namespace': namespace}, room=sid)

@sio.event
async def unsubscribe_resources(sid, data):
    """
    Unsubscribe from resource updates
    """
    kind = data.get('kind')
    namespace = data.get('namespace')
    
    room = f"{kind}:{namespace or 'all'}"
    await sio.leave_room(sid, room)
    
    logger.info(f"Client {sid} unsubscribed from {kind} in {namespace or 'all namespaces'}")
    await sio.emit('unsubscribed', {'kind': kind, 'namespace': namespace}, room=sid)

@sio.event
async def ping(sid):
    """Keepalive ping"""
    await sio.emit('pong', room=sid)

async def watch_and_emit(kind: str, namespace: str, room: str):
    """
    Watch K8s resources and emit events to room
    """
    async def callback(event):
        event_type = event['type']  # ADDED, MODIFIED, DELETED
        resource = event['object']
        
        # Emit to room
        event_name = f"resource:{event_type.lower()}"
        await sio.emit(event_name, {
            'kind': kind,
            'namespace': namespace,
            'resource': resource.to_dict() if hasattr(resource, 'to_dict') else resource
        }, room=room)
    
    try:
        await K8sClient.watch_resource(kind, namespace, callback)
    except asyncio.CancelledError:
        logger.info(f"Watch task cancelled for {kind}:{namespace}")
    except Exception as e:
        logger.error(f"Error in watch task for {kind}:{namespace}: {e}")

# Create ASGI app
socket_app = socketio.ASGIApp(sio)
