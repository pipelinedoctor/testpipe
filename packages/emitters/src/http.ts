import type { TestRun } from "@testpipe/core";

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function emitHttp(run: TestRun, url: string, token: string): Promise<void> {
  const body = JSON.stringify(run);
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  let lastError: Error | null = null;
  const delays = [1000, 2000, 4000];

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(url, { method: "POST", headers, body });
      if (resp.ok) return;
      if (resp.status >= 400 && resp.status < 500) {
        throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
      }
      lastError = new Error(`HTTP ${resp.status}: server error`);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("HTTP 4")) throw e;
      lastError = e instanceof Error ? e : new Error(String(e));
    }
    if (attempt < 2) await sleep(delays[attempt]);
  }

  throw lastError ?? new Error("HTTP push failed after 3 attempts");
}
