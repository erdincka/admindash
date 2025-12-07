from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # API Settings
    api_prefix: str = "/api/v1"
    environment: str = "development"

    # Logging
    log_level: str = "DEBUG"

    # Redis
    redis_host: str = "redis"
    redis_port: int = 6379
    redis_db: int = 0

    # Kubernetes
    k8s_in_cluster: bool = True
    k8s_namespace: str = "kubik-dev"

    # Cache TTL (seconds)
    cache_ttl_namespaces: int = 300
    cache_ttl_resources: int = 30
    cache_ttl_configmaps: int = 120
    cache_ttl_charts: int = 60

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
