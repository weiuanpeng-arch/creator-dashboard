const STORAGE_KEY = "creator_dashboard_overrides_v1";
const CUSTOM_TAG_STORAGE_KEY = "creator_dashboard_custom_tags_v1";
const SYNC_SETTINGS_KEY = "creator_dashboard_sync_settings_v1";

const EDITABLE_FIELDS = [
  "主页链接",
  "达人昵称",
  "内容一级标签",
  "内容二级标签",
  "内容形式标签",
  "人设/风格标签",
  "受众标签",
  "带货一级类目",
  "带货二级类目",
  "适配品牌",
  "转化形式",
  "合作分层",
  "是否已打标",
  "打标依据链接",
  "备注",
];

const TAG_DIMENSION_CONFIG = {
  内容一级标签: "内容标签",
  内容二级标签: "内容标签",
  内容形式标签: "内容标签",
  "人设/风格标签": "内容标签",
  受众标签: "内容标签",
  带货一级类目: "产品标签",
  带货二级类目: "产品标签",
  转化形式: "筛选标签",
  合作分层: "筛选标签",
};

const DEFAULT_SYNC_SETTINGS = {
  supabaseUrl: "",
  anonKey: "",
  workspaceId: "",
  editorName: "",
  writePasscode: "",
};

const PUBLIC_READ_SYNC_SETTINGS = {
  supabaseUrl: "https://sbznfjnsirajqkkcwayj.supabase.co",
  anonKey: "sb_publishable_tM67K7Mi1qDUkemhgzDuGg_dsdwitBT",
  workspaceId: "creator-dashboard-prod",
};

let baseData;
let data;
let tagOptions;
let creators = [];
let sourceCreatorsById = {};
let remoteOverridesById = {};
let remoteCustomTags = [];
let syncSettings = { ...DEFAULT_SYNC_SETTINGS };
let syncConnected = false;

const state = {
  search: "",
  brand: "全部",
  platform: "全部",
  content: "全部",
  product: "全部",
  conversion: "全部",
  progress: "全部",
  minCoop: 3,
  activeTab: "creators",
  activeCreatorId: "",
};

const elements = {
  generatedAt: document.querySelector("#generated-at"),
  statsGrid: document.querySelector("#stats-grid"),
  brandGrid: document.querySelector("#brand-grid"),
  creatorTableBody: document.querySelector("#creator-table-body"),
  tagCards: document.querySelector("#tag-cards"),
  resultTitle: document.querySelector("#result-title"),
  resultSubtitle: document.querySelector("#result-subtitle"),
  activeFilters: document.querySelector("#active-filters"),
  saveStatus: document.querySelector("#save-status"),
  brandFilter: document.querySelector("#brand-filter"),
  platformFilter: document.querySelector("#platform-filter"),
  contentFilter: document.querySelector("#content-filter"),
  productFilter: document.querySelector("#product-filter"),
  conversionFilter: document.querySelector("#conversion-filter"),
  progressFilter: document.querySelector("#progress-filter"),
  searchInput: document.querySelector("#search-input"),
  coopRange: document.querySelector("#coop-range"),
  coopRangeValue: document.querySelector("#coop-range-value"),
  resetFilters: document.querySelector("#reset-filters"),
  exportFiltered: document.querySelector("#export-filtered"),
  exportAll: document.querySelector("#export-all"),
  tabs: document.querySelectorAll(".tab"),
  panels: document.querySelectorAll(".tab-panel"),
  detailModal: document.querySelector("#detail-modal"),
  detailTitle: document.querySelector("#detail-title"),
  detailSubtitle: document.querySelector("#detail-subtitle"),
  detailBody: document.querySelector("#detail-body"),
  closeModal: document.querySelector("#close-modal"),
  customTagForm: document.querySelector("#custom-tag-form"),
  customTagDimension: document.querySelector("#custom-tag-dimension"),
  customTagStatus: document.querySelector("#custom-tag-status"),
  customTagList: document.querySelector("#custom-tag-list"),
  customTagEmpty: document.querySelector("#custom-tag-empty"),
  customTagScope: document.querySelector("#custom-tag-scope"),
  syncSettingsForm: document.querySelector("#sync-settings-form"),
  syncSupabaseUrl: document.querySelector("#sync-supabase-url"),
  syncAnonKey: document.querySelector("#sync-anon-key"),
  syncWorkspaceId: document.querySelector("#sync-workspace-id"),
  syncEditorName: document.querySelector("#sync-editor-name"),
  syncWritePasscode: document.querySelector("#sync-write-passcode"),
  syncStatus: document.querySelector("#sync-status"),
  syncRefresh: document.querySelector("#sync-refresh"),
  syncMigrateLocal: document.querySelector("#sync-migrate-local"),
  syncClear: document.querySelector("#sync-clear"),
};

function unique(items) {
  return [...new Set(items.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function splitMultiValue(value) {
  return (value || "")
    .split(/[，,\/]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatNow() {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

function dateStamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function parseJsonSafely(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function normalizeCreator(creator) {
  creator["合作次数"] = Number(creator["合作次数"] || 0);
  refreshDerivedFields(creator);
  return creator;
}

function refreshDerivedFields(creator) {
  creator.contentTags = [
    creator["内容一级标签"],
    creator["内容二级标签"],
    creator["内容形式标签"],
    creator["人设/风格标签"],
    creator["受众标签"],
  ].filter(Boolean);
  creator.productTags = [creator["带货一级类目"], creator["带货二级类目"]].filter(Boolean);
}

function getOptions(dimension) {
  return unique(data.tags.filter((tag) => tag["标签维度"] === dimension).map((tag) => tag["标签名称"]));
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

function normalizeSyncSettings(raw = {}) {
  return {
    supabaseUrl: String(raw.supabaseUrl || PUBLIC_READ_SYNC_SETTINGS.supabaseUrl || "").trim().replace(/\/+$/, ""),
    anonKey: String(raw.anonKey || PUBLIC_READ_SYNC_SETTINGS.anonKey || "").trim(),
    workspaceId: String(raw.workspaceId || PUBLIC_READ_SYNC_SETTINGS.workspaceId || "").trim(),
    editorName: String(raw.editorName || "").trim(),
    writePasscode: String(raw.writePasscode || "").trim(),
  };
}

function hasReadSyncConfig(settings = syncSettings) {
  return Boolean(settings.supabaseUrl && settings.anonKey && settings.workspaceId);
}

function hasWriteSyncConfig(settings = syncSettings) {
  return Boolean(hasReadSyncConfig(settings) && settings.editorName && settings.writePasscode);
}

function loadOverrides() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function persistOverrideStore(overrides) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

function loadCustomTags() {
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOM_TAG_STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function persistCustomTags(tags) {
  localStorage.setItem(CUSTOM_TAG_STORAGE_KEY, JSON.stringify(tags));
}

function loadSyncSettings() {
  try {
    return normalizeSyncSettings(JSON.parse(localStorage.getItem(SYNC_SETTINGS_KEY) || "{}"));
  } catch {
    return { ...DEFAULT_SYNC_SETTINGS };
  }
}

function persistSyncSettings(settings) {
  localStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(normalizeSyncSettings(settings)));
}

function clearSyncSettings() {
  localStorage.removeItem(SYNC_SETTINGS_KEY);
  syncSettings = { ...DEFAULT_SYNC_SETTINGS };
  syncConnected = false;
}

function getActiveCustomTags() {
  return syncConnected ? remoteCustomTags : loadCustomTags();
}

function getActiveOverrides() {
  return syncConnected ? remoteOverridesById : loadOverrides();
}

function normalizeStoredFields(fields = {}) {
  const normalized = {};
  EDITABLE_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(fields, field)) {
      normalized[field] = String(fields[field] ?? "");
    }
  });
  return normalized;
}

function buildChangedFields(kolId, values) {
  const source = sourceCreatorsById[kolId] || {};
  const changed = {};
  EDITABLE_FIELDS.forEach((field) => {
    const currentValue = String(values[field] ?? "");
    const sourceValue = String(source[field] ?? "");
    if (currentValue !== sourceValue) {
      changed[field] = currentValue;
    }
  });
  return changed;
}

function buildFormValues(formData) {
  const nextValues = {};
  EDITABLE_FIELDS.forEach((field) => {
    nextValues[field] = String(formData.get(field) || "").trim();
  });
  return nextValues;
}

function persistLocalOverridesFromCreators() {
  const overrides = {};
  creators.forEach((creator) => {
    const changed = buildChangedFields(creator["kolId"], creator);
    if (Object.keys(changed).length) {
      overrides[creator["kolId"]] = changed;
    }
  });
  persistOverrideStore(overrides);
}

function applyActiveOverrides(list) {
  const overrides = getActiveOverrides();
  list.forEach((creator) => {
    const changed = overrides[creator["kolId"]];
    if (!changed) return;
    Object.assign(creator, normalizeStoredFields(changed));
    refreshDerivedFields(creator);
  });
}

function refreshDataState() {
  data = {
    ...baseData,
    tags: [...baseData.tags, ...getActiveCustomTags()],
  };
  tagOptions = {
    contentPrimary: getOptions("内容一级标签"),
    contentSecondary: getOptions("内容二级标签"),
    contentFormat: getOptions("内容形式标签"),
    persona: getOptions("人设/风格标签"),
    audience: getOptions("受众标签"),
    productPrimary: getOptions("带货一级类目"),
    productSecondary: getOptions("带货二级类目"),
    conversion: getOptions("转化形式"),
    tier: getOptions("合作分层"),
    brand: data.brands.map((brand) => brand["品牌"]),
    progress: ["待处理", "已初筛", "已完成"],
  };
}

function mapRemoteTagToLocal(remoteTag) {
  return {
    id: remoteTag.id,
    __custom: true,
    标签大类: remoteTag.tag_category,
    标签维度: remoteTag.tag_dimension,
    标签名称: remoteTag.tag_name,
    适配品牌: remoteTag.brand_scope || "",
    "定义/什么时候打这个标签": remoteTag.definition || "",
    createdBy: remoteTag.created_by || "",
    updatedAt: remoteTag.updated_at || "",
  };
}

function buildSupabaseHeaders(extraHeaders = {}) {
  return {
    apikey: syncSettings.anonKey,
    Authorization: `Bearer ${syncSettings.anonKey}`,
    ...extraHeaders,
  };
}

async function supabaseRequest(path, options = {}) {
  const { method = "GET", body, headers = {} } = options;
  const requestOptions = {
    method,
    headers: buildSupabaseHeaders(headers),
  };
  if (body !== undefined) {
    requestOptions.headers["Content-Type"] = "application/json";
    requestOptions.body = JSON.stringify(body);
  }

  const response = await fetch(`${syncSettings.supabaseUrl}/rest/v1${path}`, requestOptions);
  const text = await response.text();
  const payload = parseJsonSafely(text);
  if (!response.ok) {
    const message = payload?.message || payload?.error_description || payload?.hint || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

async function loadRemoteState() {
  const workspaceFilter = encodeURIComponent(syncSettings.workspaceId);
  const [remoteOverrideRows, remoteTagRows] = await Promise.all([
    supabaseRequest(
      `/creator_sync_overrides?workspace_id=eq.${workspaceFilter}&select=kol_id,fields,updated_at,updated_by`,
    ),
    supabaseRequest(
      `/creator_sync_tags?workspace_id=eq.${workspaceFilter}&select=id,tag_category,tag_dimension,tag_name,brand_scope,definition,created_by,updated_at&order=updated_at.desc`,
    ),
  ]);

  remoteOverridesById = Object.fromEntries(
    (remoteOverrideRows || []).map((row) => [row.kol_id, normalizeStoredFields(row.fields || {})]),
  );
  remoteCustomTags = (remoteTagRows || []).map(mapRemoteTagToLocal);

  persistOverrideStore(remoteOverridesById);
  persistCustomTags(remoteCustomTags);
}

async function remoteUpsertCreatorOverride(kolId, changedFields) {
  await supabaseRequest("/rpc/upsert_creator_override", {
    method: "POST",
    body: {
      p_workspace_id: syncSettings.workspaceId,
      p_passcode: syncSettings.writePasscode,
      p_editor_name: syncSettings.editorName,
      p_kol_id: kolId,
      p_fields: changedFields,
    },
  });
}

async function remoteUpsertCustomTag(tag) {
  await supabaseRequest("/rpc/upsert_custom_tag", {
    method: "POST",
    body: {
      p_workspace_id: syncSettings.workspaceId,
      p_passcode: syncSettings.writePasscode,
      p_editor_name: syncSettings.editorName,
      p_tag_category: tag["标签大类"],
      p_tag_dimension: tag["标签维度"],
      p_tag_name: tag["标签名称"],
      p_brand_scope: tag["适配品牌"],
      p_definition: tag["定义/什么时候打这个标签"],
    },
  });
}

async function remoteDeleteCustomTag(tagId) {
  await supabaseRequest("/rpc/delete_custom_tag", {
    method: "POST",
    body: {
      p_workspace_id: syncSettings.workspaceId,
      p_passcode: syncSettings.writePasscode,
      p_tag_id: tagId,
    },
  });
}

async function rebuildWorkingSet() {
  syncSettings = loadSyncSettings();
  remoteOverridesById = {};
  remoteCustomTags = [];
  syncConnected = false;

  if (hasReadSyncConfig(syncSettings)) {
    try {
      await loadRemoteState();
      syncConnected = true;
      if (hasWriteSyncConfig(syncSettings)) {
        setSyncStatus(`已连接工作区 ${syncSettings.workspaceId}，当前修改会同步到共享库。`);
      } else {
        setSyncStatus(`已连接工作区 ${syncSettings.workspaceId}，当前为共享只读模式。填写编辑人和口令后可直接写入。`);
      }
    } catch (error) {
      syncConnected = false;
      setSyncStatus(`云端连接失败，当前回退为本地模式：${error.message}`);
    }
  } else {
    setSyncStatus("当前为本地模式。填写云端设置后即可多人同步。");
  }

  refreshDataState();
  creators = baseData.creators.map((creator) => normalizeCreator({ ...creator }));
  applyActiveOverrides(creators);
}

async function loadData() {
  const response = await fetch(`./data/creator_pool.json?ts=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load creator data: ${response.status}`);
  }

  baseData = await response.json();
  sourceCreatorsById = Object.fromEntries(baseData.creators.map((creator) => [creator["kolId"], { ...creator }]));
  await rebuildWorkingSet();
}

function setSaveStatus(text) {
  elements.saveStatus.textContent = text;
}

function setCustomTagStatus(text) {
  elements.customTagStatus.textContent = text;
}

function setSyncStatus(text) {
  elements.syncStatus.textContent = text;
}

function updateModeCopy() {
  if (syncConnected) {
    if (hasWriteSyncConfig(syncSettings)) {
      setSaveStatus(`云端同步已连接：${syncSettings.workspaceId} · 修改会实时写入共享库`);
    } else {
      setSaveStatus(`已连接共享库：${syncSettings.workspaceId} · 当前默认展示最新云端标签，填写编辑信息后可直接保存`);
    }
    elements.customTagScope.textContent = `当前展示工作区 ${syncSettings.workspaceId} 的共享自定义标签。`;
    return;
  }

  if (hasReadSyncConfig(syncSettings)) {
    setSaveStatus("云端暂时不可用，当前修改会先缓存在本地浏览器");
    elements.customTagScope.textContent = "云端当前未连通，下面展示的是当前浏览器里的本地缓存。";
    return;
  }

  setSaveStatus("网页内修改会自动保存在当前浏览器");
  elements.customTagScope.textContent = "只展示你当前浏览器里新增或暂存的标签。";
}

function populateFilterControls() {
  populateSelect(elements.brandFilter, unique(tagOptions.brand));
  populateSelect(elements.platformFilter, unique(creators.map((creator) => creator["平台"])));
  populateSelect(elements.contentFilter, tagOptions.contentPrimary);
  populateSelect(elements.productFilter, tagOptions.productPrimary);
  populateSelect(elements.conversionFilter, tagOptions.conversion);
  populateSelect(elements.progressFilter, tagOptions.progress);

  elements.brandFilter.value = state.brand;
  elements.platformFilter.value = state.platform;
  elements.contentFilter.value = state.content;
  elements.productFilter.value = state.product;
  elements.conversionFilter.value = state.conversion;
  elements.progressFilter.value = state.progress;
}

function populateCustomTagDimensionOptions() {
  elements.customTagDimension.innerHTML = "";
  Object.keys(TAG_DIMENSION_CONFIG).forEach((dimension) => {
    const node = document.createElement("option");
    node.value = dimension;
    node.textContent = dimension;
    elements.customTagDimension.appendChild(node);
  });
}

function setupFilters() {
  populateFilterControls();

  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    render();
  });

  [
    ["brandFilter", "brand"],
    ["platformFilter", "platform"],
    ["contentFilter", "content"],
    ["productFilter", "product"],
    ["conversionFilter", "conversion"],
    ["progressFilter", "progress"],
  ].forEach(([elementKey, stateKey]) => {
    elements[elementKey].addEventListener("change", (event) => {
      state[stateKey] = event.target.value;
      render();
    });
  });

  elements.coopRange.max = Math.max(...creators.map((creator) => creator["合作次数"]));
  elements.coopRange.addEventListener("input", (event) => {
    state.minCoop = Number(event.target.value);
    elements.coopRangeValue.textContent = `${state.minCoop} 次`;
    render();
  });

  elements.resetFilters.addEventListener("click", () => {
    state.search = "";
    state.brand = "全部";
    state.platform = "全部";
    state.content = "全部";
    state.product = "全部";
    state.conversion = "全部";
    state.progress = "全部";
    state.minCoop = 3;

    elements.searchInput.value = "";
    elements.brandFilter.value = "全部";
    elements.platformFilter.value = "全部";
    elements.contentFilter.value = "全部";
    elements.productFilter.value = "全部";
    elements.conversionFilter.value = "全部";
    elements.progressFilter.value = "全部";
    elements.coopRange.value = "3";
    elements.coopRangeValue.textContent = "3 次";
    render();
  });
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

function setupExport() {
  elements.exportFiltered.addEventListener("click", () => {
    downloadCsv(filterCreators(), `creator-filtered-${dateStamp()}.csv`);
  });
  elements.exportAll.addEventListener("click", () => {
    downloadCsv(creators, `creator-all-${dateStamp()}.csv`);
  });
}

async function saveSyncSettingsFromForm(formData) {
  const nextSettings = normalizeSyncSettings({
    supabaseUrl: formData.get("supabaseUrl"),
    anonKey: formData.get("anonKey"),
    workspaceId: formData.get("workspaceId"),
    editorName: formData.get("editorName"),
    writePasscode: formData.get("writePasscode"),
  });

  persistSyncSettings(nextSettings);
  syncSettings = nextSettings;

  if (!hasReadSyncConfig(nextSettings)) {
    syncConnected = false;
    updateSyncUi();
    updateModeCopy();
    setSyncStatus("同步配置已保存，但字段还没填完整，当前继续使用本地模式。");
    return;
  }

  await refreshAfterMutation();
  updateSyncUi();
  updateModeCopy();
  if (syncConnected) {
    if (hasWriteSyncConfig(syncSettings)) {
      setSyncStatus(`已连接工作区 ${syncSettings.workspaceId}，后续保存会多人同步。`);
    } else {
      setSyncStatus(`已连接工作区 ${syncSettings.workspaceId}，当前为共享只读模式。`);
    }
  }
}

async function migrateLocalCacheToCloud() {
  if (!hasWriteSyncConfig(syncSettings)) {
    setSyncStatus("请先填写完整的云端配置，再执行迁移。");
    return;
  }

  const localOverrides = loadOverrides();
  const localTags = loadCustomTags();
  const overrideEntries = Object.entries(localOverrides);

  if (!overrideEntries.length && !localTags.length) {
    setSyncStatus("当前浏览器里没有需要迁移的本地缓存。");
    return;
  }

  setSyncStatus("正在把当前浏览器缓存同步到云端...");

  try {
    for (const [kolId, changedFields] of overrideEntries) {
      await remoteUpsertCreatorOverride(kolId, normalizeStoredFields(changedFields));
    }
    for (const tag of localTags) {
      await remoteUpsertCustomTag(tag);
    }
    await refreshAfterMutation();
    setSyncStatus("本地缓存已经迁移到云端共享库。");
  } catch (error) {
    syncConnected = false;
    updateModeCopy();
    setSyncStatus(`迁移失败，请检查云端配置或口令：${error.message}`);
  }
}

function setupSyncSettings() {
  updateSyncUi();

  elements.syncSettingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setSyncStatus("正在保存同步配置...");
    try {
      await saveSyncSettingsFromForm(new FormData(elements.syncSettingsForm));
    } catch (error) {
      syncConnected = false;
      updateModeCopy();
      setSyncStatus(`同步配置已保存，但连接失败：${error.message}`);
    }
  });

  elements.syncRefresh.addEventListener("click", async () => {
    if (!hasReadSyncConfig(syncSettings)) {
      setSyncStatus("请先填写完整的云端配置。");
      return;
    }
    setSyncStatus("正在从云端刷新最新数据...");
    try {
      await refreshAfterMutation();
      updateSyncUi();
      updateModeCopy();
      setSyncStatus(`已从工作区 ${syncSettings.workspaceId} 刷新最新数据。`);
    } catch (error) {
      syncConnected = false;
      updateSyncUi();
      updateModeCopy();
      setSyncStatus(`刷新失败：${error.message}`);
    }
  });

  elements.syncMigrateLocal.addEventListener("click", async () => {
    await migrateLocalCacheToCloud();
  });

  elements.syncClear.addEventListener("click", async () => {
    clearSyncSettings();
    updateSyncUi();
    await refreshAfterMutation();
    updateModeCopy();
    setSyncStatus("已切回本地模式，当前修改只保存在当前浏览器。");
  });
}

function setupCustomTagManager() {
  populateCustomTagDimensionOptions();
  renderCustomTagList();
  elements.customTagForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await addCustomTag(new FormData(elements.customTagForm));
  });
}

function updateSyncUi() {
  const current = loadSyncSettings();
  syncSettings = current;
  elements.syncSupabaseUrl.value = current.supabaseUrl;
  elements.syncAnonKey.value = current.anonKey;
  elements.syncWorkspaceId.value = current.workspaceId;
  elements.syncEditorName.value = current.editorName;
  elements.syncWritePasscode.value = current.writePasscode;
}

function renderStats(filteredCreators) {
  const matchedBrands = new Set(filteredCreators.flatMap((creator) => splitMultiValue(creator["适配品牌"])));
  const avgCoop = filteredCreators.length
    ? (filteredCreators.reduce((sum, creator) => sum + creator["合作次数"], 0) / filteredCreators.length).toFixed(1)
    : "0.0";
  const completed = filteredCreators.filter((creator) => creator["是否已打标"] === "已完成").length;
  const inProgress = filteredCreators.filter((creator) => creator["是否已打标"] === "已初筛").length;

  const cards = [
    { label: "当前达人", value: filteredCreators.length, note: `总池子 ${creators.length}` },
    { label: "已完成打标", value: completed, note: `初筛中 ${inProgress}` },
    { label: "覆盖品牌", value: matchedBrands.size || data.stats.brandCount, note: "四大品牌匹配" },
    { label: "平均合作次数", value: avgCoop, note: "合作>=3 次达人池" },
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

function renderBrands() {
  elements.brandGrid.innerHTML = data.brands
    .map(
      (brand) => `
        <article class="brand-card">
          <h3>${escapeHtml(brand["品牌"])}</h3>
          <p>${escapeHtml(brand["品牌定位"])}</p>
        </article>
      `,
    )
    .join("");
}

function renderTagCards() {
  elements.tagCards.innerHTML = data.tags
    .map(
      (tag) => `
        <article class="tag-card">
          <div class="tag-card__meta">
            <div class="pill-group">
              <span class="pill">${escapeHtml(tag["标签大类"] || "")}</span>
              <span class="pill is-muted">${escapeHtml(tag["标签维度"] || "")}</span>
            </div>
            ${tag.__custom ? '<span class="pill is-warm">自定义</span>' : ""}
          </div>
          <h3>${escapeHtml(tag["标签名称"] || "")}</h3>
          <p><strong>适配品牌：</strong>${escapeHtml(tag["适配品牌"] || "")}</p>
          <p>${escapeHtml(tag["定义/什么时候打这个标签"] || "")}</p>
        </article>
      `,
    )
    .join("");
}

function renderCustomTagList() {
  const customTags = getActiveCustomTags();
  elements.customTagEmpty.style.display = customTags.length ? "none" : "block";
  elements.customTagList.innerHTML = customTags
    .map(
      (tag) => `
        <article class="custom-tag-item">
          <div class="custom-tag-item__top">
            <div>
              <div class="pill-group">
                <span class="pill">${escapeHtml(tag["标签维度"] || "")}</span>
                <span class="pill is-warm">${syncConnected ? "云端" : "本地"}</span>
              </div>
              <h4>${escapeHtml(tag["标签名称"] || "")}</h4>
            </div>
            <div class="custom-tag-item__actions">
              <button class="ghost-button table-action" type="button" data-delete-custom-tag="${escapeHtml(tag.id || "")}">删除</button>
            </div>
          </div>
          <p><strong>适配品牌：</strong>${escapeHtml(tag["适配品牌"] || "未填写")}</p>
          <p>${escapeHtml(tag["定义/什么时候打这个标签"] || "未填写定义")}</p>
        </article>
      `,
    )
    .join("");

  elements.customTagList.querySelectorAll("[data-delete-custom-tag]").forEach((button) => {
    button.addEventListener("click", async () => {
      await deleteCustomTag(button.dataset.deleteCustomTag);
    });
  });
}

async function refreshAfterMutation() {
  await rebuildWorkingSet();
  populateFilterControls();
  renderTagCards();
  renderCustomTagList();
  updateModeCopy();
  render();
  if (elements.detailModal.open && state.activeCreatorId) {
    const creator = creators.find((item) => item["kolId"] === state.activeCreatorId);
    if (creator) {
      openDetail(creator);
    }
  }
}

async function addCustomTag(formData) {
  const dimension = String(formData.get("标签维度") || "").trim();
  const tagName = String(formData.get("标签名称") || "").trim();
  const brands = String(formData.get("适配品牌") || "").trim();
  const definition = String(formData.get("定义") || "").trim();

  if (!dimension || !tagName) {
    setCustomTagStatus("请先填写标签维度和标签名称。");
    return;
  }

  const duplicated = data.tags.some((tag) => tag["标签维度"] === dimension && tag["标签名称"] === tagName);
  if (duplicated) {
    setCustomTagStatus("这个标签已经存在了，可以直接回达人池使用。");
    return;
  }

  const tagPayload = {
    id: `${dimension}-${tagName}-${Date.now()}`,
    __custom: true,
    标签大类: TAG_DIMENSION_CONFIG[dimension],
    标签维度: dimension,
    标签名称: tagName,
    适配品牌: brands,
    "定义/什么时候打这个标签": definition,
  };

  if (hasWriteSyncConfig(syncSettings)) {
    try {
      await remoteUpsertCustomTag(tagPayload);
      await refreshAfterMutation();
      setCustomTagStatus(`已同步新增标签：${tagName}`);
    } catch (error) {
      const localTags = loadCustomTags();
      localTags.push(tagPayload);
      persistCustomTags(localTags);
      await refreshAfterMutation();
      setCustomTagStatus(`云端失败，已暂存到本地：${error.message}`);
    }
  } else {
    const localTags = loadCustomTags();
    localTags.push(tagPayload);
    persistCustomTags(localTags);
    await refreshAfterMutation();
    setCustomTagStatus(`已新增本地标签：${tagName}`);
  }

  elements.customTagForm.reset();
  populateCustomTagDimensionOptions();
}

async function deleteCustomTag(tagId) {
  if (hasWriteSyncConfig(syncSettings) && syncConnected) {
    try {
      await remoteDeleteCustomTag(tagId);
      await refreshAfterMutation();
      setCustomTagStatus("已从云端删除标签。");
      return;
    } catch (error) {
      setCustomTagStatus(`云端删除失败：${error.message}`);
      return;
    }
  }

  const nextTags = loadCustomTags().filter((tag) => tag.id !== tagId);
  persistCustomTags(nextTags);
  await refreshAfterMutation();
  setCustomTagStatus("已删除本地标签。");
}

function matchesCreator(creator) {
  const haystack = [creator["kolId"], creator["达人昵称"], creator["备注"]].join(" ").toLowerCase();
  if (state.search && !haystack.includes(state.search)) return false;
  if (creator["合作次数"] < state.minCoop) return false;
  if (state.brand !== "全部" && !splitMultiValue(creator["适配品牌"]).includes(state.brand)) return false;
  if (state.platform !== "全部" && creator["平台"] !== state.platform) return false;
  if (state.content !== "全部" && creator["内容一级标签"] !== state.content) return false;
  if (state.product !== "全部" && creator["带货一级类目"] !== state.product) return false;
  if (state.conversion !== "全部" && creator["转化形式"] !== state.conversion) return false;
  if (state.progress !== "全部" && creator["是否已打标"] !== state.progress) return false;
  return true;
}

function filterCreators() {
  return creators.filter(matchesCreator);
}

function renderActiveFilters() {
  const chips = [];
  if (state.search) chips.push(`搜索：${state.search}`);
  if (state.brand !== "全部") chips.push(`品牌：${state.brand}`);
  if (state.platform !== "全部") chips.push(`平台：${state.platform}`);
  if (state.content !== "全部") chips.push(`内容：${state.content}`);
  if (state.product !== "全部") chips.push(`类目：${state.product}`);
  if (state.conversion !== "全部") chips.push(`转化：${state.conversion}`);
  if (state.progress !== "全部") chips.push(`状态：${state.progress}`);
  if (state.minCoop > 3) chips.push(`合作次数 >= ${state.minCoop}`);

  if (!chips.length) {
    elements.activeFilters.innerHTML = '<span class="pill is-muted">当前未设置额外筛选</span>';
    return;
  }
  elements.activeFilters.innerHTML = chips.map((chip) => `<span class="pill is-warm">${escapeHtml(chip)}</span>`).join("");
}

function renderPills(items, variant) {
  if (!items.length) return '<span class="pill is-muted">待补充</span>';
  return `<div class="pill-group">${items.map((item) => `<span class="pill ${variant}">${escapeHtml(item)}</span>`).join("")}</div>`;
}

function renderCreatorRows(filteredCreators) {
  elements.resultTitle.textContent = `${filteredCreators.length} 个达人`;
  const tabLabels = {
    creators: "达人池",
    tags: "标签字典",
    manage: "标签维护",
  };
  elements.resultSubtitle.textContent = `合作门槛 ${state.minCoop} 次，当前以 ${tabLabels[state.activeTab] || "达人池"} 视图展示`;
  renderActiveFilters();

  if (!filteredCreators.length) {
    elements.creatorTableBody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state">当前筛选条件下没有匹配达人，可以放宽品牌、内容或合作次数。</div>
        </td>
      </tr>
    `;
    return;
  }

  elements.creatorTableBody.innerHTML = "";

  filteredCreators.forEach((creator) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>
        <div class="creator-name">
          <strong>${escapeHtml(creator["达人昵称"] || creator["kolId"])}</strong>
          <span>@${escapeHtml(creator["kolId"])}</span>
        </div>
      </td>
      <td><span class="pill is-warm">${escapeHtml(creator["合作次数"])} 次</span></td>
      <td>${escapeHtml(creator["平台"] || "-")}</td>
      <td>${escapeHtml(creator["最近合作状态"] || "-")}</td>
      <td>${renderPills(splitMultiValue(creator["适配品牌"]), "is-warm")}</td>
      <td>${renderPills(creator.contentTags, "")}</td>
      <td>${renderPills(creator.productTags, "is-muted")}</td>
      <td><button class="ghost-button table-action" type="button">编辑标签</button></td>
    `;
    row.querySelector(".table-action").addEventListener("click", (event) => {
      event.stopPropagation();
      openDetail(creator);
    });
    row.addEventListener("click", () => openDetail(creator));
    elements.creatorTableBody.appendChild(row);
  });
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

function renderSelectField(label, value, options) {
  const mergedOptions = value && !options.includes(value) ? [value, ...options] : options;
  const choices = [
    '<option value="">请选择</option>',
    ...mergedOptions.map(
      (option) => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`,
    ),
  ];
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <select name="${escapeHtml(label)}">
        ${choices.join("")}
      </select>
    </label>
  `;
}

function openDetail(creator) {
  state.activeCreatorId = creator["kolId"];
  elements.detailTitle.textContent = creator["达人昵称"] || creator["kolId"];
  elements.detailSubtitle.textContent = `@${creator["kolId"]} · ${creator["平台"] || "-"} · 合作 ${creator["合作次数"]} 次`;

  const editorHint = syncConnected
    ? `当前为云端同步模式，保存后会写入工作区 ${syncSettings.workspaceId}。想新增下拉里没有的标签，先到“标签维护”页新增。`
    : "当前为本地模式，保存后会写到当前浏览器。想新增下拉里没有的标签，先到“标签维护”页新增。";

  elements.detailBody.innerHTML = `
    <article class="detail-card">
      <h3>基础信息</h3>
      <p><strong>最近状态：</strong>${escapeHtml(creator["最近合作状态"] || "-")}</p>
      <p><strong>最近跟进人：</strong>${escapeHtml(creator["最近跟进人"] || "-")}</p>
      <p><strong>首次合作：</strong>${escapeHtml(creator["首次合作时间"] || "-")}</p>
      <p><strong>最近合作：</strong>${escapeHtml(creator["最近合作时间"] || "-")}</p>
      <p><strong>是否复投：</strong>${escapeHtml(creator["是否复投过"] || "-")}</p>
    </article>
    <article class="detail-card">
      <h3>历史合作记录</h3>
      <p><strong>合作类型：</strong>${escapeHtml(creator["历史合作类型"] || "-")}</p>
      <p><strong>SPU：</strong>${escapeHtml(creator["历史合作SPU"] || "-")}</p>
    </article>
    <article class="detail-card is-wide">
      <h3>网页内打标</h3>
      <form id="creator-editor" class="editor-grid">
        ${renderInputField("主页链接", creator["主页链接"], "text", "主页链接")}
        ${renderInputField("达人昵称", creator["达人昵称"], "text", "达人昵称")}
        ${renderSelectField("内容一级标签", creator["内容一级标签"], tagOptions.contentPrimary)}
        ${renderSelectField("内容二级标签", creator["内容二级标签"], tagOptions.contentSecondary)}
        ${renderSelectField("内容形式标签", creator["内容形式标签"], tagOptions.contentFormat)}
        ${renderSelectField("人设/风格标签", creator["人设/风格标签"], tagOptions.persona)}
        ${renderSelectField("受众标签", creator["受众标签"], tagOptions.audience)}
        ${renderSelectField("带货一级类目", creator["带货一级类目"], tagOptions.productPrimary)}
        ${renderSelectField("带货二级类目", creator["带货二级类目"], tagOptions.productSecondary)}
        ${renderInputField("适配品牌", creator["适配品牌"], "text", "多个可用 / 分隔", "多个品牌可用 / 分隔")}
        ${renderSelectField("转化形式", creator["转化形式"], tagOptions.conversion)}
        ${renderSelectField("合作分层", creator["合作分层"], tagOptions.tier)}
        ${renderSelectField("是否已打标", creator["是否已打标"] || "待处理", tagOptions.progress)}
        ${renderInputField("打标依据链接", creator["打标依据链接"], "text", "内容链接或主页链接")}
        <label class="field is-wide">
          <span>备注</span>
          <textarea name="备注" placeholder="补充达人风格、历史表现、适配建议">${escapeHtml(creator["备注"] || "")}</textarea>
        </label>
        <div class="editor-actions is-wide">
          <p class="editor-meta">${escapeHtml(editorHint)}</p>
          <button class="solid-button" type="submit">保存当前达人</button>
        </div>
      </form>
    </article>
  `;

  const form = document.querySelector("#creator-editor");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveCreatorFromForm(new FormData(form));
  });

  if (!elements.detailModal.open) {
    elements.detailModal.showModal();
  }
}

async function saveCreatorFromForm(formData) {
  const creator = creators.find((item) => item["kolId"] === state.activeCreatorId);
  if (!creator) return;

  const nextValues = buildFormValues(formData);
  const changedFields = buildChangedFields(creator["kolId"], nextValues);

  if (hasWriteSyncConfig(syncSettings)) {
    try {
      await remoteUpsertCreatorOverride(creator["kolId"], changedFields);
      await refreshAfterMutation();
      setSaveStatus(`最近云端保存：${formatNow()}`);
      return;
    } catch (error) {
      Object.assign(creator, nextValues);
      refreshDerivedFields(creator);
      persistLocalOverridesFromCreators();
      render();
      openDetail(creator);
      syncConnected = false;
      updateModeCopy();
      setSaveStatus(`云端保存失败，已暂存本地：${error.message}`);
      return;
    }
  }

  Object.assign(creator, nextValues);
  refreshDerivedFields(creator);
  persistLocalOverridesFromCreators();
  render();
  openDetail(creator);
  setSaveStatus(`最近本地保存：${formatNow()}`);
}

function downloadCsv(rows, filename) {
  const headers = [
    "kolId",
    "合作次数",
    "平台",
    "主页链接",
    "达人昵称",
    "首次合作时间",
    "最近合作时间",
    "最近合作状态",
    "最近跟进人",
    "是否复投过",
    "历史合作类型",
    "历史合作SPU",
    "内容一级标签",
    "内容二级标签",
    "内容形式标签",
    "人设/风格标签",
    "受众标签",
    "带货一级类目",
    "带货二级类目",
    "适配品牌",
    "转化形式",
    "合作分层",
    "是否已打标",
    "打标依据链接",
    "备注",
  ];
  const csv = [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ""))]
    .map((line) => line.map(csvCell).join(","))
    .join("\n");

  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function render() {
  const filteredCreators = filterCreators();
  renderStats(filteredCreators);
  renderCreatorRows(filteredCreators);
}

async function init() {
  try {
    await loadData();
  } catch (error) {
    elements.generatedAt.textContent = "数据加载失败";
    elements.saveStatus.textContent = "请刷新页面重试";
    elements.creatorTableBody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state">达人数据加载失败，请稍后刷新页面。</div>
        </td>
      </tr>
    `;
    console.error(error);
    return;
  }

  elements.generatedAt.textContent = `数据生成时间 ${data.generatedAt}`;
  elements.coopRangeValue.textContent = `${state.minCoop} 次`;
  updateModeCopy();

  setupFilters();
  setupTabs();
  setupExport();
  setupSyncSettings();
  setupCustomTagManager();
  renderBrands();
  renderTagCards();
  renderCustomTagList();
  render();

  elements.closeModal.addEventListener("click", () => elements.detailModal.close());
  elements.detailModal.addEventListener("click", (event) => {
    const rect = elements.detailModal.getBoundingClientRect();
    const isInDialog =
      rect.top <= event.clientY &&
      event.clientY <= rect.top + rect.height &&
      rect.left <= event.clientX &&
      event.clientX <= rect.left + rect.width;
    if (!isInDialog) elements.detailModal.close();
  });
}

init();
