from __future__ import annotations

import csv
import json
from datetime import datetime
from pathlib import Path

from openpyxl import load_workbook


BASE_DIR = Path(__file__).resolve().parent
WORKBOOK_PATH = Path("/Users/apple/Desktop/达人多次合作监控看板_同步版.xlsx")
OUTPUT_JSON = BASE_DIR / "data" / "core_creator_dashboard.json"
OUTPUT_CSV = BASE_DIR / "data" / "core_creator_overview.csv"
OUTPUT_JS = BASE_DIR / "data" / "core_creator_dashboard.js"

OVERVIEW_HEADERS = [
    "达人ID",
    "达人名称",
    "平台",
    "粉丝量",
    "达人分层(L0/L1/L2/L3)",
    "达人类型",
    "历史总GMV",
    "90天GMV",
    "近30天发布视频gmv",
    "最近合作日期",
    "当前合作状态",
    "近30天合作次数",
    "平均间隔天数",
    "距离上次发布天数",
    "近30天是否出单(Y/N)",
    "是否进入复投(Y/N)",
    "是否超时未合作",
    "平均交付时间",
    "优先级",
    "下一步动作",
    "负责人",
    "截止日期",
    "备注",
]

FOCUS_HEADERS = [
    "达人ID",
    "达人名称",
    "平台",
    "粉丝量",
    "达人分层(L0/L1/L2/L3)",
    "达人类型",
    "历史总GMV",
    "90天GMV",
    "最近合作日期",
    "当前合作状态",
    "近30天合作次数",
    "平均间隔天数",
    "距离上次发布天数",
    "近30天是否出单(Y/N)",
    "是否进入复投(Y/N)",
    "是否超时未合作",
    "优先级",
    "下一步动作",
    "负责人",
    "截止日期",
    "备注",
]

RECORD_HEADERS = [
    "达人ID",
    "达人名称",
    "合作日期",
    "产品",
    "视频链接",
    "内容类型",
    "是否出单(Y/N)",
    "订单数",
    "GMV",
    "佣金",
    "是否复投(Y/N)",
    "备注",
]

METRIC_HEADERS = ["指标", "数值", "说明", ""]


def normalize_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d")
    return str(value).strip()


def sheet_headers(worksheet) -> list[str]:
    return [normalize_text(cell.value) for cell in worksheet[1]]


def read_sheet_rows(worksheet, start_row: int, key_field: str) -> list[dict[str, object]]:
    headers = sheet_headers(worksheet)
    rows: list[dict[str, object]] = []
    for row in worksheet.iter_rows(min_row=start_row, values_only=True):
        record = {headers[index]: value for index, value in enumerate(row) if index < len(headers)}
        if not normalize_text(record.get(key_field)):
            continue
        rows.append(record)
    return rows


def read_metrics(worksheet) -> list[dict[str, str]]:
    headers = sheet_headers(worksheet)
    metrics: list[dict[str, str]] = []
    for row in worksheet.iter_rows(min_row=2, values_only=True):
        record = {headers[index]: normalize_text(value) for index, value in enumerate(row) if index < len(headers)}
        if not record.get("指标"):
            continue
        metrics.append(record)
    return metrics


def build_payload() -> dict[str, object]:
    workbook = load_workbook(WORKBOOK_PATH, read_only=True, data_only=True)

    overview_rows = read_sheet_rows(workbook["达人总览"], start_row=4, key_field="达人ID")
    focus_rows = [
        {header: row.get(header, "") for header in FOCUS_HEADERS}
        for row in overview_rows
        if normalize_text(row.get("达人分层(L0/L1/L2/L3)")) in {"L0", "L1"}
    ]
    record_rows = [
        {header: row.get(header, "") for header in RECORD_HEADERS}
        for row in read_sheet_rows(workbook["合作记录明细"], start_row=2, key_field="达人ID")
    ]
    metrics = read_metrics(workbook["运营驾驶舱"])

    assumptions = [
        "当前网页直接读取同步版工作簿，不再使用旧的达人标签库 JSON 作为数据源。",
        "基线数据来自 4 个店铺 2026-02-22 至 2026-03-24 的月度导出；后续从 2026-03-25 起按日增量追加。",
        "GMV 类字段来自 Videos 明细聚合回填；Creator 导出主要用于达人映射、达人级补数与后续数据库补数预留。",
        "店铺在事实层保留为标签字段，网页总览继续按统一达人 ID 聚合展示，避免同一达人被四店铺重复计数。",
    ]

    stats = {
        "overviewCount": len(overview_rows),
        "focusCount": len(focus_rows),
        "recordCount": len(record_rows),
        "highPriorityCount": sum(1 for row in overview_rows if normalize_text(row.get("优先级")) == "高"),
    }

    return {
        "generatedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "source": str(WORKBOOK_PATH),
        "assumptions": assumptions,
        "stats": stats,
        "overview": [{header: row.get(header, "") for header in OVERVIEW_HEADERS} for row in overview_rows],
        "focusPool": focus_rows,
        "records": record_rows,
        "metrics": metrics,
    }


def export_csv(overview_rows: list[dict[str, object]]) -> None:
    with OUTPUT_CSV.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=OVERVIEW_HEADERS)
        writer.writeheader()
        for row in overview_rows:
            writer.writerow({header: row.get(header, "") for header in OVERVIEW_HEADERS})


def main() -> None:
    payload = build_payload()
    OUTPUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    OUTPUT_JS.write_text(
        "window.__CORE_CREATOR_DASHBOARD__ = "
        + json.dumps(payload, ensure_ascii=False, indent=2)
        + ";\n",
        encoding="utf-8",
    )
    export_csv(payload["overview"])
    print(f"Wrote {OUTPUT_JSON}")
    print(f"Wrote {OUTPUT_JS}")
    print(f"Wrote {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
