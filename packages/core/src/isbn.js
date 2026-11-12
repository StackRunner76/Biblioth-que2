/** Retire tirets et espaces d’un ISBN saisi. */
export const cleanIsbn = (v) => String(v ?? '').replace(/[-\s]/g, '');

/** Vrai si `c` est un EAN-13 d’ISBN (préfixe 978/979) avec une clé de contrôle correcte. */
export function isEan13Isbn(c) {
  if (!/^97[89]\d{10}$/.test(c)) return false;
  let t = 0;
  for (let i = 0; i < 12; i++) t += +c[i] * (i % 2 ? 3 : 1);
  return (10 - (t % 10)) % 10 === +c[12];
}

/** Format accepté à la saisie : ISBN-10 (clé X possible) ou ISBN-13. */
export const isValidIsbnFormat = (n) => /^(\d{9}[\dXx]|\d{13})$/.test(n);
