# Synthetic condition images — Tayma AlDabbas

These four original illustrations are fake demo inputs, not photos of real assets or proof of condition. Every PNG visibly states **SYNTHETIC DEMO IMAGE — NOT REAL EVIDENCE**. They contain no personal information. Each is 960 × 640 and under 50 KB, within the uploader's PNG/10 MB limits.

| Download                                         | Use                       | Observation                                          |
| ------------------------------------------------ | ------------------------- | ---------------------------------------------------- |
| [apartment-baseline.png](apartment-baseline.png) | Owner's initial condition | Unit DEMO-18, two keys, existing wall mark           |
| [apartment-return.png](apartment-return.png)     | Renter's return           | Same wall mark; unchanged condition                  |
| [camera-baseline.png](camera-baseline.png)       | Owner's initial condition | Camera DEMO-CAM-001, battery and case, no case scuff |
| [camera-return.png](camera-return.png)           | Renter's return           | Same equipment with a cosmetic case scuff            |

For the deployed demo, download these files from `/demo-evidence/<filename>.png` to the presentation computer, then choose them in the uploader. Visiting an image URL does not attach it to an agreement. The browser stores uploaded bytes in IndexedDB; another browser or origin starts without those uploads.

The scuff is a conversation prompt. A visual difference does not establish damage, cause, responsibility or a deduction. Any owner allocation in the equipment story still needs the renter's explicit approval.

To regenerate the PNGs from their original vector source, install the project's Playwright Chromium browser and run `node scripts/generate-demo-evidence.mjs`. The generator uses local SVG markup and headless screenshots, with no remote assets. See [the handover runbook](../../docs/demo/handover-runbook.md) for checklist inputs and reset instructions.
