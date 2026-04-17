export function normalizeGender(val) {
  if (!val) return '';
  const v = String(val).trim().toUpperCase();
  if (v === 'M' || v === 'MALE') return 'M';
  if (v === 'F' || v === 'FEMALE') return 'F';
  if (v === 'N' || v === 'NON-BINARY' || v === 'NONBINARY' || v === 'NOT SPECIFIED') return 'N';
  if (v === 'U' || v === 'UNKNOWN' || v === 'OTHER') return 'U';
  return v;
}
