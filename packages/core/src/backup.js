import { normalizeLayout } from './dashboard.js';

/** Construit la sauvegarde JSON complète (livres, catégories, réglages). */
export function buildBackup(s, now = new Date()) {
  return {
    app: 'biblio',
    version: 2,
    exporte: now.toISOString(),
    lib: s.lib,
    gbkey: s.gbkey || '',
    settings: { lib: s.lib, gbkey: s.gbkey || '', beep: s.beep !== false },
    cats: s.cats,
    extra: s.extra || { auteur: [], editeur: [] },
    layout: normalizeLayout(s.layout),
    books: s.books,
  };
}

/**
 * Valide une sauvegarde et renvoie le nouvel état. Lève une Error si le fichier n’est pas une sauvegarde Biblio.
 * @param {object} d      contenu JSON déjà analysé
 * @param {object} [fb]   valeurs de repli { lib, gbkey }
 */
export function parseBackup(d, fb = {}) {
  if (!d || d.app !== 'biblio' || !Array.isArray(d.books) || !Array.isArray(d.cats)) throw new Error('Sauvegarde invalide');
  const s = (x) => String(x ?? '');
  const seen = new Set();
  const cats = d.cats.map((c) => ({ id: +c.id, name: s(c.name), parent: +c.parent || 0 })).filter((c) => c.id && c.name);
  const books = d.books
    .map((b) => ({
      id: +b.id, titre: s(b.titre), auteur: s(b.auteur), isbn: s(b.isbn).replace(/[-\s]/g, ''), editeur: s(b.editeur),
      date: s(b.date), catId: +b.catId, genre: s(b.genre), pages: +b.pages || 0, langue: s(b.langue) || 'fr',
      desc: s(b.desc), quatrieme: s(b.quatrieme), cover: s(b.cover), lieu: s(b.lieu),
      ajout: s(b.ajout) || new Date().toISOString().slice(0, 10),
    }))
    .filter((b) => b.id && b.titre && b.isbn && !seen.has(b.isbn) && seen.add(b.isbn));
  const st = d.settings && typeof d.settings === 'object' ? d.settings : {};
  const gk = typeof st.gbkey === 'string' ? st.gbkey : typeof d.gbkey === 'string' ? d.gbkey : null;
  const list = (k) => (Array.isArray(d.extra && d.extra[k]) ? d.extra[k].map(s) : []);
  return {
    lib: s(st.lib || d.lib) || fb.lib || 'Ma bibliothèque',
    cats,
    books,
    extra: { auteur: list('auteur'), editeur: list('editeur') },
    gbkey: gk !== null ? gk.trim() : fb.gbkey || '',
    beep: st.beep !== false,
    layout: normalizeLayout(d.layout),
  };
}
