import { cleanIsbn } from './isbn.js';

const strip = (t) => String(t || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const norm = (t) => strip(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const fixDate = (d) => {
  d = d || '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  if (/^\d{4}-\d{2}$/.test(d)) return d + '-01';
  const m = d.match(/\d{4}/);
  return m ? m[0] + '-01-01' : '';
};

/**
 * Cherche une fiche livre par ISBN (Google Books, puis Open Library en secours).
 * @returns {Promise<{found:boolean, fields:object, quota:boolean, why:string}>}
 *   `fields` ne contient que les valeurs trouvées ; `why` vaut 'net', 'quota…' ou 'erreur Google Books NNN' en cas d’échec.
 */
export async function lookupIsbn(rawIsbn, { apiKey = '', fetchImpl = globalThis.fetch } = {}) {
  const n = cleanIsbn(rawIsbn);
  const fields = {};
  const put = (k, x) => {
    if (x) fields[k] = x;
  };
  let found = false;
  let quota = false;
  let why = '';
  let items = [];

  const gb = async (q) => {
    const r = await fetchImpl('https://www.googleapis.com/books/v1/volumes?' + q + '&maxResults=5' + (apiKey ? '&key=' + encodeURIComponent(apiKey) : ''));
    if (!r.ok) throw r.status;
    return (await r.json()).items || [];
  };

  try {
    items = await gb('q=isbn:' + n);
  } catch (x) {
    quota = x === 429;
    why = quota ? 'quota Google Books atteint' : typeof x === 'number' ? 'erreur Google Books ' + x : 'net';
  }
  const v = items[0] && items[0].volumeInfo;
  if (v) {
    put('titre', v.title);
    put('auteur', (v.authors || []).join(', '));
    put('editeur', v.publisher);
    put('date', fixDate(v.publishedDate));
    put('pages', v.pageCount);
    put('langue', v.language);
    put('genre', (v.categories || [])[0]);
    const t = v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail);
    put('cover', t ? t.replace('http://', 'https://') : 'https://covers.openlibrary.org/b/isbn/' + n + '-L.jpg?default=false');
    found = true;
  }

  // Quatrième de couverture : on cherche une description en français.
  const fr = (l) => l.map((i) => i.volumeInfo).find((w) => w && w.language === 'fr' && strip(w.description).length > 40);
  let w = fr(items);
  if (!w && !quota) {
    try {
      w = fr(await gb('q=isbn:' + n + '&langRestrict=fr'));
    } catch (x) {
      if (x === 429) quota = true;
    }
  }
  if (!w && !quota && v && v.title) {
    try {
      const l = await gb('q=intitle:' + encodeURIComponent(v.title) + (v.authors && v.authors[0] ? '+inauthor:' + encodeURIComponent(v.authors[0]) : '') + '&langRestrict=fr');
      w = l.map((i) => i.volumeInfo).find((x) => x && x.language === 'fr' && norm(x.title) === norm(v.title) && strip(x.description).length > 40);
    } catch (x) {
      if (x === 429) quota = true;
    }
  }
  if (w) put('quatrieme', strip(w.description));

  if (!found) {
    try {
      const r = await fetchImpl('https://openlibrary.org/api/books?bibkeys=ISBN:' + n + '&format=json&jscmd=data');
      const d = await r.json();
      const o = d['ISBN:' + n];
      if (o) {
        put('titre', o.title);
        put('auteur', (o.authors || []).map((a) => a.name).join(', '));
        put('editeur', o.publishers && o.publishers[0] && o.publishers[0].name);
        put('date', fixDate(o.publish_date));
        put('pages', o.number_of_pages);
        put('genre', o.subjects && o.subjects[0] && o.subjects[0].name);
        put('cover', (o.cover && (o.cover.large || o.cover.medium)) || 'https://covers.openlibrary.org/b/isbn/' + n + '-L.jpg?default=false');
        found = true;
      }
    } catch (x) {
      if (!why) why = 'net';
    }
  }
  return { found: found || !!w, fields, quota, why };
}
