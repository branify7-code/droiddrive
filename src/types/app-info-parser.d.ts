/* Minimal ambient typing for the CommonJS "app-info-parser" package.
 * It parses APK (AndroidManifest.xml + resources.arsc) in browser (File/Blob)
 * and Node-like runtimes (file path string). */
declare module "app-info-parser" {
  interface ApkParseResult {
    package?: unknown;
    versionName?: unknown;
    versionCode?: unknown;
    usesSdk?: unknown;
    usesPermissions?: unknown;
    usesPermissionsSDK23?: unknown;
    application?: unknown;
    icon?: unknown;
    [key: string]: unknown;
  }
  const AppInfoParser: new (
    source: File | Blob | string
  ) => { parse(): Promise<ApkParseResult> };
  export default AppInfoParser;
}
