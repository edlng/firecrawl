# Deployment Guide

This guide covers deploying Firecrawl with Valkey in various environments.

## Table of Contents

- [Docker Compose (Local/Development)](#docker-compose)
- [Docker Compose (Production)](#docker-compose-production)
- [Kubernetes](#kubernetes)
- [Self-Hosted Valkey](#self-hosted-valkey)
- [AWS ElastiCache / MemoryDB](#aws-elasticache--memorydb)

---

## Docker Compose

### Development Setup

The simplest way to run Firecrawl with Valkey locally:

```bash
# From Firecrawl root directory
docker compose up -d
```

The default `docker-compose.yaml` uses Redis, but you can switch to Valkey by editing the redis service:

```yaml
redis:
  # Comment out Redis and uncomment Valkey:
  # image: redis:alpine
  image: valkey/valkey:alpine

  networks:
    - backend
  command: redis-server --bind 0.0.0.0
```

### Verify Valkey is Running

```bash
# Check container status
docker compose ps

# Test connection
docker compose exec redis redis-cli ping
# Expected: PONG

# Check if running Valkey (will show valkey_version)
docker compose exec redis redis-cli info server | grep -E "redis_version|valkey_version"
```

---

## Docker Compose Production

For production deployments, use a dedicated compose file with persistence and security:

### `deploy/docker-compose.valkey.yaml`

The actual compose file includes additional services and configuration. Here's a simplified overview:

```yaml
name: firecrawl-valkey

services:
  valkey:
    image: valkey/valkey:7-alpine
    restart: unless-stopped
    command: >
      valkey-server
      --bind 0.0.0.0
      --port 6379
      --requirepass ${VALKEY_PASSWORD:-changeme}
      --appendonly yes
      --appendfsync everysec
      --maxmemory ${VALKEY_MAXMEMORY:-2gb}
      --maxmemory-policy allkeys-lru
    volumes:
      - valkey-data:/data
    networks:
      - backend
    ports:
      - "${VALKEY_PORT:-6379}:6379"
    healthcheck:
      test: ["CMD", "valkey-cli", "-a", "${VALKEY_PASSWORD:-changeme}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3

  api:
    image: ghcr.io/firecrawl/firecrawl:latest
    restart: unless-stopped
    environment:
      REDIS_URL: redis://:${VALKEY_PASSWORD:-changeme}@valkey:6379
      REDIS_RATE_LIMIT_URL: redis://:${VALKEY_PASSWORD:-changeme}@valkey:6379
      PLAYWRIGHT_MICROSERVICE_URL: http://playwright-service:3000/scrape
      # ... other env vars
    depends_on:
      valkey:
        condition: service_healthy
      playwright-service:
        condition: service_started
    networks:
      - backend
    ports:
      - "${API_PORT:-3002}:3002"

  playwright-service:
    image: ghcr.io/firecrawl/playwright-service:latest
    # Required for browser-based scraping

  # Optional: Include valkey-demo with --profile demo
  valkey-demo:
    # ... runs on port 3030

volumes:
  valkey-data:

networks:
  backend:
    driver: bridge
```

See the full file at `deploy/docker-compose.valkey.yaml` for complete configuration including resource limits and logging.

### Production Environment Variables

```env
# .env.production
VALKEY_PASSWORD=your-secure-password-here
REDIS_URL=redis://:${VALKEY_PASSWORD}@valkey:6379
REDIS_RATE_LIMIT_URL=redis://:${VALKEY_PASSWORD}@valkey:6379
```

### Deploy

```bash
# From apps/valkey-demo directory
docker compose -f deploy/docker-compose.valkey.yaml --env-file .env.production up -d
```

---

## Kubernetes

Firecrawl includes ready-to-use Kubernetes manifests in `examples/kubernetes/cluster-install/`.

### Deploy with Valkey

```bash
cd examples/kubernetes/cluster-install

# Configure secrets and configmap first
# Edit secret.yaml and configmap.yaml with your values

# Deploy all components
kubectl apply -f configmap.yaml
kubectl apply -f secret.yaml
kubectl apply -f playwright-service.yaml
kubectl apply -f api.yaml
kubectl apply -f worker.yaml
kubectl apply -f nuq-worker.yaml
kubectl apply -f nuq-postgres.yaml
kubectl apply -f valkey.yaml  # Use valkey.yaml instead of redis.yaml

# Verify
kubectl get pods
```

### Port Forward for Testing

```bash
kubectl port-forward svc/api 3002:3002
```

See [examples/kubernetes/cluster-install/README.md](../../../examples/kubernetes/cluster-install/README.md) for full instructions.

---

## Self-Hosted Valkey

### Ubuntu/Debian

```bash
# Install dependencies
sudo apt update
sudo apt install -y build-essential tcl wget

# Download and build Valkey
wget https://github.com/valkey-io/valkey/archive/refs/tags/7.2.5.tar.gz
tar xzf 7.2.5.tar.gz
cd valkey-7.2.5
make
sudo make install

# Create config directory
sudo mkdir -p /etc/valkey
sudo cp valkey.conf /etc/valkey/

# Edit config
sudo nano /etc/valkey/valkey.conf
```

**Recommended config changes:**

```conf
# /etc/valkey/valkey.conf
bind 0.0.0.0
port 6379
requirepass your-secure-password
daemonize yes
pidfile /var/run/valkey.pid
logfile /var/log/valkey/valkey.log
dir /var/lib/valkey
appendonly yes
appendfsync everysec
maxmemory 2gb
maxmemory-policy allkeys-lru
```

---

## AWS ElastiCache / MemoryDB

To connect to AWS managed Valkey services, use `rediss://` (TLS) with your cluster endpoint:

```env
# ElastiCache (Valkey mode)
VALKEY_URL=rediss://:your-auth-token@your-cluster.xxxxx.cache.amazonaws.com:6379

# MemoryDB (with ACL user)
VALKEY_URL=rediss://username:password@your-cluster.xxxxx.memorydb.us-east-1.amazonaws.com:6379
```

Ensure your application runs in a VPC that can reach the cluster, and security groups allow port 6379.
