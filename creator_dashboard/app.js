const data = window.__CREATOR_POOL__;
const STORAGE_KEY = "creator_dashboard_overrides_v1";

const tagOptions = {
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

const creators = data.creators.map((creator) => normalizeCreator({ ...creator }));
applyStoredOverrides(creators);

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
};

function getOptions(dimension) {
  return unique(data.tags.filter((tag) => tag["标签维度"] === dimension).map((tag) => tag["标签名称"]));
}

function unique(items) {
  return [...new Set(items.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function splitMultiValue(value) {
  return (value || "")
    .split(/[，,\/]/)
    .map((item) => item.trim())
    .filter(Boolean);
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

function populateSelect(select, options) {
  select.innerHTML = "";
  ["全部", ...options].forEach((option) => {
    const node = document.createElement("option");
    node.value = option;
    node.textContent = option;
    select.appendChild(node);
  });
}

function formatNow() {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

function loadOverrides() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function persistOverrides() {
  const overrides = {};
  creators.forEach((creator) => {
    const changedFields = [
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
    const changed = {};
    changedFields.forEach((field) => {
      if (creator[field]) changed[field] = creator[field];
    });
    if (Object.keys(changed).length) overrides[creator["kolId"]] = changed;
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

function applyStoredOverrides(list) {
  const overrides = loadOverrides();
  list.forEach((creator) => {
    const changed = overrides[creator["kolId"]];
    if (!changed) return;
    Object.assign(creator, changed);
    refreshDerivedFields(creator);
  });
}

function setSaveStatus(text) {
  elements.saveStatus.textContent = text;
}

function setupFilters() {
  populateSelect(elements.brandFilter, unique(tagOptions.brand));
  populateSelect(elements.platformFilter, unique(creators.map((creator) => creator["平台"])));
  populateSelect(elements.contentFilter, tagOptions.contentPrimary);
  populateSelect(elements.productFilter, tagOptions.productPrimary);
  populateSelect(elements.conversionFilter, tagOptions.conversion);
  populateSelect(elements.progressFilter, tagOptions.progress);

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
          <p>${card.label}</p>
          <strong>${card.value}</strong>
          <p>${card.note}</p>
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
          <h3>${brand["品牌"]}</h3>
          <p>${brand["品牌定位"]}</p>
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
          <div class="pill-group">
            <span class="pill">${tag["标签大类"]}</span>
            <span class="pill is-muted">${tag["标签维度"]}</span>
          </div>
          <h3>${tag["标签名称"]}</h3>
          <p><strong>适配品牌：</strong>${tag["适配品牌"]}</p>
          <p>${tag["定义/什么时候打这个标签"]}</p>
        </article>
      `,
    )
    .join("");
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
  elements.activeFilters.innerHTML = chips.map((chip) => `<span class="pill is-warm">${chip}</span>`).join("");
}

function renderCreatorRows(filteredCreators) {
  elements.resultTitle.textContent = `${filteredCreators.length} 个达人`;
  elements.resultSubtitle.textContent = `合作门槛 ${state.minCoop} 次，当前以 ${state.activeTab === "creators" ? "达人池" : "标签字典"} 视图展示`;
  renderActiveFilters();

  if (!filteredCreators.length) {
    elements.creatorTableBody.innerHTML = `
      <tr>
        <td colspan="7">
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
          <strong>${creator["达人昵称"] || creator["kolId"]}</strong>
          <span>@${creator["kolId"]}</span>
        </div>
      </td>
      <td><span class="pill is-warm">${creator["合作次数"]} 次</span></td>
      <td>${creator["平台"] || "-"}</td>
      <td>${creator["最近合作状态"] || "-"}</td>
      <td>${renderPills(splitMultiValue(creator["适配品牌"]), "is-warm")}</td>
      <td>${renderPills(creator.contentTags, "")}</td>
      <td>${renderPills(creator.productTags, "is-muted")}</td>
    `;
    row.addEventListener("click", () => openDetail(creator));
    elements.creatorTableBody.appendChild(row);
  });
}

function renderPills(items, variant) {
  if (!items.length) return '<span class="pill is-muted">待补充</span>';
  return `<div class="pill-group">${items.map((item) => `<span class="pill ${variant}">${item}</span>`).join("")}</div>`;
}

function openDetail(creator) {
  state.activeCreatorId = creator["kolId"];
  elements.detailTitle.textContent = creator["达人昵称"] || creator["kolId"];
  elements.detailSubtitle.textContent = `@${creator["kolId"]} · ${creator["平台"] || "-"} · 合作 ${creator["合作次数"]} 次`;

  elements.detailBody.innerHTML = `
    <article class="detail-card">
      <h3>基础信息</h3>
      <p><strong>最近状态：</strong>${creator["最近合作状态"] || "-"}</p>
      <p><strong>最近跟进人：</strong>${creator["最近跟进人"] || "-"}</p>
      <p><strong>首次合作：</strong>${creator["首次合作时间"] || "-"}</p>
      <p><strong>最近合作：</strong>${creator["最近合作时间"] || "-"}</p>
      <p><strong>是否复投：</strong>${creator["是否复投过"] || "-"}</p>
    </article>
    <article class="detail-card">
      <h3>历史合作记录</h3>
      <p><strong>合作类型：</strong>${creator["历史合作类型"] || "-"}</p>
      <p><strong>SPU：</strong>${creator["历史合作SPU"] || "-"}</p>
    </article>
    <article class="detail-card is-wide">
      <h3>网页内打标</h3>
      <form id="creator-editor" class="editor-grid">
        ${renderInputField("主页链接", creator["主页链接"], "text", "主页链接")}
        ${renderInputField("达人昵称", creator["达人昵称"], "text", "达人昵称")}
        ${renderSelectField("内容一级标签", creator["内容一级标签"], tagOptions.contentPrimary)}
        ${renderInputField("内容二级标签", creator["内容二级标签"], "text", "多个可用 / 分隔")}
        ${renderSelectField("内容形式标签", creator["内容形式标签"], tagOptions.contentFormat)}
        ${renderSelectField("人设/风格标签", creator["人设/风格标签"], tagOptions.persona)}
        ${renderSelectField("受众标签", creator["受众标签"], tagOptions.audience)}
        ${renderSelectField("带货一级类目", creator["带货一级类目"], tagOptions.productPrimary)}
        ${renderInputField("带货二级类目", creator["带货二级类目"], "text", "多个可用 / 分隔")}
        ${renderInputField("适配品牌", creator["适配品牌"], "text", "多个可用 / 分隔")}
        ${renderSelectField("转化形式", creator["转化形式"], tagOptions.conversion)}
        ${renderSelectField("合作分层", creator["合作分层"], tagOptions.tier)}
        ${renderSelectField("是否已打标", creator["是否已打标"] || "待处理", tagOptions.progress)}
        ${renderInputField("打标依据链接", creator["打标依据链接"], "text", "内容链接或主页链接")}
        <label class="field is-wide">
          <span>备注</span>
          <textarea name="备注" placeholder="补充达人风格、历史表现、适配建议">${escapeHtml(creator["备注"] || "")}</textarea>
        </label>
        <div class="editor-actions is-wide">
          <p class="editor-meta">修改后会自动保存到当前浏览器，可再用“导出全部打标”带走结果。</p>
          <button class="solid-button" type="submit">保存当前达人</button>
        </div>
      </form>
    </article>
  `;

  const form = document.querySelector("#creator-editor");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveCreatorFromForm(new FormData(form));
  });

  if (!elements.detailModal.open) {
    elements.detailModal.showModal();
  }
}

function renderInputField(label, value, type, placeholder) {
  return `
    <label class="field">
      <span>${label}</span>
      <input name="${label}" type="${type}" value="${escapeHtml(value || "")}" placeholder="${placeholder}" />
    </label>
  `;
}

function renderSelectField(label, value, options) {
  const choices = ['<option value="">请选择</option>', ...options.map((option) => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${option}</option>`)];
  return `
    <label class="field">
      <span>${label}</span>
      <select name="${label}">
        ${choices.join("")}
      </select>
    </label>
  `;
}

function saveCreatorFromForm(formData) {
  const creator = creators.find((item) => item["kolId"] === state.activeCreatorId);
  if (!creator) return;

  [
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
  ].forEach((field) => {
    creator[field] = String(formData.get(field) || "").trim();
  });

  refreshDerivedFields(creator);
  persistOverrides();
  setSaveStatus(`最近保存：${formatNow()}`);
  render();
  openDetail(creator);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function dateStamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
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

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function render() {
  const filteredCreators = filterCreators();
  renderStats(filteredCreators);
  renderCreatorRows(filteredCreators);
}

function init() {
  elements.generatedAt.textContent = `数据生成时间 ${data.generatedAt}`;
  elements.coopRangeValue.textContent = `${state.minCoop} 次`;
  setSaveStatus("网页内修改会自动保存在当前浏览器");

  setupFilters();
  setupTabs();
  setupExport();
  renderBrands();
  renderTagCards();
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
