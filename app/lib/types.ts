export type JobEventType = "JOB_CREATED" | "JOB_COMPLETED";

export interface EventInput {
  id: string;
  type: JobEventType;
  aggregateId: string;
  baseVersion: number;
  nextVersion: number;
  payload: unknown;
  timestamp: number;
  synced?: boolean;
}

export interface SyncConflict {
  eventId: string;
  aggregateId: string;
  serverVersion: number;
  clientBaseVersion: number;
}

export interface SyncResult {
  accepted: string[];
  conflicts: SyncConflict[];
}

export interface ProjectedJob {
  id: string;
  name: string;
  status: "open" | "done";
  version: number;
}

export interface IntegrationJobRow {
  id: string;
  event_id: string;
  connector: string;
  status: string;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  payload: unknown;
  created_at: string;
  updated_at: string;
}
