import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

// Original vector illustrations rendered to PNG for the photo-only uploader.
// These are visibly marked synthetic fixtures, not photographs or proof.
const directory = new URL("../public/demo-evidence/", import.meta.url);
await mkdir(directory, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 960, height: 640 },
    deviceScaleFactor: 1,
  });
  for (const asset of ["apartment", "camera"]) {
    for (const phase of ["baseline", "return"]) {
      const isReturn = phase === "return";
      const room = `<rect x="60" y="130" width="840" height="360" rx="12" fill="#f3efe7"/>
        <path d="M60 430H900V490H60Z" fill="#bca388"/>
        <rect x="120" y="180" width="190" height="170" fill="#bcdce3" stroke="#fff" stroke-width="10"/>
        <path d="M215 180V350M120 265H310" stroke="#fff" stroke-width="8"/>
        <rect x="390" y="290" width="300" height="140" rx="22" fill="#698678"/>
        <rect x="410" y="310" width="120" height="90" rx="12" fill="#829d90"/>
        <rect x="550" y="310" width="120" height="90" rx="12" fill="#829d90"/>
        <path d="M730 260l20 12m-18 0l14-18" stroke="#976e52" stroke-width="5"/>
        <text x="685" y="235" font-size="17" fill="#394a42">Existing wall mark</text>
        <circle cx="810" cy="390" r="15" fill="none" stroke="#dab150" stroke-width="8"/>
        <path d="M810 405v40m0-12h14" stroke="#dab150" stroke-width="8"/>
        <text x="85" y="470" font-size="19" fill="#293e34">Unit DEMO-18 · two keys · condition unchanged</text>`;
      const camera = `<rect x="60" y="130" width="840" height="360" rx="12" fill="#e8eee9"/>
        <rect x="125" y="245" width="340" height="190" rx="24" fill="#354c43"/>
        <path d="M180 245v-30h90v30" fill="#354c43"/>
        <circle cx="300" cy="335" r="72" fill="#1d3028" stroke="#829e8c" stroke-width="12"/>
        <circle cx="300" cy="335" r="42" fill="#6a9eae"/>
        <circle cx="409" cy="278" r="10" fill="#d5b86a"/>
        <rect x="550" y="245" width="235" height="190" rx="24" fill="#ab957d"/>
        <path d="M600 245v-25h130v25" fill="none" stroke="#846e57" stroke-width="12"/>
        ${isReturn ? '<path d="M700 330l36 20m-36-4l34-3" stroke="#faf7ee" stroke-width="6"/><text x="575" y="195" font-size="19" fill="#714e35">New cosmetic case scuff</text>' : '<text x="575" y="195" font-size="19" fill="#394a42">Case without scuff</text>'}
        <rect x="485" y="365" width="35" height="60" rx="5" fill="#50695d"/>
        <text x="85" y="470" font-size="19" fill="#293e34">Camera DEMO-CAM-001 · battery + case included</text>`;
      await page.setContent(`<style>body{margin:0;font-family:Arial,sans-serif}</style>
        <svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640">
        <rect width="960" height="640" fill="#fbfaf6"/>
        <text x="60" y="65" font-size="28" font-weight="700" fill="#253f31">PACT · ${asset.toUpperCase()} · ${phase.toUpperCase()}</text>
        <text x="60" y="103" font-size="20" fill="#52665b">SYNTHETIC DEMO IMAGE — NOT REAL EVIDENCE</text>
        ${asset === "apartment" ? room : camera}
        <rect x="60" y="525" width="840" height="65" rx="12" fill="#e3ebdb"/>
        <text x="80" y="563" font-size="20" fill="#253f31">${asset === "apartment" ? "Compare the same pre-existing wall mark before and after." : "A visible difference is a discussion prompt, not proof of responsibility."}</text>
        </svg>`);
      await page.screenshot({
        path: new URL(`${asset}-${phase}.png`, directory).pathname,
      });
    }
  }
} finally {
  await browser.close();
}
