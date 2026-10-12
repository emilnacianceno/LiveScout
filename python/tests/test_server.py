import json
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import pytest

import server


@pytest.fixture()
def base_url():
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    server.jobs.clear()
    yield f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()
    httpd.server_close()


def call(url, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    try:
        with urllib.request.urlopen(req) as res:
            return res.status, json.loads(res.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def test_status_idle(base_url):
    assert call(f"{base_url}/status") == (200, {"running": False})


def test_status_reports_running_job(base_url):
    server.jobs["abc"] = {"status": "running", "log": [], "results": []}
    assert call(f"{base_url}/status") == (200, {"running": True})


def test_unknown_job_is_404(base_url):
    assert call(f"{base_url}/jobs/nope")[0] == 404


def test_known_job_is_returned(base_url):
    server.jobs["abc"] = {"status": "done", "log": ["x"], "results": [], "exitCode": 0}
    status, body = call(f"{base_url}/jobs/abc")
    assert status == 200 and body["status"] == "done"


def test_scrape_requires_group_url(base_url):
    status, body = call(f"{base_url}/scrape", "POST", {})
    assert status == 400 and "groupUrl" in body["error"]


def test_scrape_rejects_second_job_while_running(base_url):
    server.jobs["abc"] = {"status": "running", "log": [], "results": []}
    status, _ = call(f"{base_url}/scrape", "POST", {"groupUrl": "https://www.facebook.com/groups/x"})
    assert status == 409


def test_unknown_post_path_is_404(base_url):
    assert call(f"{base_url}/nope", "POST", {})[0] == 404
