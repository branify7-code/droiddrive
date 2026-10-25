export function formatBytes(bytes: number, digits = 1): string {
  if (!bytes || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

export function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

export function fileKindOf(item: { mimeType: string; name: string; isFolder: boolean }): {
  kind: "image" | "video" | "audio" | "pdf" | "text" | "archive" | "apk" | "file" | "folder";
  color: string;
} {
  if (item.isFolder) return { kind: "folder", color: "text-amber-400" };
  const m = item.mimeType || "";
  const n = item.name.toLowerCase();
  if (m.startsWith("image/")) return { kind: "image", color: "text-emerald-400" };
  if (m.startsWith("video/")) return { kind: "video", color: "text-rose-400" };
  if (m.startsWith("audio/")) return { kind: "audio", color: "text-violet-400" };
  if (m === "application/pdf" || n.endsWith(".pdf")) return { kind: "pdf", color: "text-red-400" };
  if (m.startsWith("text/") || /\.(txt|md|json|csv|xml|js|ts|html|css)$/i.test(n))
    return { kind: "text", color: "text-sky-400" };
  if (/\.(zip|rar|7z|tar|gz)$/i.test(n)) return { kind: "archive", color: "text-orange-400" };
  if (n.endsWith(".apk")) return { kind: "apk", color: "text-lime-400" };
  return { kind: "file", color: "text-slate-300" };
}

export function twoDigits(n: number): string {
  return n.toString().padStart(2, "0");
}
