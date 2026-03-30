import fs from "node:fs";
import path from "node:path";
import playwright from "/Users/apple/Documents/Playground/chrome_bridge/node_modules/playwright-core/index.js";

const { chromium } = playwright;

const configs = {
  letme: { port: 9222, store: "Letme Home Living", shopId: "7495867457043466817" },
  stypro: { port: 9231, store: "STYPRO.ID", shopId: "7496061001205123232" },
  sparco: { port: 9232, store: "spar.co jewelry", shopId: "7495612479548001053" },
  icyee: { port: 9234, store: "Icyee Indonesia", shopId: "7496020661994686844" },
};

const MODULES = {
  creator: {
    moduleType: 103,
    tabId: "core-tabs-0-tab-0",
    tabText: "Creators",
    waitText: "Creator",
    prefix: "Transaction_Analysis_Creator_List_",
  },
  video: {
    moduleType: 105,
    tabId: "core-tabs-0-tab-2",
    tabText: "Videos",
    waitText: "Video Information",
    prefix: "Transaction_Analysis_Video_List_",
  },
};

class ExportSkipError extends Error {
  constructor(reason, detail = "") {
    super(`__SKIP__:${reason}${detail ? `:${detail}` : ""}`);
    this.name = "ExportSkipError";
    this.reason = reason;
    this.detail = detail;
  }
}

function formatRangeToken(value) {
  const [month, day, year] = value.split("/");
  return `${year}${month}${day}`;
}

function buildPerformanceUrl(config) {
  return `https://affiliate-id.tokopedia.com/insights/transaction-analysis?shop_region=ID&shop_id=${config.shopId}`;
}

function buildSellerLandingUrl(config) {
  return `https://seller-id.tokopedia.com/affiliate/landing?shop_region=ID&shop_id=${config.shopId}`;
}

function parseUsDate(value) {
  const [month, day, year] = value.split("/").map((item) => Number(item));
  return { year, month, day };
}

function toGmt7Epoch(value) {
  const { year, month, day } = parseUsDate(value);
  return Math.floor(Date.UTC(year, month - 1, day, -7, 0, 0) / 1000);
}

function addDaysUs(value, days) {
  const { year, month, day } = parseUsDate(value);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getUTCDate()).padStart(2, "0");
  return `${nextMonth}/${nextDay}/${nextYear}`;
}

function dayToken(value) {
  const { day } = parseUsDate(value);
  return String(day);
}

function yearMonthTokenUs(value) {
  const { year, month } = parseUsDate(value);
  return `${year}-${String(month).padStart(2, "0")}`;
}

function buildVideoCreateBody(appliedRange) {
  const endExclusive = addDaysUs(appliedRange.end, 1);
  return {
    module_type: 105,
    transaction_video_list_param: {
      time_descriptor: {
        granularity_type: 1,
        timezone_offset: 25200,
        start_time: toGmt7Epoch(appliedRange.start),
        end_time: toGmt7Epoch(endExclusive),
      },
      metric_types: [1, 2, 5, 11, 14, 15, 16, 12],
      page_param: {
        page_no: 1,
        page_size: 20,
      },
      sorter: {
        sort_type: 1,
        order_type: 1,
      },
      filter: {},
    },
  };
}

async function describePageState(page) {
  const snapshot = await page.evaluate(() => {
    const bodyText = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
    const visibleButtons = [...document.querySelectorAll("button")]
      .map((node) => (node.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 12);
    return {
      url: location.href,
      bodyText: bodyText.slice(0, 400),
      visibleButtons,
    };
  }).catch(() => ({ url: page.url(), bodyText: "", visibleButtons: [] }));
  return {
    ...snapshot,
    bodyLower: (snapshot.bodyText || "").toLowerCase(),
  };
}

function classifyPageState(state, pageLabel) {
  const text = state.bodyLower || "";
  const url = (state.url || "").toLowerCase();
  const loginHints = ["login", "log in", "sign in", "session expired", "expired"];
  const emptyHints = ["no data", "no result", "no results", "empty", "no creator", "no video"];
  if (url.includes("login") || loginHints.some((hint) => text.includes(hint))) {
    return new ExportSkipError("not_logged_in", `${pageLabel} page requires login`);
  }
  if (emptyHints.some((hint) => text.includes(hint))) {
    return new ExportSkipError("no_results", `${pageLabel} page returned no results`);
  }
  return null;
}

async function ensurePageReady(page, pageLabel) {
  const state = await describePageState(page);
  const classified = classifyPageState(state, pageLabel);
  if (classified) {
    throw classified;
  }
  return state;
}

async function openPerformancePage(page, config) {
  const targetUrl = buildPerformanceUrl(config);
  const landingUrl = buildSellerLandingUrl(config);
  if (!page.url().includes("affiliate-id.tokopedia.com/insights/transaction-analysis")) {
    await page.goto(landingUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  }
  let ready = await page.waitForFunction(
    () => document.body.innerText.includes("Videos") && document.body.innerText.includes("Export"),
    { timeout: 30000 },
  ).then(() => true).catch(() => false);
  if (!ready) {
    const firstState = await describePageState(page);
    const firstClassified = classifyPageState(firstState, "Performance");
    if (firstClassified?.reason === "not_logged_in") {
      await page.goto(landingUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(5000);
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      ready = await page.waitForFunction(
        () => document.body.innerText.includes("Videos") && document.body.innerText.includes("Export"),
        { timeout: 30000 },
      ).then(() => true).catch(() => false);
    }
  }
  if (!ready) {
    const state = await ensurePageReady(page, "Performance");
    throw new Error(`performance page not ready: ${state.url} :: ${state.bodyText}`);
  }
  await page.waitForTimeout(4000);
}

async function resolveRangePickerIndex(page, preferredIndex = 1) {
  const count = await page.locator(".arco-picker-range").count();
  if (count <= 0) {
    throw new Error("date range picker not found");
  }
  return count > preferredIndex ? preferredIndex : count - 1;
}

async function selectTab(page, tabId, tabText, waitText) {
  let tab = page.locator(`#${tabId}`);
  if ((await tab.count()) === 0) {
    tab = page
      .locator('[role="tab"], .arco-tabs-tab')
      .filter({ hasText: tabText })
      .first();
  }
  await tab.click({ force: true });
  await page.waitForTimeout(2500);
}

async function readAppliedRange(page, pickerIndex = 1) {
  const resolvedIndex = await resolveRangePickerIndex(page, pickerIndex);
  return page.evaluate((index) => {
    const pickers = [...document.querySelectorAll(".arco-picker-range")];
    const picker = pickers[index];
    if (!picker) {
      return { start: "", end: "" };
    }
    const inputs = [...picker.querySelectorAll('input[placeholder="Start date"], input[placeholder="End date"]')];
    const values = inputs.slice(0, 2).map((node) => (node.value || "").trim());
    return { start: values[0] || "", end: values[1] || "" };
  }, resolvedIndex);
}

async function clickSameDayRange(page, pickerIndex, dateValue) {
  const resolvedIndex = await resolveRangePickerIndex(page, pickerIndex);
  const picker = page.locator(".arco-picker-range").nth(resolvedIndex);
  await picker.click({ force: true });
  await page.waitForTimeout(800);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const headers = await page.evaluate(() =>
      [...document.querySelectorAll(".arco-picker-header-value")].map((node) => (node.textContent || "").trim()),
    );
    if (headers.includes(yearMonthTokenUs(dateValue))) {
      break;
    }
    await page.evaluate((targetYearMonth) => {
      const headers = [...document.querySelectorAll(".arco-picker-header-value")].map((node) =>
        (node.textContent || "").trim(),
      );
      const current = headers[0] || "";
      const parseToken = (value) => {
        const [year, month] = value.split("-").map((item) => Number(item));
        return year * 100 + month;
      };
      const targetToken = parseToken(targetYearMonth);
      const currentToken = parseToken(current);
      const prevSelectors = [
        ".arco-picker-header-super-prev-btn",
        ".arco-picker-header-prev-btn",
        '[class*=\"picker-header-prev\"]',
      ];
      const nextSelectors = [
        ".arco-picker-header-super-next-btn",
        ".arco-picker-header-next-btn",
        '[class*=\"picker-header-next\"]',
      ];
      const selectors = currentToken > targetToken ? prevSelectors : nextSelectors;
      const button = selectors
        .map((selector) => document.querySelector(selector))
        .find((node) => node instanceof HTMLElement);
      button?.click();
    }, yearMonthTokenUs(dateValue));
    await page.waitForTimeout(500);
  }
  const target = await page.evaluate((payload) => {
    const headers = [...document.querySelectorAll(".arco-picker-header-value")].map((node) =>
      (node.textContent || "").trim(),
    );
    const targetPanelIndex = Math.max(headers.findIndex((text) => text === payload.yearMonth), 0);
    const cells = [...document.querySelectorAll(".arco-picker-cell-in-view:not(.arco-picker-cell-disabled)")].filter(
      (node) => (node.textContent || "").trim() === payload.day,
    );
    const cell = cells[targetPanelIndex] || cells[0] || null;
    if (!cell) {
      return { headers, targetPanelIndex, clicked: false };
    }
    cell.click();
    cell.click();
    return { headers, targetPanelIndex, clicked: true };
  }, { yearMonth: yearMonthTokenUs(dateValue), day: dayToken(dateValue) });
  if (!target.clicked) {
    await page.evaluate((index) => {
      const target = [...document.querySelectorAll(".arco-picker-range")][index];
      target
        ?.querySelectorAll('input[placeholder="Start date"], input[placeholder="End date"]')
        .forEach((node) => node.removeAttribute("readonly"));
    }, resolvedIndex);
    const dateInputs = picker.locator('input[placeholder="Start date"], input[placeholder="End date"]');
    if ((await dateInputs.count()) >= 2) {
      await dateInputs.nth(0).fill(dateValue);
      await dateInputs.nth(1).fill(dateValue);
      await dateInputs.nth(1).press("Enter");
      await page.waitForTimeout(10000);
      return;
    }
    throw new Error(`day cell not found for ${dateValue}`);
  }
  await page.waitForTimeout(10000);
}

async function setDateRange(page, startDate, endDate, pickerIndex = 1) {
  const resolvedIndex = await resolveRangePickerIndex(page, pickerIndex);
  const picker = page.locator(".arco-picker-range").nth(resolvedIndex);
  await picker.click({ force: true });
  await page.waitForTimeout(800);
  await page.evaluate((index) => {
    const target = [...document.querySelectorAll(".arco-picker-range")][index];
    target
      ?.querySelectorAll('input[placeholder="Start date"], input[placeholder="End date"]')
      .forEach((node) => node.removeAttribute("readonly"));
  }, resolvedIndex);
  const dateInputs = picker.locator('input[placeholder="Start date"], input[placeholder="End date"]');
  await dateInputs.nth(0).fill(startDate);
  await dateInputs.nth(1).fill(endDate);
  await dateInputs.nth(1).press("Enter");
  await page.waitForTimeout(10000);
  return readAppliedRange(page, pickerIndex);
}

async function getVisibleExportButton(page) {
  await ensurePageReady(page, "Performance");
  const exports = page.locator('button:visible').filter({ hasText: "Export" });
  const count = await exports.count();
  for (let index = 0; index < count; index += 1) {
    const box = await exports.nth(index).boundingBox();
    if (box && box.x >= 0) {
      return exports.nth(index);
    }
  }
  const state = await ensurePageReady(page, "Performance");
  throw new Error(`no visible export button found: ${state.url} :: ${state.bodyText}`);
}

function pickTask(tasks, prefix, appliedRange) {
  const expected = `${prefix}${formatRangeToken(appliedRange.start)}-${formatRangeToken(appliedRange.end)}`;
  const exact = tasks.find((task) => task.file_name === expected && Number(task.status) === 2);
  if (exact) {
    return exact;
  }
  const ready = tasks.find((task) => Number(task.status) === 2);
  if (ready) {
    return ready;
  }
  return tasks[0] || null;
}

async function fetchBinaryWithCookies(context, url) {
  const cookies = await context.cookies("https://affiliate-id.tokopedia.com");
  const cookieHeader = cookies.map((item) => `${item.name}=${item.value}`).join("; ");
  const response = await fetch(url, {
    headers: {
      cookie: cookieHeader,
      "user-agent": "Mozilla/5.0",
    },
  });
  if (!response.ok) {
    throw new Error(`download failed: ${response.status} ${url}`);
  }
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] || "export.xlsx";
  const buffer = Buffer.from(await response.arrayBuffer());
  return { filename, buffer };
}

async function fetchJsonWithCookies(context, url, method, body) {
  const cookies = await context.cookies("https://affiliate-id.tokopedia.com");
  const cookieHeader = cookies.map((item) => `${item.name}=${item.value}`).join("; ");
  const response = await fetch(url, {
    method,
    headers: {
      cookie: cookieHeader,
      "user-agent": "Mozilla/5.0",
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`json request failed: ${response.status} ${url}`);
  }
  return response.json();
}

async function exportModule(page, context, storeKey, moduleKey, appliedRange) {
  const moduleConfig = MODULES[moduleKey];
  await selectTab(page, moduleConfig.tabId, moduleConfig.tabText, moduleConfig.waitText);
  await ensurePageReady(page, `${moduleConfig.tabText} Performance`);

  const listResponses = [];
  const createResponses = [];
  const handler = async (resp) => {
    const url = resp.url();
    if (
      url.indexOf("/api/v1/oec/affiliate/compass/export_task/list") < 0 &&
      url.indexOf("/api/v1/oec/affiliate/compass/export_task/create") < 0
    ) {
      return;
    }
    try {
      const payload = await resp.json();
      if (url.indexOf("/export_task/create") >= 0) {
        createResponses.push({ url, payload });
      } else {
        listResponses.push({ url, payload });
      }
    } catch {}
  };
  page.on("response", handler);
  try {
    const button = await getVisibleExportButton(page);
    await button.click({ force: true });
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await page.waitForTimeout(1000);
      const hasCreate = createResponses.length > 0;
      const hasRelevantList = listResponses.some((item) =>
        (item.payload?.data?.export_tasks || []).some((task) => Number(task.module_type) === moduleConfig.moduleType),
      );
      if (hasCreate || hasRelevantList) {
        break;
      }
    }
  } finally {
    page.off("response", handler);
  }

  const relevant = listResponses
    .map((item) => ({
      url: item.url,
      tasks: item.payload?.data?.export_tasks || [],
    }))
    .find((item) => item.tasks.some((task) => Number(task.module_type) === moduleConfig.moduleType));
  const listUrl = relevant?.url || listResponses.at(-1)?.url || createResponses.at(-1)?.url?.replace("/create", "/list");
  const createUrl = createResponses.at(-1)?.url || listUrl?.replace("/list", "/create");
  let createdTaskId = createResponses.at(-1)?.payload?.data?.task_id || "";

  if (moduleKey === "video" && createUrl && listUrl) {
    const customPayload = await fetchJsonWithCookies(context, createUrl, "POST", buildVideoCreateBody(appliedRange));
    createdTaskId = customPayload?.data?.task_id || createdTaskId;
  }

  let tasks = relevant?.tasks?.filter((task) => Number(task.module_type) === moduleConfig.moduleType) || [];
  if (listUrl) {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const payload = await fetchJsonWithCookies(context, listUrl, "POST", { module_type: moduleConfig.moduleType });
      const latest = payload?.data?.export_tasks || [];
      tasks = latest.filter((task) => Number(task.module_type) === moduleConfig.moduleType);
      const matchedCreatedTask = createdTaskId ? tasks.find((task) => task.task_id === createdTaskId) : null;
      const readyByCreate = matchedCreatedTask && Number(matchedCreatedTask.status) === 2;
      const shouldBreak = createdTaskId ? readyByCreate : tasks.some((task) => Number(task.status) === 2);
      if (shouldBreak) {
        break;
      }
      await page.waitForTimeout(2000);
    }
  }

  if (tasks.length === 0) {
    throw new Error(`no export task list found for ${moduleKey}`);
  }

  const selectedTask = createdTaskId
    ? tasks.find((task) => task.task_id === createdTaskId) || null
    : pickTask(tasks, moduleConfig.prefix, appliedRange);
  if (!selectedTask) {
    throw new Error(`no export task available for ${moduleKey}`);
  }

  const exportUrlBase = new URL(listUrl);
  const sellerId = exportUrlBase.searchParams.get("oec_seller_id");
  const shopRegion = exportUrlBase.searchParams.get("shop_region") || "ID";
  const downloadUrl = `https://affiliate-id.tokopedia.com/api/v1/oec/affiliate/compass/export_task/export?shop_region=${shopRegion}&oec_seller_id=${sellerId}&task_id=${selectedTask.task_id}`;
  const { filename, buffer } = await fetchBinaryWithCookies(context, downloadUrl);

  const exportDir = path.join(
    "/Users/apple/Documents/Playground/tiktok_shop_sync/data/exports",
    storeKey,
    moduleKey,
  );
  fs.mkdirSync(exportDir, { recursive: true });
  const exportPath = path.join(exportDir, filename);
  fs.writeFileSync(exportPath, buffer);

  return {
    module: moduleKey,
    moduleType: moduleConfig.moduleType,
    appliedRange,
    task: selectedTask,
    downloadUrl,
    exportPath,
  };
}

async function main() {
  const storeKey = process.argv[2] || "letme";
  const startDate = process.argv[3] || "12/24/2025";
  const endDate = process.argv[4] || "03/24/2026";
  const mode = process.argv[5] || "both";
  const config = configs[storeKey];
  if (!config) {
    throw new Error(`unknown store: ${storeKey}`);
  }

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${config.port}`);
  try {
    const context = browser.contexts()[0];
    const page =
      context.pages().find((item) =>
        item.url().includes("affiliate-id.tokopedia.com/insights/transaction-analysis"),
      ) || (await context.newPage());

    await openPerformancePage(page, config);
    // Videos 直连创建导出任务时，以请求区间为准；日期控件仅用于页面就绪和兜底校验。
    await setDateRange(page, startDate, endDate, 1);
    const appliedRange = { start: startDate, end: endDate };
    await ensurePageReady(page, "Performance");
    const modules = mode === "both" ? ["creator", "video"] : [mode];
    const exports = [];
    for (const moduleKey of modules) {
      exports.push(await exportModule(page, context, storeKey, moduleKey, appliedRange));
    }

    const result = {
      store: config.store,
      port: config.port,
      requestedRange: { startDate, endDate },
      appliedRange,
      exports,
      capturedAt: new Date().toISOString(),
    };
    const outDir = "/Users/apple/Documents/Playground/tiktok_shop_sync/data/export_manifests";
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(
      outDir,
      `${storeKey}_${formatRangeToken(appliedRange.start)}_${formatRangeToken(appliedRange.end)}.json`,
    );
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
    console.log(outPath);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
