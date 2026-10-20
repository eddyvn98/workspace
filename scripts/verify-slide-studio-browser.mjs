import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PORT = 3140;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SCREENSHOT_DIR = "/Users/htt711/.gemini/antigravity/brain/86a3b26a-a70d-40cb-97ab-9761c61d27c9/screenshots";

async function waitServerReady(url, maxRetries = 40) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 200) return true;
    } catch {
      // wait
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`Server failed to start at ${url}`);
}

async function runVerification() {
  console.log("Starting Next.js server on port", PORT);
  const server = spawn("pnpm", ["exec", "next", "start", "-p", String(PORT)], {
    cwd: "/Users/htt711/mymy/workspace",
    env: {
      ...process.env,
      PORT: String(PORT),
      SLIDE_BROWSER_ACCEPTANCE: "true",
      NODE_ENV: "production"
    },
    stdio: "inherit"
  });

  try {
    await waitServerReady(`${BASE_URL}/slide-acceptance`);
    console.log("Server ready! Launching Chromium...");

    const browser = await chromium.launch({ headless: true });
    const viewports = [
      { name: "375px", width: 375, height: 812, label: "Mobile (iPhone)" },
      { name: "768px", width: 768, height: 1024, label: "Tablet (iPad portrait)" },
      { name: "1280px", width: 1280, height: 800, label: "Laptop / Desktop" },
      { name: "1920px", width: 1920, height: 1080, label: "Full HD Monitor" }
    ];

    const results = [];

    for (const vp of viewports) {
      console.log(`\nTesting viewport: ${vp.name} (${vp.width}x${vp.height} - ${vp.label})`);
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();

      await page.goto(`${BASE_URL}/slide-acceptance`, { waitUntil: "networkidle" });

      // Click "Open Slide Studio"
      const openStudioBtn = page.getByRole("button", { name: "Open Slide Studio" });
      await openStudioBtn.waitFor({ state: "visible", timeout: 5000 });
      await openStudioBtn.click();

      // Check Studio portal
      const studioDialog = page.locator("[data-slide-studio]");
      await studioDialog.waitFor({ state: "visible", timeout: 3000 });

      // Measure layout
      const metrics = await page.evaluate(() => {
        const stage = document.querySelector("[data-slide-stage]");
        const toolbar = document.querySelector('[aria-label="Slide editing tools"]');
        const filmstrip = document.querySelector('nav[aria-label="Presentation slides"]');
        const inspector = document.querySelector('aside[aria-label="Slide inspector"]');
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;

        const stageRect = stage ? stage.getBoundingClientRect() : null;
        const toolbarRect = toolbar ? toolbar.getBoundingClientRect() : null;
        const filmstripRect = filmstrip ? filmstrip.getBoundingClientRect() : null;
        const inspectorRect = inspector ? inspector.getBoundingClientRect() : null;

        return {
          viewport: { width: viewportW, height: viewportH },
          stage: stageRect ? {
            x: Math.round(stageRect.x),
            y: Math.round(stageRect.y),
            width: Math.round(stageRect.width),
            height: Math.round(stageRect.height),
            aspectRatio: +(stageRect.width / stageRect.height).toFixed(3),
            fitsInViewport: stageRect.bottom <= viewportH && stageRect.right <= viewportW && stageRect.top >= 0 && stageRect.left >= 0
          } : null,
          toolbar: toolbarRect ? {
            width: Math.round(toolbarRect.width),
            height: Math.round(toolbarRect.height),
            scrollWidth: toolbar ? toolbar.scrollWidth : 0,
            hasHorizontalScroll: toolbar ? toolbar.scrollWidth > toolbar.clientWidth : false
          } : null,
          filmstrip: filmstripRect ? {
            x: Math.round(filmstripRect.x),
            y: Math.round(filmstripRect.y),
            width: Math.round(filmstripRect.width),
            height: Math.round(filmstripRect.height),
            isVertical: filmstrip ? filmstrip.classList.contains("md:flex-col") && filmstripRect.height > filmstripRect.width : false,
            isHorizontal: filmstrip ? filmstripRect.width > filmstripRect.height : false
          } : null,
          inspector: inspectorRect ? {
            x: Math.round(inspectorRect.x),
            y: Math.round(inspectorRect.y),
            width: Math.round(inspectorRect.width),
            height: Math.round(inspectorRect.height)
          } : null
        };
      });

      console.log("Metrics:", JSON.stringify(metrics, null, 2));

      // Take main Studio screenshot
      const shotPath = path.join(SCREENSHOT_DIR, `studio-${vp.name}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });
      console.log(`Saved screenshot: ${shotPath}`);

      // If desktop, test Inspector format switch & timeline toggle
      if (vp.width >= 1280) {
        // Switch to Format tab
        const formatTabBtn = page.getByRole("button", { name: "Format" });
        if (await formatTabBtn.isVisible()) {
          await formatTabBtn.click();
          await page.waitForTimeout(300);
          const formatShot = path.join(SCREENSHOT_DIR, `studio-${vp.name}-format-tab.png`);
          await page.screenshot({ path: formatShot });
          console.log(`Saved screenshot: ${formatShot}`);
        }

        // Toggle Timeline
        const timelineBtn = page.getByRole("button", { name: "Toggle animation timeline" });
        if (await timelineBtn.isVisible()) {
          await timelineBtn.click();
          await page.waitForTimeout(300);

          const stageWithTimeline = await page.evaluate(() => {
            const stage = document.querySelector("[data-slide-stage]");
            const r = stage ? stage.getBoundingClientRect() : null;
            const timeline = document.querySelector('[role="region"][aria-label="Slide object timeline"]');
            const tr = timeline ? timeline.getBoundingClientRect() : null;
            return {
              stage: r ? { width: Math.round(r.width), height: Math.round(r.height), bottom: Math.round(r.bottom) } : null,
              timeline: tr ? { height: Math.round(tr.height), top: Math.round(tr.top) } : null,
              fitsInViewport: r ? r.bottom <= window.innerHeight : false
            };
          });
          console.log("Stage with timeline:", stageWithTimeline);

          const timelineShot = path.join(SCREENSHOT_DIR, `studio-${vp.name}-timeline-open.png`);
          await page.screenshot({ path: timelineShot });
          console.log(`Saved screenshot: ${timelineShot}`);

          // Close timeline
          await timelineBtn.click();
        }
      }

      // Test Escape key exits Studio
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      const studioAfterEsc = await page.locator("[data-slide-studio]").count();
      const exitedCleanly = studioAfterEsc === 0;
      console.log(`Escape key exited Studio: ${exitedCleanly}`);

      results.push({
        viewport: vp,
        metrics,
        exitedCleanly
      });

      await context.close();
    }

    await browser.close();

    fs.writeFileSync(
      path.join(SCREENSHOT_DIR, "browser-verification-results.json"),
      JSON.stringify(results, null, 2),
      "utf-8"
    );
    console.log("\nBrowser QA verification completed successfully!");
  } finally {
    server.kill("SIGTERM");
  }
}

runVerification().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});
