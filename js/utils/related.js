export function relatedScore(a, b) {
  let score = 0;
  const aLast = (a.lastName || '').trim().toLowerCase();
  const bLast = (b.lastName || '').trim().toLowerCase();
  if (aLast && bLast && aLast === bLast) score += 5;
  const aSection = a.locationString || '';
  const bSection = b.locationString || '';
  if (aSection && bSection && aSection === bSection) score += 3;
  const aLot = (a.lot != null && a.lot !== '') ? String(a.lot).trim() : '';
  const bLot = (b.lot != null && b.lot !== '') ? String(b.lot).trim() : '';
  if (aLot && bLot && aLot === bLot) score += 4;
  const aFuneral = a.funeralHome || '';
  const bFuneral = b.funeralHome || '';
  if (aFuneral && bFuneral && aFuneral === bFuneral) score += 1;
  const aYear = a.serviceYear != null ? a.serviceYear : (a.deathYear != null ? a.deathYear : null);
  const bYear = b.serviceYear != null ? b.serviceYear : (b.deathYear != null ? b.deathYear : null);
  if (aYear != null && bYear != null && Math.abs(aYear - bYear) <= 1) score += 1;
  return score;
}

export function getRelated(graves, grave, limit) {
  const withCoords = graves.filter(g => g.id !== grave.id && g.lat != null && g.lng != null);
  const scored = withCoords.map(g => ({ g, score: relatedScore(grave, g) })).filter(x => x.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit || 5).map(x => x.g);
}
