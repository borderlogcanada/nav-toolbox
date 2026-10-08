import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const packs = ["seed", "catalog-v2", "catalog-v3"].map((name) =>
  JSON.parse(
    readFileSync(new URL(`../src/data/${name}.json`, import.meta.url), "utf8"),
  ),
);
const snapshot = {
  categories: packs.flatMap((pack) => pack.categories),
  commands: packs
    .flatMap((pack) => pack.commands)
    .map((command) => ({
      ...command,
      isEnabled: true,
      runCount: 0,
      lastUsedAt: null,
    })),
  settings: {
    theme: "light",
    shortcut: "Control+Space",
    startOnLogin: false,
    showRun: false,
    closeAfterCopy: false,
  },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((data) => {
    localStorage.setItem("nav-toolbox-preview-v1", JSON.stringify(data));
    localStorage.setItem("nav-toolbox-preview-catalog-version", "3");
  }, snapshot);
});

test("all 339 enabled commands are reachable and keyboard selection scrolls", async ({
  page,
}) => {
  await page.goto("/?view=popup");
  await expect(page.locator(".popup-row")).toHaveCount(339);
  const search = page.getByPlaceholder(/Search commands, descriptions/);
  await search.focus();
  for (let index = 0; index < 12; index++) await search.press("ArrowDown");
  await expect(page.locator(".popup-row.selected")).toHaveAttribute(
    "data-command-id",
    snapshot.commands[12].id,
  );
  expect(
    await page.locator(".popup-list").evaluate((node) => node.scrollTop),
  ).toBeGreaterThan(0);
  await expect(page.locator(".popup-preview")).toHaveCount(0);
  await page.locator(".popup-row").first().click();
  await page.screenshot({ path: "/tmp/nav-toolbox-launcher-v011.png" });
  await search.press("Alt+i");
  await expect(page.locator(".popup-preview")).toBeVisible();
  await page.getByTitle("Collapse details").click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator(".setting-row select").first().selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.keyboard.press("Escape");
  await expect(page.locator(".toast")).toHaveCount(0);
  await page.screenshot({ path: "/tmp/nav-toolbox-launcher-v011-dark.png" });
});

test("details stay on demand and More filters categories inside the launcher", async ({
  page,
}) => {
  await page.goto("/?view=popup");
  await page.locator(".popup-row").first().click();
  await expect(page.locator(".popup-preview")).toHaveCount(0);
  await page
    .locator(".popup-row")
    .first()
    .getByRole("button", { name: /View details/ })
    .click();
  await expect(page.locator(".popup-preview")).toBeVisible();
  await page.getByTitle("Collapse details").click();
  await page.getByRole("button", { name: "Choose category" }).click();
  await page
    .getByRole("dialog", { name: "Choose category" })
    .getByRole("button", { name: "Btrfs", exact: true })
    .click();
  await expect(page.locator(".popup-row")).toHaveCount(5);
  await expect(page.locator(".full-shell")).toHaveCount(0);
});

test("Enter copies the selected search result", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/?view=popup");
  const search = page.getByPlaceholder(/Search commands, descriptions/);
  await search.fill("journalctl -xe");
  await expect(page.locator(".popup-row.selected")).toContainText(
    "journalctl -xe",
  );
  await search.press("Enter");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("journalctl -xe");
  await expect(page.locator(".toast")).toContainText("Copied");
});

test("close is visible and the manager fills normal and compact windows", async ({
  page,
}) => {
  await page.goto("/?view=popup");
  await page
    .getByRole("button", { name: "Close launcher", exact: true })
    .click();
  await expect(page.locator(".full-shell")).toBeVisible();
  for (const size of [
    { width: 1280, height: 840 },
    { width: 900, height: 620 },
  ]) {
    await page.setViewportSize(size);
    const box = await page.locator(".full-shell").boundingBox();
    expect(box?.x).toBe(0);
    expect(box?.y).toBe(0);
    expect(box?.width).toBe(size.width);
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBe(size.height);
  }
  await page.setViewportSize({ width: 1280, height: 840 });
  await page.locator(".command-row").first().click();
  await expect(page.locator(".detail-title")).toContainText(
    "docker compose up -d",
  );
  await page.screenshot({ path: "/tmp/nav-toolbox-manager-v011.png" });
});
