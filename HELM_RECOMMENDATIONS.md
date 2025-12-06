
# Helm Chart Recommendations for Production Deployment

This document outlines the recommended structure and configuration for the production Helm chart of the Admin Dashboard. It takes into account the existing `helm/` folder settings and the recent architectural changes (Frontend/Backend split, Redis dependency, etc.).

## 1. Top-Level Architecture

The current `helm/` folder contains a generic single-deployment chart ("kubik"). This needs to be refactored to support the three microservices architecture:

1.  **Frontend**: Next.js application (Port 3000)
2.  **Backend**: FastAPI application (Port 8000)
3.  **Redis**: Key-Value store (Port 6379)

**Recommendation**: Use a "Subchart" pattern or distinct Deployment templates within a single chart.

### Directory Structure Proposal
```
helm/
  Chart.yaml
  values.yaml (Global + Component values)
  templates/
    frontend-deployment.yaml
    frontend-service.yaml
    backend-deployment.yaml
    backend-service.yaml
    redis-deployment.yaml (or bitnami/redis subchart)
    redis-service.yaml
    ingress.yaml (VirtualService)
    serviceaccount.yaml
```

## 2. Configuration (`values.yaml`) Recommendations

The `values.yaml` should be structured to configure each component independently while sharing global platform settings.

```yaml
global:
  domain: "${DOMAIN_NAME}" # from ezua.domainName
  imagePullSecrets: []

ezua:
  # Preserve existing Platform settings
  oidc:
    client_id: "${OIDC_CLIENT_ID}"
    ...
  podAnnotations:
    # Critical for Backend Auth
    hpe-ezua/add-auth-token: "true"

frontend:
  image:
    repository: "dashboard-frontend"
    tag: "prod-v1"
  replicaCount: 2
  env:
    NEXT_PUBLIC_API_URL: "/api/v1" # Relative path via Ingress/Gateway

backend:
  image:
    repository: "dashboard-backend"
    tag: "prod-v1"
  replicaCount: 2
  env:
    # Use internal service names
    REDIS_HOST: "dashboard-redis"
    REDIS_PORT: "6379"
    PROMETHEUS_URL: "http://kubeprom-prometheus.prometheus:9090"
    CORS_ORIGINS: '["https://dash.${DOMAIN_NAME}"]' # Restrict for Prod
    K8S_IN_CLUSTER: "true"
    # Ezua Auth Token is mounted to /etc/secrets/ezua/.auth_token automatically
    # AUTH_TOKEN env var can be optional override

redis:
  enabled: true
  image: "redis:7"
  # Or use persistence settings
```

## 3. Specific Feature Integrations

### Data Sources & S3
*   The backend now supports an S3 Browser (`POST /storage/browse`).
*   It requires the `hpe-ezua/add-auth-token: "true"` annotation on the **Backend Pod**.
*   **Recommendation**: Ensure this annotation is applied in `backend-deployment.yaml`.

### Monitoring (Prometheus)
*   The backend proxies Prometheus requests.
*   **Recommendation**: Expose `PROMETHEUS_URL` in `values.yaml` so it can be changed if the Prometheus service name differs in the production cluster.

### Ingress / VirtualService
*   The current chart uses `istio-gateway`.
*   **Recommendation**: Update the `VirtualService` template to route:
    *   `/` -> `frontend` service (port 3000)
    *   `/api` -> `backend` service (port 8000)
    *   `/socket.io` -> `backend` service (port 8000) - **Important for WebSockets**

### Shared Storage (PVCs)
*   The application uses a shared PVC (`ezpresto-shared-pv` copy logic).
*   **Recommendation**:
    *   Include a `pvc-shared.yaml` template in the chart.
    *   Make the storage class and size configurable in `values.yaml`.
    *   Add a `volumeMount` for `/mnt/shared` (or configured path) in the Backend deployment.

## 4. Airgap Support
*   Preserve the logic for prepending `airgap.registry.url` to image repositories.
*   This is already present in the old chart and is critical for enterprise deployments.

## 5. Migration Steps

1.  **Backup**: Backup existing values.
2.  **Refactor**: Create the new templates in `helm/templates/`.
3.  **Verify**: Use `helm template . --debug` to verify the generated manifests match the structure of the `k8s/` folder (conceptually).
4.  **Deploy**: Perform a `helm upgrade --install` with the new values.
