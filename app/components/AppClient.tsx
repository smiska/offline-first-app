"use client";

import { useEffect, useState } from "react";
import { createJob, completeJob, getJobs } from "../client-db/jobs";
import { sync } from "../client-db/sync";
import type { IntegrationJobRow, ProjectedJob, SyncResult } from "../lib/types";

export default function AppClient() {
  const [jobs, setJobs] = useState<ProjectedJob[]>([]);
  const [queue, setQueue] = useState<IntegrationJobRow[]>([]);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    setJobs(await getJobs());
    const response = await fetch("/api/integration-jobs");
    if (!response.ok) {
      const text = await response.text();
      const message = `Queue load failed: ${response.status} ${text}`;
      setError(message);
      throw new Error(message);
    }
    setQueue((await response.json()) as IntegrationJobRow[]);
  }

  useEffect(() => {
    refresh().catch((e: unknown) => {
      const message = e instanceof Error ? e.message : "Unknown error";
      setError(message);
    });
  }, []);

  async function doSync() {
    setError(null);
    try {
      setSyncResult(await sync());
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Phase 5 – ERP Connector Layer</h1>
      <button onClick={async () => { await createJob("Boiler install"); await refresh(); }}>
        Create offline job
      </button>
      <button onClick={doSync} style={{ marginLeft: 8 }}>Sync</button>
      <button onClick={async () => { await fetch("/api/integration-jobs/retry", { method: "POST" }); await refresh(); }} style={{ marginLeft: 8 }}>
        Retry DLQ
      </button>

      <h2>Local jobs</h2>
      {jobs.map(j => (
        <div key={j.id} style={{ border: "1px solid #ddd", padding: 8, marginTop: 8 }}>
          {j.name} – {j.status} – v{j.version}
          <button onClick={async () => { await completeJob(j); await refresh(); }} style={{ marginLeft: 8 }}>
            Complete
          </button>
        </div>
      ))}

      <h2>Last sync</h2>
      <pre>{JSON.stringify(syncResult, null, 2)}</pre>
      {error && <pre style={{ color: "crimson" }}>{error}</pre>}

      <h2>ERP queue</h2>
      <pre>{JSON.stringify(queue, null, 2)}</pre>
    </main>
  );
}
