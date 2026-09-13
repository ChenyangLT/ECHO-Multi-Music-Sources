// Build-time shim: replaces
// ECHO-main/src/main/library/artistImages/ArtistImageCacheService.ts.
// The real service renders and caches artist images with sharp. The mod only
// reads artist metadata, so every cache lookup simply misses.
export class ArtistImageCacheService {
  async get() {
    return null;
  }

  async getCached() {
    return null;
  }

  async store() {
    return null;
  }

  async prune() {
    return { removed: 0 };
  }

  getCacheDirectory() {
    return '';
  }
}
