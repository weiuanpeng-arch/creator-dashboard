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

class ExportSkipError extends Error {
  constructor(reason, detail = "") {
    super(`__SKIP__:${reason}${detail ? `:${detail}` : ""}`);
    this.name = "ExportSkipError";
    this.reason = reason;
    this.detail = detail;
  }
}

function normalizeInputDate(value) {
  if (!value) {
    return "";
  }
  if (value.includes("-")) {
    return value;
  }
  const [month, day, year] = value.split("/");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function dayToken(value) {
  return String(Number(value.split("-").at(-1) || "0"));
}

function yearMonthToken(value) {
  const [year, month] = value.split("-");
  return `${year}-${month}`;
}

function addOneDay(value) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function buildCreatorAnalysisUrl(config) {
  return `https://affiliate-id.tokopedia.com/data/creator-analysis?shop_region=ID&shop_id=${config.shopId}&platform_data_source=shop`;
}

function buildSellerLandingUrl(config) {
  return `https://seller-id.tokopedia.com/affiliate/landing?shop_region=ID&shop_id=${config.shopId}`;
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
  const emptyHints = ["no data", "no result", "no results", "empty", "no creator", "creator not found"];
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

async function readAppliedRange(page) {
  return page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input[placeholder="Start date"], input[placeholder="End date"]')];
    const values = inputs.slice(0, 2).map((node) => (node.value || "").trim());
    return { start: values[0] || "", end: values[1] || "" };
  });
}

async function waitForCreatorAnalysis(page) {
  const ready = await page.waitForFunction(
    () =>
      document.body.innerText.includes("Creator") &&
      document.body.innerText.includes("Export") &&
      document.querySelectorAll('input[placeholder="Start date"], input[placeholder="End date"]').length >= 2,
    { timeout: 45000 },
  ).then(() => true).catch(() => false);
  if (!ready) {
    const state = await ensurePageReady(page, "Creator Analysis");
    throw new Error(`creator analysis page not ready: ${state.url} :: ${state.bodyText}`);
  }
  await page.waitForTimeout(2000);
}

async function openCreatorAnalysisPage(page, config) {
  const targetUrl = buildCreatorAnalysisUrl(config);
  const landingUrl = buildSellerLandingUrl(config);
  if (!page.url().includes("affiliate-id.tokopedia.com/data/creator-analysis")) {
    await page.goto(landingUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  } else if (!page.url().includes(`shop_id=${config.shopId}`)) {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  }

  let ready = await page.waitForFunction(
    () =>
      document.body.innerText.includes("Creator") &&
      document.body.innerText.includes("Export") &&
      document.querySelectorAll('input[placeholder="Start date"], input[placeholder="End date"]').length >= 2,
    { timeout: 45000 },
  ).then(() => true).catch(() => false);
  if (!ready) {
    const firstState = await describePageState(page);
    const firstClassified = classifyPageState(firstState, "Creator Analysis");
    if (firstClassified?.reason === "not_logged_in") {
      await page.goto(landingUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(5000);
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      ready = await page.waitForFunction(
        () =>
          document.body.innerText.includes("Creator") &&
          document.body.innerText.includes("Export") &&
          document.querySelectorAll('input[placeholder="Start date"], input[placeholder="End date"]').length >= 2,
        { timeout: 45000 },
      ).then(() => true).catch(() => false);
    }
  }
  if (!ready) {
    const state = await ensurePageReady(page, "Creator Analysis");
    throw new Error(`creator analysis page not ready: ${state.url} :: ${state.bodyText}`);
  }
  await page.waitForTimeout(2000);
}

async function clickSameDayRange(page, normalizedDate) {
  await page.locator(".arco-picker-range").first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(800);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const headers = await page.evaluate(() =>
      [...document.querySelectorAll(".arco-picker-header-value")].map((node) => (node.textContent || "").trim()),
    );
    if (headers.includes(yearMonthToken(normalizedDate))) {
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
    }, yearMonthToken(normalizedDate));
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
  }, { yearMonth: yearMonthToken(normalizedDate), day: dayToken(normalizedDate) });
  if (!target.clicked) {
    await page.evaluate(() => {
      const picker = document.querySelector(".arco-picker-range");
      picker
        ?.querySelectorAll('input[placeholder="Start date"], input[placeholder="End date"]')
        .forEach((node) => node.removeAttribute("readonly"));
    });
    const inputs = page.locator('input[placeholder="Start date"], input[placeholder="End date"]');
    if ((await inputs.count()) >= 2) {
      await inputs.nth(0).fill(normalizedDate);
      await inputs.nth(1).fill(normalizedDate);
      await inputs.nth(1).press("Enter");
      await page.waitForTimeout(12000);
      return;
    }
    throw new Error(`day cell not found for ${normalizedDate}`);
  }
  await page.waitForTimeout(12000);
}

async function setDateRange(page, startDate, endDate) {
  const normalizedStart = normalizeInputDate(startDate);
  const normalizedEnd = normalizeInputDate(endDate);
  if (normalizedStart === normalizedEnd) {
    await clickSameDayRange(page, normalizedStart);
    return readAppliedRange(page);
  }
  await page.locator(".arco-picker-range").first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(800);
  await page.locator('input[placeholder="Start date"]').first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const picker = document.querySelector(".arco-picker-range");
    picker?.querySelectorAll('input[placeholder="Start date"], input[placeholder="End date"]').forEach((node) => {
      node.removeAttribute("readonly");
    });
  });
  const inputs = page.locator('input[placeholder="Start date"], input[placeholder="End date"]');
  await inputs.nth(0).fill(normalizedStart);
  await inputs.nth(1).fill(normalizedEnd);
  await inputs.nth(1).press("Enter");
  await page.waitForTimeout(12000);
  return readAppliedRange(page);
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
  const filename = match?.[1] || "creator_export.xlsx";
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

function listReadyTask(tasks, fileIdHint) {
  if (fileIdHint) {
    const matched = tasks.find((item) => item.task_id === fileIdHint && Number(item.status) === 2);
    return matched || null;
  }
  return tasks.find((item) => Number(item.status) === 2) || null;
}

async function buildCreatorTaskListUrl(page) {
  return page.evaluate(() => {
    const url = new URL(location.href);
    const shopRegion = url.searchParams.get("shop_region") || "ID";
    const shopId = url.searchParams.get("shop_id") || "";
    const params = new URLSearchParams({
      user_language: "en",
      aid: "4331",
      app_name: "i18n_ecom_alliance",
      device_id: "0",
      device_platform: "web",
      cookie_enabled: "true",
      screen_width: String(window.innerWidth || 1280),
      screen_height: String(window.innerHeight || 800),
      browser_language: navigator.language || "en-US",
      browser_platform: navigator.platform || "",
      browser_name: "Mozilla",
      browser_version: navigator.userAgent,
      browser_online: String(navigator.onLine),
      timezone_name: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
      oec_seller_id: shopId,
      shop_region: shopRegion,
      platform_data_source: "shop",
    });
    return `https://affiliate-id.tokopedia.com/api/v1/insights/export/task/list?${params.toString()}`;
  });
}

async function exportCreatorReport(page, context, storeKey) {
  await ensurePageReady(page, "Creator Analysis");
  const responses = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("/api/v3/insights/affiliate/seller/creator/filter_list/export") || url.includes("/api/v1/insights/export/task/list")) {
      let body = null;
      try {
        body = await response.json();
      } catch {}
      responses.push({
        url,
        status: response.status(),
        method: response.request().method(),
        body,
      });
    }
  });

  const exportButtons = page.locator("button").filter({ hasText: "Export" });
  const count = await exportButtons.count();
  if (count < 2) {
    const state = await ensurePageReady(page, "Creator Analysis");
    throw new Error(`creator analysis export button not found: ${state.url} :: ${state.bodyText}`);
  }
  await exportButtons.nth(1).click({ force: true });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.waitForTimeout(1000);
    const hasCreate = responses.some((item) =>
      item.url.includes("/api/v3/insights/affiliate/seller/creator/filter_list/export"),
    );
    if (hasCreate) {
      break;
    }
  }

  const exportResp = responses
    .filter((item) => item.url.includes("/api/v3/insights/affiliate/seller/creator/filter_list/export"))
    .at(-1);
  if (!exportResp?.body?.data?.file) {
    throw new Error("creator export task id not captured");
  }
  const createdFileId = exportResp.body.data.file;
  let listUrl = responses
    .filter((item) => item.url.includes("/api/v1/insights/export/task/list"))
    .at(-1)?.url;
  if (!listUrl) {
    listUrl = await buildCreatorTaskListUrl(page);
  }

  let readyTask = null;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    await page.waitForTimeout(2000);
    const listResp = await fetchJsonWithCookies(context, listUrl, "POST", {
      version: 1,
      sub_modules: [5],
      module: 22,
    });
    const tasks = listResp?.export_tasks || [];
    readyTask = listReadyTask(tasks, createdFileId);
    if (readyTask) {
      break;
    }
  }
  if (!readyTask) {
    throw new Error("creator export task did not become ready");
  }

  const downloadUrl = `https://affiliate-id.tokopedia.com/api/v1/insights/export/file/${readyTask.task_id}?aid=4068&language=en&shop_region=ID&app_name=i18n_ecom_alliance&platform_data_source=shop`;
  const { filename, buffer } = await fetchBinaryWithCookies(context, downloadUrl);
  const exportDir = path.join("/Users/apple/Documents/Playground/tiktok_shop_sync/data/exports", storeKey, "creator");
  fs.mkdirSync(exportDir, { recursive: true });
  const exportPath = path.join(exportDir, filename);
  fs.writeFileSync(exportPath, buffer);

  return { task: readyTask, downloadUrl, exportPath, filename };
}

async function captureCreatorExportUrl(page) {
  await ensurePageReady(page, "Creator Analysis");
  const urls = [];
  const handler = (request) => {
    const url = request.url();
    if (url.includes("/api/v3/insights/affiliate/seller/creator/filter_list/export")) {
      urls.push(url);
    }
  };
  page.on("request", handler);
  try {
    const exportButtons = page.locator("button").filter({ hasText: "Export" });
    const count = await exportButtons.count();
    if (count < 2) {
      const state = await ensurePageReady(page, "Creator Analysis");
      throw new Error(`creator analysis export button not found: ${state.url} :: ${state.bodyText}`);
    }
    await exportButtons.nth(1).click({ force: true });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await page.waitForTimeout(500);
      if (urls.length) {
        break;
      }
    }
  } finally {
    page.off("request", handler);
  }
  if (!urls.length) {
    throw new Error("creator export url not captured");
  }
  return urls.at(-1);
}

async function exportCreatorReportDirect(page, context, storeKey, startDate, endDate) {
  await ensurePageReady(page, "Creator Analysis");
  const exportUrl = await captureCreatorExportUrl(page);
  const taskListUrl = await buildCreatorTaskListUrl(page);
  const exclusiveEnd = addOneDay(normalizeInputDate(endDate));

  const createResp = await page.evaluate(async ({ exportUrl, body }) => {
    const response = await fetch(exportUrl, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }, {
    exportUrl,
    body: {
      request: {
        requests: [
          {
            filter: {},
            list_control: {
              rules: [{ field: "SELLER_CREATOR_FILTER_LIST_REVENUE", direction: 2 }],
              pagination: { size: 5000, page: 0 },
            },
            stats_types: [2, 24, 20, 40, 30, 34, 38, 35, 10, 60, 50],
            time_descriptor: {
              start: normalizeInputDate(startDate),
              end: exclusiveEnd,
              timezone_offset: 25200,
              scenario: 1,
              granularity: "",
              with_previous_period: false,
            },
          },
        ],
      },
      version: 3,
    },
  });

  const createdFileId = createResp?.body?.data?.file;
  if (!createdFileId) {
    throw new Error(`creator direct export failed: ${JSON.stringify(createResp)}`);
  }

  let readyTask = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.waitForTimeout(2000);
    const listResp = await fetchJsonWithCookies(context, taskListUrl, "POST", {
      version: 1,
      sub_modules: [5],
      module: 22,
    });
    const tasks = listResp?.export_tasks || [];
    readyTask = listReadyTask(tasks, createdFileId);
    if (readyTask) {
      break;
    }
  }
  if (!readyTask) {
    throw new Error("creator direct export task did not become ready");
  }

  const downloadUrl = `https://affiliate-id.tokopedia.com/api/v1/insights/export/file/${readyTask.task_id}?aid=4068&language=en&shop_region=ID&app_name=i18n_ecom_alliance&platform_data_source=shop`;
  const { filename, buffer } = await fetchBinaryWithCookies(context, downloadUrl);
  const exportDir = path.join("/Users/apple/Documents/Playground/tiktok_shop_sync/data/exports", storeKey, "creator");
  fs.mkdirSync(exportDir, { recursive: true });
  const exportPath = path.join(exportDir, filename);
  fs.writeFileSync(exportPath, buffer);

  return { task: readyTask, downloadUrl, exportPath, filename };
}

async function main() {
  const storeKey = process.argv[2] || "letme";
  const startDate = process.argv[3] || "";
  const endDate = process.argv[4] || "";
  const config = configs[storeKey];
  if (!config) {
    throw new Error(`unknown store: ${storeKey}`);
  }

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${config.port}`);
  try {
    const context = browser.contexts()[0];
    let page = context.pages().find((item) => item.url().includes("affiliate-id.tokopedia.com/data/creator-analysis"));
    if (page === undefined) {
      page = await context.newPage();
    }
    await openCreatorAnalysisPage(page, config);
    await page.bringToFront();
    await ensurePageReady(page, "Creator Analysis");
    const initialRange = await readAppliedRange(page);
    const result =
      startDate && endDate
        ? await exportCreatorReportDirect(page, context, storeKey, startDate, endDate)
        : await exportCreatorReport(page, context, storeKey);
    const appliedRange =
      startDate && endDate
        ? {
            start: normalizeInputDate(startDate),
            end: normalizeInputDate(endDate),
            endExclusive: addOneDay(normalizeInputDate(endDate)),
          }
        : initialRange;

    const outDir = "/Users/apple/Documents/Playground/tiktok_shop_sync/data/export_manifests";
    fs.mkdirSync(outDir, { recursive: true });
    const manifestPath = path.join(outDir, `${storeKey}_creator_latest.json`);
    const payload = {
      capturedAt: new Date().toISOString(),
      store: config.store,
      port: config.port,
      source: "creator-analysis",
      requestedRange: { startDate, endDate },
      appliedRange,
      ...result,
    };
    fs.writeFileSync(manifestPath, JSON.stringify(payload, null, 2));
    console.log(manifestPath);
    console.log(JSON.stringify(payload, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
