import { CORE_COLUMNS, FOCUS_EXTRA_COLUMNS, escapeHtml, formatFollowerCount, formatNumber, splitMultiValue } from "./dashboard-data.js";

function toneForStatus(value) {
  const text = String(value || "");
  if (/成功|正常|active|connected|已连接/i.test(text)) return "ok";
  if (/失败|error|超时|未合作/i.test(text)) return "danger";
  if (/进行中|running|等待|pending|skipped/i.test(text)) return "warn";
  return "neutral";
}

function renderPill(text, tone = "neutral") {
  if (!text) return "-";
  return `<span class="pill pill--${tone}">${escapeHtml(text)}</span>`;
}

function renderBrandPills(value) {
  const tags = splitMultiValue(value);
  if (!tags.length) return "-";
  return tags.map((tag) => `<span class="pill pill--brand">${escapeHtml(tag)}</span>`).join("");
}

function renderCreatorCell(row) {
  return `
    <div class="creator-cell">
      <a class="creator-link" href="${escapeHtml(row.__profileUrl || "#")}" target="_blank" rel="noreferrer noopener">${escapeHtml(
        row["达人名称"] || "-"
      )}</a>
      <span class="creator-cell__meta">${escapeHtml(row["达人ID"] || "-")}</span>
    </div>
  `;
}

function renderCollabStatus(row) {
  const status = String(row["当前合作状态"] || "").trim();
  if (row.__flags?.overdue) return renderPill("超时未合作", "danger");
  if (row.__flags?.reinvest) return renderPill("复投中", "info");
  if (status === "在合作") return renderPill("合作中", "ok");
  if (status) return renderPill(status, "neutral");
  return renderPill("待跟进", "warn");
}

function renderDaysCell(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  if (num > 30) return `<span class="metric-text metric-text--danger">${escapeHtml(value)}</span>`;
  if (num > 15) return `<span class="metric-text metric-text--warn">${escapeHtml(value)}</span>`;
  return escapeHtml(value);
}

function renderRemarkCell(value) {
  const text = String(value || "").trim();
  if (!text) return "-";
  const summary = text.length > 18 ? `${text.slice(0, 18)}...` : text;
  return `
    <details class="remark-toggle">
      <summary>${escapeHtml(summary)}</summary>
      <div class="remark-toggle__content">${escapeHtml(text)}</div>
    </details>
  `;
}

function renderCreatorValue(column, row) {
  switch (column) {
    case "达人":
      return renderCreatorCell(row);
    case "平台":
      return escapeHtml(row["平台"] || "-");
    case "粉丝量":
      return escapeHtml(formatFollowerCount(row["粉丝量"]));
    case "达人分层":
      return renderPill(row["达人分层(L0/L1/L2/L3)"] || "-", "tier");
    case "达人类型":
      return escapeHtml(row["达人类型"] || "-");
    case "品牌标签":
      return renderBrandPills(row["品牌标签"]);
    case "历史总GMV":
      return escapeHtml(formatNumber(row["历史总GMV"]));
    case "90天GMV":
      return escapeHtml(formatNumber(row["90天GMV"]));
    case "近30天视频GMV":
      return escapeHtml(formatNumber(row["近30天发布视频gmv"]));
    case "合作状态":
      return renderCollabStatus(row);
    case "近30天合作次数":
      return escapeHtml(row["近30天合作次数"] || "-");
    case "距上次发布":
      return renderDaysCell(row["距离上次发布天数"]);
    case "超时未合作":
      return renderPill(row["是否超时未合作"] === "Y" ? "是" : "否", row["是否超时未合作"] === "Y" ? "danger" : "neutral");
    case "是否复投":
      return renderPill(row["是否进入复投(Y/N)"] === "Y" ? "是" : "否", row["是否进入复投(Y/N)"] === "Y" ? "info" : "neutral");
    case "优先级":
      return renderPill(row["优先级"] || "-", row["优先级"] === "高" ? "danger" : row["优先级"] === "中" ? "warn" : "ok");
    case "负责人":
      return escapeHtml(row["负责人"] || "-");
    case "下一步动作":
      return `<span class="wrap-text">${escapeHtml(row["下一步动作"] || "-")}</span>`;
    case "截止日期":
      return escapeHtml(row["截止日期"] || "-");
    case "备注":
      return renderRemarkCell(row["备注"]);
    case "是否在GMV池":
      return row.__inGmvPool ? renderPill("已进入", "ok") : renderPill("未进入", "neutral");
    case "为何未进GMV池":
      return row.__inGmvPool ? renderPill("已在池内", "ok") : `<span class="wrap-text">${escapeHtml(row.__whyNotInGmv || "-")}</span>`;
    default:
      return "-";
  }
}

function renderTableHeader(head, columns) {
  head.innerHTML = `<tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}<th>操作</th></tr>`;
}

function renderPagination(container, pageData, onPageChange) {
  if (!pageData.total) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = `
    <div class="pagination-bar__meta">显示 ${pageData.start + 1}-${pageData.end} / 共 ${pageData.total} 条</div>
    <div class="pagination-controls">
      <button class="nav-button" type="button" data-page="prev" ${pageData.page <= 1 ? "disabled" : ""}>上一页</button>
      <span>第 ${pageData.page} / ${pageData.totalPages} 页</span>
      <button class="nav-button" type="button" data-page="next" ${pageData.page >= pageData.totalPages ? "disabled" : ""}>下一页</button>
    </div>
  `;
  container.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextPage = button.dataset.page === "prev" ? pageData.page - 1 : pageData.page + 1;
      onPageChange(nextPage);
    });
  });
}

export function renderStatusStrip(container, items) {
  container.innerHTML = items
    .map(
      (item) => `
        <article class="status-card status-card--${toneForStatus(item.value)}">
          <p class="status-card__label">${escapeHtml(item.label)}</p>
          <strong class="status-card__value">${escapeHtml(item.value || "-")}</strong>
          <p class="status-card__note">${escapeHtml(item.note || "")}</p>
        </article>
      `
    )
    .join("");
}

export function renderSummaryCards(container, cards) {
  container.innerHTML = cards
    .map(
      (card) => `
        <article class="summary-card">
          <p class="summary-card__label">${escapeHtml(card.label)}</p>
          <strong class="summary-card__value">${escapeHtml(card.value)}</strong>
          <p class="summary-card__note">${escapeHtml(card.note || "")}</p>
        </article>
      `
    )
    .join("");
}

export function renderSelectOptions(select, options, allLabel) {
  if (!select) return;
  const values = [allLabel, ...(options || [])];
  select.innerHTML = values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
}

export function renderCreatorTable({
  head,
  body,
  pagination,
  rows,
  total,
  page,
  totalPages,
  start,
  end,
  mode,
  onEdit,
  onPageChange,
}) {
  const columns = mode === "focus" ? [...CORE_COLUMNS, ...FOCUS_EXTRA_COLUMNS] : CORE_COLUMNS;
  renderTableHeader(head, columns);
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="${columns.length + 1}"><div class="empty-state">当前筛选下没有匹配数据。</div></td></tr>`;
    renderPagination(pagination, { total, page, totalPages, start, end }, onPageChange);
    return;
  }
  body.innerHTML = rows
    .map(
      (row) => `
        <tr>
          ${columns.map((column) => `<td>${renderCreatorValue(column, row)}</td>`).join("")}
          <td><button class="table-action" type="button" data-edit-id="${escapeHtml(row.__creatorKey)}">编辑</button></td>
        </tr>
      `
    )
    .join("");
  body.querySelectorAll("[data-edit-id]").forEach((button) => {
    button.addEventListener("click", () => onEdit(button.dataset.editId));
  });
  renderPagination(pagination, { total, page, totalPages, start, end }, onPageChange);
}

export function renderRecordsTable({ head, body, rows }) {
  const columns = ["发布日期", "达人", "店铺", "产品", "视频GMV", "是否复投", "合作状态", "链接"];
  renderTableHeader(head, columns.slice(0, -1));
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="${columns.length}"><div class="empty-state">当前筛选下没有合作记录。</div></td></tr>`;
    return;
  }
  head.innerHTML = `<tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>`;
  body.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row["合作日期"] || "-")}</td>
          <td>${escapeHtml(row["达人名称"] || "-")}<div class="cell-subline">${escapeHtml(row["达人ID"] || "-")}</div></td>
          <td>${escapeHtml(row.__storeLabel || "-")}</td>
          <td><span class="wrap-text">${escapeHtml(row["产品"] || "-")}</span></td>
          <td>${escapeHtml(formatNumber(row["GMV"] || 0))}</td>
          <td>${renderPill(row["是否复投(Y/N)"] === "Y" ? "是" : "否", row["是否复投(Y/N)"] === "Y" ? "info" : "neutral")}</td>
          <td>${renderPill(row["是否出单(Y/N)"] === "Y" ? "已出单" : "未出单", row["是否出单(Y/N)"] === "Y" ? "ok" : "neutral")}</td>
          <td>${row["视频链接"] ? `<a class="creator-link" href="${escapeHtml(row["视频链接"])}" target="_blank" rel="noreferrer noopener">查看视频</a>` : "-"}</td>
        </tr>
      `
    )
    .join("");
}

function renderStoreHealth(syncHealth = {}) {
  const stores = Array.isArray(syncHealth.stores) ? syncHealth.stores : [];
  const portMap = {
    LETME: "9222",
    STYPRO: "9231",
    SPARCO: "9232",
    ICYEE: "9234",
  };
  return stores
    .map(
      (store) => {
        const storeName = String(store.store || "").toUpperCase();
        const derivedDate =
          store.lastDailyDate ||
          String(store.value || "").match(/\d{4}-\d{2}-\d{2}/)?.[0] ||
          "";
        return `
        <article class="store-health-item">
          <div class="store-health-item__top">
            <strong>${escapeHtml(store.store || "-")}</strong>
            ${renderPill(store.value || "未记录", toneForStatus(store.value))}
          </div>
          <p>端口 ${escapeHtml(store.port || portMap[storeName] || "-")} · 更新到 ${escapeHtml(derivedDate || "-")}</p>
          <p>${escapeHtml(store.note || store.error || "")}</p>
        </article>
      `;
      }
    )
    .join("");
}

function renderPoolHealth(stats = {}) {
  const overviewCount = Number(stats.overviewCount || 0);
  const gmvCount = Number(stats.gmvFocusCount || 0);
  const focusCount = Number(stats.focusCount || 0);
  const missingFocusCount = Number(stats.missingFocusCount || 0);
  const gmvRatio = overviewCount ? `${Math.round((gmvCount / overviewCount) * 100)}%` : "0%";
  const focusRatio = focusCount ? `${Math.round(((focusCount - missingFocusCount) / focusCount) * 100)}%` : "0%";
  return `
    <article class="pool-health-item">
      <div class="pool-health-item__row">
        <strong>GMV重点池</strong>
        <span>${gmvCount} / ${overviewCount}</span>
      </div>
      <div class="progress-bar"><span style="width:${escapeHtml(gmvRatio)}"></span></div>
      <p>当前进入率 ${escapeHtml(gmvRatio)}</p>
    </article>
    <article class="pool-health-item">
      <div class="pool-health-item__row">
        <strong>189重点池</strong>
        <span>${focusCount - missingFocusCount} / ${focusCount}</span>
      </div>
      <div class="progress-bar"><span style="width:${escapeHtml(focusRatio)}"></span></div>
      <p>当前命中率 ${escapeHtml(focusRatio)}</p>
    </article>
  `;
}

function renderActivity(syncHealth = {}) {
  const stores = Array.isArray(syncHealth.stores) ? syncHealth.stores : [];
  const items = [
    { time: syncHealth.lastSuccessRunAt || "-", text: "最近一次成功同步", tag: "success" },
    { time: syncHealth.lastRunAt || "-", text: "最近一次尝试运行", tag: "neutral" },
    { time: syncHealth.nextSyncDate || "-", text: "当前待同步日期", tag: "warn" },
    ...stores.slice(0, 2).map((store) => ({
      time: store.lastRunAt || "-",
      text: `${store.store || "-"} 最近状态：${store.value || "未记录"}`,
      tag: toneForStatus(store.value),
    })),
  ];
  return items
    .map(
      (item) => `
        <article class="activity-item">
          <span class="activity-item__time">${escapeHtml(item.time)}</span>
          <div>
            <p>${escapeHtml(item.text)}</p>
            ${renderPill(item.tag === "success" ? "成功" : item.tag === "warn" ? "关注" : "记录", item.tag)}
          </div>
        </article>
      `
    )
    .join("");
}

function renderQuickActionButtons({ onOpenUpload, onOpenManualSync, onOpenSyncSettings }) {
  const actions = [
    { label: "🤝 上传合作表", handler: onOpenUpload, action: "upload" },
    { label: "📦 上传 SKU 表", handler: onOpenUpload, action: "upload" },
    { label: "🔄 手动触发同步", handler: onOpenManualSync, action: "manual" },
    { label: "🧩 同步设置", handler: onOpenSyncSettings, action: "settings" },
  ];
  return actions
    .map(
      (action) => `<button class="quick-action" type="button" data-quick-action="${escapeHtml(action.action)}">${escapeHtml(
        action.label
      )}</button>`
    )
    .join("");
}

export function renderCockpit({
  storeHealthList,
  poolHealthList,
  activityList,
  quickActions,
  metricList,
  assumptionList,
  syncHealth,
  stats,
  metricNotes,
  assumptions,
  onOpenUpload,
  onOpenManualSync,
  onOpenSyncSettings,
}) {
  storeHealthList.innerHTML = renderStoreHealth(syncHealth);
  poolHealthList.innerHTML = renderPoolHealth(stats);
  activityList.innerHTML = renderActivity(syncHealth);
  quickActions.innerHTML = renderQuickActionButtons({ onOpenUpload, onOpenManualSync, onOpenSyncSettings });
  quickActions.querySelectorAll("[data-quick-action='upload']").forEach((button) => {
    button.addEventListener("click", onOpenUpload);
  });
  quickActions.querySelector("[data-quick-action='manual']")?.addEventListener("click", onOpenManualSync);
  quickActions.querySelector("[data-quick-action='settings']")?.addEventListener("click", onOpenSyncSettings);
  metricList.innerHTML = metricNotes
    .map(
      (item) => `
        <article class="metric-note">
          <strong>${escapeHtml(item.title || "-")}</strong>
          <span>${escapeHtml(item.value || "-")}</span>
          <p>${escapeHtml(item.note || "")}</p>
          ${item.extra ? `<p class="metric-note__extra">${escapeHtml(item.extra)}</p>` : ""}
        </article>
      `
    )
    .join("");
  assumptionList.innerHTML = assumptions
    .map((item) => `<article class="assumption-note">${escapeHtml(item)}</article>`)
    .join("");
}
