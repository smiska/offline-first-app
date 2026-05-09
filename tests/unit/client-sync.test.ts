import { beforeEach, describe, expect, it, vi } from "vitest";

const { eventsStore } = vi.hoisted(() => ({
  eventsStore: {
    filter: vi.fn(),
    update: vi.fn(),
    orderBy: vi.fn()
  }
}));

vi.mock("../../app/client-db/db", () => ({
  db: {
    events: eventsStore
  }
}));

import { sync } from "../../app/client-db/sync";
import { getJobs } from "../../app/client-db/jobs";

describe("client sync", () => {
  beforeEach(() => {
    eventsStore.filter.mockReset();
    eventsStore.update.mockReset();
    eventsStore.orderBy.mockReset();
    vi.restoreAllMocks();
  });

  it("returns empty result and skips network when no unsynced events exist", async () => {
    eventsStore.filter.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await sync();

    expect(result).toEqual({ accepted: [], conflicts: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("marks only accepted ids as synced", async () => {
    eventsStore.filter.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        { id: "event-1", synced: false },
        { id: "event-2", synced: false }
      ])
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ accepted: ["event-2"], conflicts: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await sync();

    expect(eventsStore.update).toHaveBeenCalledTimes(1);
    expect(eventsStore.update).toHaveBeenCalledWith("event-2", { synced: true });
  });

  it("throws when sync endpoint returns non-OK", async () => {
    eventsStore.filter.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([{ id: "event-1", synced: false }])
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("boom", { status: 500, statusText: "Server Error" })
    );

    await expect(sync()).rejects.toThrow("Sync failed: 500 boom");
    expect(eventsStore.update).not.toHaveBeenCalled();
  });
});

describe("job projection", () => {
  it("projects created and completed events into final job states", async () => {
    const toArray = vi.fn().mockResolvedValue([
      {
        id: "e1",
        type: "JOB_CREATED",
        aggregateId: "job-1",
        baseVersion: 0,
        nextVersion: 1,
        payload: { name: "Packing" },
        timestamp: 1
      },
      {
        id: "e2",
        type: "JOB_COMPLETED",
        aggregateId: "job-1",
        baseVersion: 1,
        nextVersion: 2,
        payload: {},
        timestamp: 2
      }
    ]);
    eventsStore.orderBy.mockReturnValue({ toArray });

    const jobs = await getJobs();

    expect(jobs).toEqual([{ id: "job-1", name: "Packing", status: "done", version: 2 }]);
  });
});
