/** Extract short section label for filter: "Section T4 - Block ..." -> "T4" (letter and number between Section and the -). */
export function getSectionLabel(locationString) {
  const s = (locationString || '').trim();
  if (!s) return null;
  const match = s.match(/Section\s+([A-Za-z0-9]+)\s*-/);
  return match ? match[1].trim() : null;
}

/** Detail panel: "Section D4 - Block 1NS ..." -> "Section D4" (strip first " - …" suffix). */
export function sectionHeadingShort(locationString) {
  const s = (locationString || '').trim();
  if (!s) return null;
  const cut = s.indexOf(' - ');
  if (cut === -1) return s;
  return s.slice(0, cut).trim() || s;
}
