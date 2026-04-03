import {
  loadDashboardPayload,
  buildDashboardModel,
  buildStatusItems,
  buildSummaryCards,
  buildMetricNotes,
  buildAssumptionNotes,
} from "./dashboard-data.js";
import {
  createFilterState,
  buildCreatorFilterOptions,
  filterCreatorRows,
  filterRecordRows,
  paginateRows,
  normalizeTabForToolbar,
} from "./dashboard-filters.js";
import { createSyncService, formatSyncError } from "./dashboard-sync.js";
import {
  renderStatusStrip,
  renderSummaryCards,
  renderCreatorTable,
  renderRecordsTable,
  renderCockpit,
  renderSelectOptions,
} from "./dashboard-tables.js";
import { createModalController } from "./dashboard-modal.js";

const CREATOR_PAGE_SIZE = 100;

const elements = {
  generatedAt: document.querySelector("#generated-at"),
  cloudStatusPill: document.querySelector("#cloud-status-pill"),
  cloudStatusText: document.querySelector("#cloud-status-text"),
  statusStrip: document.querySelector("#status-strip"),
  summaryGrid: document.querySelector("#summary-grid"),
  tabs: document.querySelectorAll(".tab"),
  panels: document.querySelectorAll(".tab-panel"),
  creatorToolbar: document.querySelector("#creator-toolbar"),
  recordToolbar: document.querySelector("#record-toolbar"),
  quickFilterButtons: document.querySelectorAll("[data-quick-filter]"),
  searchInput: document.querySelector("#search-input"),
  brandFilter: document.querySelector("#brand-filter"),
  levelFilter: document.querySelector("#level-filter"),
  statusFilter: document.querySelector("#status-filter"),
  priorityFilter: document.querySelector("#priority-filter"),
  platformFilter: document.querySelector("#platform-filter"),
  repurchaseFilter: document.querySelector("#repurchase-filter"),
  recordSearchInput: document.querySelector("#record-search-input"),
  recordStoreFilter: document.querySelector("#record-store-filter"),
  gmvMeta: document.querySelector("#gmv-meta"),
  focusMeta: document.querySelector("#focus-meta"),
  recordsMeta: document.querySelector("#records-meta"),
  gmvHead: document.querySelector("#gmv-head"),
  gmvBody: document.querySelector("#gmv-body"),
  gmvPagination: document.querySelector("#gmv-pagination"),
  focusHead: document.querySelector("#focus-head"),
  focusBody: document.querySelector("#focus-body"),
  focusPagination: document.querySelector("#focus-pagination"),
  recordsHead: document.querySelector("#records-head"),
  recordsBody: document.querySelector("#records-body"),
  storeHealthList: document.querySelector("#store-health-list"),
  poolHealthList: document.querySelector("#pool-health-list"),
  activityList: document.querySelector("#activity-list"),
  quickActions: document.querySelector("#quick-actions"),
  metricList: document.querySelector("#metric-list"),
  assumptionList: document.querySelector("#assumption-list"),
  openUploadModal: document.querySelector("#open-upload-modal"),
  openSyncSettings: document.querySelector("#open-sync-settings"),
  openManualSync: document.querySelector("#open-manual-sync"),
};

const app = {
  payload: null,
  model: null,
  filters: createFilterState(),
  syncService: null,
  modalController: null,
};

function updateCloudStatus(connected, message) {
  elements.cloudStatusPill.dataset.tone = connected ? "ok" : "warn";
  elements.cloudStatusText.textContent = message;
}

function syncToolbarVisibility() {
  const tab = normalizeTabForToolbar(app.filters.activeTab);
  elements.creatorToolbar.classList.toggle("is-hidden", tab === "records" || tab === "cockpit");
  elements.recordToolbar.classList.toggle("is-hidden", tab !== "records");
}

function renderCreatorFilterOptions() {
  const options = buildCreatorFilterOptions(app.model);
  renderSelectOptions(elements.brandFilter, options.brandTags, "全部");
  renderSelectOptions(elements.levelFilter, options.levels, "全部");
  renderSelectOptions(elements.statusFilter, options.statuses, "全部");
  renderSelectOptions(elements.priorityFilter, options.priorities, "全部");
  renderSelectOptions(elements.platformFilter, options.platforms, "全部");
  renderSelectOptions(elements.repurchaseFilter, ["Y", "N"], "全部");
  renderSelectOptions(elements.recordStoreFilter, options.recordStores, "全部店铺");

  elements.brandFilter.value = app.filters.brandTag;
  elements.levelFilter.value = app.filters.level;
  elements.statusFilter.value = app.filters.status;
  elements.priorityFilter.value = app.filters.priority;
  elements.platformFilter.value = app.filters.platform;
  elements.repurchaseFilter.value = app.filters.repurchase;
  elements.recordStoreFilter.value = app.filters.recordStore;
}

function buildFilteredData() {
  const gmvRows = filterCreatorRows(app.model.gmvRows, app.filters);
  const focusRows = filterCreatorRows(app.model.focusRows, app.filters);
  const records = filterRecordRows(app.model.records, app.filters);
  return { gmvRows, focusRows, records };
}

function renderTables(filtered) {
  const gmvPage = paginateRows(filtered.gmvRows, app.filters.gmvPage, CREATOR_PAGE_SIZE);
  app.filters.gmvPage = gmvPage.page;
  renderCreatorTable({
    head: elements.gmvHead,
    body: elements.gmvBody,
    pagination: elements.gmvPagination,
    rows: gmvPage.rows,
    total: gmvPage.total,
    page: gmvPage.page,
    totalPages: gmvPage.totalPages,
    start: gmvPage.start,
    end: gmvPage.end,
    mode: "gmv",
    onEdit: (creatorId) => {
      const row = app.model.rowById.get(creatorId);
      if (row) app.modalController.openEditModal(row);
    },
    onPageChange: (page) => {
      app.filters.gmvPage = page;
      render();
    },
  });

  const focusPage = paginateRows(filtered.focusRows, app.filters.focusPage, CREATOR_PAGE_SIZE);
  app.filters.focusPage = focusPage.page;
  renderCreatorTable({
    head: elements.focusHead,
    body: elements.focusBody,
    pagination: elements.focusPagination,
    rows: focusPage.rows,
    total: focusPage.total,
    page: focusPage.page,
    totalPages: focusPage.totalPages,
    start: focusPage.start,
    end: focusPage.end,
    mode: "focus",
    onEdit: (creatorId) => {
      const row = app.model.rowById.get(creatorId);
      if (row) app.modalController.openEditModal(row);
    },
    onPageChange: (page) => {
      app.filters.focusPage = page;
      render();
    },
  });

  renderRecordsTable({
    head: elements.recordsHead,
    body: elements.recordsBody,
    rows: filtered.records,
  });

  elements.gmvMeta.textContent = `当前筛选命中 ${filtered.gmvRows.length} 人`;
  elements.focusMeta.textContent = `当前筛选命中 ${filtered.focusRows.length} 人`;
  elements.recordsMeta.textContent = `当前筛选命中 ${filtered.records.length} 条`;
}

function renderCockpitContent(filtered) {
  renderCockpit({
    storeHealthList: elements.storeHealthList,
    poolHealthList: elements.poolHealthList,
    activityList: elements.activityList,
    quickActions: elements.quickActions,
    metricList: elements.metricList,
    assumptionList: elements.assumptionList,
    syncHealth: app.payload.syncHealth || {},
    stats: app.payload.stats || {},
    metricNotes: buildMetricNotes(app.payload.metrics || []),
    assumptions: buildAssumptionNotes(app.payload.assumptions || []),
    onOpenUpload: () => app.modalController.openUploadModal(),
    onOpenManualSync: () => app.modalController.openManualSyncModal(),
    onOpenSyncSettings: () => app.modalController.openSyncSettingsModal(),
    filteredCounts: {
      gmv: filtered.gmvRows.length,
      focus: filtered.focusRows.length,
    },
  });
}

function render() {
  syncToolbarVisibility();
  const filtered = buildFilteredData();

  renderStatusStrip(elements.statusStrip, buildStatusItems(app.payload.syncHealth || {}));
  renderSummaryCards(
    elements.summaryGrid,
    buildSummaryCards({
      stats: app.payload.stats || {},
      activeTab: app.filters.activeTab,
      filteredCounts: filtered,
    })
  );
  renderTables(filtered);
  renderCockpitContent(filtered);
}

function rebuildModel() {
  app.model = buildDashboardModel({
    payload: app.payload,
    remoteCoreOverridesById: app.syncService.getRemoteCoreOverrides(),
    localCoreOverridesById: app.syncService.getLocalCoreOverrides(),
  });
}

async function refreshOverrides() {
  try {
    await app.syncService.refreshRemoteOverrides();
    updateCloudStatus(true, "已连接共享库");
  } catch (error) {
    updateCloudStatus(false, `共享读取失败，当前仅使用本机暂存`);
    app.syncService.setStatusMessage(`共享读取失败：${formatSyncError(error)}`);
  }
  rebuildModel();
  renderCreatorFilterOptions();
  render();
}

function setupTabs() {
  elements.tabs.forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      app.filters.activeTab = tab;
      elements.tabs.forEach((item) => item.classList.toggle("is-active", item === button));
      elements.panels.forEach((panel) => panel.classList.toggle("is-active", panel.dataset.panel === tab));
      render();
    });
  });
}

function setupFilters() {
  elements.searchInput.addEventListener("input", (event) => {
    app.filters.search = event.target.value.trim().toLowerCase();
    app.filters.gmvPage = 1;
    app.filters.focusPage = 1;
    render();
  });
  elements.recordSearchInput.addEventListener("input", (event) => {
    app.filters.recordSearch = event.target.value.trim().toLowerCase();
    render();
  });
  elements.quickFilterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      app.filters.quickFilter = button.dataset.quickFilter || "all";
      elements.quickFilterButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      app.filters.gmvPage = 1;
      app.filters.focusPage = 1;
      render();
    });
  });
  [
    [elements.brandFilter, "brandTag"],
    [elements.levelFilter, "level"],
    [elements.statusFilter, "status"],
    [elements.priorityFilter, "priority"],
    [elements.platformFilter, "platform"],
    [elements.repurchaseFilter, "repurchase"],
    [elements.recordStoreFilter, "recordStore"],
  ].forEach(([element, key]) => {
    element.addEventListener("change", (event) => {
      app.filters[key] = event.target.value;
      app.filters.gmvPage = 1;
      app.filters.focusPage = 1;
      render();
    });
  });
}

function setupTopActions() {
  elements.openUploadModal.addEventListener("click", () => app.modalController.openUploadModal());
  elements.openSyncSettings.addEventListener("click", () => app.modalController.openSyncSettingsModal());
  elements.openManualSync.addEventListener("click", () => app.modalController.openManualSyncModal());
}

async function init() {
  app.payload = await loadDashboardPayload();
  elements.generatedAt.textContent = `数据生成时间 ${app.payload.generatedAt || "未知"} · 数据真源 ${app.payload.source || "unknown"}`;

  app.syncService = createSyncService();
  app.syncService.initialize();

  try {
    await app.syncService.refreshRemoteOverrides();
    updateCloudStatus(true, "已连接共享库");
  } catch (error) {
    updateCloudStatus(false, "共享读取失败，当前仅使用本机暂存");
    app.syncService.setStatusMessage(`共享读取失败：${formatSyncError(error)}`);
  }

  rebuildModel();
  renderCreatorFilterOptions();

  app.modalController = createModalController({
    syncService: app.syncService,
    getCreatorById: (creatorId) => app.model.rowById.get(creatorId),
    getFocusMembership: (creatorId) => app.model.gmvPoolIds.has(creatorId),
    onSaved: async () => {
      rebuildModel();
      render();
    },
    onRefreshRequested: async () => {
      await refreshOverrides();
    },
  });

  setupTabs();
  setupFilters();
  setupTopActions();
  render();
}

init().catch((error) => {
  console.error(error);
  elements.generatedAt.textContent = "页面加载失败";
  updateCloudStatus(false, "页面初始化失败");
  elements.summaryGrid.innerHTML = `
    <article class="summary-card summary-card--error">
      <p class="summary-card__label">初始化失败</p>
      <strong class="summary-card__value">请稍后刷新</strong>
      <p class="summary-card__note">${String(error?.message || error || "未知错误")}</p>
    </article>
  `;
});
