#!/usr/bin/env python3
"""One-click macOS bootstrap and LaunchAgent manager for the IntMed local runner."""
from __future__ import annotations

import argparse
import importlib.util
import os
import platform
import plistlib
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

LABEL = "ir.drgerami.intmed.local-runner"
ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / "scripts" / "local_runner.py"
PLIST = Path.home() / "Library" / "LaunchAgents" / f"{LABEL}.plist"
LOG_DIR = Path.home() / "Library" / "Logs" / "IntMed"
MODELS_URL = "http://127.0.0.1:1234/v1/models"


def require_macos() -> None:
    if platform.system() != "Darwin":
        raise RuntimeError("این نصب‌کننده فقط برای macOS است.")
    if sys.version_info < (3, 9):
        raise RuntimeError("Python 3.9 یا جدیدتر لازم است.")


def lms_path() -> str:
    candidates = [shutil.which("lms"), str(Path.home() / ".lmstudio" / "bin" / "lms")]
    return next((item for item in candidates if item and Path(item).is_file()), "")


def server_ready(timeout: float = 2) -> bool:
    try:
        with urllib.request.urlopen(MODELS_URL, timeout=timeout) as response:
            return response.status == 200
    except Exception:
        return False


def wait_server(seconds: int = 45) -> bool:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if server_ready():
            return True
        time.sleep(1)
    return False


def start_server(interactive: bool) -> bool:
    if server_ready():
        return True
    cli = lms_path()
    if not cli:
        subprocess.run(["/usr/bin/open", "-gj", "-a", "LM Studio"], check=False)
        for _ in range(15):
            time.sleep(1)
            cli = lms_path()
            if cli:
                break
    if cli:
        subprocess.run([cli, "server", "start"], stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL, timeout=30, check=False)
        if wait_server():
            return True
    if interactive:
        subprocess.run(["/usr/bin/open", "-a", "LM Studio"], check=False)
        print("\nدر LM Studio بخش Developer را باز کنید و Start Server را بزنید.")
        input("بعد از روشن‌شدن سرور، Enter را بزنید: ")
        return wait_server(20)
    return False


def pdf_support() -> str:
    if importlib.util.find_spec("fitz"):
        return "PyMuPDF"
    if shutil.which("pdftotext"):
        return "pdftotext"
    print("نصب ابزار رایگان PDF (PyMuPDF)…")
    result = subprocess.run([sys.executable, "-m", "pip", "install", "--user", "PyMuPDF"], check=False)
    return "PyMuPDF" if result.returncode == 0 else "ندارد؛ متن و تصویر همچنان کار می‌کنند"


def publishing_support() -> str:
    if importlib.util.find_spec("jsonschema"):
        return "jsonschema"
    print("نصب ابزار اعتبارسنجی انتشار (jsonschema)…")
    result = subprocess.run([sys.executable, "-m", "pip", "install", "--user", "jsonschema>=4.20,<5"], check=False)
    importlib.invalidate_caches()
    if result.returncode or not importlib.util.find_spec("jsonschema"):
        raise RuntimeError("نصب jsonschema ناموفق بود؛ انتشار کنترل‌شده بدون اعتبارسنجی انجام نمی‌شود.")
    return "jsonschema"


def plist_payload() -> dict:
    return {
        "Label": LABEL,
        "ProgramArguments": [sys.executable, str(Path(__file__).resolve()), "service-watch"],
        "WorkingDirectory": str(ROOT),
        "RunAtLoad": True,
        "KeepAlive": {"SuccessfulExit": False},
        "ThrottleInterval": 30,
        "StandardOutPath": str(LOG_DIR / "runner.log"),
        "StandardErrorPath": str(LOG_DIR / "runner-error.log"),
        "EnvironmentVariables": {"PYTHONUNBUFFERED": "1"},
        "ProcessType": "Background",
    }


def launchctl(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["/bin/launchctl", *args], stdout=subprocess.DEVNULL,
                          stderr=subprocess.DEVNULL, check=False)


def stop_orphan_runners() -> None:
    """Stop only this checkout's legacy child watch process, if one survived bootout."""
    subprocess.run(["/usr/bin/pkill", "-TERM", "-f", str(RUNNER) + " watch"],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)


def install_service() -> None:
    require_macos()
    PLIST.parent.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with PLIST.open("wb") as handle:
        plistlib.dump(plist_payload(), handle)
    os.chmod(PLIST, 0o600)
    domain = f"gui/{os.getuid()}"
    launchctl("bootout", domain, str(PLIST))
    stop_orphan_runners()
    result = launchctl("bootstrap", domain, str(PLIST))
    if result.returncode:
        raise RuntimeError("فعال‌سازی اجرای پس‌زمینه ناموفق بود.")
    launchctl("kickstart", "-k", f"{domain}/{LABEL}")
    print("اجرای خودکار IntMed فعال شد.")


def uninstall_service() -> None:
    require_macos()
    launchctl("bootout", f"gui/{os.getuid()}", str(PLIST))
    stop_orphan_runners()
    if PLIST.exists():
        PLIST.unlink()
    print("اجرای خودکار غیرفعال شد؛ تنظیمات حساب و صف حذف نشدند.")


def bootstrap() -> None:
    require_macos()
    print("\nراه‌اندازی خودکار IntMed + LM Studio")
    print("این برنامه رمز شما را ذخیره نمی‌کند و LM Studio را عمومی نمی‌کند.\n")
    applications = [Path("/Applications/LM Studio.app"), Path.home() / "Applications" / "LM Studio.app"]
    if not any(path.exists() for path in applications) and not lms_path():
        raise RuntimeError("LM Studio پیدا نشد؛ ابتدا آن را نصب کنید و یک‌بار باز کنید.")
    if not start_server(True):
        raise RuntimeError("سرور LM Studio روی 127.0.0.1:1234 پاسخ نداد.")
    print("✓ اتصال محلی LM Studio برقرار است.")
    print("✓ پشتیبانی PDF:", pdf_support())
    print("✓ اعتبارسنجی انتشار:", publishing_support())
    setup = subprocess.run([sys.executable, str(RUNNER), "setup"], cwd=ROOT, check=False)
    if setup.returncode:
        raise RuntimeError("تنظیم حساب کامل نشد؛ هیچ سرویس پس‌زمینه‌ای نصب نشد.")
    status = subprocess.run([sys.executable, str(RUNNER), "status"], cwd=ROOT, check=False)
    if status.returncode:
        raise RuntimeError("آزمایش نهایی اتصال ناموفق بود.")
    answer = input("Runner با ورود به مک خودکار روشن شود؟ [Y/n]: ").strip().casefold()
    if answer not in {"n", "no", "خیر"}:
        install_service()
    print("\n✅ اتصال کامل شد. اکنون فایل‌های تلگرام می‌توانند به پیش‌نویس تبدیل شوند.")


def service_watch() -> int:
    require_macos()
    publishing_support()
    if not start_server(False):
        print("LM Studio آماده نیست؛ Runner بعداً توسط launchd دوباره تلاش می‌کند.", file=sys.stderr)
        return 75
    os.chdir(ROOT)
    os.execv(sys.executable, [sys.executable, str(RUNNER), "watch"])
    return 75


def main() -> int:
    parser = argparse.ArgumentParser(description="IntMed LM Studio macOS setup")
    parser.add_argument("command", choices=["bootstrap", "install", "uninstall", "service-watch"])
    args = parser.parse_args()
    try:
        if args.command == "bootstrap":
            bootstrap()
        elif args.command == "install":
            install_service()
        elif args.command == "uninstall":
            uninstall_service()
        else:
            return service_watch()
        return 0
    except (RuntimeError, OSError, subprocess.SubprocessError) as exc:
        print("خطا:", exc, file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
