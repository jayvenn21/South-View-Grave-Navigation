import {
  GRAVES_DATA_URL,
  INITIAL_VIEW,
  GRAVE_ZOOM_CLOSE,
  GRAVE_ZOOM_PAN,
  GENDER_OPTIONS,
  DISABLE_PINCH_ZOOM
} from './constants.js';
import { buildGravesGeojson } from './utils/geo.js';
import { formatDate, escapeHtml } from './utils/formatting.js';
import { normalizeGender } from './utils/gender.js';
import { createPopupHtmlBuilders } from './components/popup-html.js';
import { registerGravePinImage, GRAVE_PIN_ICON_ID } from './utils/map-marker-icon.js';

mapboxgl.accessToken = typeof MAPBOX_ACCESS_TOKEN !== 'undefined' ? MAPBOX_ACCESS_TOKEN : '';

let graves = [];
let gravesWithCoords = [];
let filteredGraves = [];

const { createPopupHTML } = createPopupHtmlBuilders({
  getGraves: () => graves,
  getFilteredGraves: () => filteredGraves
});

const map = new mapboxgl.Map({
  container: 'map',
  // Satellite imagery for educational / historical prototype (was streets-v12).
  style: 'mapbox://styles/mapbox/satellite-v9',
  center: INITIAL_VIEW.center,
  zoom: INITIAL_VIEW.zoom,
  pitch: INITIAL_VIEW.pitch,
  bearing: INITIAL_VIEW.bearing
});

map.setMinZoom(14);
map.setMaxZoom(19);
map.once('load', () => {
  map.jumpTo(INITIAL_VIEW);
  if (DISABLE_PINCH_ZOOM) {
    map.touchZoomRotate.disableRotation();
    map.touchZoomRotate.disable();
  }
});

function resetMapView() {
  map.easeTo(INITIAL_VIEW);
}

const MAPBOX_FATAL_ERROR_BANNER_ID = 'mapbox-fatal-error-banner';

map.on('error', (e) => {
  // GL JS can fire `error` for single failed tiles (e.g. brief 403s with URL-restricted tokens).
  // That looks "random" in the console but the map often keeps working — don't treat like total failure.
  if (e.tile) {
    console.warn('Mapbox tile error (often transient):', e.error?.message || e.error || e);
    return;
  }
  console.error('Mapbox error:', e);
  if (document.getElementById(MAPBOX_FATAL_ERROR_BANNER_ID)) return;
  const local =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const msg = local
    ? 'Map failed to load. Check your Mapbox token and URL restrictions for localhost.'
    : 'Map failed to load. Check your Mapbox token and URL restrictions for this site.';
  document.body.insertAdjacentHTML(
    'afterbegin',
    `<div id="${MAPBOX_FATAL_ERROR_BANNER_ID}" style="position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#c00;color:#fff;padding:12px 24px;border-radius:8px;z-index:9999;font-size:14px;max-width:90%;text-align:center;">${msg}</div>`
  );
});

let popupInstance = null;
let tourActive = false;
let tourStep = 0;
let tourMaxBurialStops = 10;
let selectedGrave = null;
let hoveredGraveId = null;
let waypointHoverLeaveTimer = null;
let waypointHoverMoveBound = false;
let activeStoryFilter = 'all';

let sidebarMapInteractLocks = 0;
let sidebarDimFromMapMarkerHover = false;
let mapZoomUserGesture = false;

const STORY_FILTERS = [
  { value: 'all', label: 'All Burials' },
  { value: 'spiritual', label: 'Spiritual Leaders' },
  { value: 'civil-rights', label: 'Civil Rights Leaders' },
  { value: 'educators', label: 'Educators' },
  { value: 'music-arts', label: 'Music & Arts' },
  { value: 'business', label: 'Business & Community Builders' }
];

function classifyGraveStoryCategories(g) {
  const name = (g.fullName || '').toLowerCase();
  const text = `${g.historicalBlurb || ''} ${g.notes || ''}`.toLowerCase();
  const cats = [];

  if (name.includes('king') || text.includes('pastor') || text.includes('church') || text.includes('spiritual')) {
    cats.push('spiritual');
  }
  if (text.includes('civil rights') || text.includes('voting rights') || text.includes('naacp') || text.includes('segregation')) {
    cats.push('civil-rights');
  }
  if (text.includes('educator') || text.includes('education') || text.includes('teacher') || text.includes('school') || text.includes('college') || text.includes('library')) {
    cats.push('educators');
  }
  if (text.includes('musician') || text.includes('music') || text.includes('fashion') || text.includes('artist')) {
    cats.push('music-arts');
  }
  if (text.includes('entrepreneur') || text.includes('business') || text.includes('insurance') || text.includes('construction') || text.includes('founded')) {
    cats.push('business');
  }
  return cats;
}

function refreshSidebarDimForMap() {
  const el = document.querySelector('.sidebar');
  if (!el) return;
  const dim = sidebarMapInteractLocks > 0 || sidebarDimFromMapMarkerHover;
  el.classList.toggle('sidebar--dimmed-for-map', dim);
}

function beginSidebarMapInteract() {
  sidebarMapInteractLocks++;
  refreshSidebarDimForMap();
}

function endSidebarMapInteract() {
  sidebarMapInteractLocks = Math.max(0, sidebarMapInteractLocks - 1);
  refreshSidebarDimForMap();
}

function setSidebarDimFromMapMarkerHover(on) {
  sidebarDimFromMapMarkerHover = !!on;
  refreshSidebarDimForMap();
}

function setupSidebarMapInteractDimming(map) {
  const canvas = map.getCanvas();

  let pointerDownOnMapCanvas = false;
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0 || e.button === 1 || e.button === 2) {
      pointerDownOnMapCanvas = true;
      beginSidebarMapInteract();
    }
  });
  window.addEventListener('mouseup', () => {
    if (pointerDownOnMapCanvas) {
      pointerDownOnMapCanvas = false;
      endSidebarMapInteract();
    }
  });
  window.addEventListener('blur', () => {
    pointerDownOnMapCanvas = false;
    sidebarMapInteractLocks = 0;
    refreshSidebarDimForMap();
  });

  let wheelDimTimer = null;
  let wheelDimLockHeld = false;
  canvas.addEventListener(
    'wheel',
    () => {
      if (!wheelDimLockHeld) {
        wheelDimLockHeld = true;
        beginSidebarMapInteract();
      }
      clearTimeout(wheelDimTimer);
      wheelDimTimer = setTimeout(() => {
        wheelDimTimer = null;
        if (wheelDimLockHeld) {
          wheelDimLockHeld = false;
          endSidebarMapInteract();
        }
      }, 380);
    },
    { passive: true }
  );

  map.on('dragstart', () => beginSidebarMapInteract());
  map.on('dragend', () => endSidebarMapInteract());

  map.on('zoomstart', (e) => {
    if (e.originalEvent) {
      mapZoomUserGesture = true;
      beginSidebarMapInteract();
    }
  });
  map.on('zoomend', () => {
    if (mapZoomUserGesture) {
      mapZoomUserGesture = false;
      endSidebarMapInteract();
    }
  });
}

function graveDisplayName(g) {
  return (g.fullName || [g.firstName, g.middleName, g.lastName].filter(Boolean).join(' ')).trim();
}

function shouldShowGraveHoverEffects(grave) {
  if (tourActive) return false;
  if (!grave || grave.lat == null || grave.lng == null) return false;
  if (selectedGrave && selectedGrave.id === grave.id) return false;
  return true;
}

function setGraveHoverDimming(hoveredGrave) {
  if (!map.getSource || !map.getSource('graves')) return;
  const withCoords = filteredGraves.filter(g => g.lat != null && g.lng != null);
  for (const g of withCoords) {
    map.setFeatureState(
      { source: 'graves', id: g.id },
      { dim: !!(hoveredGrave && g.id !== hoveredGrave.id) }
    );
  }
}

function positionWaypointHoverCallout(grave) {
  const el = document.getElementById('waypoint-hover-callout');
  const nameEl = document.getElementById('waypoint-hover-callout-name');
  const photoEl = document.getElementById('waypoint-hover-callout-photo');
  const phEl = document.getElementById('waypoint-hover-callout-photo-ph');
  if (!el || !nameEl || !photoEl || !phEl || !grave || grave.lat == null) return;
  const pt = map.project([grave.lng, grave.lat]);
  el.style.left = pt.x + 'px';
  el.style.top = pt.y + 'px';
  const name = graveDisplayName(grave);
  nameEl.textContent = name;
  if (grave.imageUrl) {
    photoEl.src = grave.imageUrl;
    photoEl.alt = name ? 'Portrait: ' + name : '';
    photoEl.removeAttribute('hidden');
    phEl.setAttribute('hidden', '');
  } else {
    photoEl.removeAttribute('src');
    photoEl.alt = '';
    photoEl.setAttribute('hidden', '');
    phEl.removeAttribute('hidden');
  }
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden', 'false');
}

function hideWaypointHoverCallout() {
  const el = document.getElementById('waypoint-hover-callout');
  if (el) {
    el.classList.add('hidden');
    el.setAttribute('aria-hidden', 'true');
  }
}

function ensureWaypointHoverRepositionHandlers() {
  if (waypointHoverMoveBound) return;
  waypointHoverMoveBound = true;
  const reposition = () => {
    if (hoveredGraveId == null) return;
    const g = filteredGraves.find(x => x.id === hoveredGraveId);
    if (g && shouldShowGraveHoverEffects(g)) positionWaypointHoverCallout(g);
  };
  map.on('move', reposition);
  map.on('zoom', reposition);
}

function openPopupForGrave(grave) {
  if (popupInstance) popupInstance.remove();
  if (!grave || grave.lat == null || grave.lng == null) return;
  popupInstance = new mapboxgl.Popup({ offset: 25, closeButton: true })
    .setLngLat([grave.lng, grave.lat])
    .setHTML(createPopupHTML(grave))
    .addTo(map);
  map.flyTo({ center: [grave.lng, grave.lat], zoom: GRAVE_ZOOM_CLOSE, speed: 0.5, curve: 1.2, essential: true });
  popupInstance.on('open', () => {
    const container = popupInstance.getElement();
    container.querySelectorAll('.popup-related-link').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        if (tourActive) return;
        const id = parseInt(a.dataset.id, 10);
        const g = graves.find(x => x.id === id);
        if (g) selectGrave(g);
      });
    });
  });
}

function flyToGrave(grave) {
  if (!grave || grave.lat == null || grave.lng == null) return;
  map.easeTo({
    center: [grave.lng, grave.lat],
    zoom: GRAVE_ZOOM_PAN,
    duration: 800
  });
  setTimeout(() => {
    map.easeTo({
      center: [grave.lng, grave.lat],
      zoom: GRAVE_ZOOM_CLOSE,
      duration: 600
    });
  }, 300);
}

function tourBurials() {
  const withCoords = filteredGravesWithCoords();
  return tourMaxBurialStops == null ? withCoords : withCoords.slice(0, tourMaxBurialStops);
}

function tourTotalStops() {
  const n = tourBurials().length;
  return n === 0 ? 0 : 1 + n;
}

function tourMaxStepIndex() {
  return Math.max(0, tourTotalStops() - 1);
}

function fitMapToTourPath() {
  const coords = getTourPathCoords();
  if (coords.length === 0) return;
  if (coords.length === 1) {
    map.flyTo({ center: coords[0], zoom: GRAVE_ZOOM_PAN, essential: true });
    return;
  }
  const b = new mapboxgl.LngLatBounds(coords[0], coords[0]);
  coords.forEach(c => b.extend(c));
  map.fitBounds(b, {
    padding: { top: 72, bottom: 200, left: 340, right: 40 },
    duration: 1100,
    maxZoom: 17,
    essential: true
  });
}

function selectGrave(grave) {
  if (popupInstance) popupInstance.remove();
  setHoveredGrave(null);
  selectedGrave = grave;
  const listWrap = document.getElementById('list-view-wrap');
  const detailPanel = document.getElementById('selected-burial');
  if (!grave) {
    listWrap.classList.remove('hidden');
    detailPanel.classList.remove('visible');
    const photoWrap = document.getElementById('detail-photo-wrap');
    const photoEl = document.getElementById('detail-photo');
    const phEl = document.getElementById('detail-photo-placeholder');
    photoWrap.style.display = 'none';
    photoEl.removeAttribute('src');
    photoEl.alt = '';
    photoEl.setAttribute('hidden', '');
    if (phEl) phEl.setAttribute('hidden', '');
    document.getElementById('detail-history').innerHTML = '';
    document.getElementById('detail-history').style.display = 'none';
    return;
  }
  listWrap.classList.add('hidden');
  detailPanel.classList.add('visible');
  const name = (grave.fullName || [grave.firstName, grave.middleName, grave.lastName].filter(Boolean).join(' ')).trim();
  const born = grave.birthDate ? formatDate(grave.birthDate) : null;
  const died = grave.deathDate ? formatDate(grave.deathDate) : null;
  const metaLines = [];
  if (born) metaLines.push('<p><strong>Born:</strong> ' + escapeHtml(born) + '</p>');
  if (died) metaLines.push('<p><strong>Died:</strong> ' + escapeHtml(died) + '</p>');
  if (grave.gender) {
    const gNorm = normalizeGender(grave.gender);
    const gLabel = GENDER_OPTIONS.find(o => o.value === gNorm);
    metaLines.push('<p><strong>Gender:</strong> ' + escapeHtml(gLabel ? gLabel.label : grave.gender) + '</p>');
  }
  document.getElementById('detail-name').textContent = name;
  document.getElementById('detail-meta').innerHTML = metaLines.length ? metaLines.join('') : '';
  const photoWrap = document.getElementById('detail-photo-wrap');
  const photoEl = document.getElementById('detail-photo');
  const phEl = document.getElementById('detail-photo-placeholder');
  photoWrap.style.display = 'flex';
  if (grave.imageUrl) {
    photoEl.src = grave.imageUrl;
    photoEl.alt = 'Portrait: ' + name;
    photoEl.removeAttribute('hidden');
    if (phEl) phEl.setAttribute('hidden', '');
  } else {
    photoEl.removeAttribute('src');
    photoEl.alt = '';
    photoEl.setAttribute('hidden', '');
    if (phEl) phEl.removeAttribute('hidden');
  }
  const imgSourcingEl = document.getElementById('detail-image-sourcing');
  if (imgSourcingEl) {
    imgSourcingEl.innerHTML = grave.imageUrlSourcing
        ? '<em>Image From: ' + escapeHtml(grave.imageUrlSourcing) + '</em>'
        : '';
  }
  const historyEl = document.getElementById('detail-history');
  const blurb = grave.historicalBlurb || grave.notes;
  if (blurb) {
    historyEl.style.display = 'block';
    let html = '<p>' + escapeHtml(blurb) + '</p>';
    if (grave.historicalBlurbSourcing) {
      html += '<p class="sourcing-credit"><em>Source: ' + escapeHtml(grave.historicalBlurbSourcing) + '</em></p>';
    }
    historyEl.innerHTML = html;
  } else {
    historyEl.innerHTML = '';
    historyEl.style.display = 'none';
  }
  const bioEl = document.getElementById('detail-bio');
  bioEl.textContent = '';
  bioEl.style.display = 'none';
  const directionsEl = document.getElementById('get-directions-link');
  if (grave.lat != null && grave.lng != null) {
    flyToGrave(grave);
    directionsEl.href = 'https://www.google.com/maps/dir/?api=1&destination=' + grave.lat + ',' + grave.lng;
    directionsEl.style.display = 'inline-block';
  } else {
    directionsEl.style.display = 'none';
  }
}

function applyFilters() {
  filteredGraves = activeStoryFilter === 'all'
    ? graves
    : graves.filter(g => classifyGraveStoryCategories(g).includes(activeStoryFilter));
  if (selectedGrave && !filteredGraves.some(g => g.id === selectedGrave.id)) {
    selectedGrave = null;
    if (popupInstance) {
      popupInstance.remove();
      popupInstance = null;
    }
  }
  updateListPanel();
  if (map.getSource && map.getSource('graves')) {
    map.getSource('graves').setData(buildGravesGeojson(filteredGraves));
  }
  if (hoveredGraveId != null) {
    const hg = filteredGraves.find(x => x.id === hoveredGraveId);
    if (!hg || hg.lat == null) {
      setHoveredGrave(null);
    } else if (map.getSource && map.getSource('graves')) {
      const show = shouldShowGraveHoverEffects(hg);
      setGraveHoverDimming(show ? hg : null);
      if (show) positionWaypointHoverCallout(hg);
      else hideWaypointHoverCallout();
    }
  }
  if (tourActive && tourTotalStops() > 0) {
    tourStep = Math.min(tourStep, tourMaxStepIndex());
    updateTourPath();
  }
}

function filteredGravesWithCoords() {
  return filteredGraves.filter(g => g.lat != null && g.lng != null);
}

function setHoveredGrave(grave, fromMap = false) {
  if (waypointHoverLeaveTimer != null) {
    clearTimeout(waypointHoverLeaveTimer);
    waypointHoverLeaveTimer = null;
  }
  hoveredGraveId = grave ? grave.id : null;
  document.querySelectorAll('.list-panel-item[data-grave-id]').forEach(el => {
    el.classList.toggle('hovered', parseInt(el.dataset.graveId, 10) === hoveredGraveId);
  });
  if (fromMap) {
    setSidebarDimFromMapMarkerHover(!!(grave && grave.lat != null && grave.lng != null));
  } else {
    setSidebarDimFromMapMarkerHover(false);
  }
  if (!map.getSource || !map.getSource('graves')) return;

  if (!grave || grave.lat == null) {
    setGraveHoverDimming(null);
    hideWaypointHoverCallout();
    return;
  }

  const show = shouldShowGraveHoverEffects(grave);
  if (show) {
    setGraveHoverDimming(grave);
    positionWaypointHoverCallout(grave);
    ensureWaypointHoverRepositionHandlers();
  } else {
    setGraveHoverDimming(null);
    hideWaypointHoverCallout();
  }
}

function updateListPanel() {
  const listEl = document.getElementById('list-panel-list');
  listEl.innerHTML = '';
  filteredGraves.slice(0, 200).forEach(g => {
    const name = (g.fullName || [g.firstName, g.middleName, g.lastName].filter(Boolean).join(' ')).trim();
    const deathYear = g.deathDate ? g.deathDate.slice(0, 4) : '';
    const sub = deathYear || g.locationString || '';
    const div = document.createElement('div');
    div.className = 'list-panel-item';
    div.dataset.graveId = g.id;
    div.innerHTML = `<strong>${escapeHtml(name)}</strong>${sub ? `<span>${escapeHtml(sub)}</span>` : ''}`;
    div.addEventListener('click', () => {
      selectGrave(g);
      if (g.lat != null && g.lng != null) flyToGrave(g);
    });
    div.addEventListener('mouseenter', () => {
      if (g.lat != null && g.lng != null) {
        map.flyTo({ center: [g.lng, g.lat], zoom: GRAVE_ZOOM_CLOSE, speed: 0.5, curve: 1.2, essential: true });
        setHoveredGrave(g);
      }
    });
    div.addEventListener('mouseleave', () => { setHoveredGrave(null); });
    listEl.appendChild(div);
  });
  if (filteredGraves.length > 200) {
    const more = document.createElement('div');
    more.className = 'list-panel-item';
    more.style.fontStyle = 'italic';
    more.textContent = `+ ${filteredGraves.length - 200} more burials not shown in this list.`;
    listEl.appendChild(more);
  }
}

function getTourPathCoords() {
  return tourBurials().map(g => [g.lng, g.lat]);
}

function getProgressPathCoords() {
  const coords = getTourPathCoords();
  if (tourStep <= 0 || coords.length === 0) return [];
  const segment = coords.slice(0, tourStep);
  if (segment.length >= 2) return segment;
  if (segment.length === 1) return [segment[0], segment[0]];
  return [];
}

function getTourCalloutText(step) {
  const burials = tourBurials();
  if (burials.length === 0) return '';
  const total = tourTotalStops();
  const last = total - 1;
  if (step === 0) return 'Explorer Mode — interactive walkthrough of the cemetery.';
  const g = burials[step - 1];
  const name = (g.fullName || [g.firstName, g.lastName].filter(Boolean).join(' ')).trim();
  if (step === last) {
    return `${name} — Final stop. You've completed the interactive cemetery walkthrough.`;
  }
  return name;
}

function tourStopSummaryText() {
  const total = tourTotalStops();
  if (total <= 0) return '0 / 0';
  return `Stop ${tourStep + 1} of ${total} — Explorer Mode`;
}

function syncTourCalloutProgressLine() {
  const el = document.getElementById('tour-callout-progress');
  if (el) el.textContent = tourStopSummaryText();
}

function updateTourPath() {
  if (!map.getSource || !map.getSource('tour-path-full')) return;
  const fullCoords = getTourPathCoords();
  const progressCoords = getProgressPathCoords();
  map.getSource('tour-path-full').setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: fullCoords } });
  map.getSource('tour-path-progress').setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: progressCoords } });
  const total = tourTotalStops();
  syncTourCalloutProgressLine();
  const fillEl = document.getElementById('tour-progress-fill');
  if (fillEl) fillEl.style.width = total > 0 ? ((tourStep + 1) / total * 100) + '%' : '0%';
}

function showTourCallout(text) {
  const el = document.getElementById('tour-callout');
  document.getElementById('tour-callout-text').textContent = text;
  syncTourCalloutProgressLine();
  el.classList.remove('hidden');
}

function hideTourCallout() {
  document.getElementById('tour-callout').classList.add('hidden');
}

function goToTourStop(step) {
  if (tourBurials().length === 0) return;
  const maxStep = tourMaxStepIndex();
  tourStep = Math.max(0, Math.min(step, maxStep));
  updateTourPath();
  if (tourStep === 0) {
    selectGrave(null);
    fitMapToTourPath();
  } else {
    selectGrave(tourBurials()[tourStep - 1]);
  }
  showTourCallout(getTourCalloutText(tourStep));
  const prevBtn = document.getElementById('tour-prev');
  const nextBtn = document.getElementById('tour-next');
  if (prevBtn) prevBtn.disabled = tourStep === 0;
  if (nextBtn) nextBtn.disabled = tourStep >= maxStep;
}

function exitTour() {
  tourActive = false;
  document.getElementById('map-actions').style.display = 'flex';
  document.getElementById('tour-controls').classList.remove('visible');
  hideTourCallout();
  map.setLayoutProperty('tour-path-full', 'visibility', 'none');
  map.setLayoutProperty('tour-path-progress', 'visibility', 'none');
  if (popupInstance) popupInstance.remove();
}

function startTour() {
  if (tourBurials().length === 0) return;
  tourActive = true;
  map.getCanvas().style.cursor = '';
  tourStep = 0;
  document.getElementById('map-actions').style.display = 'none';
  document.getElementById('tour-controls').classList.add('visible');
  map.setLayoutProperty('tour-path-full', 'visibility', 'visible');
  map.setLayoutProperty('tour-path-progress', 'visibility', 'visible');
  goToTourStop(0);
}

map.on('load', () => {
  map.addControl(new mapboxgl.NavigationControl(), 'top-right');
  map.resize();
  window.addEventListener('resize', () => map.resize());

  // Avoid stale browser cache of a previously huge graves.json during local dev.
  fetch(GRAVES_DATA_URL, { cache: 'no-store' })
    .then(r => r.json())
    .then(data => {
      graves = data;
      gravesWithCoords = graves.filter(g => g.lat != null && g.lng != null);

      // Teardrop pin sprite (canvas), then symbol layer with icon + number.
      return registerGravePinImage(map).then(() => {
      // No clustering: each grave is its own point, numbered 1…n in filter order.
      map.addSource('graves', {
        type: 'geojson',
        data: buildGravesGeojson(graves),
        promoteId: 'graveId'
      });

      map.addLayer({
        id: 'graves-points',
        type: 'symbol',
        source: 'graves',
        layout: {
          // Enforce deterministic overlap order so lower numbers stay on top.
          'symbol-sort-key': ['get', 'drawSortKey'],
          'icon-image': GRAVE_PIN_ICON_ID,
          // Smaller markers (tune together with custom PNG intrinsic size).
          'icon-size': 0.35,
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'text-field': ['get', 'label'],
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 13,
          'text-offset': [0, -1.5],
          'text-anchor': 'center',
          // Keep text tied to its marker and preserve layer ordering by number.
          'text-allow-overlap': true,
          'text-ignore-placement': true
        },
        paint: {
          'icon-opacity': ['case', ['boolean', ['feature-state', 'dim'], false], 0.35, 1],
          'text-opacity': ['case', ['boolean', ['feature-state', 'dim'], false], 0.35, 1],
          'text-color': '#ffffff',
          'text-halo-color': '#3d3222',
          'text-halo-width': 1.2
        }
      });

      const GRAVE_POINT_LAYERS = ['graves-points'];

      function graveFromPointFeature(f) {
        const gid = f.properties.graveId;
        if (gid == null) return null;
        const idNum = typeof gid === 'string' ? parseInt(gid, 10) : gid;
        return graves.find(x => x.id === idNum);
      }

      function onGravePointClick(e) {
        if (tourActive) return;
        const features = map.queryRenderedFeatures(e.point, { layers: GRAVE_POINT_LAYERS });
        if (!features.length) return;
        const g = graveFromPointFeature(features[0]);
        if (g) selectGrave(g);
      }
      map.on('click', 'graves-points', onGravePointClick);
      document.getElementById('map').addEventListener('click', (e) => {
        const link = e.target.closest('.popup-related-link');
        if (!link || !link.closest('.mapboxgl-popup')) return;
        e.preventDefault();
        e.stopPropagation();
        if (tourActive) return;
        const id = parseInt(link.dataset.id, 10);
        const g = graves.find(x => x.id === id);
        if (g) {
          if (popupInstance) { popupInstance.remove(); popupInstance = null; }
          selectGrave(g);
        }
      });

      function onGravePointMouseEnter(e) {
        if (tourActive) return;
        map.getCanvas().style.cursor = 'pointer';
        const features = map.queryRenderedFeatures(e.point, { layers: GRAVE_POINT_LAYERS });
        if (features.length) {
          const g = graveFromPointFeature(features[0]);
          if (g) setHoveredGrave(g, true);
        }
      }
      function onGravePointMouseLeave() {
        if (tourActive) {
          map.getCanvas().style.cursor = '';
          return;
        }
        map.getCanvas().style.cursor = '';
        waypointHoverLeaveTimer = setTimeout(() => {
          waypointHoverLeaveTimer = null;
          setHoveredGrave(null, true);
        }, 100);
      }
      map.on('mouseenter', 'graves-points', onGravePointMouseEnter);
      map.on('mouseleave', 'graves-points', onGravePointMouseLeave);

      setupSidebarMapInteractDimming(map);

      map.on('click', (e) => {
        if (tourActive) return;
        const hit = map.queryRenderedFeatures(e.point, { layers: GRAVE_POINT_LAYERS });
        if (hit.length === 0) {
          selectGrave(null);
          if (popupInstance) { popupInstance.remove(); popupInstance = null; }
        }
      });

      filteredGraves = graves;
      applyFilters();
      });
    })
    .catch(err => {
      console.error('Failed to load graves dataset', err);
      document.body.insertAdjacentHTML('afterbegin', '<div style="position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#c00;color:#fff;padding:12px 24px;border-radius:8px;z-index:9999;">Failed to load data/graves.json. Run python python/convert.py and serve the site from the project root over HTTP.</div>');
    });

  map.addSource('tour-path-full', {
    type: 'geojson',
    data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [INITIAL_VIEW.center] } }
  });
  map.addSource('tour-path-progress', {
    type: 'geojson',
    data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } }
  });
  map.addLayer({
    id: 'tour-path-full',
    type: 'line',
    source: 'tour-path-full',
    layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'none' },
    paint: { 'line-color': '#94a3b8', 'line-width': 4, 'line-dasharray': [2, 2], 'line-opacity': 0.7 }
  });
  map.addLayer({
    id: 'tour-path-progress',
    type: 'line',
    source: 'tour-path-progress',
    layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'none' },
    paint: { 'line-color': '#722f37', 'line-width': 5 }
  });

  document.getElementById('back-to-list').addEventListener('click', () => { selectGrave(null); });

  document.getElementById('reset-map').addEventListener('click', resetMapView);
  const categorySelect = document.getElementById('category-filter');
  if (categorySelect) {
    categorySelect.innerHTML = STORY_FILTERS
      .map(f => `<option value="${f.value}">${f.label}</option>`)
      .join('');
    categorySelect.value = activeStoryFilter;
    categorySelect.addEventListener('change', (e) => {
      activeStoryFilter = e.target.value;
      applyFilters();
    });
  }

  const helpBtn = document.getElementById('sidebar-help-btn');
  const helpPanel = document.getElementById('sidebar-help-panel');
  if (helpBtn && helpPanel) {
    helpBtn.addEventListener('click', () => {
      const willOpen = helpPanel.classList.contains('hidden');
      helpPanel.classList.toggle('hidden', !willOpen);
      helpBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });
  }

  const stopCountSelect = document.getElementById('tour-stop-count');
  if (stopCountSelect) {
    stopCountSelect.addEventListener('change', (e) => {
      tourMaxBurialStops = parseInt(e.target.value, 10);
    });
  }

  document.getElementById('start-tour').addEventListener('click', startTour);
  document.getElementById('tour-next').addEventListener('click', () => {
    if (tourTotalStops() === 0) return;
    goToTourStop(Math.min(tourStep + 1, tourMaxStepIndex()));
  });
  document.getElementById('tour-prev').addEventListener('click', () => goToTourStop(tourStep - 1));
  document.getElementById('tour-exit').addEventListener('click', exitTour);
});

const SIDEBAR_TOP_PX = 16;
const SIDEBAR_BOTTOM_MARGIN_PX = 16;
/** Extra gap below the panel so full expansion stops above the viewport bottom padding. */
const SIDEBAR_EXPAND_EXTRA_BOTTOM_PX = 80;
const SIDEBAR_HEIGHT_STORAGE_KEY = 'southview-sidebar-height';

function sidebarHeightBounds() {
  const vh = window.innerHeight;
  const maxH =
    vh -
    SIDEBAR_TOP_PX -
    SIDEBAR_BOTTOM_MARGIN_PX -
    SIDEBAR_EXPAND_EXTRA_BOTTOM_PX;
  const minH = maxH / 2;
  return { minH, maxH };
}

function clampSidebarHeight(px) {
  const { minH, maxH } = sidebarHeightBounds();
  return Math.round(Math.min(maxH, Math.max(minH, px)));
}

function applySidebarHeightPx(px) {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  const h = clampSidebarHeight(px);
  sidebar.style.height = `${h}px`;
  try {
    localStorage.setItem(SIDEBAR_HEIGHT_STORAGE_KEY, String(h));
  } catch (_) {}
}

function initSidebarResize() {
  const handle = document.getElementById('sidebar-resize-handle');
  const sidebar = document.querySelector('.sidebar');
  if (!handle || !sidebar) return;

  let stored = null;
  try {
    stored = localStorage.getItem(SIDEBAR_HEIGHT_STORAGE_KEY);
  } catch (_) {}
  if (stored != null) {
    const n = parseInt(stored, 10);
    if (!Number.isNaN(n)) applySidebarHeightPx(n);
  }

  let dragging = false;
  let startY = 0;
  let startHeight = 0;

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    try {
      handle.releasePointerCapture(e.pointerId);
    } catch (_) {}
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  handle.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    startY = e.clientY;
    startHeight = sidebar.offsetHeight;
    try {
      handle.setPointerCapture(e.pointerId);
    } catch (_) {}
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  });

  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const delta = e.clientY - startY;
    applySidebarHeightPx(startHeight + delta);
  });

  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);

  window.addEventListener('resize', () => {
    const hStyle = sidebar.style.height;
    const current = hStyle ? parseFloat(hStyle) : sidebar.offsetHeight;
    if (!Number.isNaN(current)) applySidebarHeightPx(current);
  });
}

initSidebarResize();
