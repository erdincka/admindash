# API Specification - Phase 1

**Project**: K8s Dashboard v2  
**Version**: 1.0.0  
**Base URL**: `/api/v1`

---

## Authentication

All API requests must include user headers from OAuth2-proxy:

```http
X-Forwarded-User: user@example.com
X-Forwarded-Email: user@example.com
X-Forwarded-Groups: admin,developers
```

In development mode (when OAuth2-proxy is not available):
```http
X-Dev-User: developer@local
```

---

## Common Response Formats

### Success Response
```typescript
interface SuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
  timestamp: string; // ISO 8601
}
```

### Error Response
```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  timestamp: string;
}
```

---

## Deployments API

### Create Deployment

```http
POST /api/v1/deployments
Content-Type: application/json
```

**Request Body:**
```typescript
interface CreateDeploymentRequest {
  name: string;                    // lowercase, alphanumeric, max 63 chars
  image: string;                   // container image (e.g., nginx:latest)
  port: number;                    // 1-65535
  namespace?: string;              // optional, defaults based on isPublic
  
  // Options
  isPublic?: boolean;              // default: false
  isService?: boolean;             // expose as service, default: false
  isGPU?: boolean;                 // request GPU, default: false
  runAsRoot?: boolean;             // run as root user, default: false
  
  // Volumes
  isUserVolume?: boolean;          // mount user PVC, default: false
  isSharedVolume?: boolean;        // mount shared PVC, default: false
  isSSO?: boolean;                 // inject SSO token, default: false
  
  // Advanced
  command?: string[];              // custom entrypoint
  env?: Array<{                    // environment variables
    name: string;
    value: string;
  }>;
  resources?: {
    requests?: {
      cpu?: string;                // e.g., "1000m", "1"
      memory?: string;             // e.g., "2Gi", "2048Mi"
    };
    limits?: {
      cpu?: string;
      memory?: string;
    };
  };
}
```

**Example Request:**
```json
{
  "name": "my-nginx",
  "image": "nginx:1.25",
  "port": 80,
  "isPublic": true,
  "isService": true,
  "resources": {
    "requests": {
      "cpu": "500m",
      "memory": "512Mi"
    },
    "limits": {
      "cpu": "1000m",
      "memory": "1Gi"
    }
  },
  "env": [
    {
      "name": "ENVIRONMENT",
      "value": "production"
    }
  ]
}
```

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "name": "my-nginx",
    "namespace": "ezapp-user",
    "status": "Creating",
    "url": "https://my-nginx.domain.com"
  },
  "message": "Deployment created successfully",
  "timestamp": "2025-12-03T01:36:18Z"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid deployment configuration",
    "details": {
      "name": ["Name must be lowercase alphanumeric"],
      "port": ["Port must be between 1 and 65535"]
    }
  },
  "timestamp": "2025-12-03T01:36:18Z"
}
```

---

### Validate Deployment

```http
POST /api/v1/deployments/validate
Content-Type: application/json
```

**Request Body:** Same as Create Deployment

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "warnings": [
      "No resource limits specified, using defaults"
    ]
  },
  "timestamp": "2025-12-03T01:36:18Z"
}
```

---

### List Deployments

```http
GET /api/v1/deployments?namespace=default&labels=app=nginx
```

**Query Parameters:**
- `namespace` (optional): Filter by namespace
- `labels` (optional): Filter by labels (format: key=value,key2=value2)
- `limit` (optional): Max results, default: 100
- `continue` (optional): Pagination token

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "name": "my-nginx-deployment",
        "namespace": "default",
        "image": "nginx:1.25",
        "replicas": {
          "desired": 1,
          "ready": 1,
          "available": 1
        },
        "status": "Available",
        "created": "2025-12-03T01:00:00Z",
        "labels": {
          "app": "nginx"
        }
      }
    ],
    "total": 1,
    "continue": null
  },
  "timestamp": "2025-12-03T01:36:18Z"
}
```

---

### Get Deployment

```http
GET /api/v1/deployments/{namespace}/{name}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "metadata": {
      "name": "my-nginx-deployment",
      "namespace": "default",
      "labels": {...},
      "annotations": {...},
      "creationTimestamp": "2025-12-03T01:00:00Z"
    },
    "spec": {
      "replicas": 1,
      "selector": {...},
      "template": {...}
    },
    "status": {
      "replicas": 1,
      "readyReplicas": 1,
      "availableReplicas": 1,
      "conditions": [...]
    }
  },
  "timestamp": "2025-12-03T01:36:18Z"
}
```

---

### Delete Deployment

```http
DELETE /api/v1/deployments/{namespace}/{name}?cleanup=true
```

**Query Parameters:**
- `cleanup` (optional): Also delete associated Service, VirtualService, AuthorizationPolicy

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "deleted": ["deployment/my-nginx", "service/my-nginx", "virtualservice/my-nginx-vs"]
  },
  "message": "Deployment deleted successfully",
  "timestamp": "2025-12-03T01:36:18Z"
}
```

---

## Resources API

### List Resources

```http
GET /api/v1/resources/{kind}?namespace=default&limit=50
```

**Path Parameters:**
- `kind`: Resource type (Pod, Deployment, Service, ConfigMap, Secret, PVC, PV, StatefulSet, DaemonSet)

**Query Parameters:**
- `namespace` (optional): Filter by namespace, omit for cluster-wide
- `limit` (optional): Max results, default: 50
- `continue` (optional): Pagination token

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "kind": "Pod",
    "items": [
      {
        "namespace": "default",
        "name": "nginx-pod-123",
        "status": "Running",
        "created": "2025-12-03T01:00:00Z",
        "labels": {...}
      }
    ],
    "total": 1,
    "continue": null
  },
  "timestamp": "2025-12-03T01:36:18Z"
}
```

---

### Get Resource Details

```http
GET /api/v1/resources/{kind}/{namespace}/{name}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "apiVersion": "v1",
    "kind": "Pod",
    "metadata": {...},
    "spec": {...},
    "status": {...}
  },
  "timestamp": "2025-12-03T01:36:18Z"
}
```

---

### Get Resource YAML

```http
GET /api/v1/resources/{kind}/{namespace}/{name}/yaml
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "yaml": "apiVersion: v1\nkind: Pod\n..."
  },
  "timestamp": "2025-12-03T01:36:18Z"
}
```

---

## Charts API

### List Charts

```http
GET /api/v1/charts
```

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "name": "nginx",
      "version": "1.0.0",
      "appVersion": "1.25.0",
      "description": "NGINX web server",
      "icon": "https://...",
      "created": "2025-12-03T01:00:00Z"
    }
  ],
  "timestamp": "2025-12-03T01:36:18Z"
}
```

---

### Get Chart Details

```http
GET /api/v1/charts/{name}/{version}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "name": "nginx",
    "version": "1.0.0",
    "appVersion": "1.25.0",
    "description": "NGINX web server",
    "home": "https://nginx.org",
    "sources": ["https://github.com/..."],
    "maintainers": [...],
    "icon": "https://..."
  },
  "timestamp": "2025-12-03T01:36:18Z"
}
```

---

### Delete Chart

```http
DELETE /api/v1/charts/{name}/{version}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Chart nginx:1.0.0 deleted successfully",
  "timestamp": "2025-12-03T01:36:18Z"
}
```

---

## Namespaces API

### List Namespaces

```http
GET /api/v1/namespaces
```

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "name": "default",
      "status": "Active",
      "labels": {...},
      "annotations": {...},
      "created": "2025-01-01T00:00:00Z"
    }
  ],
  "timestamp": "2025-12-03T01:36:18Z"
}
```

---

## WebSocket Events

### Connection

```typescript
// Client connects
socket.connect();

// Server acknowledges
socket.on('connection', (data) => {
  console.log('Connected:', data);
  // { connectionId: 'abc123', user: 'user@example.com' }
});
```

---

### Subscribe to Resources

```typescript
// Subscribe to resource updates
socket.emit('subscribe:resources', {
  kind: 'Pod',
  namespace: 'default'
});

// Receive updates
socket.on('resource:created', (resource) => {
  console.log('New resource:', resource);
});

socket.on('resource:updated', (resource) => {
  console.log('Updated resource:', resource);
});

socket.on('resource:deleted', (resource) => {
  console.log('Deleted resource:', resource);
});
```

---

### Deployment Progress

```typescript
// Automatic subscription when creating deployment
socket.on('deployment:progress', (status) => {
  console.log('Deployment status:', status);
  // {
  //   name: 'my-nginx',
  //   namespace: 'default',
  //   phase: 'Creating' | 'Running' | 'Failed',
  //   conditions: [...]
  // }
});
```

---

### Error Events

```typescript
socket.on('error', (error) => {
  console.error('WebSocket error:', error);
  // {
  //   code: 'WATCH_ERROR',
  //   message: 'Failed to watch resource',
  //   details: {...}
  // }
});
```

---

### Unsubscribe

```typescript
socket.emit('unsubscribe:resources', {
  kind: 'Pod',
  namespace: 'default'
});
```

---

## Error Codes Reference

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `K8S_API_ERROR` | 502 | Kubernetes API returned error |
| `RESOURCE_NOT_FOUND` | 404 | Resource does not exist |
| `RESOURCE_CONFLICT` | 409 | Resource already exists |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |
| `WATCH_ERROR` | 500 | WebSocket watch failed |
| `CACHE_ERROR` | 500 | Redis cache error (non-fatal) |

---

## Rate Limiting

### Limits
- **Anonymous**: 60 requests/minute
- **Authenticated**: 600 requests/minute
- **WebSocket connections**: 10 per user

### Headers
```http
X-RateLimit-Limit: 600
X-RateLimit-Remaining: 599
X-RateLimit-Reset: 1701566178
```

---

## Versioning

API version is specified in the URL path:
- Current: `/api/v1`
- Future: `/api/v2` (breaking changes only)

---

**Status**: Ready for implementation 🚀
