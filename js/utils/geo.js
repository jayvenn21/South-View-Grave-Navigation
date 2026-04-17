import { COORD_PRECISION } from '../constants.js';

export function roundCoordKey(lat, lng) {
  return Math.round(lat * COORD_PRECISION) / COORD_PRECISION + ',' + Math.round(lng * COORD_PRECISION) / COORD_PRECISION;
}

/**
 * One map point per grave (no coordinate grouping). `label` is 1..n in current list order.
 */
export function buildGravesGeojson(graveList) {
  const withCoords = graveList.filter(g => g.lat != null && g.lng != null);
  return {
    type: 'FeatureCollection',
    features: withCoords.map((g, i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [g.lng, g.lat] },
      properties: {
        graveId: g.id,
        label: String(i + 1),
        labelNum: i + 1,
        // Lower numbers should visually win overlap stacking.
        drawSortKey: -(i + 1),
        ids: JSON.stringify([g.id]),
        count: 1
      }
    }))
  };
}
