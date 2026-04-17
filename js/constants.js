// Curated subset: data/graves.json is built from buried-data.csv (see python/buried_subset.py, python/convert.py).
export const GRAVES_DATA_URL = 'data/graves.json';

export const INITIAL_VIEW = {
  center: [-84.3731, 33.7019],
  zoom: 15.4,
  pitch: 0,
  bearing: 0
};

export const COORD_PRECISION = 1e5;
export const GRAVE_ZOOM_CLOSE = 17.7;
export const GRAVE_ZOOM_PAN = 16;
export const DISABLE_PINCH_ZOOM = false;

export const GENDER_OPTIONS = [
  { value: 'M', label: 'Male' },
  { value: 'F', label: 'Female' },
  { value: 'N', label: 'Not Specified' },
  { value: 'U', label: 'Unknown' }
];
