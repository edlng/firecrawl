# Firecrawl + Valkey Demo

A demo that lets you see inside Firecrawl's Valkey usage in real-time. Start scrapes and crawls, then inspect the actual keys, queues, and state that Firecrawl creates in Valkey.

## What This Shows

- **Rate Limiting** — Sliding window rate limiter using Valkey sorted sets, matching Firecrawl's production pattern
- **Crawl State Management** — See how Firecrawl stores all crawl state in Valkey (config, jobs, visited URLs)
- **Valkey Inspector** — View the actual keys Firecrawl creates for your crawls in real-time
- **Batch Operations** — Queue multiple URLs with progress tracked in Valkey

> **Note:** Self-hosted Firecrawl uses mock authentication which disables rate limiting (all limits set to 99999999). This is currently a limitation in self-hosted Firecrawl itself. This demo implements its own rate limiting layer using Valkey to demonstrate the pattern Firecrawl uses in production.

## Quick Start

Before running the commands, please do the following in project root's `docker-compose.yaml`

```yaml
  redis:
    # image: redis:alpine # comment this
    image: valkey/valkey:alpine # uncomment this
    ...
    ports: # add this
      - "6379:6379" # add this
```

```bash
cd apps/valkey-demo
pnpm install
pnpm run server

# Opens at http://localhost:3030
# Automatically starts Firecrawl + Valkey via docker compose
```

The server will automatically run `docker compose up` to start Firecrawl and Valkey.

## How It Works

The demo server:
1. Starts Firecrawl + Valkey via docker compose
2. Proxies requests to Firecrawl's real API (scrape, crawl, batch)
3. Implements rate limiting using Valkey GLIDE (same pattern as Firecrawl production)
4. Provides a **Valkey Inspector** to see the actual keys Firecrawl creates in real-time

## Rate Limiting

The rate limiting panel demonstrates Valkey-based rate limiting using a sliding window algorithm with sorted sets — the same approach Firecrawl uses in production.

The demo endpoint is limited to 10 requests/minute by default (configurable via `RATE_LIMIT_SCRAPE`). The other endpoints (scrape, crawl, batch) are unlimited since they go directly to Firecrawl.

## Firecrawl's Valkey Usage

Firecrawl stores **all crawl state** in Valkey. This is how it tracks progress, prevents duplicate URL visits, and manages concurrent crawls:

| Pattern | Type | Purpose |
|---------|------|---------|
| `crawl:{id}` | string (JSON) | Crawl configuration, options, team_id, timestamps |
| `crawl:{id}:jobs` | set | All job IDs for this crawl |
| `crawl:{id}:jobs_done` | set | Completed job IDs |
| `crawl:{id}:visited` | set | URLs already visited (prevents duplicates)* |
| `crawl:{id}:visited_unique` | set | Unique URLs visited* |
| `crawl:{id}:robots_blocked` | set | URLs blocked by robots.txt |
| `active_crawls` | set | Currently running crawl IDs |

All keys have a 24-hour TTL.

*\*Note: `visited` and `visited_unique` sets are deleted when a crawl completes to save memory. Inspect while crawling to see them populated.*

### Demo-Specific Keys

| Pattern | Type | Purpose |
|---------|------|---------|
| `ratelimit:{endpoint}:{id}` | sorted set | Sliding window rate limiting |

## What About Caching Results?

**Crawl state** (config, jobs, visited URLs) → Stored in **Valkey** ✓

**Crawl results** (the actual scraped documents) → Stored in:
- **GCS** (Google Cloud Storage) in production
- **PostgreSQL** (NuQ job queue `returnvalue`) when GCS is not configured

**Scrape caching** (index system) → Uses **GCS + Supabase**, not Valkey

This demo focuses on what Firecrawl **actually** stores in Valkey: crawl state, job tracking, and rate limiting.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `FIRECRAWL_API_URL` | `http://localhost:3002` | Firecrawl API endpoint |
| `FIRECRAWL_API_KEY` | `fc-test-key` | API key |
| `VALKEY_HOST` | `localhost` | Valkey/Redis host |
| `VALKEY_PORT` | `6379` | Valkey/Redis port |
| `RATE_LIMIT_SCRAPE` | `10` | Rate limit demo requests per minute |
| `SKIP_DOCKER` | `false` | Skip docker compose if running separately |

## License

Apache-2.0
