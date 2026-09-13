// Build-time shim: replaces ECHO-main/src/main/app/dataProtection.ts.
// The community StreamingService gates on ECHO's protected library database.
// The mod runs without that database, so the availability gate is a no-op.
export class LibraryDatabaseUnavailableError extends Error {
  constructor(recovery) {
    super('library_database_unavailable');
    this.name = 'LibraryDatabaseUnavailableError';
    this.recovery = recovery ?? null;
  }
}

export const isProtectedLibraryAvailable = () => true;
export const assertProtectedLibraryAvailable = () => {};
export const getLastDataProtectionResult = () => null;
export const getLibraryDatabaseProtectionStatus = () => ({ available: true });
export const getProtectedUserDataPath = (electronApp) => {
  try {
    return electronApp?.getPath?.('userData') || '';
  } catch {
    return '';
  }
};
export const initializeProtectedUserDataPath = (electronApp) => getProtectedUserDataPath(electronApp);
export const ensureDataProtection = async () => ({ ok: true });
export const ensureDataProtectionStartup = async () => ({ ok: true });
export const ensureDataProtectionFastStartup = async () => ({ ok: true });
export const runDeferredStartupDataProtection = async () => ({ ok: true });
export const setDataProtectionPlaybackStateProvider = () => {};
export const noteDataProtectionPlaybackActivity = () => {};
export const recordLibraryDatabaseMaintenanceEvent = () => {};
export const checkpointProtectedLibrary = () => ({ ok: true });
export const createDataProtectionDisabledResult = () => ({ ok: true, disabled: true });
export const protectedDataEntries = [];
export const createDataProtectionSnapshot = async () => ({ ok: true, skipped: true });
export const createScanGuardLibraryDatabaseSnapshot = async () => ({ ok: true, skipped: true });
export const restoreProtectedLibraryDatabaseFromScanGuard = () => ({ ok: true, skipped: true });
export const restoreProtectedLibraryDatabaseSnapshot = () => ({ ok: true, skipped: true });
export const restoreMissingProtectedData = () => ({ ok: true, skipped: true });
export const restoreMissingProtectedDataAsync = async () => ({ ok: true, skipped: true });
export const writeDataProtectionManifest = () => {};
export const scrubQuarantinedLibraryDatabase = () => ({ ok: true, skipped: true });
export const discardQuarantinedProblemTracks = () => ({ ok: true, skipped: true });
export const repairProtectedLibraryDatabase = () => ({ ok: true, skipped: true });
export const deleteProtectedLibraryDatabase = () => ({ ok: true, skipped: true });
export const inspectLibraryDatabaseForPoison = () => ({ poisoned: false });
export const getLibraryDatabaseStartupMetrics = () => ({});
export const shouldCreateDeferredStartupSnapshot = () => false;
export const getLibraryDatabaseMaintenanceReport = () => ({ events: [] });
export const migrateLegacyProtectedData = async () => ({ ok: true, skipped: true });
export const waitForDataProtectionBackgroundSlotForTest = async () => {};
export const isDataProtectionBackgroundPlaybackBlockedForTest = () => false;
export const getDeferredStartupSnapshotDecision = () => ({ shouldSnapshot: false });
export const getLibraryDatabaseScanGuardRestoreResult = () => null;
