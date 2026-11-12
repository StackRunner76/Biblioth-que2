import { cleanIsbn } from './isbn.js';
import { catName, nextId, today } from './state.js';

export const CSV_HEADERS = ['titre', 'auteur', 'isbn', 'editeur', 'date', 'categorie', 'genre', 'langue', 'pages', 'lieu', 'qte', 'etat', 'desc', 'quatrieme'];

/** CSV séparé par « ; », encodé avec BOM pour Excel. */
export function toCsv(s) {
  const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const rows = [CSV_HEADERS.join(';'), ...s.books.map((b) => CSV_HEADERS.map((h) => q(h === 'categorie' ? catName(s, b.catId) : b[h])).join(';'))];
  return '\ufeff' + rows.join('\n');
}

/** Analyse un CSV « ; » : guillemets doublés et retours à la ligne dans les champs entre guillemets pris en charge. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let f = '';
  let inQ = false;
  text = String(text).replace(/^\ufeff/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          f += '"';
          i++;
        } else inQ = false;
      } else f += c;
    } else if (c === '"' && f === '') inQ = true;
    else if (c === ';') {
      row.push(f);
      f = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f);
      f = '';
      rows.push(row);
      row = [];
    } else f += c;
  }
  if (f !== '' || row.length) {
    row.push(f);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x !== ''));
}

/** Importe un CSV dans l’état (modifié sur place). Les doublons d’ISBN sont ignorés. */
export function importCsv(s, text) {
  const rows = parseCsv(text);
  let added = 0;
  let skipped = 0;
  if (!rows.length) return { added, skipped };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const cols = head.includes('titre') && head.includes('isbn') ? head : CSV_HEADERS;
  rows.slice(1).forEach((r) => {
    const o = {};
    cols.forEach((h, j) => (o[h] = r[j] || ''));
    const n = cleanIsbn(o.isbn);
    if (!o.titre || !n || s.books.some((b) => cleanIsbn(b.isbn) === n)) {
      skipped++;
      return;
    }
    let ct = s.cats.find((x) => x.name === o.categorie);
    if (!ct) {
      ct = { id: nextId(s.cats), name: o.categorie || 'Divers', parent: 0 };
      s.cats.push(ct);
    }
    s.books.push({
      id: nextId(s.books), titre: o.titre, auteur: o.auteur, isbn: n, editeur: o.editeur, date: o.date,
      catId: ct.id, genre: o.genre, langue: o.langue || 'fr', pages: +o.pages || 0, lieu: o.lieu,
      qte: +o.qte || 1, etat: o.etat || 'Bon', desc: o.desc, quatrieme: o.quatrieme, cover: '', ajout: today(),
    });
    added++;
  });
  return { added, skipped };
}
