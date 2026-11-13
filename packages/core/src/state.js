import { seed } from './seed.js';
import { normalizeLayout } from './dashboard.js';

export const STORAGE_KEY = 'biblio_v1';

const isState = (s) => s && typeof s === 'object' && Array.isArray(s.books) && Array.isArray(s.cats);

/** Charge l’état depuis un objet de type Storage (ou null) ; retombe sur les données de démo. */
export function loadState(storage) {
  let s = null;
  try {
    s = JSON.parse(storage && storage.getItem(STORAGE_KEY));
  } catch (e) {
    /* données absentes ou corrompues */
  }
  if (!isState(s)) s = seed();
  s.lib = s.lib || 'Ma bibliothèque';
  s.extra = s.extra || { auteur: [], editeur: [] };
  s.layout = normalizeLayout(s.layout);
  s.users = Array.isArray(s.users) ? s.users : [];
  s.books.forEach((b) => { delete b.qte; delete b.etat; }); // champs retirés : on nettoie les anciennes données
  return s;
}

/** Enregistre l’état ; renvoie false si le stockage est plein ou indisponible. */
export function saveState(storage, s) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(s));
    return true;
  } catch (e) {
    return false;
  }
}

export const nextId = (list) => Math.max(0, ...list.map((x) => x.id)) + 1;
export const today = () => new Date().toISOString().slice(0, 10);

export const catName = (s, id) => (s.cats.find((c) => c.id == id) || { name: '—' }).name;

/** Valeurs distinctes (livres + valeurs ajoutées à la main) d’un champ `auteur` ou `editeur`. */
export const uniqueValues = (s, k) =>
  [...new Set([...s.books.map((b) => b[k]), ...((s.extra || {})[k] || [])].filter(Boolean))].sort();

/** Décompte des livres par valeur d’un champ ; `cat` regroupe par nom de catégorie. */
export const countBy = (s, k) =>
  s.books.reduce((m, b) => {
    const v = k === 'cat' ? catName(s, b.catId) : b[k] || '—';
    m[v] = (m[v] || 0) + 1;
    return m;
  }, {});
