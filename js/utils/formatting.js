export function formatDate(str) {
  if (!str || str.length < 10) return null;
  const d = new Date(str + 'T12:00:00');
  if (isNaN(d.getTime())) return str.slice(0, 10);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

/** Safe double-quoted HTML attribute values (e.g. img src on controlled URLs). */
export function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/\r?\n/g, ' ');
}
