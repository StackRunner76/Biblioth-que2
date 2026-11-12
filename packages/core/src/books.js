import { cleanIsbn, isValidIsbnFormat } from './isbn.js';

const TEXT_FIELDS = ['titre', 'auteur', 'isbn', 'editeur', 'date', 'genre', 'langue', 'lieu', 'etat', 'desc', 'quatrieme', 'cover'];

/**
 * Valide et normalise une fiche livre issue du formulaire.
 * @returns {{error:string}|{book:object}}
 */
export function validateBook(raw, books, editingId = 0) {
  const o = {};
  TEXT_FIELDS.forEach((k) => (o[k] = String(raw[k] ?? '').trim()));
  o.catId = +raw.catId;
  o.pages = +raw.pages || 0;
  o.qte = +raw.qte || 1;
  const n = cleanIsbn(o.isbn);
  if (!o.titre || !o.auteur || !n) return { error: 'Titre, auteur et ISBN sont obligatoires.' };
  if (!isValidIsbnFormat(n)) return { error: 'ISBN invalide (10 ou 13 caractères).' };
  if (books.some((b) => cleanIsbn(b.isbn) === n && b.id !== editingId))
    return { error: 'Doublon : cet ISBN existe déjà dans le catalogue.' };
  o.isbn = n;
  return { book: o };
}
