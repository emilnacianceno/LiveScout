"""Tiny HTTP service that runs the scraper for one group at a time (stdlib only).

POST /scrape   {"groupUrl": "...", "scrolls": 30, "liveOnly": false} -> 202 {"jobId": "..."}
GET  /jobs/<id>                                                      -> status, log tail, results
GET  /status                                                         -> is a job running?
The backend (Bun) owns groups and the database; this service only drives the browser.
"""
import json
import os
import subprocess
import sys
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = int(os.environ.get("PYTHON_PORT", "8001"))
SCRAPER = Path(__file__).parent / "fb_live_scraper.py"
RUNS_DIR = Path(__file__).parent.parent / "data" / "runs"

jobs = {}  # job id -> {"status": running|done|failed, "log": [...], "results": [...]}
lock = threading.Lock()


def run_job(job_id, cmd, out_file):
    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace"
    )
    for line in proc.stdout:
        with lock:
            jobs[job_id]["log"] = (jobs[job_id]["log"] + [line.rstrip()])[-50:]
    code = proc.wait()
    results = []
    if code == 0 and out_file.exists():
        results = json.loads(out_file.read_text(encoding="utf-8"))
    out_file.unlink(missing_ok=True)
    with lock:
        jobs[job_id].update(status="done" if code == 0 else "failed", exitCode=code, results=results)


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        with lock:
            if self.path == "/status":
                return self._send(200, {"running": any(j["status"] == "running" for j in jobs.values())})
            if self.path.startswith("/jobs/"):
                job = jobs.get(self.path[len("/jobs/"):])
                if job:
                    return self._send(200, job)
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/scrape":
            return self._send(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(length) or b"{}")
        group = body.get("groupUrl")
        if not group:
            return self._send(400, {"error": "groupUrl missing"})
        with lock:
            # One browser profile, so one job at a time
            if any(j["status"] == "running" for j in jobs.values()):
                return self._send(409, {"error": "a scrape is already running"})
            job_id = uuid.uuid4().hex
            jobs[job_id] = {"status": "running", "log": [], "results": [], "exitCode": None}
        RUNS_DIR.mkdir(parents=True, exist_ok=True)
        out_file = RUNS_DIR / f"{job_id}.json"
        cmd = [sys.executable, "-u", str(SCRAPER), group, "--headless", "--out", str(out_file),
               "--scrolls", str(int(body.get("scrolls", 30)))]
        if body.get("liveOnly"):
            cmd.append("--live-only")
        threading.Thread(target=run_job, args=(job_id, cmd, out_file), daemon=True).start()
        self._send(202, {"jobId": job_id})

    def log_message(self, fmt, *args):
        print("[python]", fmt % args, flush=True)


if __name__ == "__main__":
    print(f"[python] scraper service on http://localhost:{PORT}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
