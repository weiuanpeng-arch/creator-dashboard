from __future__ import annotations

import argparse
import csv
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
CREATOR_CSV = DATA_DIR / "normalized" / "creator_performance.csv"
VIDEO_CSV = DATA_DIR / "normalized" / "video_performance.csv"

DEFAULT_SUPABASE_URL = "https://sbznfjnsirajqkkcwayj.supabase.co"
DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_tM67K7Mi1qDUkemhgzDuGg_dsdwitBT"

CREATOR_TABLE = "tiktok_creator_performance_raw"
VIDEO_TABLE = "tiktok_video_performance_raw"

CREATOR_FIELD_MAP = {
    "抓取日期": "crawl_date",
    "统计日期": "stat_date",
    "店铺": "store_tag",
    "平台": "platform",
    "来源": "source_view",
    "时间范围": "range_label",
    "达人名称": "creator_name",
    "达人主页标识": "creator_handle",
    "统一达人键": "creator_key",
    "Affiliate-attributed GMV": "affiliate_gmv",
    "Attributed orders": "attributed_orders",
    "Affiliate-attributed items sold": "items_sold",
    "Refunds": "refunds",
    "Items refunded": "items_refunded",
    "AOV": "aov",
    "Est. commission": "est_commission",
    "Videos": "videos",
    "LIVE streams": "live_streams",
    "Avg. daily products sold": "avg_daily_products_sold",
    "Samples shipped": "samples_shipped",
    "数据批次ID": "batch_id",
    "原文件名": "source_file",
    "备注": "note",
}

VIDEO_FIELD_MAP = {
    "抓取日期": "crawl_date",
    "统计日期": "stat_date",
    "店铺": "store_tag",
    "平台": "platform",
    "来源": "source_view",
    "时间范围": "range_label",
    "达人名称": "creator_name",
    "达人主页标识": "creator_handle",
    "统一达人键": "creator_key",
    "Video title": "video_title",
    "Video ID": "video_id",
    "Post date": "post_date",
    "Video link": "video_link",
    "Product name": "product_name",
    "Product ID": "product_id",
    "Affiliate video-attributed GMV": "affiliate_video_gmv",
    "Video-attributed orders": "video_orders",
    "AOV": "aov",
    "Avg. GMV per customer": "avg_gmv_per_customer",
    "Video-attributed items sold": "items_sold",
    "Refunds": "refunds",
    "Items refunded": "items_refunded",
    "Est. commission": "est_commission",
    "数据批次ID": "batch_id",
    "原文件名": "source_file",
    "备注": "note",
}


def env_default(name: str, fallback: str = "") -> str:
    value = os.environ.get(name, "").strip()
    return value or fallback


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync normalized TikTok CSVs into Supabase REST tables.")
    parser.add_argument("--supabase-url", default=env_default("SUPABASE_URL", DEFAULT_SUPABASE_URL))
    parser.add_argument("--anon-key", default=env_default("SUPABASE_ANON_KEY", DEFAULT_SUPABASE_ANON_KEY))
    parser.add_argument("--creator-file", default=str(CREATOR_CSV))
    parser.add_argument("--video-file", default=str(VIDEO_CSV))
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--ping-only", action="store_true")
    return parser.parse_args()


def load_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def map_row(row: dict[str, str], field_map: dict[str, str]) -> dict[str, str]:
    return {target: str(row.get(source, "") or "") for source, target in field_map.items()}


def build_headers(anon_key: str, extra: dict[str, str] | None = None) -> dict[str, str]:
    headers = {
        "apikey": anon_key,
        "Authorization": f"Bearer {anon_key}",
        "Accept": "application/json",
    }
    if extra:
        headers.update(extra)
    return headers


def rest_request(
    supabase_url: str,
    anon_key: str,
    path: str,
    *,
    method: str = "GET",
    payload: object | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[int, str, dict[str, str]]:
    request_headers = build_headers(anon_key, headers)
    body = None
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(
        f"{supabase_url.rstrip('/')}/rest/v1{path}",
        data=body,
        headers=request_headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            text = response.read().decode("utf-8", "ignore")
            return response.status, text, dict(response.headers.items())
    except urllib.error.HTTPError as exc:
        text = exc.read().decode("utf-8", "ignore")
        return exc.code, text, dict(exc.headers.items())


def check_table(supabase_url: str, anon_key: str, table_name: str) -> dict[str, object]:
    status, body, headers = rest_request(
        supabase_url,
        anon_key,
        f"/{table_name}?select=id&limit=1",
        headers={"Range-Unit": "items", "Range": "0-0"},
    )
    return {"status": status, "body": body[:300], "headers": headers}


def insert_batches(
    supabase_url: str,
    anon_key: str,
    table_name: str,
    rows: list[dict[str, str]],
    batch_size: int,
) -> dict[str, object]:
    if not rows:
        return {
            "attempted": 0,
            "batches": 0,
            "success": True,
            "status_codes": [],
            "error": "",
        }

    status_codes: list[int] = []
    for start in range(0, len(rows), batch_size):
        batch = rows[start : start + batch_size]
        status, body, _headers = rest_request(
            supabase_url,
            anon_key,
            f"/{table_name}",
            method="POST",
            payload=batch,
            headers={
                "Prefer": "resolution=ignore-duplicates,return=minimal",
            },
        )
        status_codes.append(status)
        if status >= 400:
            return {
                "attempted": len(rows),
                "batches": len(status_codes),
                "success": False,
                "status_codes": status_codes,
                "error": body[:1000],
            }
    return {
        "attempted": len(rows),
        "batches": len(status_codes),
        "success": True,
        "status_codes": status_codes,
        "error": "",
    }


def main() -> None:
    args = parse_args()
    supabase_url = args.supabase_url.rstrip("/")
    anon_key = args.anon_key.strip()
    if not supabase_url or not anon_key:
        print(
            json.dumps(
                {
                    "connected": False,
                    "error": "Missing SUPABASE_URL or SUPABASE_ANON_KEY",
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        raise SystemExit(1)

    creator_table_status = check_table(supabase_url, anon_key, CREATOR_TABLE)
    video_table_status = check_table(supabase_url, anon_key, VIDEO_TABLE)
    connected = creator_table_status["status"] != 401 and video_table_status["status"] != 401
    tables_ready = creator_table_status["status"] < 400 and video_table_status["status"] < 400
    table_status = {
        CREATOR_TABLE: creator_table_status,
        VIDEO_TABLE: video_table_status,
    }

    if args.ping_only:
        print(
            json.dumps(
                {
                    "connected": connected,
                    "tables_ready": tables_ready,
                    "supabase_url": supabase_url,
                    "table_status": table_status,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        raise SystemExit(0 if connected else 1)

    if not tables_ready:
        print(
            json.dumps(
                {
                    "connected": connected,
                    "tables_ready": False,
                    "supabase_url": supabase_url,
                    "table_status": table_status,
                    "error": "Raw tables are not ready for REST writes",
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        raise SystemExit(1)

    creator_rows = [map_row(row, CREATOR_FIELD_MAP) for row in load_rows(Path(args.creator_file))]
    video_rows = [map_row(row, VIDEO_FIELD_MAP) for row in load_rows(Path(args.video_file))]

    creator_result = insert_batches(supabase_url, anon_key, CREATOR_TABLE, creator_rows, args.batch_size)
    if not creator_result["success"]:
        print(
            json.dumps(
                {
                    "connected": connected,
                    "tables_ready": True,
                    "supabase_url": supabase_url,
                    "table_status": table_status,
                    "creator_rows_attempted": len(creator_rows),
                    "video_rows_attempted": len(video_rows),
                    "creator_rows_inserted": None,
                    "video_rows_inserted": None,
                    "error": creator_result["error"],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        raise SystemExit(1)

    video_result = insert_batches(supabase_url, anon_key, VIDEO_TABLE, video_rows, args.batch_size)
    if not video_result["success"]:
        print(
            json.dumps(
                {
                    "connected": connected,
                    "tables_ready": True,
                    "supabase_url": supabase_url,
                    "table_status": table_status,
                    "creator_rows_attempted": len(creator_rows),
                    "video_rows_attempted": len(video_rows),
                    "creator_rows_inserted": creator_result["attempted"],
                    "video_rows_inserted": None,
                    "error": video_result["error"],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        raise SystemExit(1)

    print(
        json.dumps(
            {
                "connected": connected,
                "tables_ready": True,
                "supabase_url": supabase_url,
                "table_status": table_status,
                "creator_rows_attempted": len(creator_rows),
                "video_rows_attempted": len(video_rows),
                "creator_rows_inserted": creator_result["attempted"],
                "video_rows_inserted": video_result["attempted"],
                "error": "",
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
