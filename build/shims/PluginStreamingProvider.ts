// Build-time shim: replaces
// ECHO-main/src/main/streaming/providers/PluginStreamingProvider.ts.
//
// The real provider resolves custom sources through ECHO's in-process plugin
// service and its entitlement gate. That graph pulls in the library database,
// sharp, taglib-wasm and the plugin runtime — none of which a ShinawaseLoader
// mod should load. Plugin sources are an ECHO Pro surface the Steam build does
// not hand to external mods, so the provider keeps its identity in the registry
// (so the descriptor list still matches the community build) but reports that
// no plugin sources are available.
import { streamingStableKey } from 'ECHO_MAIN_ROOT/src/shared/types/streaming';

const emptySearchResult = (request) => ({
  provider: 'plugin',
  query: request?.query ?? '',
  page: request?.page ?? 1,
  pageSize: request?.pageSize ?? 20,
  total: 0,
  hasMore: false,
  tracks: [],
  albums: [],
  artists: [],
  playlists: [],
  mvs: [],
});

const createUnavailableError = () => new Error('plugin_streaming_unavailable_in_mod');

export class PluginStreamingProvider {
  constructor() {
    this.name = 'plugin';
    this.descriptor = {
      displayName: '插件音源',
      enabled: false,
      supportsSearch: false,
      supportsPlayback: false,
      supportsDownload: false,
      supportsLyrics: false,
      supportsMv: false,
      requiresAccount: false,
      status: 'unavailable',
      statusMessage: '插件音源需要 ECHO 内置插件运行环境，外部模组不可用。',
    };
  }

  async search(request) {
    return emptySearchResult(request);
  }

  async getTrack(input) {
    return {
      id: streamingStableKey('plugin', String(input?.providerTrackId ?? '')),
      provider: 'plugin',
      providerTrackId: String(input?.providerTrackId ?? ''),
      stableKey: streamingStableKey('plugin', String(input?.providerTrackId ?? '')),
      title: 'Plugin Source',
      artist: 'Plugin Source',
      artists: [],
      album: 'Custom Source',
      albumId: null,
      albumArtist: 'Plugin Source',
      duration: null,
      coverUrl: null,
      coverThumb: null,
      qualities: ['standard'],
      explicit: false,
      playable: false,
      unavailableReason: '插件音源需要 ECHO 内置插件运行环境，外部模组不可用。',
      lyricsStatus: 'unknown',
      mvStatus: 'unknown',
    };
  }

  async resolvePlayback() {
    throw createUnavailableError();
  }
}
