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
# Active terminal sessions
terminal_sessions = {}

class TerminalSession:
    def __init__(self, sid, namespace, pod, container, command):
        self.sid = sid
        self.namespace = namespace
        self.pod = pod
        self.container = container
        self.command = command
        self.ws_client = None
        self.session = None
        self.task = None
        self.api_client = None

    async def start(self):
        from kubernetes_asyncio import client
        import aiohttp

        # Try different shells in order of preference
        shells_to_try = ['/bin/bash', '/bin/ash', '/bin/sh']
        
        # If user specified a command, use it directly
        if self.command and self.command not in ['/bin/bash', '/bin/sh']:
            shells_to_try = [self.command]
        
        last_error = None
        
        for shell in shells_to_try:
            try:
                await K8sClient.initialize()
                # Create persistent ApiClient
                self.api_client = client.ApiClient()
                
                # Ensure command is a list
                if isinstance(shell, str):
                    command_list = [shell]
                else:
                    command_list = shell
                
                logger.info(f"Starting terminal for {self.namespace}/{self.pod}/{self.container} with {command_list[0]}")
                
                # Build the WebSocket URL
                config = self.api_client.configuration
                host = config.host
                config.verify_ssl = False
                
                # Build query parameters
                query_params = []
                for cmd in command_list:
                    query_params.append(f"command={cmd}")
                query_params.extend([
                    f"container={self.container}",
                    "stdin=true",
                    "stdout=true",
                    "stderr=true",
                    "tty=true"
                ])
                query_string = "&".join(query_params)
                
                # Build full WebSocket URL
                ws_url = f"{host}/api/v1/namespaces/{self.namespace}/pods/{self.pod}/exec?{query_string}"
                # Replace https with wss
                ws_url = ws_url.replace('https://', 'wss://').replace('http://', 'ws://')
                
                # Prepare headers with proper authentication
                headers = {}
                
                # Try multiple ways to get the authorization token
                if hasattr(config, 'api_key_with_prefix') and config.api_key_with_prefix:
                    # Some versions use api_key_with_prefix
                    if 'authorization' in config.api_key_with_prefix:
                        headers['Authorization'] = config.api_key_with_prefix['authorization']
                    elif 'BearerToken' in config.api_key_with_prefix:
                        headers['Authorization'] = config.api_key_with_prefix['BearerToken']
                elif config.api_key:
                    # Check for 'BearerToken' key (common in in-cluster config)
                    if 'BearerToken' in config.api_key:
                        token = config.api_key['BearerToken']
                        # Token already includes 'Bearer ' prefix
                        headers['Authorization'] = token
                    elif 'authorization' in config.api_key:
                        token = config.api_key['authorization']
                        if config.api_key_prefix and 'authorization' in config.api_key_prefix:
                            headers['Authorization'] = f"{config.api_key_prefix['authorization']} {token}"
                        else:
                            headers['Authorization'] = f"Bearer {token}"
                
                # If still no auth, try to get it from the default headers
                if 'Authorization' not in headers and hasattr(self.api_client, 'default_headers'):
                    if 'authorization' in self.api_client.default_headers:
                        headers['Authorization'] = self.api_client.default_headers['authorization']
                    elif 'Authorization' in self.api_client.default_headers:
                        headers['Authorization'] = self.api_client.default_headers['Authorization']
                
                # Add WebSocket-specific headers
                headers['Sec-WebSocket-Protocol'] = 'v4.channel.k8s.io'
                
                # Create aiohttp session with SSL context
                import ssl
                ssl_context = ssl.create_default_context()
                if config.verify_ssl is False:
                    ssl_context.check_hostname = False
                    ssl_context.verify_mode = ssl.CERT_NONE
                
                # Connect to WebSocket
                self.session = aiohttp.ClientSession()
                self.ws_client = await self.session.ws_connect(
                    ws_url,
                    headers=headers,
                    ssl=ssl_context,
                    protocols=['v4.channel.k8s.io']
                )
                
                logger.info(f"Terminal connected successfully using {command_list[0]}")
                
                # Start reading from stdout/stderr
                self.task = asyncio.create_task(self.output())
                
                # Success! Exit the loop
                return
                    
            except Exception as e:
                last_error = e
                logger.warning(f"Failed to connect with {shell}: {e}")
                
                # Clean up failed attempt
                if self.ws_client:
                    try:
                        await self.ws_client.close()
                    except:
                        pass
                    self.ws_client = None
                if self.session:
                    try:
                        await self.session.close()
                    except:
                        pass
                    self.session = None
                if self.api_client:
                    try:
                        await self.api_client.close()
                    except:
                        pass
                    self.api_client = None
                
                # If this wasn't the last shell to try, continue to next
                if shell != shells_to_try[-1]:
                    continue
                else:
                    # All shells failed
                    break
        
        # If we get here, all shells failed
        error_msg = f"Failed to start terminal: {last_error}"
        logger.error(error_msg, exc_info=True)
        await sio.emit('error', {'message': error_msg}, room=self.sid)
        await self.close()

    async def output(self):
        import aiohttp
        try:
            # self.ws_client is already a ClientWebSocketResponse, use it directly
            while True:
                if self.ws_client.closed:
                    logger.info("WebSocket is closed")
                    break
                
                # Read raw websocket message
                msg = await self.ws_client.receive()
                
                if msg.type == aiohttp.WSMsgType.BINARY:
                    data = msg.data
                    if len(data) > 1:
                        channel = data[0]
                        payload = data[1:]
                        
                        if channel == 1: # stdout
                            # logger.debug(f"Terminal stdout: {len(payload)} bytes")
                            await sio.emit('terminal:output', payload.decode('utf-8', errors='replace'), room=self.sid)
                        elif channel == 2: # stderr
                            # logger.debug(f"Terminal stderr: {len(payload)} bytes")
                            await sio.emit('terminal:output', payload.decode('utf-8', errors='replace'), room=self.sid)
                        elif channel == 3: # error
                            # logger.debug(f"Terminal error: {len(payload)} bytes")
                            # Error channel usually contains return code info at the end
                            pass
                elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR, aiohttp.WSMsgType.CLOSE):
                    logger.info("Terminal websocket closed")
                    break
        except Exception as e:
            logger.error(f"Error reading terminal output: {e}", exc_info=True)
            await sio.emit('terminal:output', f"\r\nError: {e}\r\n", room=self.sid)
        finally:
            await self.close()

    async def input(self, data):
        if self.ws_client and not self.ws_client.closed:
            # Channel 0 is stdin
            # Kubernetes WebSocket protocol: first byte is channel, rest is data
            if isinstance(data, str):
                data = data.encode('utf-8')
            message = bytes([0]) + data
            await self.ws_client.send_bytes(message)

    async def resize(self, cols, rows):
        if self.ws_client and not self.ws_client.closed:
            # Channel 4 is resize
            # Send resize message as JSON
            import json
            resize_msg = json.dumps({"Width": cols, "Height": rows})
            message = bytes([4]) + resize_msg.encode('utf-8')
            await self.ws_client.send_bytes(message)

    async def close(self):
        if self.ws_client:
            try:
                await self.ws_client.close()
            except:
                pass
        if self.session:
            try:
                await self.session.close()
            except:
                pass
        if self.api_client:
            try:
                await self.api_client.close()
            except:
                pass
        if self.task:
            self.task.cancel()
        
        # Remove from global sessions
        if self.sid in terminal_sessions:
            del terminal_sessions[self.sid]

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
    
    # Close terminal session
    if sid in terminal_sessions:
        await terminal_sessions[sid].close()

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

# Terminal Events
@sio.on('terminal:start')
async def terminal_start(sid, data):
    """Start a terminal session"""
    namespace = data.get('namespace')
    pod = data.get('pod')
    container = data.get('container')
    command = data.get('command', '/bin/bash')
    
    if not all([namespace, pod, container]):
        await sio.emit('error', {'message': 'Missing required arguments'}, room=sid)
        return

    logger.info(f"Starting terminal for {namespace}/{pod}/{container} with command: {command}")
    
    session = TerminalSession(sid, namespace, pod, container, command)
    terminal_sessions[sid] = session
    await session.start()

@sio.on('terminal:input')
async def terminal_input(sid, data):
    """Handle terminal input"""
    if sid in terminal_sessions:
        await terminal_sessions[sid].input(data)

@sio.on('terminal:resize')
async def terminal_resize(sid, data):
    """Handle terminal resize"""
    if sid in terminal_sessions:
        await terminal_sessions[sid].resize(data.get('cols'), data.get('rows'))

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
