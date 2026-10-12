import { NextResponse } from "next/server";
import { deleteFlow, getFlow, updateFlow, type FlowStep } from "@/lib/flows";
import { JSON_LIMITS, readJsonObject } from "@/lib/api-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context): Promise<NextResponse> {
  const flow = getFlow((await params).id);
  return flow ? NextResponse.json({ flow }) : NextResponse.json({ error: "Flow not found." }, { status: 404 });
}

export async function PATCH(request: Request, { params }: Context): Promise<NextResponse> {
  const { id } = await params;
  const parsed = await readJsonObject(request, JSON_LIMITS.project);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.value;
  const result = updateFlow(id, { name: body.name as string | undefined, steps: body.steps as FlowStep[] | undefined });
  if (!result.ok) return NextResponse.json({ error: result.errors.join(" "), errors: result.errors }, { status: getFlow(id) ? 400 : 404 });
  return NextResponse.json({ flow: result.flow });
}

export async function DELETE(_request: Request, { params }: Context): Promise<NextResponse> {
  return deleteFlow((await params).id)
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Flow not found." }, { status: 404 });
}
