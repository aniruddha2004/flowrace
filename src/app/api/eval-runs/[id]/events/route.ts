import { getEvaluation } from "@/lib/evaluations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const id = (await params).id;
  if (!getEvaluation(id)) return Response.json({ error: "Evaluation run not found." }, { status: 404 });
  let interval: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const send = () => {
        const run = getEvaluation(id);
        if (!run) { if (interval) clearInterval(interval); controller.close(); return; }
        try { controller.enqueue(encoder.encode(JSON.stringify({ status: run.status, completed: run.result.completed, total: run.result.total, perFlow: run.result.perFlow }) + "\n")); }
        catch { if (interval) clearInterval(interval); return; }
        if (["completed", "cancelled", "failed"].includes(run.status)) { if (interval) clearInterval(interval); controller.close(); }
      };
      interval = setInterval(send, 1000);
      send();
    },
    cancel() { if (interval) clearInterval(interval); },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
