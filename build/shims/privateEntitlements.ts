// Build-time shim: replaces ECHO-main/src/main/plugins/privateEntitlements.ts.
// Plugin-provided streaming sources are an ECHO Pro feature the Steam build does
// not expose to mods; the provider stays registered but always reports empty.
export class PrivateFeatureError extends Error {
  constructor(feature) {
    super(`private_feature_unavailable:${feature}`);
    this.name = 'PrivateFeatureError';
    this.feature = feature;
  }
}

export const createPrivateFeatureError = (feature = 'echo-pro') => new PrivateFeatureError(feature);
export const requirePrivateFeature = async (feature = 'echo-pro') => {
  throw createPrivateFeatureError(feature);
};
export const getPrivatePluginOperations = () => null;
export const getPrivateEntitlementsProvider = () => null;
export const installPrivateEntitlementsProvider = () => {};
export const clearPrivateEntitlementsProvider = () => {};
export const getDefaultEchoProAccountStatus = () => ({ loggedIn: false });
export const getDefaultEchoProSettingsCloudStatus = () => ({ loggedIn: false });
export const getDefaultConnectDonatorUnlockStatus = () => ({ unlocked: false });
export const getEchoProAccountStatus = async () => getDefaultEchoProAccountStatus();
export const loginEchoProAccount = async () => getDefaultEchoProAccountStatus();
export const registerEchoProAccount = async () => getDefaultEchoProAccountStatus();
export const logoutEchoProAccount = async () => getDefaultEchoProAccountStatus();
export const redeemEchoProKey = async () => ({ success: false });
export const releaseEchoProDevices = async () => ({ success: false });
export const getEchoProSettingsCloudStatus = async () => getDefaultEchoProSettingsCloudStatus();
export const saveEchoProSettingsCloud = async () => ({ success: false });
export const pullEchoProSettingsCloud = async () => ({ success: false });
export const applyEchoProSettingsCloud = async () => ({ success: false });
