/**
 * Registers Mapbox image `grave-pin` from assets/ (URL relative to the page when served).
 * Design the PNG with the map anchor at the bottom center; we use icon-anchor: bottom on the layer.
 */
const ICON_ID = 'grave-pin';

export const WAYPOINT_PIN_URL = 'assets/transparent_waypoint.png';

function addIconToMap(map, image) {
  if (map.hasImage(ICON_ID)) map.removeImage(ICON_ID);
  map.addImage(ICON_ID, image, { pixelRatio: 1 });
}

export function registerGravePinImage(map) {
  return new Promise((resolve, reject) => {
    map.loadImage(WAYPOINT_PIN_URL, (err, image) => {
      if (err || !image) {
        reject(new Error(`Could not load waypoint PNG at ${WAYPOINT_PIN_URL}. Serve the site from the project root.`));
        return;
      }
      try {
        addIconToMap(map, image);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
}

export const GRAVE_PIN_ICON_ID = ICON_ID;
