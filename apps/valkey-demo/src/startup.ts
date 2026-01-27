import { execSync } from "child_process";
import path from "path";

// Fixed path: apps/valkey-demo/src -> apps/valkey-demo -> apps -> project root
const PROJECT_ROOT = path.resolve(__dirname, "../../..");

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkHealth(url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForService(
  name: string,
  url: string,
  maxAttempts = 60,
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    if (await checkHealth(url)) {
      console.log(`[Startup] ${name} is ready`);
      return true;
    }
    if (i > 0 && i % 10 === 0) {
      console.log(
        `[Startup] Waiting for ${name}... (attempt ${i}/${maxAttempts})`,
      );
    }
    await sleep(2000);
  }
  return false;
}

export async function startDependencies(
  firecrawlUrl: string,
): Promise<boolean> {
  const skipDocker = process.env.SKIP_DOCKER === "true";

  if (skipDocker) {
    console.log("[Startup] SKIP_DOCKER=true, skipping docker compose");
    return true;
  }

  // Check if Firecrawl is already running
  if (await checkHealth(firecrawlUrl)) {
    console.log("[Startup] Firecrawl API already running");
    return true;
  }

  console.log("[Startup] Starting Firecrawl services via docker compose...");
  console.log("[Startup] This may take a minute on first run...");

  // Try docker compose up multiple times - rabbitmq health check can be flaky
  const maxDockerAttempts = 3;
  for (let attempt = 1; attempt <= maxDockerAttempts; attempt++) {
    try {
      execSync("docker compose up -d", {
        cwd: PROJECT_ROOT,
        stdio: "inherit",
      });
      break; // Success, exit retry loop
    } catch {
      if (attempt < maxDockerAttempts) {
        console.log(`[Startup] Docker compose attempt ${attempt} failed, retrying in 5s...`);
        await sleep(5000);
      } else {
        console.log("[Startup] Docker compose failed after retries, checking if services come up anyway...");
      }
    }
  }

  // Wait for Firecrawl API regardless of docker compose exit code
  // Note: Firecrawl API returns JSON at root, not /health
  console.log("[Startup] Waiting for Firecrawl API to be ready...");
  const ready = await waitForService(
    "Firecrawl API",
    firecrawlUrl,
    90, // Give it more time
  );

  if (!ready) {
    console.error("[Startup] Firecrawl API failed to become healthy");
    console.error("[Startup] Check docker logs: docker compose logs -f");
    return false;
  }

  return true;
}

export function setupShutdownHandler(): void {
  const shutdown = () => {
    console.log("\n[Startup] Shutting down...");

    if (process.env.SKIP_DOCKER !== "true") {
      try {
        console.log("[Startup] Stopping docker services...");
        execSync("docker compose down", {
          cwd: PROJECT_ROOT,
          stdio: "inherit",
        });
      } catch {
        // Ignore errors during shutdown
      }
    }

    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
