import { getCreatorKey } from "./dashboard-data.js";

export const CORE_SYNC_SETTINGS_KEY = "core_dashboard_sync_settings_v1";
export const CORE_LOCAL_OVERRIDE_KEY = "core_dashboard_local_overrides_v1";
export const LEGACY_SYNC_SETTINGS_KEY = "creator_dashboard_sync_settings_v1";

export const PUBLIC_READ_SYNC_SETTINGS = {
  supabaseUrl: "https://sbznfjnsirajqkkcwayj.supabase.co",
  anonKey: "sb_publishable_tM67K7Mi1qDUkemhgzDuGg_dsdwitBT",
  workspaceId: "creator-dashboard-prod",
  editorName: "",
  writePasscode: "",
};

export const CORE_EDIT_FIELDS = [
  { label: "复投产品链接", remoteKey: "core_复投产品链接", type: "text", placeholder: "粘贴产品链接或直接输入 PID" },
  { label: "复投产品PID", remoteKey: "core_复投产品PID", type: "text", placeholder: "可直接输入数字 PID" },
  { label: "优先级", remoteKey: "core_优先级", type: "select", options: ["高", "中", "低"] },
  { label: "下一步动作", remoteKey: "core_下一步动作", type: "textarea", placeholder: "填写下一步运营动作" },
  { label: "负责人", remoteKey: "core_负责人", type: "text", placeholder: "负责人" },
  { label: "截止日期", remoteKey: "core_截止日期", type: "date", placeholder: "" },
  { label: "备注", remoteKey: "core_备注", type: "textarea", placeholder: "补充说明" },
];

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

function loadStoredSyncSettings() {
  try {
    const current = JSON.parse(localStorage.getItem(CORE_SYNC_SETTINGS_KEY) || "{}");
    if (Object.keys(current).length) return normalizeSyncSettings(current);
    const legacy = JSON.parse(localStorage.getItem(LEGACY_SYNC_SETTINGS_KEY) || "{}");
    if (Object.keys(legacy).length) return normalizeSyncSettings(legacy);
  } catch {
    return normalizeSyncSettings();
  }
  return normalizeSyncSettings();
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

export function formatSyncError(error) {
  const message = String(error?.message || error || "").trim();
  if (!message) return "共享库暂时不可用，当前继续使用本机暂存。";
  if (/failed to fetch/i.test(message) || /networkerror/i.test(message) || /err_connection/i.test(message)) {
    return "当前浏览器环境暂时无法连接共享库，页面仍可正常浏览并保存到本机。";
  }
  return message;
}

export function parsePidFromText(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d+$/.test(text)) return text;
  const patterns = [/\/product\/(\d+)/i, /[?&](?:pid|product_id)=([0-9]+)/i, /\b(\d{12,})\b/];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return "";
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

function buildSupabaseHeaders(settings, extra = {}) {
  return {
    apikey: settings.anonKey,
    Authorization: `Bearer ${settings.anonKey}`,
    ...extra,
  };
}

async function supabaseRequest(settings, path, options = {}) {
  const { headers = {}, ...rest } = options;
  const response = await fetch(`${settings.supabaseUrl}/rest/v1${path}`, {
    ...rest,
    headers: buildSupabaseHeaders(settings, headers),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Supabase ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function ensureXlsxReady() {
  if (!window.XLSX) throw new Error("页面还没有加载完成，请刷新后重试。");
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsArrayBuffer(file);
  });
}

async function parseWorkbookRows(file) {
  ensureXlsxReady();
  const buffer = await readFileAsArrayBuffer(file);
  const workbook = window.XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return window.XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

function normalizeCooperationUploadRows(rows) {
  return rows
    .map((row) => ({
      cooperation_id: String(row["合作ID"] || "").trim(),
      kol_id: String(row["kolId"] || "").trim(),
      platform: String(row["平台"] || "").trim(),
      cooperation_type: String(row["合作类型"] || "").trim(),
      start_at: String(row["开始时间"] || "").trim(),
      end_at: String(row["结束时间"] || "").trim(),
      is_joint_post: String(row["是否为Joint Post合作"] || "").trim(),
      sample_type: String(row["样品类型"] || "").trim(),
      shipping_channel: String(row["发货渠道"] || "").trim(),
      cooperation_attribute: String(row["合作属性"] || "").trim(),
      cooperation_fee: String(row["合作费用"] || "").trim(),
      prepaid_fee: String(row["预付费用"] || "").trim(),
      commission_rate: String(row["佣金比例"] || "").trim(),
      shipping_address: String(row["收获地址"] || "").trim(),
      live_minutes: String(row["直播分钟数"] || "").trim(),
      product_spu_list: String(row["合作商品SPU，以 / 分割"] || "").trim(),
      created_at_source: String(row["创建时间"] || "").trim(),
      updated_at_source: String(row["更新时间"] || "").trim(),
      created_by_source: String(row["创建人"] || "").trim(),
      status: String(row["状态"] || "").trim(),
    }))
    .filter((row) => row.cooperation_id || row.kol_id);
}

function normalizeSkuUploadRows(rows) {
  return rows
    .map((row) => ({
      spu: String(row["spu"] || row["SPU"] || "").trim(),
      sku: String(row["sku"] || row["SKU"] || "").trim().toUpperCase(),
      cost: String(row["cost"] || row["COST"] || "").trim(),
      country_code: String(
        row["country_code"] || row["country code"] || row["COUNTRY_CODE"] || ""
      )
        .trim()
        .toUpperCase(),
    }))
    .filter((row) => row.spu && row.sku);
}

export function createSyncService() {
  let syncSettings = normalizeSyncSettings(loadStoredSyncSettings());
  let localCoreOverridesById = loadLocalOverrides();
  let remoteRawFieldsById = {};
  let remoteCoreOverridesById = {};
  let statusMessage = "默认只读共享云端；填写编辑人和口令后可写入人工维护字段。";

  async function loadRemoteOverrides() {
    const workspace = encodeURIComponent(syncSettings.workspaceId);
    const rows = await supabaseRequest(
      syncSettings,
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
    return rows;
  }

  function buildMergedOverridePayload(creatorId, values) {
    const merged = { ...(remoteRawFieldsById[creatorId] || {}) };
    CORE_EDIT_FIELDS.forEach((config) => {
      const nextValue = String(values[config.label] || "").trim();
      if (nextValue) merged[config.remoteKey] = nextValue;
      else delete merged[config.remoteKey];
    });
    return merged;
  }

  async function remoteUpsertCreatorOverride(creatorId, mergedFields) {
    return supabaseRequest(syncSettings, "/rpc/upsert_creator_override", {
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

  async function replaceCloudUpload(functionName, fileName, rows) {
    return supabaseRequest(syncSettings, `/rpc/${functionName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_workspace_id: syncSettings.workspaceId,
        p_passcode: syncSettings.writePasscode,
        p_editor_name: syncSettings.editorName,
        p_source_file: fileName,
        p_rows: rows,
      }),
    });
  }

  return {
    initialize() {
      syncSettings = loadStoredSyncSettings();
      localCoreOverridesById = loadLocalOverrides();
    },
    getSyncSettings() {
      return { ...syncSettings };
    },
    updateSyncSettings(partial) {
      syncSettings = normalizeSyncSettings({ ...syncSettings, ...partial });
      persistSyncSettings(syncSettings);
      return { ...syncSettings };
    },
    clearSyncSettings() {
      syncSettings = normalizeSyncSettings(PUBLIC_READ_SYNC_SETTINGS);
      persistSyncSettings(syncSettings);
      return { ...syncSettings };
    },
    canWriteShared() {
      return Boolean(syncSettings.editorName && syncSettings.writePasscode);
    },
    getLocalCoreOverrides() {
      return { ...localCoreOverridesById };
    },
    getRemoteCoreOverrides() {
      return { ...remoteCoreOverridesById };
    },
    getRemoteRawFields() {
      return { ...remoteRawFieldsById };
    },
    setStatusMessage(message) {
      statusMessage = message;
    },
    getStatusMessage() {
      return statusMessage;
    },
    async refreshRemoteOverrides() {
      await loadRemoteOverrides();
      statusMessage = `已连接工作区 ${syncSettings.workspaceId}，当前可读共享维护结果。`;
    },
    async saveCreatorOverride(creatorId, values, { forceLocal = false } = {}) {
      const normalizedValues = { ...values };
      if (!normalizedValues["复投产品PID"] && normalizedValues["复投产品链接"]) {
        normalizedValues["复投产品PID"] = parsePidFromText(normalizedValues["复投产品链接"]);
      }
      if (forceLocal || !this.canWriteShared()) {
        localCoreOverridesById[creatorId] = normalizedValues;
        persistLocalOverrides(localCoreOverridesById);
        statusMessage = `已保存到本机暂存：${creatorId}`;
        return { mode: "local", creatorId };
      }
      try {
        const mergedFields = buildMergedOverridePayload(creatorId, normalizedValues);
        await remoteUpsertCreatorOverride(creatorId, mergedFields);
        delete localCoreOverridesById[creatorId];
        persistLocalOverrides(localCoreOverridesById);
        await loadRemoteOverrides();
        statusMessage = `已保存共享字段：${creatorId}`;
        return { mode: "remote", creatorId };
      } catch (error) {
        localCoreOverridesById[creatorId] = normalizedValues;
        persistLocalOverrides(localCoreOverridesById);
        statusMessage = `云端保存失败，已回退到本机暂存：${formatSyncError(error)}`;
        return { mode: "fallback", creatorId, error };
      }
    },
    clearLocalOverrides() {
      localCoreOverridesById = {};
      persistLocalOverrides(localCoreOverridesById);
    },
    async uploadCooperationWorkbook(file) {
      if (!this.canWriteShared()) {
        throw new Error("请先填写编辑人和写入口令，再上传合作表到云端。");
      }
      const rows = normalizeCooperationUploadRows(await parseWorkbookRows(file));
      if (!rows.length) {
        throw new Error("合作表没有可上传的数据，请检查表头是否正确。");
      }
      const result = await replaceCloudUpload("replace_tiktok_cooperation_upload", file.name, rows);
      const inserted = Number(result?.inserted ?? 0);
      if (inserted <= 0) {
        throw new Error("合作表接口已响应，但云端写入 0 行，请检查表头和文件内容。");
      }
      return { inserted, rows };
    },
    async uploadSkuWorkbook(file) {
      if (!this.canWriteShared()) {
        throw new Error("请先填写编辑人和写入口令，再上传 SPU/SKU 表到云端。");
      }
      const rows = normalizeSkuUploadRows(await parseWorkbookRows(file));
      if (!rows.length) {
        throw new Error("SPU/SKU 表没有可上传的数据，请检查表头是否正确。");
      }
      const result = await replaceCloudUpload("replace_tiktok_product_sku_cost_upload", file.name, rows);
      const inserted = Number(result?.inserted ?? 0);
      if (inserted <= 0) {
        throw new Error("SPU/SKU 接口已响应，但云端写入 0 行，请检查表头和文件内容。");
      }
      return { inserted, rows };
    },
    getCreatorIdFromRow(row) {
      return getCreatorKey(row);
    },
  };
}
