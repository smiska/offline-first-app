import { beforeEach, describe, expect, it, vi } from "vitest";

type Event = {
  id: string;
  synced?: boolean;
  localStatus?: "queued" | "pushing" | "pushed" | "conflict" | "error";
  pushAttempts?: number;
  nextPushAt?: string;
  lastPushError?: string | null;
  aggregateId: string;
  baseVersion: number;
  nextVersion: number;
  payload: unknown;
  timestamp: number;
  type: "JOB_CREATED" | "JOB_COMPLETED";
  conflict?: { serverVersion: number; clientBaseVersion: number };
};

function makeDb(initialEvents: Event[]) {
  const state = { events: [...initialEvents] };

  const eventsTable = {
    filter: vi.fn((predicate: (e: Event) => boolean) => ({
      toArray: vi.fn(async () => state.events.filter(predicate)),
      first: vi.fn(async () => state.events.find(predicate))
    })),
    orderBy: vi.fn((_key: string) => ({
      toArray: vi.fn(async () => [...state.events])
    })),
    update: vi.fn(async (id: string, changes: Partial<Event>) => {
      const index = state.events.findIndex((e) => e.id === id);
      if (index === -1) return 0;
      state.events[index] = { ...state.events[index], ...changes };
      return 1;
    })
  };

  return { state, db: { events: eventsTable } };
}

describe("offline-first outbox", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("marks due events error when API base url is missing", async () => {
    const { state, db } = makeDb([
      {
        id: "e1",
        synced: false,
        localStatus: "queued",
        pushAttempts: 0,
        nextPushAt: "2000-01-01T00:00:00.000Z",
        lastPushError: null,
        aggregateId: "a",
        baseVersion: 0,
        nextVersion: 1,
        payload: {},
        timestamp: 1,
        type: "JOB_CREATED"
      }
    ]);

    vi.doMock("../../app/client-db/db", () => ({ db }));
    vi.doMock("../../app/lib/clientApi", () => ({
      getApiBaseUrl: () => "",
      toApiUrl: (p: string) => p
    }));

    const { syncOfflineFirst } = await import("../../app/client-db/localConnector");

    const result = await syncOfflineFirst();

    expect(result).toEqual({ accepted: [], conflicts: [] });
    expect(state.events[0].localStatus).toBe("error");
    expect(state.events[0].pushAttempts).toBe(1);
    expect(state.events[0].lastPushError).toContain("NEXT_PUBLIC_API_BASE_URL");
    expect(state.events[0].nextPushAt).toMatch(/T/);
  });

  it("marks accepted events pushed+synced and conflicts as conflict", async () => {
    const { state, db } = makeDb([
      {
        id: "e1",
        synced: false,
        localStatus: "queued",
        pushAttempts: 0,
        nextPushAt: "2000-01-01T00:00:00.000Z",
        lastPushError: null,
        aggregateId: "agg-1",
        baseVersion: 0,
        nextVersion: 1,
        payload: {},
        timestamp: 1,
        type: "JOB_CREATED"
      },
      {
        id: "e2",
        synced: false,
        localStatus: "queued",
        pushAttempts: 0,
        nextPushAt: "2000-01-01T00:00:00.000Z",
        lastPushError: null,
        aggregateId: "agg-2",
        baseVersion: 7,
        nextVersion: 8,
        payload: {},
        timestamp: 2,
        type: "JOB_COMPLETED"
      }
    ]);

    vi.doMock("../../app/client-db/db", () => ({ db }));
    vi.doMock("../../app/lib/clientApi", () => ({
      getApiBaseUrl: () => "https://backend.test",
      toApiUrl: (p: string) => `https://backend.test${p}`
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            accepted: ["e1"],
            conflicts: [
              { eventId: "e2", aggregateId: "agg-2", serverVersion: 9, clientBaseVersion: 7 }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      })
    );

    const { syncOfflineFirst } = await import("../../app/client-db/localConnector");

    const result = await syncOfflineFirst();

    expect(result.accepted).toEqual(["e1"]);
    expect(result.conflicts).toHaveLength(1);
    expect(state.events.find((e) => e.id === "e1")?.synced).toBe(true);
    expect(state.events.find((e) => e.id === "e1")?.localStatus).toBe("pushed");
    const conflicted = state.events.find((e) => e.id === "e2")!;
    expect(conflicted.synced).toBe(false);
    expect(conflicted.localStatus).toBe("conflict");
    expect(conflicted.conflict).toEqual({ serverVersion: 9, clientBaseVersion: 7 });
  });

  it("retryPushDlq resets errored events", async () => {
    const { state, db } = makeDb([
      {
        id: "e1",
        synced: false,
        localStatus: "error",
        pushAttempts: 3,
        nextPushAt: "2099-01-01T00:00:00.000Z",
        lastPushError: "boom",
        aggregateId: "a",
        baseVersion: 0,
        nextVersion: 1,
        payload: {},
        timestamp: 1,
        type: "JOB_CREATED"
      }
    ]);

    vi.doMock("../../app/client-db/db", () => ({ db }));
    vi.doMock("../../app/lib/clientApi", () => ({
      getApiBaseUrl: () => "",
      toApiUrl: (p: string) => p
    }));

    const { retryPushDlq } = await import("../../app/client-db/localConnector");

    const result = await retryPushDlq();

    expect(result.ok).toBe(true);
    expect(result.reset).toBe(1);
    expect(state.events[0].localStatus).toBe("queued");
    expect(state.events[0].pushAttempts).toBe(0);
    expect(state.events[0].lastPushError).toBe(null);
  });
});
