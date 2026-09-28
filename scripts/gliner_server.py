"""Local-only HTTP bridge for fastino/GLiNER2.5-Decide.

Run from the project root with: python scripts/gliner_server.py
"""

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock

from gliner2 import AutoExtractor


MODEL = os.getenv("GLINER_MODEL", "fastino/GLiNER2.5-Decide")
PORT = int(os.getenv("GLINER_PORT", "8100"))
MAX_BODY = 256_000
model = AutoExtractor.from_pretrained(MODEL)
inference_lock = Lock()


class Handler(BaseHTTPRequestHandler):
    def respond(self, status, value):
        data = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            self.respond(200, {"model": MODEL, "ready": True})
        else:
            self.respond(404, {"error": "Not found"})

    def do_POST(self):
        if self.path != "/classify":
            self.respond(404, {"error": "Not found"})
            return
        if self.headers.get("Origin"):
            self.respond(403, {"error": "Browser requests are not accepted"})
            return
        if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
            self.respond(415, {"error": "Content-Type must be application/json"})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size <= 0 or size > MAX_BODY:
                self.respond(413, {"error": "Invalid request size"})
                return
            body = json.loads(self.rfile.read(size))
            text, tasks = body["text"], body["tasks"]
            if not isinstance(text, str) or not text.strip() or len(text) > 20_000:
                raise ValueError("text must be a non-empty string (max 20,000 characters)")
            if not isinstance(tasks, dict) or not 1 <= len(tasks) <= 80:
                raise ValueError("tasks must be an object with 1–80 heads")
            # The label sets can exceed the model's context if sent in one pass.
            # Keep main decisions together, then evaluate probes in small batches.
            items = list(tasks.items())
            results = {}
            with inference_lock:
                for start in range(0, len(items), 6):
                    batch = dict(items[start:start + 6])
                    results.update(model.classify_text(text, batch, include_confidence=True))
            self.respond(200, results)
        except (ValueError, KeyError, json.JSONDecodeError) as exc:
            self.respond(400, {"error": str(exc)})
        except Exception as exc:
            self.respond(500, {"error": f"GLiNER inference failed: {exc}"})


if __name__ == "__main__":
    print(f"Loaded {MODEL}; serving on http://127.0.0.1:{PORT}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
