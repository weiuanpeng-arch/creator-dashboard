from __future__ import annotations

import csv
import json
from datetime import date, datetime
from pathlib import Path

from openpyxl import Workbook


BASE_DIR = Path(__file__).resolve().parent
SOURCE_JSON = BASE_DIR / "data" / "creator_pool.json"
OUTPUT_JSON = BASE_DIR / "data" / "core_creator_dashboard.json"
OUTPUT_CSV = BASE_DIR / "data" / "core_creator_overview.csv"
OUTPUT_XLSX = Path("/Users/apple/Desktop/达人多次合作监控看板_填充版.xlsx")

OVERVIEW_HEADERS = [
    "达人ID",
    "达人名称",
    "平台",
    "粉丝量",
    "达人分层(L0/L1/L2/L3)",
    "达人类型",
    "历史总GMV",
    "近30天GMV",
    "最近合作日期",
    "当前合作状态",
    "近30天合作次数",
    "平均间隔天数",
    "距离上次发布天数",
    "是否出单(Y/N)",
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
    "近30天GMV",
    "最近合作日期",
    "当前合作状态",
    "近30天合作次数",
    "平均间隔天数",
    "距离上次合作天数",
    "是否出单(Y/N)",
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

IN_PROGRESS_STATUSES = {"Pending MOU", "MOU submitted", "Pending publish review", "Pending review"}


def normalize_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d")
    return str(value).strip()


def parse_date(value: str) -> date | None:
    text = normalize_text(value)
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(text[:19], fmt).date()
        except ValueError:
            continue
    return None


def split_brands(value: str) -> list[str]:
    text = normalize_text(value)
    if not text:
        return []
    return [item.strip() for item in text.replace("，", "/").split("/") if item.strip()]


def derive_level(creator: dict[str, object]) -> str:
    coop_count = int(creator.get("合作次数") or 0)
    coop_tier = normalize_text(creator.get("合作分层"))
    if coop_tier == "核心达人":
        return "L0" if coop_count >= 10 else "L1"
    if coop_count >= 5 or normalize_text(creator.get("是否复投过")) == "是":
        return "L2"
    return "L3"


def derive_creator_type(creator: dict[str, object]) -> str:
    content = normalize_text(creator.get("内容一级标签"))
    product = normalize_text(creator.get("带货一级类目"))
    if content and product and content != product:
        return f"{content} / {product}"
    return content or product


def derive_current_status(raw_status: str) -> str:
    return "在合作" if normalize_text(raw_status) in IN_PROGRESS_STATUSES else "不在合作"


def derive_order_flag(creator: dict[str, object], current_status: str) -> str:
    if normalize_text(creator.get("是否复投过")) == "是":
        return "Y"
    if normalize_text(creator.get("最近合作状态")) == "Published":
        return "Y"
    if current_status == "在合作":
        return "Y"
    return "N"


def derive_recent_30_count(last_date: date | None, today: date) -> int:
    if not last_date:
        return 0
    return 1 if (today - last_date).days <= 30 else 0


def derive_avg_gap(first_date: date | None, last_date: date | None, coop_count: int) -> str:
    if not first_date or not last_date or coop_count <= 1:
        return ""
    gap_days = (last_date - first_date).days
    if gap_days < 0:
        return ""
    return f"{round(gap_days / max(coop_count - 1, 1), 1)}"


def timeout_threshold(level: str) -> int:
    return {
        "L0": 14,
        "L1": 21,
        "L2": 30,
        "L3": 45,
    }.get(level, 30)


def derive_timeout(level: str, current_status: str, repeat_flag: str, days_since_last: str) -> str:
    if current_status == "在合作":
        return "N"
    if repeat_flag != "Y":
        return "N"
    if not days_since_last:
        return "N"
    return "Y" if int(days_since_last) > timeout_threshold(level) else "N"


def derive_priority(level: str, current_status: str, timeout_flag: str, recent_30_count: int) -> str:
    if timeout_flag == "Y":
        return "高"
    if level in {"L0", "L1"} and (current_status == "在合作" or recent_30_count > 0):
        return "高"
    if current_status == "在合作" or recent_30_count > 0:
        return "中"
    return "低"


def derive_next_action(
    level: str,
    current_status: str,
    timeout_flag: str,
    repeat_flag: str,
    recent_30_count: int,
) -> str:
    if current_status == "在合作":
        return "跟进交付和发布时间"
    if timeout_flag == "Y":
        return "优先重启复投沟通"
    if level == "L0":
        return "安排重点达人复盘"
    if repeat_flag == "Y":
        return "推进下一轮复投"
    if recent_30_count > 0:
        return "补充选品并发起合作"
    return "观察内容并建立联系"


def build_rows() -> tuple[list[dict[str, object]], list[dict[str, object]], list[dict[str, object]], list[dict[str, str]], list[str]]:
    payload = json.loads(SOURCE_JSON.read_text(encoding="utf-8"))
    creators = payload["creators"]
    today = date.today()
    overview_rows: list[dict[str, object]] = []
    record_rows: list[dict[str, object]] = []
    assumptions = [
        "达人分层采用现有合作分层与合作次数的组合映射：核心达人>=10次记为L0，其余核心达人记为L1，其余达人按合作频次归入L2/L3。",
        "近30天合作次数当前按最近合作日期做保守代理：30天内记1次，否则记0次；后续补入合作明细后可升级为真实次数。",
        "是否出单、是否超时未合作、优先级、下一步动作均为现有标签数据的运营推导值，便于先搭建核心看板，不替代真实GMV口径。",
        "粉丝量、GMV、佣金、平均交付时间等字段因当前源数据缺失，先留空保位。",
    ]

    for creator in creators:
        coop_count = int(creator.get("合作次数") or 0)
        first_date = parse_date(normalize_text(creator.get("首次合作时间")))
        last_date = parse_date(normalize_text(creator.get("最近合作时间")))
        level = derive_level(creator)
        current_status = derive_current_status(normalize_text(creator.get("最近合作状态")))
        recent_30_count = derive_recent_30_count(last_date, today)
        avg_gap = derive_avg_gap(first_date, last_date, coop_count)
        days_since_last = str((today - last_date).days) if last_date else ""
        repeat_flag = "Y" if normalize_text(creator.get("是否复投过")) == "是" else "N"
        order_flag = derive_order_flag(creator, current_status)
        timeout_flag = derive_timeout(level, current_status, repeat_flag, days_since_last)
        priority = derive_priority(level, current_status, timeout_flag, recent_30_count)
        next_action = derive_next_action(level, current_status, timeout_flag, repeat_flag, recent_30_count)
        note = normalize_text(creator.get("备注"))
        original_status = normalize_text(creator.get("最近合作状态"))
        if original_status:
            note = f"{note} | 原状态: {original_status}" if note else f"原状态: {original_status}"

        overview_row = {
            "达人ID": normalize_text(creator.get("kolId")),
            "达人名称": normalize_text(creator.get("达人昵称")) or normalize_text(creator.get("kolId")),
            "平台": normalize_text(creator.get("平台")),
            "粉丝量": "",
            "达人分层(L0/L1/L2/L3)": level,
            "达人类型": derive_creator_type(creator),
            "历史总GMV": "",
            "近30天GMV": "",
            "最近合作日期": normalize_text(creator.get("最近合作时间")),
            "当前合作状态": current_status,
            "近30天合作次数": recent_30_count,
            "平均间隔天数": avg_gap,
            "距离上次发布天数": days_since_last,
            "是否出单(Y/N)": order_flag,
            "是否进入复投(Y/N)": repeat_flag,
            "是否超时未合作": timeout_flag,
            "平均交付时间": "",
            "优先级": priority,
            "下一步动作": next_action,
            "负责人": "",
            "截止日期": "",
            "备注": note,
            "__原始数据": creator,
        }
        overview_rows.append(overview_row)

        record_rows.append(
            {
                "达人ID": overview_row["达人ID"],
                "达人名称": overview_row["达人名称"],
                "合作日期": normalize_text(creator.get("最近合作时间")),
                "产品": normalize_text(creator.get("历史合作SPU")),
                "视频链接": normalize_text(creator.get("打标依据链接")) or normalize_text(creator.get("主页链接")),
                "内容类型": normalize_text(creator.get("内容形式标签")),
                "是否出单(Y/N)": order_flag,
                "订单数": "",
                "GMV": "",
                "佣金": "",
                "是否复投(Y/N)": repeat_flag,
                "备注": note,
            }
        )

    overview_rows.sort(
        key=lambda row: (
            {"L0": 0, "L1": 1, "L2": 2, "L3": 3}.get(row["达人分层(L0/L1/L2/L3)"], 9),
            {"高": 0, "中": 1, "低": 2}.get(row["优先级"], 9),
            -int(row["近30天合作次数"] or 0),
            row["达人名称"],
        )
    )

    focus_rows = [
        {
            "达人ID": row["达人ID"],
            "达人名称": row["达人名称"],
            "平台": row["平台"],
            "粉丝量": row["粉丝量"],
            "达人分层(L0/L1/L2/L3)": row["达人分层(L0/L1/L2/L3)"],
            "达人类型": row["达人类型"],
            "历史总GMV": row["历史总GMV"],
            "近30天GMV": row["近30天GMV"],
            "最近合作日期": row["最近合作日期"],
            "当前合作状态": row["当前合作状态"],
            "近30天合作次数": row["近30天合作次数"],
            "平均间隔天数": row["平均间隔天数"],
            "距离上次合作天数": row["距离上次发布天数"],
            "是否出单(Y/N)": row["是否出单(Y/N)"],
            "是否进入复投(Y/N)": row["是否进入复投(Y/N)"],
            "是否超时未合作": row["是否超时未合作"],
            "优先级": row["优先级"],
            "下一步动作": row["下一步动作"],
            "负责人": row["负责人"],
            "截止日期": row["截止日期"],
            "备注": row["备注"],
            "__原始数据": row["__原始数据"],
        }
        for row in overview_rows
        if row["达人分层(L0/L1/L2/L3)"] in {"L0", "L1"}
    ]

    level_l1_l2 = [row for row in overview_rows if row["达人分层(L0/L1/L2/L3)"] in {"L1", "L2"}]
    coverage = (
        f"{round(sum(1 for row in level_l1_l2 if int(row['近30天合作次数']) > 0) / len(level_l1_l2) * 100, 1)}%"
        if level_l1_l2
        else "0%"
    )
    order_rows = [row for row in overview_rows if row["是否出单(Y/N)"] == "Y"]
    reinvest_rate = (
        f"{round(sum(1 for row in order_rows if row['是否进入复投(Y/N)'] == 'Y') / len(order_rows) * 100, 1)}%"
        if order_rows
        else "0%"
    )
    avg_frequency = round(
        sum(int(row["__原始数据"].get("合作次数") or 0) for row in overview_rows) / len(overview_rows), 1
    ) if overview_rows else 0
    timeout_count = sum(1 for row in overview_rows if row["是否超时未合作"] == "Y")
    category_values = {normalize_text(row["__原始数据"].get("带货一级类目")) for row in overview_rows if normalize_text(row["__原始数据"].get("带货一级类目"))}
    brand_values = {
        brand
        for row in overview_rows
        for brand in split_brands(normalize_text(row["__原始数据"].get("适配品牌")))
    }
    product_coverage = f"{len(category_values)} 个一级类目 / {len(brand_values)} 个品牌"

    metrics = [
        {"指标": "L1/L2合作覆盖率", "数值": coverage, "说明": "L1/L2中近30天有合作动作的比例", "": "当前按最近合作日期代理"},
        {"指标": "出单达人复投率", "数值": reinvest_rate, "说明": "已出单达人中进入复投的比例", "": "当前按复投字段计算"},
        {"指标": "平均合作频次", "数值": str(avg_frequency), "说明": "达人平均历史合作次数", "": "来自现有合作次数"},
        {"指标": "超时达人数量", "数值": str(timeout_count), "说明": "超过跟进阈值且未在合作的达人数量", "": "阈值按L0-L3分层"},
        {"指标": "产品覆盖率", "数值": product_coverage, "说明": "当前重点池覆盖的一级品类与品牌数", "": ""},
    ]

    return overview_rows, focus_rows, record_rows, metrics, assumptions


def export_workbook(
    overview_rows: list[dict[str, object]],
    focus_rows: list[dict[str, object]],
    record_rows: list[dict[str, object]],
    metrics: list[dict[str, str]],
) -> None:
    workbook = Workbook()
    overview_sheet = workbook.active
    overview_sheet.title = "达人总览"
    focus_sheet = workbook.create_sheet("L0_L1重点达人池")
    record_sheet = workbook.create_sheet("合作记录明细")
    metric_sheet = workbook.create_sheet("运营驾驶舱")

    overview_sheet.append(OVERVIEW_HEADERS)
    overview_sheet.append(
        ["", "", "", "", "", "标签", "", "", "", "在合作/不在合作", "", "", "", "近三条视频GMV>0 or not", "近30天gmv>最近cooperation fee", "进入复投但一周没有开始新合作", "开始合作到视频发布时长", "", "", "", "", ""]
    )
    for row in overview_rows:
        overview_sheet.append([row.get(header, "") for header in OVERVIEW_HEADERS])

    focus_sheet.append(FOCUS_HEADERS)
    for row in focus_rows:
        focus_sheet.append([row.get(header, "") for header in FOCUS_HEADERS])

    record_sheet.append(RECORD_HEADERS)
    for row in record_rows:
        record_sheet.append([row.get(header, "") for header in RECORD_HEADERS])

    metric_sheet.append(METRIC_HEADERS)
    for row in metrics:
        metric_sheet.append([row.get(header, "") for header in METRIC_HEADERS])

    for sheet in workbook.worksheets:
        for column in sheet.columns:
            width = max(len(str(cell.value or "")) for cell in column[: min(len(column), 50)]) + 2
            sheet.column_dimensions[column[0].column_letter].width = min(max(width, 10), 36)

    workbook.save(OUTPUT_XLSX)


def export_csv(overview_rows: list[dict[str, object]]) -> None:
    with OUTPUT_CSV.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=OVERVIEW_HEADERS)
        writer.writeheader()
        for row in overview_rows:
            writer.writerow({header: row.get(header, "") for header in OVERVIEW_HEADERS})


def main() -> None:
    overview_rows, focus_rows, record_rows, metrics, assumptions = build_rows()
    payload = {
        "generatedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "source": str(SOURCE_JSON),
        "assumptions": assumptions,
        "stats": {
            "overviewCount": len(overview_rows),
            "focusCount": len(focus_rows),
            "recordCount": len(record_rows),
            "highPriorityCount": sum(1 for row in overview_rows if row["优先级"] == "高"),
        },
        "overview": [
            {key: value for key, value in row.items() if not key.startswith("__")}
            for row in overview_rows
        ],
        "focusPool": [
            {key: value for key, value in row.items() if not key.startswith("__")}
            for row in focus_rows
        ],
        "records": record_rows,
        "metrics": metrics,
    }
    OUTPUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    export_csv(overview_rows)
    export_workbook(overview_rows, focus_rows, record_rows, metrics)
    print(f"Wrote {OUTPUT_JSON}")
    print(f"Wrote {OUTPUT_CSV}")
    print(f"Wrote {OUTPUT_XLSX}")


if __name__ == "__main__":
    main()
