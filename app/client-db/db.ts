"use client";
import Dexie, { Table } from "dexie";
import type { EventInput } from "../lib/types";

export type Event = EventInput;

class DB extends Dexie {
  events!: Table<Event, string>;
  constructor() {
    super("phase5");
    this.version(1).stores({ events: "id, synced, aggregateId, timestamp" });
  }
}
export const db = new DB();
