export const CORE_COLUMNS = [
  "达人",
  "平台",
  "粉丝量",
  "达人分层",
  "达人类型",
  "品牌标签",
  "历史总GMV",
  "90天GMV",
  "近30天视频GMV",
  "合作状态",
  "近30天合作次数",
  "距上次发布",
  "超时未合作",
  "是否复投",
  "优先级",
  "负责人",
  "下一步动作",
  "截止日期",
  "备注",
];

export const FOCUS_EXTRA_COLUMNS = ["是否在GMV池", "为何未进GMV池"];

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function splitMultiValue(value) {
  return String(value || "")
    .split(/\s*\/\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "zh-CN"));
}

export function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function formatNumber(value) {
  const num = toNumber(value);
  if (!num) return "0";
  return Math.round(num).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

export function formatFollowerCount(value) {
  const text = String(value || "").trim();
  if (!text) return "-";
  return formatNumber(text);
}

export function getCreatorKey(row) {
  return String(row["统一达人键"] || row["达人ID"] || "").trim();
}

export function getProfileUrl(row) {
  const explicit = String(row["主页链接"] || "").trim();
  if (explicit) return explicit;
  const raw = String(row["达人ID"] || "").trim().replace(/^@+/, "");
  return raw ? `https://www.tiktok.com/@${encodeURIComponent(raw)}` : "";
}

function normalizeOverrideValue(remote = {}, local = {}, label) {
  return String(local[label] || remote[label] || "").trim();
}

function mergeRowOverrides(row, remote = {}, local = {}) {
  return {
    ...row,
    优先级: normalizeOverrideValue(remote, local, "优先级") || String(row["优先级"] || "").trim(),
    下一步动作: normalizeOverrideValue(remote, local, "下一步动作") || String(row["下一步动作"] || "").trim(),
    负责人: normalizeOverrideValue(remote, local, "负责人") || String(row["负责人"] || "").trim(),
    截止日期: normalizeOverrideValue(remote, local, "截止日期") || String(row["截止日期"] || "").trim(),
    备注: normalizeOverrideValue(remote, local, "备注") || String(row["备注"] || "").trim(),
    复投产品链接: normalizeOverrideValue(remote, local, "复投产品链接"),
    复投产品PID: normalizeOverrideValue(remote, local, "复投产品PID"),
  };
}

function computeCreatorDecorations(row, gmvPoolSet) {
  const creatorKey = getCreatorKey(row);
  const gmv90 = toNumber(row["90天GMV"]);
  const inGmvPool = gmvPoolSet.has(creatorKey);
  const overdue = String(row["是否超时未合作"] || "").trim() === "Y";
  const reinvest = String(row["是否进入复投(Y/N)"] || "").trim() === "Y";
  const sold30 = String(row["近30天是否出单(Y/N)"] || "").trim() === "Y";
  const brandTags = splitMultiValue(row["品牌标签"]);
  return {
    ...row,
    __creatorKey: creatorKey,
    __profileUrl: getProfileUrl(row),
    __brandTags: brandTags,
    __inGmvPool: inGmvPool,
    __whyNotInGmv: inGmvPool ? "" : gmv90 > 0 ? "符合规则但未命中池快照" : "90天GMV=0，不满足入池规则（90天GMV>0）",
    __storeLabel: brandTags[0] || "",
    __flags: {
      overdue,
      reinvest,
      sold30,
    },
  };
}

function buildRecordStoreMap(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const creatorId = String(row["达人ID"] || "").trim();
    if (!creatorId) return;
    const storeLabel = splitMultiValue(row["品牌标签"])[0] || "";
    if (storeLabel && !map.has(creatorId)) {
      map.set(creatorId, storeLabel);
    }
  });
  return map;
}

function sortCreators(rows) {
  return [...rows].sort((a, b) => {
    const historyGap = toNumber(b["历史总GMV"]) - toNumber(a["历史总GMV"]);
    if (historyGap !== 0) return historyGap;
    const recentGap = toNumber(b["90天GMV"]) - toNumber(a["90天GMV"]);
    if (recentGap !== 0) return recentGap;
    return String(a["达人名称"] || "").localeCompare(String(b["达人名称"] || ""), "zh-CN");
  });
}

function sortRecords(rows) {
  return [...rows].sort((a, b) => String(b["合作日期"] || "").localeCompare(String(a["合作日期"] || "")));
}

export async function loadDashboardPayload() {
  const response = await fetch(`./data/core_creator_dashboard.json?ts=${Date.now()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`加载看板数据失败：${response.status}`);
  }
  return response.json();
}

export function buildDashboardModel({ payload, remoteCoreOverridesById, localCoreOverridesById }) {
  const gmvPoolIds = new Set((payload.gmvFocusPool || []).map((row) => getCreatorKey(row)));
  const mergedGmvRows = sortCreators(
    (payload.gmvFocusPool || []).map((row) =>
      computeCreatorDecorations(
        mergeRowOverrides(
          row,
          remoteCoreOverridesById[getCreatorKey(row)] || {},
          localCoreOverridesById[getCreatorKey(row)] || {}
        ),
        gmvPoolIds
      )
    )
  );
  const mergedFocusRows = sortCreators(
    (payload.focusPool || []).map((row) =>
      computeCreatorDecorations(
        mergeRowOverrides(
          row,
          remoteCoreOverridesById[getCreatorKey(row)] || {},
          localCoreOverridesById[getCreatorKey(row)] || {}
        ),
        gmvPoolIds
      )
    )
  );

  const recordStoreMap = buildRecordStoreMap([...mergedGmvRows, ...mergedFocusRows, ...(payload.overview || [])]);
  const records = sortRecords(
    (payload.records || []).map((row, index) => ({
      ...row,
      __recordKey: `${row["达人ID"] || "row"}-${row["合作日期"] || index}-${index}`,
      __storeLabel: recordStoreMap.get(String(row["达人ID"] || "").trim()) || "",
    }))
  );

  const rowById = new Map();
  [...mergedGmvRows, ...mergedFocusRows].forEach((row) => {
    rowById.set(getCreatorKey(row), row);
  });

  return {
    gmvRows: mergedGmvRows,
    focusRows: mergedFocusRows,
    records,
    rowById,
    gmvPoolIds,
  };
}

export function buildStatusItems(syncHealth = {}) {
  return [
    { label: "最新单店更新到", value: syncHealth.latestDataDate || "-", note: "四店中任一店铺的最新完成日期" },
    { label: "四店统一更新到", value: syncHealth.allStoresSyncedThrough || "-", note: "四店共同覆盖到的最新日期" },
    { label: "当前待同步日期", value: syncHealth.nextSyncDate || "-", note: syncHealth.summary || "等待下一次同步窗口" },
    { label: "采集入库状态", value: syncHealth.dataSyncStatus || "-", note: syncHealth.dataSyncNote || "浏览器拉起、导出、入库状态" },
    { label: "页面重建状态", value: syncHealth.rebuildStatus || "-", note: syncHealth.rebuildNote || "页面快照与工作簿生成状态" },
  ];
}

export function buildSummaryCards({ stats = {}, activeTab, filteredCounts }) {
  const currentCount =
    activeTab === "focus"
      ? filteredCounts.focusRows?.length || 0
      : activeTab === "records"
        ? filteredCounts.records?.length || 0
        : filteredCounts.gmvRows?.length || 0;
  return [
    {
      label: "全量池数量",
      value: stats.overviewCount || 0,
      note: "后台统计用 · 前台不渲染明细",
    },
    {
      label: "GMV重点池人数",
      value: stats.gmvFocusCount || filteredCounts.gmvRows?.length || 0,
      note: "规则：90天GMV > 0 · 动态池",
    },
    {
      label: "189重点达人池",
      value: stats.focusCount || filteredCounts.focusRows?.length || 0,
      note: "固定种子池 · 不重打标签",
    },
    {
      label: "当前筛选结果",
      value: currentCount,
      note: activeTab === "records" ? "当前合作记录视图命中数" : "当前页签筛选后命中数",
    },
  ];
}

export function buildMetricNotes(metrics = []) {
  return metrics.map((row) => ({
    title: String(row["指标"] || "").trim(),
    value: String(row["数值"] || "").trim(),
    note: String(row["说明"] || "").trim(),
    extra: String(row[""] || "").trim(),
  }));
}

export function buildAssumptionNotes(assumptions = []) {
  return assumptions.map((item) => String(item || "").trim()).filter(Boolean);
}
