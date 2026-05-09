import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventInput } from "../../app/lib/types";

const { mockConnect } = vi.hoisted(() => ({
  mockConnect: vi.fn()
}));

vi.mock("../../app/lib/db", () => ({
  pool: {
    connect: mockConnect
  }
}));

import { appendEvents } from "../../app/lib/eventStore";

function buildEvent(overrides: Partial<EventInput> = {}): EventInput {
  return {
    id: overrides.id ?? "event-1",
    type: overrides.type ?? "JOB_CREATED",
    aggregateId: overrides.aggregateId ?? "job-1",
    baseVersion: overrides.baseVersion ?? 0,
    nextVersion: overrides.nextVersion ?? 1,
    payload: overrides.payload ?? { name: "Job" },
    timestamp: overrides.timestamp ?? 1710000000000
  };
}

describe("appendEvents", () => {
  beforeEach(() => {
    mockConnect.mockReset();
  });

  it("treats duplicate event id as idempotent acceptance", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT id FROM events")) return { rowCount: 1, rows: [{ id: "event-1" }] };
      return { rowCount: 0, rows: [] };
    });
    const release = vi.fn();
    mockConnect.mockResolvedValue({ query, release });

    const result = await appendEvents([buildEvent()]);

    expect(result).toEqual({ accepted: ["event-1"], conflicts: [] });
    expect(query).toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalled();
  });

  it("returns conflict when client baseVersion is stale", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT id FROM events")) return { rowCount: 0, rows: [] };
      if (sql.includes("SELECT version FROM aggregate_versions")) return { rowCount: 1, rows: [{ version: 3 }] };
      return { rowCount: 0, rows: [] };
    });
    const release = vi.fn();
    mockConnect.mockResolvedValue({ query, release });

    const result = await appendEvents([buildEvent({ id: "event-2", baseVersion: 2, nextVersion: 3 })]);

    expect(result.accepted).toEqual([]);
    expect(result.conflicts).toEqual([
      {
        eventId: "event-2",
        aggregateId: "job-1",
        serverVersion: 3,
        clientBaseVersion: 2
      }
    ]);
    const allSql = query.mock.calls.map((call) => String(call[0])).join("\n");
    expect(allSql).not.toContain("INSERT INTO integration_jobs");
  });

  it("writes event, aggregate version and integration job on happy path", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT id FROM events")) return { rowCount: 0, rows: [] };
      if (sql.includes("SELECT version FROM aggregate_versions")) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [] };
    });
    const release = vi.fn();
    mockConnect.mockResolvedValue({ query, release });

    const result = await appendEvents([buildEvent({ id: "event-3", aggregateId: "job-2" })]);

    expect(result).toEqual({ accepted: ["event-3"], conflicts: [] });
    const allSql = query.mock.calls.map((call) => String(call[0])).join("\n");
    expect(allSql).toContain("INSERT INTO events");
    expect(allSql).toContain("INSERT INTO aggregate_versions");
    expect(allSql).toContain("INSERT INTO integration_jobs");
  });

  it("rolls back and rethrows when a query fails", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT id FROM events")) return { rowCount: 0, rows: [] };
      if (sql.includes("SELECT version FROM aggregate_versions")) return { rowCount: 0, rows: [] };
      if (sql.includes("INSERT INTO events")) throw new Error("insert failed");
      return { rowCount: 0, rows: [] };
    });
    const release = vi.fn();
    mockConnect.mockResolvedValue({ query, release });

    await expect(appendEvents([buildEvent({ id: "event-4" })])).rejects.toThrow("insert failed");
    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalled();
  });
});
