// Build-time shim: replaces ECHO-main/src/main/library/KgmConverter.ts.
// The real converter decrypts KuGou .kgm files through the @clamber_l/crypto
// wasm module. The mod never scans local files, so the converter is inert.
export const isKgmFile = (filePath) => /\.kgm$/iu.test(String(filePath ?? ''));

export class KgmConverter {
  async convert() {
    return null;
  }

  async decrypt() {
    return null;
  }

  async dispose() {}
}

export const getKgmConverter = () => new KgmConverter();
