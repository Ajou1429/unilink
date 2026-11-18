const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MaterialScope = { material_note_id?: string; material_note_ids?: string[] };

export function parseMaterialScope(single: unknown, multiple: unknown): MaterialScope | null {
  if (multiple !== undefined) {
    if (single !== undefined || !Array.isArray(multiple) || multiple.length < 2 || multiple.length > 5 ||
      !multiple.every(id => typeof id === "string" && uuid.test(id)) || new Set(multiple.map(id => id.toLowerCase())).size !== multiple.length) return null;
    return { material_note_ids: multiple.map(id => id.toLowerCase()) };
  }
  if (single === undefined) return {};
  return typeof single === "string" && uuid.test(single) ? { material_note_id: single.toLowerCase() } : null;
}

export function matchesMaterialScope(expected: MaterialScope, actual?: MaterialScope | null) {
  if (expected.material_note_id) return expected.material_note_id === actual?.material_note_id;
  if (expected.material_note_ids) return actual?.material_note_ids?.length === expected.material_note_ids.length &&
    expected.material_note_ids.every(id => actual.material_note_ids!.includes(id));
  return true;
}
