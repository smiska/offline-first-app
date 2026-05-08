"use client";
import Dexie, { Table } from "dexie";

export type Event = {
  id: string;
  type: "JOB_CREATED" | "JOB_COMPLETED";
  aggregateId: string;
  baseVersion: number;
  nextVersion: number;
  payload: any;
  timestamp: number;
  synced?: boolean;
};

class DB extends Dexie {
  events!: Table<Event, string>;
  constructor() {
    super("phase5");
    this.version(1).stores({ events: "id, synced, aggregateId, timestamp" });
  }
}
export const db = new DB();
