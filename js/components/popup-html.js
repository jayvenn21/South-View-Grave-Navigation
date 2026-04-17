import { formatDate, escapeHtml, escapeAttr } from '../utils/formatting.js';
import { getRelated } from '../utils/related.js';

/**
 * @param {object} opts
 * @param {() => unknown[]} opts.getGraves
 * @param {() => unknown[]} opts.getFilteredGraves
 */
export function createPopupHtmlBuilders(opts) {
  const { getGraves } = opts;

  function createPopupHTML(g) {
    const name = (g.fullName || [g.firstName, g.middleName, g.lastName].filter(Boolean).join(' ')).trim();
    const born = g.birthDate ? formatDate(g.birthDate) : null;
    const died = g.deathDate ? formatDate(g.deathDate) : null;
    const parts = [];
    if (born) parts.push(`Born: ${escapeHtml(born)}`);
    if (died) parts.push(`Died: ${escapeHtml(died)}`);
    if (g.gender) parts.push(`Gender: ${escapeHtml(g.gender)}`);
    const metaHtml = parts.length ? `<div class="popup-meta">${parts.join('<br>')}</div>` : '';
    const related = getRelated(getGraves(), g, 4);
    let relatedHtml = '';
    if (related.length > 0) {
      relatedHtml = '<div class="popup-related"><strong>Related burials</strong><ul>' +
        related.map(r => `<li><a href="#" data-id="${r.id}" class="popup-related-link">${escapeHtml((r.fullName || (r.firstName + ' ' + (r.lastName || '')).trim()))}</a></li>`).join('') +
        '</ul></div>';
    }
    const tagsHtml = (g.tags && g.tags.length) ? `<div class="popup-tags">${g.tags.map(t => `<span class="popup-tag">${escapeHtml(t)}</span>`).join(' ')}</div>` : '';
    // Educational prototype: optional portrait + short blurb (full text in sidebar detail).
    const blurbSource = g.historicalBlurb || g.notes;
    const blurbShort = blurbSource && blurbSource.length > 200 ? blurbSource.slice(0, 197) + '…' : blurbSource;
    const figureHtml = g.imageUrl
      ? `<div class="popup-figure"><img src="${escapeAttr(g.imageUrl)}" alt="" loading="lazy" width="240" height="140"></div>`
      : '';
    const blurbHtml = blurbShort ? `<div class="popup-blurb">${escapeHtml(blurbShort)}</div>` : '';
    return `
        <div class="popup-content">
          <div class="popup-title">${escapeHtml(name)}</div>
          ${figureHtml}
          ${blurbHtml}
          ${metaHtml}
          ${tagsHtml}
          ${relatedHtml}
        </div>
      `;
  }

  function createPopupHTMLForMultiple(gravesAtLocation) {
    const listHtml = gravesAtLocation.map(g => {
      const name = (g.fullName || [g.firstName, g.middleName, g.lastName].filter(Boolean).join(' ')).trim();
      return `<li><a href="#" data-id="${g.id}" class="popup-related-link">${escapeHtml(name)}</a></li>`;
    }).join('');
    return `
        <div class="popup-content">
          <div class="popup-title">Multiple burials at this section</div>
          <div class="popup-meta">Exact location unknown.</div>
          <div class="popup-related"><strong>Select a burial:</strong><ul>${listHtml}</ul></div>
        </div>
      `;
  }

  return { createPopupHTML, createPopupHTMLForMultiple };
}
