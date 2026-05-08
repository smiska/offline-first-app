import { NextResponse } from "next/server";
import { appendEvents } from "../../lib/eventStore";

export async function POST(req: Request) {
  const body = await req.json();
  return NextResponse.json(await appendEvents(body.events ?? []));
}
