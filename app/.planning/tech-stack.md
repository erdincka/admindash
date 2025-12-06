# Technology Stack Details

**Project**: K8s Dashboard v2  
**Phase**: 1 - Foundation  
**Date**: 2025-12-03

---

## Frontend Stack

### Core Framework
```json
{
  "next": "^14.0.4",
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "typescript": "^5.3.3"
}
```

### UI Components
```json
{
  "grommet": "^2.35.0",
  "grommet-icons": "^4.12.0",
  "grommet-theme-hpe": "^8.0.0",
  "styled-components": "^6.1.8"
}
```

### State & Data Management
```json
{
  "zustand": "^4.4.7",
  "@tanstack/react-query": "^5.17.9",
  "socket.io-client": "^4.6.1"
}
```

### Forms & Validation
```json
{
  "react-hook-form": "^7.49.2",
  "zod": "^3.22.4",
  "@hookform/resolvers": "^3.3.3"
}
```

### Utilities
```json
{
  "react-hot-toast": "^2.4.1",
  "date-fns": "^3.0.6",
  "js-yaml": "^4.1.0",
  "prism-react-renderer": "^2.3.1"
}
```

### Development Tools
```json
{
  "@types/node": "^20.10.6",
  "@types/react": "^18.2.46",
  "eslint": "^8.56.0",
  "eslint-config-next": "^14.0.4",
  "prettier": "^3.1.1"
}
```

---

## Backend Stack

### Core Framework
```txt
fastapi==0.109.0
uvicorn[standard]==0.27.0
python-socketio==5.11.0
pydantic==2.5.3
pydantic-settings==2.1.0
```

### Kubernetes Integration
```txt
kubernetes-asyncio==28.2.1
pyyaml==6.0.1
```

### Caching & Storage
```txt
redis==5.0.1
aioredis==2.0.1
```

### Utilities
```txt
python-dotenv==1.0.0
python-multipart==0.0.6
httpx==0.26.0
tenacity==8.2.3
```

### Development Tools
```txt
pytest==7.4.4
pytest-asyncio==0.23.3
black==23.12.1
ruff==0.1.11
mypy==1.8.0
```

---

## Infrastructure

### Redis Configuration
```yaml
version: '7.2-alpine'
persistence: enabled
maxmemory: 256mb
maxmemory-policy: allkeys-lru
```

### Nginx (Optional Reverse Proxy)
```nginx
upstream frontend {
    server frontend:3000;
}

upstream backend {
    server backend:8000;
}

server {
    listen 80;
    
    location / {
        proxy_pass http://frontend;
    }
    
    location /api/ {
        proxy_pass http://backend;
        proxy_set_header X-Forwarded-User $http_x_forwarded_user;
        proxy_set_header X-Forwarded-Email $http_x_forwarded_email;
    }
    
    location /socket.io/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## Development Environment

### VSCode Extensions (Recommended)
- ESLint
- Prettier
- TypeScript + JavaScript
- Python
- Docker
- Kubernetes
- YAML
- GitLens

### Environment Variables

#### Frontend (.env.local)
```bash
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=http://localhost:8000

# Feature Flags
NEXT_PUBLIC_ENABLE_WEBSOCKET=true
NEXT_PUBLIC_ENABLE_CACHING=true

# Development
NEXT_PUBLIC_ENV=development
```

#### Backend (.env)
```bash
# Application
APP_NAME=kubik
APP_ENV=development
LOG_LEVEL=DEBUG

# API
API_PREFIX=/api/v1
CORS_ORIGINS=http://localhost:3000

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=

# Kubernetes
K8S_IN_CLUSTER=false
K8S_CONFIG_PATH=~/.kube/config

# ChartMuseum
CHARTMUSEUM_URL=http://chartmuseum.ez-chartmuseum-ns:8080

# Prometheus
PROMETHEUS_URL=http://kubeprom-prometheus.prometheus:9090

# OAuth2 Proxy (Production)
OAUTH2_HEADER_USER=X-Forwarded-User
OAUTH2_HEADER_EMAIL=X-Forwarded-Email
OAUTH2_HEADER_GROUPS=X-Forwarded-Groups

# Cache TTL (seconds)
CACHE_TTL_NAMESPACES=300
CACHE_TTL_RESOURCES=30
CACHE_TTL_CONFIGMAPS=120
CACHE_TTL_CHARTS=60

# WebSocket
WS_PING_INTERVAL=25
WS_PING_TIMEOUT=60

# Retry Configuration
RETRY_MAX_ATTEMPTS=3
RETRY_BACKOFF_FACTOR=2
```

---

## Docker Configuration

### Frontend Dockerfile
```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT 3000

CMD ["node", "server.js"]
```

### Backend Dockerfile
```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app ./app

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Docker Compose
```yaml
version: '3.9'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - K8S_IN_CLUSTER=false
    volumes:
      - ./backend/app:/app/app
      - ~/.kube/config:/home/appuser/.kube/config:ro
    depends_on:
      redis:
        condition: service_healthy
    command: uvicorn app.main:app --host 0.0.0.0 --reload

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      target: builder
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:8000
      - NEXT_PUBLIC_WS_URL=http://localhost:8000
    volumes:
      - ./frontend/src:/app/src
      - ./frontend/public:/app/public
    command: npm run dev

volumes:
  redis_data:
```

---

## CI/CD Pipeline (Future)

### GitHub Actions Workflow
```yaml
name: Build and Test

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
        working-directory: ./frontend
      - run: npm run lint
        working-directory: ./frontend
      - run: npm run build
        working-directory: ./frontend

  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install -r requirements.txt
        working-directory: ./backend
      - run: ruff check .
        working-directory: ./backend
      - run: black --check .
        working-directory: ./backend
      - run: pytest
        working-directory: ./backend
```

---

## Monitoring & Observability (Future)

### Metrics to Track
- API response times
- Cache hit/miss rates
- WebSocket connection count
- K8s API call rate
- Error rates by endpoint
- Active user sessions

### Logging Structure
```json
{
  "timestamp": "2025-12-03T01:36:18Z",
  "level": "INFO",
  "logger": "app.api.deployments",
  "message": "Deployment created",
  "user": "user@example.com",
  "resource": {
    "kind": "Deployment",
    "namespace": "default",
    "name": "my-app"
  },
  "duration_ms": 234
}
```

---

## Security Considerations

### Frontend
- ✅ Content Security Policy (CSP)
- ✅ XSS protection via React
- ✅ HTTPS only (production)
- ✅ Secure cookie flags
- ✅ No sensitive data in localStorage

### Backend
- ✅ CORS restricted to frontend domain
- ✅ Request rate limiting
- ✅ Input validation (Pydantic)
- ✅ SQL injection N/A (no SQL)
- ✅ Secret scanning in CI
- ✅ Dependency vulnerability scanning

### Infrastructure
- ✅ OAuth2-proxy for authentication
- ✅ K8s RBAC for service account
- ✅ Network policies
- ✅ Pod security policies
- ✅ Redis password protection (production)

---

## Performance Optimizations

### Frontend
- Next.js automatic code splitting
- Image optimization (next/image)
- Font optimization (next/font)
- React.memo for expensive components
- Virtual scrolling for large lists
- Debounced search inputs

### Backend
- Async I/O throughout
- Redis connection pooling
- K8s client connection reuse
- Response compression (gzip)
- Batch API requests where possible

### Caching Strategy
```
┌─────────────┐
│   Browser   │ (HTTP Cache)
└─────┬───────┘
      │
┌─────▼───────┐
│   Next.js   │ (Static Gen + ISR)
└─────┬───────┘
      │
┌─────▼───────┐
│   FastAPI   │ (In-memory LRU)
└─────┬───────┘
      │
┌─────▼───────┐
│    Redis    │ (Distributed Cache)
└─────┬───────┘
      │
┌─────▼───────┐
│  K8s API    │ (Source of Truth)
└─────────────┘
```

---

**Status**: Ready for implementation 🚀
