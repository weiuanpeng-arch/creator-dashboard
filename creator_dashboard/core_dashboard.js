const CORE_SYNC_SETTINGS_KEY = "core_dashboard_sync_settings_v1";
const LEGACY_SYNC_SETTINGS_KEY = "creator_dashboard_sync_settings_v1";
const CORE_LOCAL_OVERRIDE_KEY = "core_dashboard_local_overrides_v1";
const PUBLIC_READ_SYNC_SETTINGS = {
  supabaseUrl: "https://sbznfjnsirajqkkcwayj.supabase.co",
  anonKey: "sb_publishable_tM67K7Mi1qDUkemhgzDuGg_dsdwitBT",
  workspaceId: "creator-dashboard-prod",
};

const CORE_EDIT_FIELDS = [
  { label: "复投产品链接", remoteKey: "core_复投产品链接", type: "text", placeholder: "粘贴产品链接或直接输入 PID" },
  { label: "复投产品PID", remoteKey: "core_复投产品PID", type: "text", placeholder: "可直接输入数字 PID" },
  { label: "优先级", remoteKey: "core_优先级", type: "select", options: ["高", "中", "低"] },
  { label: "下一步动作", remoteKey: "core_下一步动作", type: "textarea", placeholder: "例如：补齐复投产品并跟进发布时间" },
  { label: "负责人", remoteKey: "core_负责人", type: "text", placeholder: "负责人" },
  { label: "截止日期", remoteKey: "core_截止日期", type: "date", placeholder: "" },
  { label: "备注", remoteKey: "core_备注", type: "textarea", placeholder: "补充运营判断和人工备注" },
];

const state = {
  search: "",
  level: "全部",
  status: "全部",
  priority: "全部",
  platform: "全部",
  activeTab: "overview",
  activeCreatorId: "",
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
  coreEditorName: document.querySelector("#core-editor-name"),
  coreWritePasscode: document.querySelector("#core-write-passcode"),
  coreSaveSync: document.querySelector("#core-save-sync"),
  coreRefreshCloud: document.querySelector("#core-refresh-cloud"),
  coreClearSync: document.querySelector("#core-clear-sync"),
  coreSyncStatus: document.querySelector("#core-sync-status"),
  detailModal: document.querySelector("#core-detail-modal"),
  detailTitle: document.querySelector("#core-detail-title"),
  detailSubtitle: document.querySelector("#core-detail-subtitle"),
  detailBody: document.querySelector("#core-detail-body"),
  closeModal: document.querySelector("#core-close-modal"),
};

let payload;
let baseOverview = [];
let renderedOverview = [];
let remoteRawFieldsById = {};
let remoteCoreOverridesById = {};
let localCoreOverridesById = {};
let syncSettings = {
  supabaseUrl: PUBLIC_READ_SYNC_SETTINGS.supabaseUrl,
  anonKey: PUBLIC_READ_SYNC_SETTINGS.anonKey,
  workspaceId: PUBLIC_READ_SYNC_SETTINGS.workspaceId,
  editorName: "",
  writePasscode: "",
};

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

function normalizeSyncSettings(raw = {}) {
  return {
    supabaseUrl: String(raw.supabaseUrl || raw.supabase_url || PUBLIC_READ_SYNC_SETTINGS.supabaseUrl || "")
      .trim()
      .replace(/\/+$/, ""),
    anonKey: String(raw.anonKey || raw.anon_key || PUBLIC_READ_SYNC_SETTINGS.anonKey || "").trim(),
    workspaceId: String(raw.workspaceId || raw.workspace_id || PUBLIC_READ_SYNC_SETTINGS.workspaceId || "").trim(),
    editorName: String(raw.editorName || raw.editor_name || "").trim(),
    writePasscode: String(raw.writePasscode || raw.write_passcode || "").trim(),
  };
}

function loadSyncSettings() {
  try {
    const current = JSON.parse(localStorage.getItem(CORE_SYNC_SETTINGS_KEY) || "{}");
    if (current && Object.keys(current).length) {
      return normalizeSyncSettings(current);
    }
    const legacy = JSON.parse(localStorage.getItem(LEGACY_SYNC_SETTINGS_KEY) || "{}");
    if (legacy && Object.keys(legacy).length) {
      return normalizeSyncSettings({
        supabaseUrl: legacy.supabaseUrl || legacy.supabase_url,
        anonKey: legacy.anonKey || legacy.anon_key,
        workspaceId: legacy.workspaceId || legacy.workspace_id,
        editorName: "",
        writePasscode: "",
      });
    }
    return normalizeSyncSettings();
  } catch {
    return normalizeSyncSettings();
  }
}

function persistSyncSettings(settings) {
  localStorage.setItem(CORE_SYNC_SETTINGS_KEY, JSON.stringify(normalizeSyncSettings(settings)));
}

function loadLocalOverrides() {
  try {
    return JSON.parse(localStorage.getItem(CORE_LOCAL_OVERRIDE_KEY) || "{}");
  } catch {
    return {};
  }
}

function persistLocalOverrides(overrides) {
  localStorage.setItem(CORE_LOCAL_OVERRIDE_KEY, JSON.stringify(overrides));
}

function setSyncStatus(text) {
  elements.coreSyncStatus.textContent = text;
}

function formatSyncError(error) {
  const message = String(error?.message || error || "").trim();
  if (!message) {
    return "共享库暂时不可用，当前会继续使用本机暂存。";
  }
  if (/failed to fetch/i.test(message) || /networkerror/i.test(message) || /err_connection/i.test(message)) {
    return "当前浏览器环境暂时无法连接共享库，页面仍可正常浏览并保存到本机。";
  }
  return message;
}

function parsePidFromText(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d+$/.test(text)) return text;
  const patterns = [/\/product\/(\d+)/i, /[?&](?:pid|product_id)=([0-9]+)/i, /\b(\d{12,})\b/];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return "";
}

function buildSupabaseHeaders(extra = {}) {
  return {
    apikey: syncSettings.anonKey,
    Authorization: `Bearer ${syncSettings.anonKey}`,
    ...extra,
  };
}

async function supabaseRequest(path, options = {}) {
  const { headers = {}, ...rest } = options;
  const response = await fetch(`${syncSettings.supabaseUrl}/rest/v1${path}`, {
    ...rest,
    headers: buildSupabaseHeaders(headers),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Supabase ${response.status}`);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

function extractCoreFields(fields = {}) {
  const extracted = {};
  for (const config of CORE_EDIT_FIELDS) {
    extracted[config.label] = String(fields[config.remoteKey] || "");
  }
  if (!extracted["复投产品PID"] && extracted["复投产品链接"]) {
    extracted["复投产品PID"] = parsePidFromText(extracted["复投产品链接"]);
  }
  return extracted;
}

async function loadRemoteOverrides() {
  const workspace = encodeURIComponent(syncSettings.workspaceId);
  const rows = await supabaseRequest(
    `/creator_sync_overrides?workspace_id=eq.${workspace}&select=kol_id,fields,updated_at,updated_by`
  );
  remoteRawFieldsById = {};
  remoteCoreOverridesById = {};
  (rows || []).forEach((row) => {
    const creatorId = String(row.kol_id || "");
    const fields = row.fields || {};
    remoteRawFieldsById[creatorId] = fields;
    remoteCoreOverridesById[creatorId] = extractCoreFields(fields);
  });
}

function mergeCoreValues(row) {
  const creatorId = String(row["达人ID"] || "");
  const remote = remoteCoreOverridesById[creatorId] || {};
  const local = localCoreOverridesById[creatorId] || {};
  const merged = { ...row };
  CORE_EDIT_FIELDS.forEach((field) => {
    const nextValue = local[field.label] || remote[field.label] || "";
    if (nextValue) {
      merged[field.label] = nextValue;
    }
  });
  merged["优先级"] = local["优先级"] || remote["优先级"] || merged["优先级"] || "";
  merged["下一步动作"] = local["下一步动作"] || remote["下一步动作"] || merged["下一步动作"] || "";
  merged["负责人"] = local["负责人"] || remote["负责人"] || merged["负责人"] || "";
  merged["截止日期"] = local["截止日期"] || remote["截止日期"] || merged["截止日期"] || "";
  merged["备注"] = local["备注"] || remote["备注"] || merged["备注"] || "";
  merged["复投产品链接"] = local["复投产品链接"] || remote["复投产品链接"] || "";
  merged["复投产品PID"] =
    local["复投产品PID"] ||
    remote["复投产品PID"] ||
    parsePidFromText(merged["复投产品链接"]) ||
    "";
  return merged;
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
  populateSelect(elements.levelFilter, unique(baseOverview.map((item) => item["达人分层(L0/L1/L2/L3)"])));
  populateSelect(elements.statusFilter, unique(renderedOverview.map((item) => item["当前合作状态"])));
  populateSelect(elements.priorityFilter, unique(renderedOverview.map((item) => item["优先级"])));
  populateSelect(elements.platformFilter, unique(baseOverview.map((item) => item["平台"])));
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
  return [...renderedOverview.filter(matches)].sort((a, b) => {
    const gmvGap = toNumber(b["历史总GMV"]) - toNumber(a["历史总GMV"]);
    if (gmvGap !== 0) return gmvGap;
    const recentGap = toNumber(b["90天GMV"]) - toNumber(a["90天GMV"]);
    if (recentGap !== 0) return recentGap;
    return String(a["达人名称"] || "").localeCompare(String(b["达人名称"] || ""), "zh-CN");
  });
}

function filteredFocus() {
  const ids = new Set(payload.focusPool.map((item) => item["达人ID"]));
  return filteredOverview().filter((item) => ids.has(item["达人ID"]));
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
    { label: "当前达人", value: rows.length, note: `总池 ${renderedOverview.length}` },
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
      `
    )
    .join("");
}

function renderAssumptions() {
  elements.assumptionList.innerHTML = payload.assumptions
    .map((item) => `<article class="assumption-item">${escapeHtml(item)}</article>`)
    .join("");
}

function getProfileUrl(row) {
  const raw = String(row["达人ID"] || "").trim().replace(/^@+/, "");
  return raw ? `https://www.tiktok.com/@${encodeURIComponent(raw)}` : "";
}

function renderOverview() {
  const rows = filteredOverview();
  elements.resultTitle.textContent = `${rows.length} 个核心监控达人`;
  elements.resultSubtitle.textContent = `基于同步版工作簿生成，人工维护字段支持云端覆盖`;
  if (!rows.length) {
    elements.overviewBody.innerHTML = '<tr><td colspan="10"><div class="empty-state">当前筛选下没有匹配达人。</div></td></tr>';
    return;
  }
  elements.overviewBody.innerHTML = rows
    .map((row) => {
      const url = getProfileUrl(row);
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
          <td><button class="ghost-button table-action" type="button" data-edit-id="${escapeHtml(row["达人ID"])}">编辑</button></td>
        </tr>
      `;
    })
    .join("");
  elements.overviewBody.querySelectorAll("[data-edit-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const creator = renderedOverview.find((item) => item["达人ID"] === button.dataset.editId);
      if (creator) openDetail(creator);
    });
  });
}

function renderFocus() {
  const rows = filteredFocus();
  if (!rows.length) {
    elements.focusBody.innerHTML = '<tr><td colspan="7"><div class="empty-state">当前筛选下没有 L0/L1 达人。</div></td></tr>';
    return;
  }
  elements.focusBody.innerHTML = rows
    .map(
      (row) => `
      <tr>
        <td>${escapeHtml(row["达人名称"])}</td>
        <td><span class="pill">${escapeHtml(row["达人分层(L0/L1/L2/L3)"])}</span></td>
        <td>${escapeHtml(row["平台"])}</td>
        <td>${escapeHtml(formatNumber(row["历史总GMV"]))}</td>
        <td>${escapeHtml(row["当前合作状态"])}</td>
        <td><span class="pill is-warm">${escapeHtml(row["优先级"])}</span></td>
        <td>${escapeHtml(row["下一步动作"])}</td>
      </tr>
    `
    )
    .join("");
}

function renderRecords() {
  const rows = filteredRecords();
  if (!rows.length) {
    elements.recordBody.innerHTML = '<tr><td colspan="7"><div class="empty-state">当前筛选下没有合作摘要。</div></td></tr>';
    return;
  }
  elements.recordBody.innerHTML = rows
    .map(
      (row) => `
      <tr>
        <td>${escapeHtml(row["达人名称"])}</td>
        <td>${escapeHtml(row["合作日期"]) || "-"}</td>
        <td>${escapeHtml(row["产品"]) || "-"}</td>
        <td>${escapeHtml(row["内容类型"]) || "-"}</td>
        <td>${escapeHtml(row["是否出单(Y/N)"])}</td>
        <td>${escapeHtml(row["是否复投(Y/N)"])}</td>
        <td>${row["视频链接"] ? `<a class="creator-link" href="${escapeHtml(row["视频链接"])}" target="_blank" rel="noreferrer noopener">查看</a>` : "-"}</td>
      </tr>
    `
    )
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
      `
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

function renderInputField(label, value, type, placeholder, hint = "") {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <input name="${escapeHtml(label)}" type="${type}" value="${escapeHtml(value || "")}" placeholder="${escapeHtml(placeholder)}" />
      ${hint ? `<span class="field-hint">${escapeHtml(hint)}</span>` : ""}
    </label>
  `;
}

function renderTextareaField(label, value, placeholder, hint = "") {
  return `
    <label class="field is-wide">
      <span>${escapeHtml(label)}</span>
      <textarea name="${escapeHtml(label)}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value || "")}</textarea>
      ${hint ? `<span class="field-hint">${escapeHtml(hint)}</span>` : ""}
    </label>
  `;
}

function renderSelectField(label, value, options) {
  const mergedOptions = value && !options.includes(value) ? [value, ...options] : options;
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <select name="${escapeHtml(label)}">
        <option value="">请选择</option>
        ${mergedOptions
          .map((option) => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`)
          .join("")}
      </select>
    </label>
  `;
}

function openDetail(row) {
  state.activeCreatorId = row["达人ID"];
  const url = getProfileUrl(row);
  elements.detailTitle.innerHTML = url
    ? `<a class="creator-link creator-link--detail" href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(row["达人名称"])}</a>`
    : escapeHtml(row["达人名称"]);
  elements.detailSubtitle.textContent = `@${row["达人ID"]} · ${row["达人分层(L0/L1/L2/L3)"] || "-"} · ${row["当前合作状态"] || "-"}`;

  const currentLink = row["复投产品链接"] || "";
  const currentPid = row["复投产品PID"] || parsePidFromText(currentLink) || "";

  elements.detailBody.innerHTML = `
    <article class="detail-card">
      <h3>当前表现</h3>
      <p><strong>历史总GMV：</strong>${escapeHtml(formatNumber(row["历史总GMV"]))}</p>
      <p><strong>90天GMV：</strong>${escapeHtml(formatNumber(row["90天GMV"]))}</p>
      <p><strong>近30天发布视频GMV：</strong>${escapeHtml(formatNumber(row["近30天发布视频gmv"]))}</p>
      <p><strong>最近合作日期：</strong>${escapeHtml(row["最近合作日期"] || "-")}</p>
      <p><strong>距离上次发布天数：</strong>${escapeHtml(row["距离上次发布天数"] || "-")}</p>
    </article>
    <article class="detail-card">
      <h3>复投判断</h3>
      <p><strong>是否进入复投：</strong>${escapeHtml(row["是否进入复投(Y/N)"] || "-")}</p>
      <p><strong>是否超时未合作：</strong>${escapeHtml(row["是否超时未合作"] || "-")}</p>
      <p><strong>当前合作状态：</strong>${escapeHtml(row["当前合作状态"] || "-")}</p>
      <p><strong>达人类型：</strong>${escapeHtml(row["达人类型"] || "-")}</p>
    </article>
    <article class="detail-card is-wide">
      <h3>人工维护</h3>
      <form id="core-editor-form" class="editor-grid">
        ${renderInputField("复投产品链接", currentLink, "text", "粘贴产品链接或直接输入 PID", "最高优先级，系统会自动从链接里提取 PID")}
        ${renderInputField("复投产品PID", currentPid, "text", "自动识别或手工输入 PID", "支持纯数字 PID，也支持从产品链接自动提取")}
        ${renderSelectField("优先级", row["优先级"] || "", ["高", "中", "低"])}
        ${renderInputField("负责人", row["负责人"] || "", "text", "负责人")}
        ${renderInputField("截止日期", row["截止日期"] || "", "date", "")}
        ${renderTextareaField("下一步动作", row["下一步动作"] || "", "填写下一步运营动作")}
        ${renderTextareaField("备注", row["备注"] || "", "补充说明")}
        <div class="editor-actions is-wide">
          <p id="core-editor-status" class="editor-meta">保存后优先写入共享库；若未填写编辑人和口令，将暂存在当前浏览器。</p>
          <button class="solid-button" type="submit">保存当前达人</button>
        </div>
      </form>
    </article>
  `;

  const form = document.querySelector("#core-editor-form");
  const linkInput = form.querySelector('input[name="复投产品链接"]');
  const pidInput = form.querySelector('input[name="复投产品PID"]');
  const statusNode = document.querySelector("#core-editor-status");

  const syncPidFromLink = () => {
    const parsed = parsePidFromText(linkInput.value);
    if (parsed && !pidInput.value.trim()) {
      pidInput.value = parsed;
    }
    statusNode.textContent = parsed
      ? `当前已识别 PID：${parsed}`
      : "保存后优先写入共享库；若未填写编辑人和口令，将暂存在当前浏览器。";
  };
  linkInput.addEventListener("input", syncPidFromLink);
  syncPidFromLink();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveCreatorFromForm(new FormData(form));
  });

  if (!elements.detailModal.open) {
    elements.detailModal.showModal();
  }
}

function updateSyncInputs() {
  elements.coreEditorName.value = syncSettings.editorName || "";
  elements.coreWritePasscode.value = syncSettings.writePasscode || "";
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

function rebuildWorkingRows() {
  renderedOverview = baseOverview.map((item) => mergeCoreValues(item));
}

async function refreshAfterMutation() {
  try {
    await loadRemoteOverrides();
  } catch (error) {
    setSyncStatus(`云端刷新失败：${formatSyncError(error)}`);
  }
  rebuildWorkingRows();
  populateFilters();
  render();
  const current = renderedOverview.find((item) => item["达人ID"] === state.activeCreatorId);
  if (current && elements.detailModal.open) {
    openDetail(current);
  }
}

function buildMergedOverridePayload(creatorId, nextValues) {
  const merged = { ...(remoteRawFieldsById[creatorId] || {}) };
  CORE_EDIT_FIELDS.forEach((config) => {
    const nextValue = String(nextValues[config.label] || "").trim();
    if (nextValue) {
      merged[config.remoteKey] = nextValue;
    } else {
      delete merged[config.remoteKey];
    }
  });
  return merged;
}

async function remoteUpsertCreatorOverride(creatorId, mergedFields) {
  return supabaseRequest("/rpc/upsert_creator_override", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_workspace_id: syncSettings.workspaceId,
      p_passcode: syncSettings.writePasscode,
      p_editor_name: syncSettings.editorName,
      p_kol_id: creatorId,
      p_fields: mergedFields,
    }),
  });
}

function collectFormValues(formData) {
  const values = {};
  CORE_EDIT_FIELDS.forEach((config) => {
    values[config.label] = String(formData.get(config.label) || "").trim();
  });
  if (!values["复投产品PID"] && values["复投产品链接"]) {
    values["复投产品PID"] = parsePidFromText(values["复投产品链接"]);
  }
  return values;
}

async function saveCreatorFromForm(formData) {
  const creatorId = state.activeCreatorId;
  const values = collectFormValues(formData);
  if (!syncSettings.editorName || !syncSettings.writePasscode) {
    localCoreOverridesById[creatorId] = values;
    persistLocalOverrides(localCoreOverridesById);
    rebuildWorkingRows();
    render();
    const current = renderedOverview.find((item) => item["达人ID"] === creatorId);
    if (current) openDetail(current);
    setSyncStatus(`未填写编辑人或口令，已暂存到当前浏览器：${creatorId}`);
    return;
  }
  try {
    const mergedFields = buildMergedOverridePayload(creatorId, values);
    await remoteUpsertCreatorOverride(creatorId, mergedFields);
    delete localCoreOverridesById[creatorId];
    persistLocalOverrides(localCoreOverridesById);
    await refreshAfterMutation();
    setSyncStatus(`已保存共享字段：${creatorId}`);
  } catch (error) {
    localCoreOverridesById[creatorId] = values;
    persistLocalOverrides(localCoreOverridesById);
    rebuildWorkingRows();
    render();
    const current = renderedOverview.find((item) => item["达人ID"] === creatorId);
    if (current) openDetail(current);
    setSyncStatus(`云端保存失败，已回退到本机暂存：${formatSyncError(error)}`);
  }
}

function setupSyncPanel() {
  elements.coreSaveSync.addEventListener("click", () => {
    syncSettings = normalizeSyncSettings({
      ...syncSettings,
      editorName: elements.coreEditorName.value,
      writePasscode: elements.coreWritePasscode.value,
    });
    persistSyncSettings(syncSettings);
    setSyncStatus(syncSettings.editorName ? `已保存编辑身份：${syncSettings.editorName}` : "已保存本机设置，可继续只读共享数据。");
  });
  elements.coreRefreshCloud.addEventListener("click", async () => {
    try {
      await refreshAfterMutation();
      setSyncStatus(`已刷新工作区 ${syncSettings.workspaceId} 的共享数据。`);
    } catch (error) {
      setSyncStatus(`刷新失败：${formatSyncError(error)}`);
    }
  });
  elements.coreClearSync.addEventListener("click", () => {
    syncSettings = normalizeSyncSettings(PUBLIC_READ_SYNC_SETTINGS);
    localCoreOverridesById = {};
    persistLocalOverrides(localCoreOverridesById);
    persistSyncSettings(syncSettings);
    updateSyncInputs();
    rebuildWorkingRows();
    render();
    setSyncStatus("已清空本机编辑身份与本地暂存，继续只读共享数据。");
  });
}

async function init() {
  if (window.__CORE_CREATOR_DASHBOARD__) {
    payload = window.__CORE_CREATOR_DASHBOARD__;
  } else {
    const response = await fetch(`./data/core_creator_dashboard.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`加载失败：${response.status}`);
    payload = await response.json();
  }

  syncSettings = loadSyncSettings();
  localCoreOverridesById = loadLocalOverrides();
  updateSyncInputs();

  baseOverview = payload.overview.map((item) => ({ ...item }));
  try {
    await loadRemoteOverrides();
    setSyncStatus(`已连接工作区 ${syncSettings.workspaceId}，当前可读共享维护结果。`);
  } catch (error) {
    setSyncStatus(`共享读取失败，当前仅使用本机暂存：${formatSyncError(error)}`);
  }
  rebuildWorkingRows();

  elements.generatedAt.textContent = `数据生成时间 ${payload.generatedAt}`;
  populateFilters();
  renderAssumptions();
  setupTabs();
  setupFilters();
  setupSyncPanel();
  elements.closeModal.addEventListener("click", () => elements.detailModal.close());
  render();
}

init().catch((error) => {
  elements.generatedAt.textContent = "数据加载失败";
  elements.overviewBody.innerHTML = '<tr><td colspan="10"><div class="empty-state">核心看板加载失败，请稍后重试。</div></td></tr>';
  console.error(error);
});
