import { CORE_EDIT_FIELDS, formatSyncError, parsePidFromText } from "./dashboard-sync.js";
import { escapeHtml, formatNumber, getCreatorKey } from "./dashboard-data.js";

function byId(id) {
  return document.querySelector(id);
}

function closeDialog(dialog) {
  if (dialog?.open) dialog.close();
}

function ensureDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}

function renderEditField(field, value) {
  if (field.type === "select") {
    return `
      <label class="toolbar-field">
        <span>${escapeHtml(field.label)}</span>
        <select name="${escapeHtml(field.label)}">
          <option value="">请选择</option>
          ${field.options
            .map((option) => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`)
            .join("")}
        </select>
      </label>
    `;
  }
  if (field.type === "textarea") {
    return `
      <label class="toolbar-field toolbar-field--wide">
        <span>${escapeHtml(field.label)}</span>
        <textarea name="${escapeHtml(field.label)}" placeholder="${escapeHtml(field.placeholder || "")}">${escapeHtml(
          value || ""
        )}</textarea>
      </label>
    `;
  }
  return `
    <label class="toolbar-field">
      <span>${escapeHtml(field.label)}</span>
      <input
        name="${escapeHtml(field.label)}"
        type="${escapeHtml(field.type || "text")}"
        value="${escapeHtml(value || "")}"
        placeholder="${escapeHtml(field.placeholder || "")}"
      />
    </label>
  `;
}

export function createModalController({ syncService, getCreatorById, getFocusMembership, onSaved, onRefreshRequested }) {
  const editDialog = byId("#edit-modal");
  const editTitle = byId("#edit-modal-title");
  const editMeta = byId("#edit-modal-meta");
  const editBody = byId("#edit-modal-body");
  const editStatus = byId("#edit-modal-status");
  const editShell = byId("#edit-modal-form-shell");
  const closeEditButton = byId("#close-edit-modal");
  const saveLocalButton = byId("#edit-save-local");

  const uploadDialog = byId("#upload-modal");
  const closeUploadButton = byId("#close-upload-modal");
  const coopStoreSelect = byId("#coop-store-select");
  const coopPeriodInput = byId("#coop-period-input");
  const coopFileInput = byId("#coop-upload-input");
  const coopUploadButton = byId("#coop-upload-button");
  const coopStatus = byId("#coop-upload-status");
  const skuStoreSelect = byId("#sku-store-select");
  const skuVersionInput = byId("#sku-version-input");
  const skuFileInput = byId("#sku-upload-input");
  const skuUploadButton = byId("#sku-upload-button");
  const skuStatus = byId("#sku-upload-status");

  const syncDialog = byId("#sync-settings-modal");
  const closeSyncButton = byId("#close-sync-settings-modal");
  const editorInput = byId("#core-editor-name");
  const passcodeInput = byId("#core-write-passcode");
  const syncStatus = byId("#core-sync-status");
  const saveSyncButton = byId("#core-save-sync");
  const refreshCloudButton = byId("#core-refresh-cloud");
  const clearSyncButton = byId("#core-clear-sync");

  const manualDialog = byId("#manual-sync-modal");
  const closeManualButton = byId("#close-manual-sync-modal");
  const copyManualButton = byId("#copy-manual-command");
  const manualStatus = byId("#manual-sync-status");

  let activeCreatorId = "";

  function syncSettingsToInputs() {
    const settings = syncService.getSyncSettings();
    editorInput.value = settings.editorName || "";
    passcodeInput.value = settings.writePasscode || "";
    syncStatus.textContent = syncService.getStatusMessage();
  }

  async function saveOverrideFromDialog(forceLocal = false) {
    const form = editShell.querySelector("form");
    const formData = new FormData(form);
    const values = {};
    CORE_EDIT_FIELDS.forEach((field) => {
      values[field.label] = String(formData.get(field.label) || "").trim();
    });
    if (!values["复投产品PID"] && values["复投产品链接"]) {
      values["复投产品PID"] = parsePidFromText(values["复投产品链接"]);
    }
    const result = await syncService.saveCreatorOverride(activeCreatorId, values, { forceLocal });
    editStatus.textContent = syncService.getStatusMessage();
    await onSaved(result);
    const latestRow = getCreatorById(activeCreatorId);
    if (latestRow) {
      openEditModal(latestRow);
    }
  }

  function openEditModal(row) {
    activeCreatorId = getCreatorKey(row);
    editTitle.textContent = row["达人名称"] || row["达人ID"] || "达人详情";
    editMeta.innerHTML = `
      <div class="modal-meta-grid">
        <span><strong>ID：</strong>${escapeHtml(row["达人ID"] || "-")}</span>
        <span><strong>历史总GMV：</strong>${escapeHtml(formatNumber(row["历史总GMV"]))}</span>
        <span><strong>90天GMV：</strong>${escapeHtml(formatNumber(row["90天GMV"]))}</span>
        <span><strong>近30天视频GMV：</strong>${escapeHtml(formatNumber(row["近30天发布视频gmv"]))}</span>
        <span><strong>当前合作状态：</strong>${escapeHtml(row["当前合作状态"] || "-")}</span>
        <span><strong>GMV池状态：</strong>${getFocusMembership(activeCreatorId) ? "已在GMV池" : "未进入GMV池"}</span>
      </div>
    `;
    editBody.innerHTML = `
      <form class="edit-form">
        ${CORE_EDIT_FIELDS.map((field) => renderEditField(field, row[field.label] || "")).join("")}
      </form>
    `;
    editStatus.textContent = syncService.canWriteShared()
      ? "当前会优先写入共享库；失败时自动回退本机。"
      : "当前未填写编辑人或口令，默认只保存到本机。";

    const linkInput = editBody.querySelector('input[name="复投产品链接"]');
    const pidInput = editBody.querySelector('input[name="复投产品PID"]');
    if (linkInput && pidInput) {
      linkInput.addEventListener("input", () => {
        if (!pidInput.value.trim()) {
          pidInput.value = parsePidFromText(linkInput.value);
        }
      });
    }
    ensureDialog(editDialog);
  }

  async function handleCoopUpload() {
    const file = coopFileInput.files?.[0];
    if (!file) {
      coopStatus.textContent = "请先选择合作表文件。";
      return;
    }
    try {
      coopStatus.textContent = "正在上传合作表...";
      const result = await syncService.uploadCooperationWorkbook(file);
      coopStatus.textContent = `合作表上传成功：${result.inserted} 行已写入云端 · 店铺 ${coopStoreSelect.value}${coopPeriodInput.value ? ` · 周期 ${coopPeriodInput.value}` : ""}`;
    } catch (error) {
      coopStatus.textContent = `合作表上传失败：${formatSyncError(error)}`;
    }
  }

  async function handleSkuUpload() {
    const file = skuFileInput.files?.[0];
    if (!file) {
      skuStatus.textContent = "请先选择 SKU / SPU 文件。";
      return;
    }
    try {
      skuStatus.textContent = "正在上传 SKU / SPU 表...";
      const result = await syncService.uploadSkuWorkbook(file);
      const extra = [skuStoreSelect.value, skuVersionInput.value].filter(Boolean).join(" · ");
      skuStatus.textContent = `SKU 表上传成功：${result.inserted} 行已写入云端${extra ? ` · ${extra}` : ""}`;
    } catch (error) {
      skuStatus.textContent = `SKU 表上传失败：${formatSyncError(error)}`;
    }
  }

  async function handleSyncSettingsSave() {
    syncService.updateSyncSettings({
      editorName: editorInput.value,
      writePasscode: passcodeInput.value,
    });
    syncStatus.textContent = editorInput.value
      ? `已保存编辑身份：${editorInput.value}`
      : "已保存本机设置，可继续只读共享数据。";
    await onRefreshRequested();
  }

  async function handleRefreshCloud() {
    try {
      await onRefreshRequested();
      syncStatus.textContent = `已刷新工作区 ${syncService.getSyncSettings().workspaceId} 的共享数据。`;
    } catch (error) {
      syncStatus.textContent = `刷新失败：${formatSyncError(error)}`;
    }
  }

  async function handleClearSync() {
    syncService.clearSyncSettings();
    syncService.clearLocalOverrides();
    syncService.initialize();
    syncSettingsToInputs();
    syncStatus.textContent = "已清空本机编辑身份与本地暂存，继续只读共享数据。";
    await onSaved({ mode: "clear" });
  }

  async function copyManualCommand() {
    const command =
      "TIKTOK_DB_FIRST=1 TIKTOK_SKIP_DESKTOP_PUBLISH=1 TIKTOK_SKIP_WORKBOOK_SYNC=1 python3 /Users/apple/Documents/Playground/tiktok_shop_sync/run_sync_pipeline.py --mode auto";
    try {
      await navigator.clipboard.writeText(command);
      manualStatus.textContent = "终端命令已复制到剪贴板。";
    } catch {
      manualStatus.textContent = "复制失败，请手动复制弹窗中的命令。";
    }
  }

  closeEditButton?.addEventListener("click", () => closeDialog(editDialog));
  closeUploadButton?.addEventListener("click", () => closeDialog(uploadDialog));
  closeSyncButton?.addEventListener("click", () => closeDialog(syncDialog));
  closeManualButton?.addEventListener("click", () => closeDialog(manualDialog));

  editShell?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveOverrideFromDialog(false);
  });
  saveLocalButton?.addEventListener("click", async () => {
    await saveOverrideFromDialog(true);
  });
  coopUploadButton?.addEventListener("click", handleCoopUpload);
  skuUploadButton?.addEventListener("click", handleSkuUpload);
  saveSyncButton?.addEventListener("click", handleSyncSettingsSave);
  refreshCloudButton?.addEventListener("click", handleRefreshCloud);
  clearSyncButton?.addEventListener("click", handleClearSync);
  copyManualButton?.addEventListener("click", copyManualCommand);

  syncSettingsToInputs();

  return {
    openEditModal,
    openUploadModal() {
      ensureDialog(uploadDialog);
    },
    openSyncSettingsModal() {
      syncSettingsToInputs();
      ensureDialog(syncDialog);
    },
    openManualSyncModal() {
      ensureDialog(manualDialog);
    },
  };
}
