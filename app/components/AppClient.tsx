"use client";

import { useEffect, useState } from "react";
import { createJob, completeJob, getJobs } from "../client-db/jobs";
import { sync } from "../client-db/sync";

export default function AppClient() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [syncResult, setSyncResult] = useState<any>(null);

  async function refresh() {
    setJobs(await getJobs());
    setQueue(await fetch("/api/integration-jobs").then(r => r.json()));
  }

  useEffect(() => { refresh(); }, []);

  async function doSync() {
    setSyncResult(await sync());
    await refresh();
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

      <h2>ERP queue</h2>
      <pre>{JSON.stringify(queue, null, 2)}</pre>
    </main>
  );
}
