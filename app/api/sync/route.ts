import { NextResponse } from "next/server";
import { appendEvents } from "../../lib/eventStore";

/**
 * Sync ingress for offline clients.
 * - Accepts `{ events: EventInput[] }`.
 * - Returns `{ accepted: string[], conflicts: SyncConflict[] }`.
 * Accepted IDs include idempotent replays so clients can safely mark them synced.
 */
export async function POST(req: Request) {
  const body = await req.json();
  return NextResponse.json(await appendEvents(body.events ?? []));
}
