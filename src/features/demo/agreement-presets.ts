import type { DemoAgreementInput } from "./model";

/** Fake presentation inputs, shared by setup and the initial apartment. */
export const DEMO_AGREEMENT_PRESETS: Record<
  DemoAgreementInput["assetType"],
  DemoAgreementInput
> = {
  APARTMENT: {
    assetType: "APARTMENT",
    title: "Apartment security deposit",
    address: "Fictional unit DEMO-18, Budapest",
    startDate: "2026-10-01",
    endDate: "2026-10-17",
    amountMinor: 100_000,
    terms:
      "EUR 1,000 refundable security deposit for fictional unit DEMO-18. Return both keys and listed inventory in the acknowledged condition. The first photographed return declaration starts one 48-hour review using the device clock. Any deduction requires mutual agreement. This is a browser-local simulation; automatic refunds are not connected.",
  },
  EQUIPMENT: {
    assetType: "EQUIPMENT",
    title: "Camera rental deposit",
    address: "Fictional camera handover desk, Budapest",
    startDate: "2026-10-16",
    endDate: "2026-10-17",
    amountMinor: 30_000,
    terms:
      "EUR 300 refundable security deposit for camera DEMO-CAM-001, battery and case. Return the camera and listed accessories in the acknowledged condition. The first photographed return declaration starts one 48-hour review using the device clock. Any deduction requires mutual agreement. This is a browser-local simulation; automatic refunds are not connected.",
  },
};
