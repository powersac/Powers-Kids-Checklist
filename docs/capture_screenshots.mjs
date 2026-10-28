/**
 * Screenshot the live Powers Kids Daily Checklist for the README.
 *
 *   CAPTURE_URL=$(grep -v '^#' .env.capture | cut -d= -f2-) npm run capture
 *
 * Regenerable on purpose: a screenshot that cannot be rebuilt rots the moment
 * the UI changes, and a stale screenshot is a lie about the product.
 *
 * Shoots the LIVE Worker, not a fixture. The real chores and real amounts are
 * what make the shot legible; an invented list reads as a mockup.
 *
 * The URL carries the per-person auth token in its path, so it comes from the
 * environment and never from this file.
 *
 * The page renders client-side: the server returns a small SPA shell with no
 * content in it, so a shot taken right after page load photographs an empty
 * screen. Every shot below waits on a selector that only appears once real
 * data has rendered, rather than trusting domcontentloaded or a fixed delay.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const IMAGES = "docs/images";

// { name, width, height, tab, wait }
// `tab` is the tab-bar button to click before the shot (null for the default
// Today view). `wait` is the selector to wait on so the shot is taken after
// the view has actually rendered its data, not the moment the tab switches.
//
// Widths are phone widths on purpose: this is an installed-to-home-screen PWA
// and a 1280px-wide shot of it would misrepresent how it is actually used.
//
// Heights are MEASURED, not guessed. Re-measure rather than re-guess if a shot
// ever starts cutting off content its alt text promises.
//
// Measured 2026-09-17 against the live app at 420px wide, via a probe script
// that clicked each tab, waited on that view's `wait` selector, then read the
// getBoundingClientRect().bottom of main's chore <section> elements (Today,
// Parent > Tasks) or of main's last child (Summary):
//   Today:   Morning section bottom = 794.125, After School bottom =
//     1056.515625, Homework Time bottom = 1268.90625, Evening bottom =
//     1631.296875, Activities (last section, full content) bottom =
//     1943.6875. today.png crops to 1060px, just past the After School
//     boundary, showing the header, allowance figures, race bars, and the
//     first two chore sections. It is a PARTIAL view: three more sections
//     scroll below the crop, and the alt text says so.
//   Summary: last child (the current week's card; only one other week
//     exists) bottom = 691.359375. Adding main's 40px bottom padding puts
//     full content at ~731. summary.png uses 740px, which is the WHOLE view,
//     no crop.
//   Parent (Tasks tab): Morning section bottom = 621.109375, After School
//     bottom = 906.296875, Homework Time bottom = 1145.484375, Evening
//     bottom = 1522.671875, Activities (last section) bottom = 1853.859375.
//     parent.png crops to 910px, just past the After School boundary, same
//     reasoning as today.png: a full 1854px+ shot would be a poor README
//     asset. It is a PARTIAL view of the Tasks tab; the alt text says so.
const SHOTS = [
  {
    name: "today.png",
    width: 420,
    height: 1060,
    tab: null,
    wait: "main section button[aria-label]",
  },
  {
    name: "summary.png",
    width: 420,
    height: 740,
    tab: 'nav button:has-text("Summary")',
    wait: "text=/\\$[0-9]/",
  },
  {
    name: "parent.png",
    width: 420,
    height: 910,
    tab: 'nav button:has-text("Parent")',
    wait: "text=Add task",
  },
];

function targetUrl() {
  const url = process.env.CAPTURE_URL;
  if (!url) {
    console.error(
      "CAPTURE_URL is not set. Copy .env.capture.example to .env.capture,\n" +
        "fill in the real URL, then:\n" +
        "  CAPTURE_URL=$(grep -v '^#' .env.capture | cut -d= -f2-) npm run capture",
    );
    process.exit(1);
  }
  return url;
}

async function main() {
  const url = targetUrl();

  const probe = await fetch(url, { redirect: "follow" }).catch((e) => {
    console.error(`${url.replace(/\/[^/]+$/, "/<token>")} is not answering: ${e.message}`);
    process.exit(1);
  });
  if (!probe.ok) {
    console.error(
      `${url.replace(/\/[^/]+$/, "/<token>")} returned HTTP ${probe.status}. ` +
        "Check the token and that the Worker is deployed.",
    );
    process.exit(1);
  }

  await mkdir(IMAGES, { recursive: true });

  // Launched headless rather than attached over CDP to a running Chrome: the
  // reference implementation documents the CDP-attached browser stalling
  // inside Page.captureScreenshot for every shot.
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const shot of SHOTS) {
      // A clip cannot exceed the viewport, so the viewport is sized to this
      // shot rather than shared: a shorter viewport silently clamps the
      // screenshot to its own height instead of the requested one.
      const page = await browser.newPage({
        viewport: { width: shot.width, height: shot.height },
      });
      await page.goto(url, { waitUntil: "domcontentloaded" });
      // No shared "loaded" selector here: the app renders one of three views,
      // so each shot waits on its own wait selector below instead.
      if (shot.tab) {
        await page.waitForSelector(shot.tab, { state: "visible", timeout: 15000 });
        await page.click(shot.tab);
      }
      await page.waitForSelector(shot.wait, { state: "visible", timeout: 15000 });
      await page.waitForTimeout(300);
      const out = path.join(IMAGES, shot.name);
      await page.screenshot({
        path: out,
        clip: { x: 0, y: 0, width: shot.width, height: shot.height },
      });
      console.log(`wrote ${out}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

await main();
