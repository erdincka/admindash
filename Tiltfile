# Tiltfile

# Ensure we're using the correct K8s context
allow_k8s_contexts('lonadmin@lonpcaitwl')

# Create namespace
k8s_yaml('k8s/namespace.yaml')

# Redis (ephemeral)
k8s_yaml([
    'k8s/redis/deployment.yaml',
    'k8s/redis/service.yaml',
])
k8s_resource('redis', labels=['infrastructure'])

# Backend - use custom_build to avoid registry issues
docker_build('erdincka/dashboard-backend-dev',
    context='./app/backend',
    dockerfile='./app/backend/Dockerfile.dev',
    build_args={'platform': 'linux/amd64'},
    live_update=[
        sync('./app/backend/app', '/app/app'),
        run(
            'pip install -r requirements.txt',
            trigger='./backend/requirements.txt'
        ),
    ],
)

k8s_yaml([
    'k8s/backend/serviceaccount.yaml',
    'k8s/backend/roleBinding.yaml',
    'k8s/backend/deployment.yaml',
    'k8s/backend/service.yaml',
])

k8s_resource(
    'backend',
    port_forwards='8000:8000',
    labels=['backend'],
    resource_deps=['redis'],
)

# Frontend - use custom_build to avoid registry issues
docker_build('erdincka/dashboard-frontend-dev',
    dockerfile='./app/frontend/Dockerfile.dev',
    context='./app/frontend',
    build_args={ 'platform': 'linux/amd64' },
    live_update=[
        sync('./app/frontend/src', '/app/src'),
        run(
            'npm install',
            trigger=['./frontend/package.json', './frontend/package-lock.json']
        ),
    ],
)

k8s_yaml([
    'k8s/frontend/deployment.yaml',
    'k8s/frontend/service.yaml',
])

k8s_resource(
    'frontend',
    port_forwards='3000:3000',
    labels=['frontend'],
    resource_deps=['backend'],
)

# Print helpful message
print("""
🚀 Dashboard v2 Development Environment
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Frontend:  http://localhost:3000
Backend:   http://localhost:8000
API Docs:  http://localhost:8000/docs
Tilt UI:   http://localhost:10350

Namespace: dashboard-dev
Context:   lonadmin@lonpcaitwl
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""")
