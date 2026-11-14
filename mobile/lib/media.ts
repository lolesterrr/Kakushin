import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { authHeaders, uploadResult } from "./api";
import { API_URL } from "./config";

/** Same limits as the website: PNG, JPEG or WebP. */
const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

export type Picked = { uri: string; type: string; size?: number; file?: Blob };

/**
 * Opens the photo library and returns one picture, or null if the person backs out. `aspect` asks the phone to crop
 * (square for a profile picture, wide for a banner). HEIC from iPhones is converted to JPEG by the picker.
 */
export async function pickImage(aspect?: [number, number]): Promise<Picked | null> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: !!aspect, aspect, quality: 0.85, exif: false });
  if (r.canceled || !r.assets[0]) return null;
  const a = r.assets[0];
  let type = (a.mimeType ?? "").toLowerCase();
  if (!Object.values(TYPES).includes(type)) type = TYPES[(a.fileName ?? a.uri).split(".").pop()?.toLowerCase() ?? ""] ?? "image/jpeg";
  return { uri: a.uri, type, size: a.fileSize, file: (a as { file?: Blob }).file };
}

/** Sends a picture to the Worker as the raw request body, which is what the image routes expect. */
export async function uploadImage<T = unknown>(path: string, img: Picked, opts: { method?: "POST" | "PUT"; caption?: string; maxMb?: number } = {}): Promise<T> {
  const max = (opts.maxMb ?? 3) * 1024 * 1024;
  if (img.size && img.size > max) throw new Error(`That picture is too large (max ${opts.maxMb ?? 3} MB)`);
  const url = `${API_URL}/api${path}`;
  const headers = { ...authHeaders(), "Content-Type": img.type, ...(opts.caption ? { "X-Caption": encodeURIComponent(opts.caption).slice(0, 400) } : {}) };
  const method = opts.method ?? "POST";
  if (Platform.OS === "web") {
    const res = await fetch(url, { method, headers, body: img.file ?? (await (await fetch(img.uri)).blob()) });
    return (await uploadResult(res.status, await res.text())) as T;
  }
  let res: FileSystem.FileSystemUploadResult;
  try {
    res = await FileSystem.uploadAsync(url, img.uri, { httpMethod: method, uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers });
  } catch {
    throw new Error("Could not reach Kakushin. Check your connection and try again.");
  }
  return (await uploadResult(res.status, res.body)) as T;
}

/** Image addresses from the server are relative (/api/files/...); the phone needs the full address. */
export const abs = (u: string | null | undefined) => (!u ? null : /^https?:\/\//.test(u) ? u : `${API_URL}${u}`);
