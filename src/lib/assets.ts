import { supabase } from "@/integrations/supabase/client";
import { isLocalDemo } from "@/integrations/demo-backend/mode";
import type { Database } from "@/integrations/supabase/types";

export type AssetType = Database["public"]["Enums"]["asset_type"];
export type Asset = Database["public"]["Tables"]["accommodation_assets"]["Row"];

export const ASSET_BUCKET = "accommodation-assets";
export const SIGNED_URL_TTL = 3600;

export const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: "photo", label: "Photo" },
  { value: "video", label: "Video" },
  { value: "vertical_video", label: "Vertical video" },
  { value: "drone", label: "Drone" },
  { value: "document", label: "Document" },
  { value: "brand_asset", label: "Brand asset" },
];
export const assetTypeLabel = (t: AssetType) => ASSET_TYPES.find((x) => x.value === t)?.label ?? t;

type Kind = "image" | "video" | "pdf";
const MB = 1024 * 1024;
const RULES: Record<string, { kind: Kind; ext: string; max: number }> = {
  "image/jpeg": { kind: "image", ext: "jpg", max: 15 * MB },
  "image/png": { kind: "image", ext: "png", max: 15 * MB },
  "image/webp": { kind: "image", ext: "webp", max: 15 * MB },
  "video/mp4": { kind: "video", ext: "mp4", max: 50 * MB },
  "video/quicktime": { kind: "video", ext: "mov", max: 50 * MB },
  "application/pdf": { kind: "pdf", ext: "pdf", max: 10 * MB },
};
const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  mp4: "video/mp4", mov: "video/quicktime", pdf: "application/pdf",
};
export const ACCEPT = ".jpg,.jpeg,.png,.webp,.mp4,.mov,.pdf";

export function kindOfPath(path: string | null): Kind | null {
  const ext = path?.split(".").pop()?.toLowerCase();
  if (!ext) return null;
  if (["jpg", "png", "webp"].includes(ext)) return "image";
  if (["mp4", "mov"].includes(ext)) return "video";
  if (ext === "pdf") return "pdf";
  return null;
}

/** Validates type (by extension and MIME) and size. Returns rule or error message. */
export function validateFile(file: File): { ok: true; mime: string; ext: string; kind: Kind } | { ok: false; error: string } {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = EXT_TO_MIME[ext];
  if (!mime || (file.type && file.type !== mime)) {
    return { ok: false, error: `${file.name}: only JPG, PNG, WEBP, MP4, MOV or PDF` };
  }
  const rule = RULES[mime]!;
  if (file.size > rule.max) {
    return { ok: false, error: `${file.name}: max ${rule.max / MB} MB for this type` };
  }
  return { ok: true, mime, ext: rule.ext, kind: rule.kind };
}

export const defaultAssetType = (kind: Kind): AssetType =>
  kind === "image" ? "photo" : kind === "video" ? "video" : "document";

/** Upload via XHR so we can report progress. RLS on storage.objects still applies. */
export async function uploadWithProgress(path: string, file: File, mime: string, onProgress: (pct: number) => void) {
  if (isLocalDemo()) {
    // Browser demo: the file goes into the local database (storage policies still apply).
    const { error } = await supabase.storage.from(ASSET_BUCKET).upload(path, file, { contentType: mime, upsert: false });
    if (error) throw new Error(error.message);
    onProgress(100);
    return;
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");
  const url = `${import.meta.env['VITE_SUPABASE_URL']}/storage/v1/object/${ASSET_BUCKET}/${path}`;
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY']);
    xhr.setRequestHeader("Content-Type", mime);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(parseErr(xhr.responseText))));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}
function parseErr(t: string) {
  try {
    const j = JSON.parse(t);
    return j.message || j.error || "Upload failed";
  } catch {
    return "Upload failed";
  }
}

export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage.from(ASSET_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}
