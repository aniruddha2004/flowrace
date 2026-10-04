import { NextResponse } from "next/server";
import { deleteFlow, getFlow, updateFlow, type FlowStep } from "@/lib/flows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context): Promise<NextResponse> {
  const flow = getFlow((await params).id);
  return flow ? NextResponse.json({ flow }) : NextResponse.json({ error: "Flow not found." }, { status: 404 });
}

export async function PATCH(request: Request, { params }: Context): Promise<NextResponse> {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 }); }
  const result = updateFlow(id, { name: body.name as string | undefined, steps: body.steps as FlowStep[] | undefined });
  if (!result.ok) return NextResponse.json({ error: result.errors.join(" "), errors: result.errors }, { status: getFlow(id) ? 400 : 404 });
  return NextResponse.json({ flow: result.flow });
}

export async function DELETE(_request: Request, { params }: Context): Promise<NextResponse> {
  return deleteFlow((await params).id)
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Flow not found." }, { status: 404 });
}
