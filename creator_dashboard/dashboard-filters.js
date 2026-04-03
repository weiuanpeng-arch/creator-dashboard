import { splitMultiValue, unique } from "./dashboard-data.js";

export function createFilterState() {
  return {
    activeTab: "gmv",
    quickFilter: "all",
    search: "",
    brandTag: "全部",
    level: "全部",
    status: "全部",
    priority: "全部",
    platform: "全部",
    repurchase: "全部",
    recordSearch: "",
    recordStore: "全部店铺",
    gmvPage: 1,
    focusPage: 1,
  };
}

export function normalizeTabForToolbar(tab) {
  return tab || "gmv";
}

export function buildCreatorFilterOptions(model) {
  const creatorRows = [...model.gmvRows, ...model.focusRows];
  const recordStores = unique(model.records.map((row) => row.__storeLabel)).filter(Boolean);
  return {
    brandTags: unique(creatorRows.flatMap((row) => splitMultiValue(row["品牌标签"]))),
    levels: unique(creatorRows.map((row) => row["达人分层(L0/L1/L2/L3)"])),
    statuses: unique(creatorRows.map((row) => row["当前合作状态"])),
    priorities: unique(creatorRows.map((row) => row["优先级"])),
    platforms: unique(creatorRows.map((row) => row["平台"])),
    recordStores,
  };
}

function matchesCommonCreatorFilters(row, state) {
  const searchable = [row["达人ID"], row["达人名称"], row["备注"], row["下一步动作"], row["负责人"]]
    .join(" ")
    .toLowerCase();
  if (state.search && !searchable.includes(state.search)) return false;
  if (state.brandTag !== "全部" && !splitMultiValue(row["品牌标签"]).includes(state.brandTag)) return false;
  if (state.level !== "全部" && String(row["达人分层(L0/L1/L2/L3)"] || "") !== state.level) return false;
  if (state.status !== "全部" && String(row["当前合作状态"] || "") !== state.status) return false;
  if (state.priority !== "全部" && String(row["优先级"] || "") !== state.priority) return false;
  if (state.platform !== "全部" && String(row["平台"] || "") !== state.platform) return false;
  if (state.repurchase !== "全部" && String(row["是否进入复投(Y/N)"] || "") !== state.repurchase) return false;
  return true;
}

function matchesQuickFilter(row, state) {
  if (state.quickFilter === "all") return true;
  if (state.quickFilter === "overdue") return row.__flags?.overdue;
  if (state.quickFilter === "reinvest") return row.__flags?.reinvest;
  if (state.quickFilter === "sold30") return row.__flags?.sold30;
  return true;
}

export function filterCreatorRows(rows, state) {
  return rows.filter((row) => matchesCommonCreatorFilters(row, state) && matchesQuickFilter(row, state));
}

export function filterRecordRows(rows, state) {
  return rows.filter((row) => {
    const searchable = [row["达人名称"], row["达人ID"], row["产品"], row["备注"], row["内容类型"]]
      .join(" ")
      .toLowerCase();
    if (state.recordSearch && !searchable.includes(state.recordSearch)) return false;
    if (state.recordStore !== "全部店铺" && String(row.__storeLabel || "") !== state.recordStore) return false;
    return true;
  });
}

export function paginateRows(rows, page, pageSize) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    total,
    totalPages,
    page: safePage,
    start,
    end: Math.min(start + pageSize, total),
    rows: rows.slice(start, start + pageSize),
  };
}
