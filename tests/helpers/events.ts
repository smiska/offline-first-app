import type { EventInput } from "../../app/lib/types";

export function buildEvent(overrides: Partial<EventInput> = {}): EventInput {
  const id = overrides.id ?? crypto.randomUUID();
  const aggregateId = overrides.aggregateId ?? "job-1";
  const baseVersion = overrides.baseVersion ?? 0;
  const nextVersion = overrides.nextVersion ?? baseVersion + 1;

  return {
    id,
    type: overrides.type ?? "JOB_CREATED",
    aggregateId,
    baseVersion,
    nextVersion,
    payload: overrides.payload ?? { name: "Job from test" },
    timestamp: overrides.timestamp ?? Date.now(),
    synced: overrides.synced ?? false
  };
}
