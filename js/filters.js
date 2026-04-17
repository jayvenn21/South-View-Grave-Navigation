import { normalizeGender } from './utils/gender.js';
import { getSectionLabel } from './utils/section.js';

/**
 * @param {object} f
 * @param {string} f.nameQuery
 * @param {string} f.gender
 * @param {string} f.section
 * @param {string} f.funeral
 * @param {string} f.graveType
 * @param {number|null} f.birthYearFrom
 * @param {number|null} f.birthYearTo
 */
export function getFilteredGraves(graves, f) {
  const nameQuery = f.nameQuery.trim().toLowerCase();
  const { gender, section, funeral, graveType, birthYearFrom, birthYearTo } = f;

  return graves.filter(g => {
    if (nameQuery) {
      const full = (g.fullName || '').toLowerCase();
      const first = (g.firstName || '').toLowerCase();
      const last = (g.lastName || '').toLowerCase();
      if (!full.includes(nameQuery) && !first.includes(nameQuery) && !last.includes(nameQuery)) return false;
    }
    if (gender && normalizeGender(g.gender) !== gender) return false;
    if (section) {
      const gLabel = getSectionLabel(g.locationString);
      if (gLabel == null || gLabel.trim() !== section.trim()) return false;
    }
    if (funeral && (g.funeralHome || '').trim() !== funeral.trim()) return false;
    if (graveType && (g.graveType || '').trim() !== graveType.trim()) return false;
    if (birthYearFrom != null && (g.birthYear == null || g.birthYear < birthYearFrom)) return false;
    if (birthYearTo != null && (g.birthYear == null || g.birthYear > birthYearTo)) return false;
    return true;
  });
}

export function readFilterStateFromDom() {
  return {
    nameQuery: document.getElementById('search-name').value,
    gender: document.getElementById('filter-gender').value,
    section: document.getElementById('filter-section').value,
    funeral: document.getElementById('filter-funeral').value,
    graveType: document.getElementById('filter-grave-type').value,
    birthYearFrom: document.getElementById('filter-birth-year-from').value ? parseInt(document.getElementById('filter-birth-year-from').value, 10) : null,
    birthYearTo: document.getElementById('filter-birth-year-to').value ? parseInt(document.getElementById('filter-birth-year-to').value, 10) : null
  };
}
