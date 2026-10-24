const FAMILY_PREFIX = "cutpro-font-";
const loadedFonts = new Map<string, { url: string; face: FontFace }>();
const pendingFonts = new Map<string, string>();

export function fontFamilyName(id: string): string {
  return `${FAMILY_PREFIX}${id}`;
}

export async function loadImportedFont(id: string, url: string): Promise<void> {
  const current = loadedFonts.get(id);
  if (current?.url === url) return;
  if (current) {
    document.fonts.delete(current.face);
    loadedFonts.delete(id);
  }

  pendingFonts.set(id, url);
  let face: FontFace;
  try {
    face = await new FontFace(fontFamilyName(id), `url("${url}")`).load();
  } catch (error) {
    if (pendingFonts.get(id) === url) pendingFonts.delete(id);
    throw error;
  }
  if (pendingFonts.get(id) !== url) return;
  pendingFonts.delete(id);
  document.fonts.add(face);
  loadedFonts.set(id, { url, face });
}

export function removeUnusedImportedFonts(ids: Set<string>): void {
  for (const id of pendingFonts.keys()) {
    if (!ids.has(id)) pendingFonts.delete(id);
  }
  for (const [id, font] of loadedFonts) {
    if (ids.has(id)) continue;
    document.fonts.delete(font.face);
    loadedFonts.delete(id);
  }
}

export function clearImportedFonts(): void {
  removeUnusedImportedFonts(new Set());
}
