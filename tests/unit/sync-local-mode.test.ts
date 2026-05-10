import { beforeEach, describe, expect, it, vi } from "vitest";

const { eventsStore, syncOfflineFirstMock, isLocalModeMock } = vi.hoisted(() => ({
  eventsStore: {
    filter: vi.fn(),
    update: vi.fn()
  },
  syncOfflineFirstMock: vi.fn(),
  isLocalModeMock: vi.fn()
}));

vi.mock("../../app/client-db/db", () => ({
  db: {
    events: eventsStore
  }
}));

vi.mock("../../app/client-db/localConnector", () => ({
  syncOfflineFirst: syncOfflineFirstMock,
  isLocalConnectorMode: isLocalModeMock
}));

import { sync } from "../../app/client-db/sync";

describe("sync local mode branching", () => {
  beforeEach(() => {
    eventsStore.filter.mockReset();
    eventsStore.update.mockReset();
    syncOfflineFirstMock.mockReset();
    isLocalModeMock.mockReset();
    vi.restoreAllMocks();
  });

  it("uses local connector path when local mode is enabled", async () => {
    eventsStore.filter.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([{ id: "event-1", synced: false }])
    });
    isLocalModeMock.mockReturnValue(true);
    syncOfflineFirstMock.mockResolvedValue({ accepted: ["event-1"], conflicts: [] });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await sync();

    expect(result).toEqual({ accepted: ["event-1"], conflicts: [] });
    expect(syncOfflineFirstMock).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(eventsStore.update).toHaveBeenCalledWith("event-1", { synced: true });
  });

  it("keeps remote fetch path when local mode is disabled", async () => {
    eventsStore.filter.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([{ id: "event-2", synced: false }])
    });
    isLocalModeMock.mockReturnValue(false);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ accepted: ["event-2"], conflicts: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const result = await sync();

    expect(result).toEqual({ accepted: ["event-2"], conflicts: [] });
    expect(syncOfflineFirstMock).not.toHaveBeenCalled();
    expect(eventsStore.update).toHaveBeenCalledWith("event-2", { synced: true });
  });
});
