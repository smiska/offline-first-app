import { beforeEach, describe, expect, it, vi } from "vitest";

const { appendEventsMock, poolQueryMock } = vi.hoisted(() => ({
  appendEventsMock: vi.fn(),
  poolQueryMock: vi.fn()
}));

vi.mock("../../app/lib/eventStore", () => ({
  appendEvents: appendEventsMock
}));

vi.mock("../../app/lib/db", () => ({
  pool: {
    query: poolQueryMock
  }
}));

import { POST as postSync } from "../../app/api/sync/route";
import { GET as getIntegrationJobs } from "../../app/api/integration-jobs/route";
import { POST as postRetry } from "../../app/api/integration-jobs/retry/route";

describe("sync route", () => {
  beforeEach(() => {
    appendEventsMock.mockReset();
  });

  it("passes events to eventStore and returns sync result", async () => {
    appendEventsMock.mockResolvedValue({ accepted: ["e1"], conflicts: [] });
    const request = new Request("http://localhost/api/sync", {
      method: "POST",
      body: JSON.stringify({
        events: [{ id: "e1", aggregateId: "job-1" }]
      }),
      headers: { "content-type": "application/json" }
    });

    const response = await postSync(request);

    expect(response.status).toBe(200);
    expect(appendEventsMock).toHaveBeenCalledWith([{ id: "e1", aggregateId: "job-1" }]);
    await expect(response.json()).resolves.toEqual({ accepted: ["e1"], conflicts: [] });
  });
});

describe("integration jobs route", () => {
  beforeEach(() => {
    poolQueryMock.mockReset();
  });

  it("returns latest jobs", async () => {
    poolQueryMock.mockResolvedValue({ rows: [{ id: "j1", status: "pending" }] });

    const response = await getIntegrationJobs();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([{ id: "j1", status: "pending" }]);
  });

  it("returns 500 payload when query fails", async () => {
    poolQueryMock.mockRejectedValue(new Error("db down"));

    const response = await getIntegrationJobs();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Failed to load integration jobs",
      message: "db down"
    });
  });
});

describe("retry route", () => {
  beforeEach(() => {
    poolQueryMock.mockReset();
  });

  it("resets dead jobs and returns ok", async () => {
    poolQueryMock.mockResolvedValue({ rowCount: 2 });

    const response = await postRetry();

    expect(poolQueryMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
