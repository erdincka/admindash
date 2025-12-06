# K8s Dashboard v2

Modern, full-stack Kubernetes dashboard for HPE AI Essentials platform.

## Tech Stack

- **Frontend**: Next.js 14 + React 18 + TypeScript + Grommet v2 (HPE theme)
- **Backend**: FastAPI + Python 3.12 + kubernetes-asyncio
- **Caching**: Redis
- **Real-time**: Socket.IO (WebSocket)
- **Development**: Tilt + Kubernetes

## Prerequisites

- Node.js 20+
- Python 3.12+
- Docker Desktop
- Tilt (https://tilt.dev)
- kubectl access to K8s cluster
- K8s context: `lonadmin@lonpcaitwl`

## Quick Start

1. **Start Tilt:**
   ```bash
   cd app
   tilt up
   ```

2. **Access Applications:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs
   - Tilt UI: http://localhost:10350

3. **Development:**
   - Edit files in `frontend/src` or `backend/app`
   - Tilt will auto-rebuild and reload
   - Check logs in Tilt UI

## Project Structure

```
app/
├── frontend/          # Next.js application
├── backend/           # FastAPI application
├── k8s/              # Kubernetes manifests
└── Tiltfile          # Tilt configuration
```

## Architecture

- Deployed to `kubik-dev` namespace
- Port forwarding for local access
- Live reload for rapid development
- HPE branded UI with Grommet theme

## Development Workflow

1. Make code changes
2. Tilt auto-detects and rebuilds
3. Test changes immediately
4. Commit when ready

## Safety

- All resources in `kubik-dev` namespace
- No impact on production cluster
- Local builds only
- Ephemeral Redis (no persistence in dev)

---

Built with 💚 for HPE AI Essentials
