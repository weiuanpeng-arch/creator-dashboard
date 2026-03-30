from __future__ import annotations

import argparse
import json
import subprocess
import urllib.error
import urllib.request
from datetime import date, timedelta
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "store_config.json"
EXAMPLE_CONFIG_PATH = BASE_DIR / "store_config.example.json"
VIDEO_EXPORT_SCRIPT = BASE_DIR / "export_affiliate_reports.mjs"
CREATOR_EXPORT_SCRIPT = BASE_DIR / "export_creator_analysis_reports.mjs"
IMPORT_EXPORT_SCRIPT = BASE_DIR / "import_exported_reports.py"
BUILD_SCRIPT = BASE_DIR / "build_sync_workbook.py"
SYNC_SCRIPT = BASE_DIR / "sync_into_workbook.py"
DASHBOARD_BUILD_SCRIPT = BASE_DIR.parent / "creator_dashboard" / "build_core_dashboard.py"
CHROME_BRIDGE_DIR = BASE_DIR.parent / "chrome_bridge"
CHROME_DEBUG_SCRIPT = CHROME_BRIDGE_DIR / "start_chrome_debug.sh"
STORE_PROFILE_SCRIPT = CHROME_BRIDGE_DIR / "start_store_profile.sh"
STATE_PATH = BASE_DIR / "data" / "pipeline_state.json"
WORKBOOK_PATH = Path("/Users/apple/Desktop/达人多次合作监控看板_同步版.xlsx")


def load_config() -> dict:
    path = CONFIG_PATH if CONFIG_PATH.exists() else EXAMPLE_CONFIG_PATH
    return json.loads(path.read_text(encoding="utf-8"))


def load_state() -> dict:
    if not STATE_PATH.exists():
        return {"stores": {}}
    return json.loads(STATE_PATH.read_text(encoding="utf-8"))


def save_state(payload: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def run(cmd: list[str]) -> None:
    print(">", " ".join(cmd))
    completed = subprocess.run(cmd, check=False, capture_output=True, text=True)
    if completed.stdout.strip():
        print(completed.stdout.strip())
    if completed.stderr.strip():
        print(completed.stderr.strip())
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or f"exit={completed.returncode}"
        raise RuntimeError(f"{' '.join(cmd)} -> {detail}")


def run_capture(cmd: list[str]) -> str:
    print(">", " ".join(cmd))
    completed = subprocess.run(cmd, check=False, capture_output=True, text=True)
    stdout = completed.stdout.strip()
    if stdout:
        print(stdout)
    if completed.stderr.strip():
        print(completed.stderr.strip())
    if completed.returncode != 0:
        detail = completed.stderr.strip() or stdout or f"exit={completed.returncode}"
        raise RuntimeError(f"{' '.join(cmd)} -> {detail}")
    return stdout


def endpoint_ready(port: int) -> bool:
    url = f"http://127.0.0.1:{port}/json/version"
    try:
        with urllib.request.urlopen(url, timeout=3) as response:
            return response.status == 200
    except (urllib.error.URLError, TimeoutError, ConnectionError, ValueError):
        return False


def launch_profile_for_store(store: dict[str, Any]) -> None:
    port = int(store["profile_port"])
    if endpoint_ready(port):
        print(f"[browser] {store['store_tag']}: profile ready on {port}")
        return

    if port == 9222:
        cmd = ["zsh", str(CHROME_DEBUG_SCRIPT), str(port)]
    else:
        store_key = {
            9231: "store1",
            9232: "store2",
            9233: "store3",
            9234: "store4",
        }.get(port)
        if not store_key:
            raise RuntimeError(f"未配置浏览器 profile 启动脚本: port={port}")
        cmd = ["zsh", str(STORE_PROFILE_SCRIPT), store_key, str(port)]

    run(cmd)
    if not endpoint_ready(port):
        raise RuntimeError(f"{store['store_tag']} 浏览器 profile 启动后仍未就绪: port={port}")
    print(f"[browser] {store['store_tag']}: launched profile on {port}")


def ensure_browser_profiles(stores: list[dict[str, Any]]) -> None:
    for store in stores:
        launch_profile_for_store(store)


def browser_skip_reason(error: Exception) -> str:
    message = summarize_error(error)
    if "endpoint did not become ready" in message:
        return "browser profile debugging endpoint unavailable"
    if "未配置浏览器 profile 启动脚本" in message:
        return message
    return f"browser profile unavailable: {message}"


def parse_iso_date(value: str) -> date:
    return date.fromisoformat(value)


def format_us_date(value: date) -> str:
    return value.strftime("%m/%d/%Y")


def resolve_daily_target(store_state: dict) -> date:
    if store_state.get("next_increment_date"):
        return parse_iso_date(store_state["next_increment_date"])
    if store_state.get("history_stat_date"):
        return parse_iso_date(store_state["history_stat_date"]) + timedelta(days=1)
    if store_state.get("last_daily_date"):
        return parse_iso_date(store_state["last_daily_date"]) + timedelta(days=1)
    return date.today() - timedelta(days=1)


def daily_range(store_state: dict) -> tuple[str, str, str, str]:
    target = resolve_daily_target(store_state)
    return format_us_date(target), format_us_date(target), target.isoformat(), f"{target.isoformat()}单日"


def normalize_key(store_tag: str) -> str:
    mapping = {
        "Letme Home Living": "letme",
        "STYPRO.ID": "stypro",
        "spar.co jewelry": "sparco",
        "Icyee Indonesia": "icyee",
    }
    return mapping[store_tag]


def normalize_manifest_date(value: str) -> str:
    text = (value or "").strip()
    if not text:
        return date.today().isoformat()
    if "/" in text:
        month, day_value, year = text.split("/")
        return f"{year}-{month.zfill(2)}-{day_value.zfill(2)}"
    return text


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run TikTok shop sync pipeline.")
    parser.add_argument("--mode", choices=["auto", "daily"], default="auto")
    parser.add_argument("--stores", nargs="*", help="可选：只跑指定 store_tag")
    parser.add_argument("--skip-rebuild", action="store_true")
    parser.add_argument("--force-rebuild", action="store_true")
    return parser.parse_args()


def summarize_error(error: Exception) -> str:
    text = str(error).strip()
    return text or error.__class__.__name__


def parse_skip_message(message: str) -> tuple[str, str] | None:
    marker = "__SKIP__:"
    if marker not in message:
        return None
    payload = message.split(marker, 1)[1].strip()
    first_line = payload.splitlines()[0].strip()
    reason, _, detail = first_line.partition(":")
    reason = reason.strip() or "unknown"
    detail = detail.strip() or reason
    return reason, detail


def pipeline_summary(state: dict[str, Any]) -> dict[str, Any]:
    stores = state.get("stores", {})
    success = 0
    waiting = 0
    bootstrap = 0
    skipped = 0
    failed = 0
    next_dates: list[str] = []
    failures: list[dict[str, str]] = []
    last_success_runs: list[str] = []
    for key, store_state in stores.items():
        status = store_state.get("last_status") or store_state.get("last_mode") or ""
        if store_state.get("window_status") == "waiting":
            waiting += 1
        if status == "success":
            success += 1
        elif status == "bootstrap_required":
            bootstrap += 1
        elif status == "skipped":
            skipped += 1
        elif status == "error":
            failed += 1
            failures.append(
                {
                    "store": key,
                    "message": str(store_state.get("last_error") or ""),
                }
            )
        next_date = str(store_state.get("next_increment_date") or "").strip()
        if next_date:
            next_dates.append(next_date)
        last_success_at = str(store_state.get("last_success_at") or "").strip()
        if last_success_at:
            last_success_runs.append(last_success_at)
    return {
        "success": success,
        "waiting": waiting,
        "bootstrap_required": bootstrap,
        "skipped": skipped,
        "failed": failed,
        "next_sync_date": min(next_dates) if next_dates else "",
        "failures": failures,
        "last_success_run_at": max(last_success_runs) if last_success_runs else "",
    }


def main() -> None:
    args = parse_args()
    config = load_config()
    state = load_state()

    if args.force_rebuild or (not args.skip_rebuild and not WORKBOOK_PATH.exists()):
        run(["python3", str(BUILD_SCRIPT)])

    selected = set(args.stores or [])
    selected_stores = [store for store in config["stores"] if not selected or store["store_tag"] in selected]
    run_date = date.today().isoformat()
    latest_safe_date = date.today() - timedelta(days=1)

    for store in selected_stores:
        store_tag = store["store_tag"]
        key = normalize_key(store_tag)
        store_state = state.setdefault("stores", {}).setdefault(key, {})
        store_state["last_attempt_at"] = run_date
        effective_mode = args.mode
        if effective_mode == "auto":
            effective_mode = "daily" if store_state.get("initialized") else "bootstrap_required"
        if effective_mode == "bootstrap_required":
            store_state.update(
                {
                    "initialized": False,
                    "history_imported": False,
                    "bootstrap_required": True,
                    "last_mode": "bootstrap_required",
                    "last_run_at": run_date,
                    "last_status": "bootstrap_required",
                    "window_status": "",
                    "last_error": "",
                }
            )
            print(f"[skip] {store_tag}: 尚未导入历史数据，请先执行手工历史导入，再开始每日增量。")
            continue
        if effective_mode != "daily":
            raise ValueError(f"unsupported runtime mode: {effective_mode}")
        start_date, end_date, stat_date, range_label = daily_range(store_state)
        if parse_iso_date(stat_date) > latest_safe_date:
            store_state.update(
                {
                    "last_mode": "daily_waiting",
                    "last_run_at": run_date,
                    "waiting_for_date": stat_date,
                    "window_status": "waiting",
                    "last_error": "",
                }
            )
            print(f"[skip] {store_tag}: 下一次增量日期 {stat_date} 还未到可拉取窗口，当前仅拉取到 {latest_safe_date.isoformat()}。")
            continue
        try:
            launch_profile_for_store(store)
        except Exception as error:
            reason = browser_skip_reason(error)
            store_state.update(
                {
                    "last_mode": effective_mode,
                    "last_run_at": run_date,
                    "last_status": "skipped",
                    "window_status": "",
                    "last_error": reason,
                    "last_skip_code": "browser_unavailable",
                    "last_requested_range": {"start": start_date, "end": end_date},
                }
            )
            print(f"[skip] {store_tag}: {reason}")
            continue
        try:
            video_stdout = run_capture(
                [
                    "node",
                    str(VIDEO_EXPORT_SCRIPT),
                    key,
                    start_date,
                    end_date,
                    "video",
                ]
            )
            video_manifest_path = Path(video_stdout.splitlines()[0].strip())
            video_manifest = json.loads(video_manifest_path.read_text(encoding="utf-8"))
            video_export_path = Path(video_manifest["exports"][0]["exportPath"])
            video_stat_date = normalize_manifest_date(video_manifest.get("appliedRange", {}).get("end", ""))
            run(
                [
                    "python3",
                    str(IMPORT_EXPORT_SCRIPT),
                    "--file",
                    str(video_export_path),
                    "--source",
                    "video",
                    "--store",
                    store_tag,
                    "--stat-date",
                    video_stat_date,
                    "--range-label",
                    range_label,
                ]
            )

            creator_stdout = run_capture(
                [
                    "node",
                    str(CREATOR_EXPORT_SCRIPT),
                    key,
                    start_date,
                    end_date,
                ]
            )
            creator_manifest_path = Path(creator_stdout.splitlines()[0].strip())
            creator_manifest = json.loads(creator_manifest_path.read_text(encoding="utf-8"))
            creator_export_path = Path(creator_manifest["exportPath"])
            creator_stat_date = normalize_manifest_date(creator_manifest.get("appliedRange", {}).get("end", ""))
            run(
                [
                    "python3",
                    str(IMPORT_EXPORT_SCRIPT),
                    "--file",
                    str(creator_export_path),
                    "--source",
                    "creator",
                    "--store",
                    store_tag,
                    "--stat-date",
                    creator_stat_date,
                    "--range-label",
                    range_label,
                ]
            )

            store_state.update(
                {
                    "initialized": True,
                    "history_imported": store_state.get("history_imported", False),
                    "bootstrap_required": False,
                    "last_mode": effective_mode,
                    "last_run_at": run_date,
                    "last_daily_date": stat_date,
                    "next_increment_date": (parse_iso_date(stat_date) + timedelta(days=1)).isoformat(),
                    "last_requested_range": {"start": start_date, "end": end_date},
                    "last_video_stat_date": video_stat_date,
                    "last_creator_stat_date": creator_stat_date,
                    "last_video_applied_range": video_manifest.get("appliedRange", {}),
                    "last_creator_applied_range": creator_manifest.get("appliedRange", {}),
                    "last_video_export": str(video_export_path),
                    "last_creator_export": str(creator_export_path),
                    "last_status": "success",
                    "window_status": "",
                    "last_error": "",
                    "last_success_at": run_date,
                }
            )
        except Exception as error:
            message = summarize_error(error)
            skip_detail = parse_skip_message(message)
            if skip_detail is not None:
                skip_code, skip_reason = skip_detail
                store_state.update(
                    {
                        "last_mode": effective_mode,
                        "last_run_at": run_date,
                        "last_status": "skipped",
                        "window_status": "",
                        "last_error": skip_reason,
                        "last_skip_code": skip_code,
                        "last_requested_range": {"start": start_date, "end": end_date},
                    }
                )
                print(f"[skip] {store_tag}: {skip_reason}")
                continue
            store_state.update(
                {
                    "last_mode": effective_mode,
                    "last_run_at": run_date,
                    "last_status": "error",
                    "window_status": "",
                    "last_error": message,
                    "last_requested_range": {"start": start_date, "end": end_date},
                }
            )
            print(f"[error] {store_tag}: {message}")
            continue

    state["last_pipeline_run"] = {
        "run_at": run_date,
        **pipeline_summary(state),
    }
    save_state(state)

    run(["python3", str(SYNC_SCRIPT)])
    run(["python3", str(DASHBOARD_BUILD_SCRIPT)])

    state["last_pipeline_run"] = {
        "run_at": run_date,
        **pipeline_summary(state),
        "dashboard_rebuilt": True,
    }
    save_state(state)


if __name__ == "__main__":
    main()
