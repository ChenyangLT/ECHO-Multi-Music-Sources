// Build-time shim: replaces ECHO-main/src/main/library/workers/TsCoverExtractor.ts.
// The real extractor decodes MPEG-TS cover art with sharp. The mod never opens
// local media containers, so the default cover art is all that is needed.
import { createHash } from 'node:crypto';

const defaultCoverBytes = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="64" fill="#eaf1f8"/><circle cx="166" cy="172" r="62" fill="#9fb6cc"/><path d="M150 356c58-100 133-132 224-48" fill="none" stroke="#5f7f9d" stroke-width="42" stroke-linecap="round"/></svg>',
  'utf8',
);

export const defaultCoverSvg = defaultCoverBytes.toString('utf8');
export const defaultCoverSourceHash = createHash('sha256').update(defaultCoverBytes).digest('hex');

export class TsCoverExtractor {
  async extract() {
    return null;
  }

  async dispose() {}
}
