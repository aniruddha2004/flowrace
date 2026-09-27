import { NextResponse } from "next/server";
import {
  TAXONOMY_TYPES,
  addTaxonomyOption,
  getTaxonomy,
  type TaxonomyType,
} from "@/lib/taxonomy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ taxonomy: getTaxonomy() });
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
  if (
    typeof taxonomyType !== "string" ||
    !TAXONOMY_TYPES.includes(taxonomyType as TaxonomyType)
  ) {
    return NextResponse.json(
      { error: `taxonomyType must be one of ${TAXONOMY_TYPES.join(", ")}.` },
      { status: 400 },
    );
  }
  if (typeof key !== "string") {
    return NextResponse.json({ error: "key is required." }, { status: 400 });
  }
  if (typeof label !== "string") {
    return NextResponse.json({ error: "label is required." }, { status: 400 });
  }
  const result = addTaxonomyOption(taxonomyType as TaxonomyType, {
    key,
    label,
    description: typeof description === "string" ? description : "",
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ option: result.option }, { status: 201 });
}
