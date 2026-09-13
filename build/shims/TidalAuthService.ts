// Build-time shim: replaces ECHO-main/src/main/accounts/TidalAuthService.ts.
const unsupported = () => {
  throw new Error('tidal_auth_unavailable_in_mod');
};

export class TidalAuthService {
  async startLoginWindow() {
    return unsupported();
  }

  async getAccessToken() {
    return unsupported();
  }

  async checkAccount() {
    return unsupported();
  }

  getCountryCode() {
    return '';
  }
}

export const getTidalAuthService = () => new TidalAuthService();
