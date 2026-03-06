// @actual-app/api references browser globals at module evaluation time.
// This file must be imported before any module that imports @actual-app/api.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof (globalThis as any).navigator === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).navigator = { platform: "" };
}
