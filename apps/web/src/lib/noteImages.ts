import { supabase } from "@/lib/supabaseClient";

// Images on a lead note live in the private "files" bucket; the note text keeps
// one `[[img:<path>]]` line per image, so no schema change is needed.
const MARK = /\n?\[\[img:([^\]\s]+)\]\]/g;
export const NOTE_IMAGE_MAX = 10 * 1024 * 1024;

export function splitNote(text: string): { body: string; paths: string[] } {
  const paths = Array.from(text.matchAll(MARK), (m) => m[1]);
  return { body: text.replace(MARK, "").trim(), paths };
}

export function joinNote(body: string, paths: string[]): string {
  return [body.trim(), ...paths.map((p) => `[[img:${p}]]`)].filter(Boolean).join("\n");
}

export async function uploadNoteImage(orgId: string, file: File): Promise<string> {
  const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : ".png";
  const path = `${orgId}/notes/${crypto.randomUUID()}${ext}`;
  const { error } = await supabase.storage.from("files").upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return path;
}

export async function signedImageUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("files").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function removeNoteImages(paths: string[]) {
  if (paths.length) await supabase.storage.from("files").remove(paths);
}
