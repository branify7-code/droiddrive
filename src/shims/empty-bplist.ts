/* Stub for "bplist-parser" (aliased in next.config.ts).
 *
 * app-info-parser eagerly requires it for iOS .ipa files, but it pulls in
 * Node's "fs" and breaks client/SSR bundling. DroidDrive only parses .apk
 * archives — the iOS code path is never entered, so the module is stubbed. */

export function parseBuffer(): never {
  throw new Error("IPA parsing is not supported — only .apk files");
}

export function parseFile(): never {
  throw new Error("IPA parsing is not supported — only .apk files");
}

export function parseSync(): never {
  throw new Error("IPA parsing is not supported — only .apk files");
}
