const state = {
  search: "",
  level: "全部",
  status: "全部",
  priority: "全部",
  platform: "全部",
  activeTab: "overview",
};

const elements = {
  generatedAt: document.querySelector("#generated-at"),
  statsGrid: document.querySelector("#stats-grid"),
  assumptionList: document.querySelector("#assumption-list"),
  levelFilter: document.querySelector("#level-filter"),
  statusFilter: document.querySelector("#status-filter"),
  priorityFilter: document.querySelector("#priority-filter"),
  platformFilter: document.querySelector("#platform-filter"),
  resultTitle: document.querySelector("#result-title"),
  resultSubtitle: document.querySelector("#result-subtitle"),
  overviewBody: document.querySelector("#overview-body"),
  focusBody: document.querySelector("#focus-body"),
  recordBody: document.querySelector("#record-body"),
  metricList: document.querySelector("#metric-list"),
  searchInput: document.querySelector("#search-input"),
  tabs: document.querySelectorAll(".tab"),
  panels: document.querySelectorAll(".tab-panel"),
};

let payload;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function unique(items) {
  return [...new Set(items.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatNumber(value) {
  const num = toNumber(value);
  if (!num) return "0";
  return num.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function populateSelect(select, options) {
  select.innerHTML = "";
  ["全部", ...options].forEach((option) => {
    const node = document.createElement("option");
    node.value = option;
    node.textContent = option;
    select.appendChild(node);
  });
}

function populateFilters() {
  populateSelect(elements.levelFilter, unique(payload.overview.map((item) => item["达人分层(L0/L1/L2/L3)"])));
  populateSelect(elements.statusFilter, unique(payload.overview.map((item) => item["当前合作状态"])));
  populateSelect(elements.priorityFilter, unique(payload.overview.map((item) => item["优先级"])));
  populateSelect(elements.platformFilter, unique(payload.overview.map((item) => item["平台"])));
}

function matches(row) {
  const text = [row["达人ID"], row["达人名称"], row["备注"]].join(" ").toLowerCase();
  if (state.search && !text.includes(state.search)) return false;
  if (state.level !== "全部" && row["达人分层(L0/L1/L2/L3)"] !== state.level) return false;
  if (state.status !== "全部" && row["当前合作状态"] !== state.status) return false;
  if (state.priority !== "全部" && row["优先级"] !== state.priority) return false;
  if (state.platform !== "全部" && row["平台"] !== state.platform) return false;
  return true;
}

function filteredOverview() {
  return [...payload.overview.filter(matches)].sort((a, b) => {
    const gmvGap = toNumber(b["历史总GMV"]) - toNumber(a["历史总GMV"]);
    if (gmvGap !== 0) return gmvGap;
    const recentGap = toNumber(b["90天GMV"]) - toNumber(a["90天GMV"]);
    if (recentGap !== 0) return recentGap;
    return String(a["达人名称"] || "").localeCompare(String(b["达人名称"] || ""), "zh-CN");
  });
}

function filteredFocus() {
  const focusIds = new Set(payload.focusPool.map((item) => item["达人ID"]));
  return filteredOverview().filter((item) => focusIds.has(item["达人ID"]));
}

function filteredRecords() {
  const ids = new Set(filteredOverview().map((item) => item["达人ID"]));
  return payload.records.filter((item) => ids.has(item["达人ID"]));
}

function renderStats(rows) {
  const highPriority = rows.filter((item) => item["优先级"] === "高").length;
  const inProgress = rows.filter((item) => item["当前合作状态"] === "在合作").length;
  const focus = rows.filter((item) => ["L0", "L1"].includes(item["达人分层(L0/L1/L2/L3)"])).length;
  const timeout = rows.filter((item) => item["是否超时未合作"] === "Y").length;
  const cards = [
    { label: "当前达人", value: rows.length, note: `总池 ${payload.overview.length}` },
    { label: "高优先级", value: highPriority, note: "建议优先跟进" },
    { label: "L0/L1 数量", value: focus, note: "核心重点池" },
    { label: "超时人数", value: timeout, note: `在合作 ${inProgress}` },
  ];

  elements.statsGrid.innerHTML = cards
    .map(
      (card) => `
        <article>
          <p>${escapeHtml(card.label)}</p>
          <strong>${escapeHtml(card.value)}</strong>
          <p>${escapeHtml(card.note)}</p>
        </article>
      `,
    )
    .join("");
}

function renderAssumptions() {
  elements.assumptionList.innerHTML = payload.assumptions
    .map((item) => `<article class="assumption-item">${escapeHtml(item)}</article>`)
    .join("");
}

function renderOverview() {
  const rows = filteredOverview();
  elements.resultTitle.textContent = `${rows.length} 个核心监控达人`;
  elements.resultSubtitle.textContent = `按同步版工作簿生成，当前视图：${state.activeTab}`;
  if (!rows.length) {
    elements.overviewBody.innerHTML = '<tr><td colspan="8"><div class="empty-state">当前筛选下没有匹配达人。</div></td></tr>';
    return;
  }
  elements.overviewBody.innerHTML = rows
    .map((row) => {
      const url = row["达人ID"] ? `https://www.tiktok.com/@${encodeURIComponent(String(row["达人ID"]).replace(/^@+/, ""))}` : "";
      return `
        <tr>
          <td>
            <div class="creator-name">
              <a class="creator-link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(row["达人名称"])}</a>
              <span>@${escapeHtml(row["达人ID"])}</span>
            </div>
          </td>
          <td><span class="pill">${escapeHtml(row["达人分层(L0/L1/L2/L3)"])}</span></td>
          <td><span class="pill ${row["当前合作状态"] === "在合作" ? "is-warm" : "is-muted"}">${escapeHtml(row["当前合作状态"])}</span></td>
          <td>${escapeHtml(formatNumber(row["历史总GMV"]))}</td>
          <td>${escapeHtml(formatNumber(row["90天GMV"]))}</td>
          <td><span class="pill ${row["优先级"] === "高" ? "is-warm" : row["优先级"] === "中" ? "" : "is-muted"}">${escapeHtml(row["优先级"])}</span></td>
          <td>${escapeHtml(row["是否进入复投(Y/N)"])}</td>
          <td>${escapeHtml(row["下一步动作"])}</td>
          <td>${escapeHtml(row["备注"])}</td>
        </tr>
      `;
    })
    .join("");
}

function renderFocus() {
  const rows = filteredFocus();
  if (!rows.length) {
    elements.focusBody.innerHTML = '<tr><td colspan="7"><div class="empty-state">当前筛选下没有 L0/L1 达人。</div></td></tr>';
    return;
  }
  elements.focusBody.innerHTML = rows
    .map((row) => `
      <tr>
        <td>${escapeHtml(row["达人名称"])}</td>
        <td><span class="pill">${escapeHtml(row["达人分层(L0/L1/L2/L3)"])}</span></td>
        <td>${escapeHtml(row["平台"])}</td>
        <td>${escapeHtml(formatNumber(row["历史总GMV"]))}</td>
        <td>${escapeHtml(row["当前合作状态"])}</td>
        <td><span class="pill is-warm">${escapeHtml(row["优先级"])}</span></td>
        <td>${escapeHtml(row["下一步动作"])}</td>
      </tr>
    `)
    .join("");
}

function renderRecords() {
  const rows = filteredRecords();
  if (!rows.length) {
    elements.recordBody.innerHTML = '<tr><td colspan="7"><div class="empty-state">当前筛选下没有合作摘要。</div></td></tr>';
    return;
  }
  elements.recordBody.innerHTML = rows
    .map((row) => `
      <tr>
        <td>${escapeHtml(row["达人名称"])}</td>
        <td>${escapeHtml(row["合作日期"]) || "-"}</td>
        <td>${escapeHtml(row["产品"]) || "-"}</td>
        <td>${escapeHtml(row["内容类型"]) || "-"}</td>
        <td>${escapeHtml(row["是否出单(Y/N)"])}</td>
        <td>${escapeHtml(row["是否复投(Y/N)"])}</td>
        <td>${row["视频链接"] ? `<a class="creator-link" href="${escapeHtml(row["视频链接"])}" target="_blank" rel="noreferrer noopener">查看</a>` : "-"}</td>
      </tr>
    `)
    .join("");
}

function renderMetrics() {
  elements.metricList.innerHTML = payload.metrics
    .map(
      (row) => `
        <article class="metric-card">
          <p class="metric-card__eyebrow">${escapeHtml(row["指标"])}</p>
          <strong>${escapeHtml(row["数值"])}</strong>
          <p>${escapeHtml(row["说明"])}</p>
          <p class="subtle">${escapeHtml(row[""] || "")}</p>
        </article>
      `,
    )
    .join("");
}

function render() {
  const rows = filteredOverview();
  renderStats(rows);
  renderOverview();
  renderFocus();
  renderRecords();
  renderMetrics();
}

function setupTabs() {
  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      state.activeTab = tab.dataset.tab;
      elements.tabs.forEach((item) => item.classList.toggle("is-active", item === tab));
      elements.panels.forEach((panel) => panel.classList.toggle("is-active", panel.dataset.panel === state.activeTab));
      render();
    });
  });
}

function setupFilters() {
  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    render();
  });
  [
    ["levelFilter", "level"],
    ["statusFilter", "status"],
    ["priorityFilter", "priority"],
    ["platformFilter", "platform"],
  ].forEach(([key, stateKey]) => {
    elements[key].addEventListener("change", (event) => {
      state[stateKey] = event.target.value;
      render();
    });
  });
}

async function init() {
  if (window.__CORE_CREATOR_DASHBOARD__) {
    payload = window.__CORE_CREATOR_DASHBOARD__;
  } else {
    const response = await fetch(`./data/core_creator_dashboard.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`加载失败：${response.status}`);
    }
    payload = await response.json();
  }
  elements.generatedAt.textContent = `数据生成时间 ${payload.generatedAt}`;
  populateFilters();
  renderAssumptions();
  setupTabs();
  setupFilters();
  render();
}

init().catch((error) => {
  elements.generatedAt.textContent = "数据加载失败";
  elements.overviewBody.innerHTML = '<tr><td colspan="8"><div class="empty-state">核心看板加载失败，请稍后重试。</div></td></tr>';
  console.error(error);
});
