from __future__ import annotations

import shutil
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

import pytest

from app.core.settings import get_settings


def test_browser_live_smoke_roundtrip() -> None:
    settings = get_settings()
    if not settings.ai_studio_api_key:
        pytest.skip("API_KEY_AI_STUDIO is not configured.")

    node = shutil.which("node")
    npm = shutil.which("npm.cmd") or shutil.which("npm")
    if not node or not npm:
        pytest.skip("Node.js and npm are required for the browser live smoke test.")

    repo_root = Path(__file__).resolve().parents[2]
    runtime_dir = repo_root / "data" / "dev-runtime"
    runtime_dir.mkdir(parents=True, exist_ok=True)

    backend_url = "http://127.0.0.1:8000/health"
    frontend_url = "http://127.0.0.1:5173/"

    owned_processes: list[subprocess.Popen[str]] = []
    _start_if_needed(
        url=backend_url,
        command=[sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"],
        workdir=repo_root / "backend",
        stdout_path=runtime_dir / "pytest-browser-live-backend.out.log",
        stderr_path=runtime_dir / "pytest-browser-live-backend.err.log",
        owned_processes=owned_processes,
    )
    _start_if_needed(
        url=frontend_url,
        command=[npm, "run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"],
        workdir=repo_root / "frontend",
        stdout_path=runtime_dir / "pytest-browser-live-frontend.out.log",
        stderr_path=runtime_dir / "pytest-browser-live-frontend.err.log",
        owned_processes=owned_processes,
    )

    try:
        _wait_for_url(backend_url, timeout_seconds=90)
        _wait_for_url(frontend_url, timeout_seconds=90)

        subprocess.run(
            [sys.executable, str(repo_root / "scripts" / "generate_browser_live_fixture.py")],
            cwd=repo_root / "backend",
            check=True,
        )
        subprocess.run(
            [node, str(repo_root / "scripts" / "browser-live-smoke.mjs")],
            cwd=repo_root,
            check=True,
        )
    finally:
        for process in reversed(owned_processes):
            _terminate_process(process)


def _start_if_needed(
    *,
    url: str,
    command: list[str],
    workdir: Path,
    stdout_path: Path,
    stderr_path: Path,
    owned_processes: list[subprocess.Popen[str]],
) -> subprocess.Popen[str] | None:
    if _url_is_ready(url):
        return None

    stdout_handle = stdout_path.open("w", encoding="utf-8")
    stderr_handle = stderr_path.open("w", encoding="utf-8")
    process = subprocess.Popen(
        command,
        cwd=workdir,
        stdout=stdout_handle,
        stderr=stderr_handle,
        text=True,
    )
    owned_processes.append(process)
    return process


def _url_is_ready(url: str) -> bool:
    try:
        with urlopen(url, timeout=3) as response:
            return 200 <= response.status < 500
    except URLError:
        return False


def _wait_for_url(url: str, *, timeout_seconds: int) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if _url_is_ready(url):
            return
        time.sleep(1)
    raise AssertionError(f"Timed out waiting for {url}")


def _terminate_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=10)
