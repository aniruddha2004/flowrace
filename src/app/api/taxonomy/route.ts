import { NextResponse } from "next/server";
import {
  addTaxonomyOption,
  getDefaultProject,
  taxonomyFromProject,
  type TaxonomyFieldKey,
} from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIELD_KEYS: TaxonomyFieldKey[] = ["category", "priority", "route_to_team"];

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ taxonomy: taxonomyFromProject(getDefaultProject()) });
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const { taxonomyType, key, label, description } = body as {
    taxonomyType?: unknown;
    key?: unknown;
    label?: unknown;
    description?: unknown;
  };
  if (typeof taxonomyType !== "string" || !FIELD_KEYS.includes(taxonomyType as TaxonomyFieldKey)) {
    return NextResponse.json(
      { error: `taxonomyType must be one of ${FIELD_KEYS.join(", ")}.` },
      { status: 400 },
    );
  }
  if (typeof key !== "string") {
    return NextResponse.json({ error: "key is required." }, { status: 400 });
  }
  if (typeof label !== "string") {
    return NextResponse.json({ error: "label is required." }, { status: 400 });
  }
  const result = addTaxonomyOption(getDefaultProject().id, taxonomyType as TaxonomyFieldKey, {
    key,
    label,
    description: typeof description === "string" ? description : "",
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ option: result.option }, { status: 201 });
}
