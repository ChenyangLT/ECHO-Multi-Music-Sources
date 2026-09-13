// Build-time shim: replaces ECHO-main/src/main/accounts/SpotifyAuthService.ts.
// The mod resolves Spotify audio through ECHO's own bridge / Web API token cache
// instead of driving ECHO's OAuth window server from inside a mod.
const unsupported = () => {
  throw new Error('spotify_auth_unavailable_in_mod');
};

export class SpotifyAuthService {
  async startLoginWindow() {
    return unsupported();
  }

  async getAccessToken() {
    return unsupported();
  }

  async checkAccount() {
    return unsupported();
  }

  async startPlayback() {
    return unsupported();
  }

  async getDevices() {
    return [];
  }

  async ensureConnectDevice() {
    return unsupported();
  }

  async getPlaybackState() {
    return unsupported();
  }

  async transferPlayback() {
    return unsupported();
  }

  async pause() {
    return unsupported();
  }

  async resume() {
    return unsupported();
  }

  async seek() {
    return unsupported();
  }

  async setVolume() {
    return unsupported();
  }
}

export const getSpotifyRedirectUri = () => '';
export const getSpotifyAuthService = () => new SpotifyAuthService();
