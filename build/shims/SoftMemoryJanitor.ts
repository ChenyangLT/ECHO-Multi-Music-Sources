// Build-time shim: replaces ECHO-main/src/main/diagnostics/SoftMemoryJanitor.ts.
export const registerSoftMemoryCleanupTask = () => () => {};
export const releaseSoftMemoryPressure = async () => ({ released: 0 });
export const resetSoftMemoryJanitorForTests = () => {};
export const createSoftMemoryCleanupLogFields = () => ({});
