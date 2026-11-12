import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isEan13Isbn, cleanIsbn, isValidIsbnFormat, seed, loadState, saveState, STORAGE_KEY, nextId, uniqueValues, countBy,
  validateBook, toCsv, parseCsv, importCsv, buildBackup, parseBackup, lookupIsbn,
} from '../src/index.js';

const fakeStorage = (init = {}) => {
  const m = { ...init };
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; }, m };
};

test('ISBN : clé de contrôle EAN-13', () => {
  assert.equal(isEan13Isbn('9782266320481'), true);
  assert.equal(isEan13Isbn('9782266320482'), false);
  assert.equal(isEan13Isbn('1234567890123'), false);
  assert.equal(cleanIsbn('978-2-266-32048-1 '), '9782266320481');
  assert.equal(isValidIsbnFormat('2070612759'), true);
  assert.equal(isValidIsbnFormat('abc'), false);
});

test('les ISBN de démonstration sont valides', () => {
  seed().books.forEach((b) => assert.equal(isEan13Isbn(b.isbn), true, b.titre));
});

test('état : chargement, repli sur la démo, sauvegarde', () => {
  assert.equal(loadState(null).books.length, 8);
  assert.equal(loadState(fakeStorage({ [STORAGE_KEY]: '{oups' })).books.length, 8);
  const st = fakeStorage();
  const s = loadState(st);
  s.books.pop();
  assert.equal(saveState(st, s), true);
  assert.equal(loadState(st).books.length, 7);
  assert.equal(saveState({ setItem() { throw new Error('plein'); } }, s), false);
});

test('états : identifiants, valeurs uniques, décomptes', () => {
  const s = seed();
  assert.equal(nextId(s.books), 9);
  s.extra = { auteur: ['Zola'], editeur: [] };
  assert.ok(uniqueValues(s, 'auteur').includes('Zola'));
  assert.equal(countBy(s, 'cat')['Littérature classique'], 2);
});

test('validateBook : champs obligatoires, format, doublons', () => {
  const s = seed();
  const ok = { titre: ' T ', auteur: 'A', isbn: '978-2-07-036002-4', catId: '2', pages: '12', qte: '' };
  assert.match(validateBook({ ...ok, isbn: '' }, s.books).error, /obligatoires/);
  assert.match(validateBook({ ...ok, isbn: '12' }, s.books).error, /invalide/);
  assert.match(validateBook({ ...ok, isbn: '9782070360024' }, s.books).error, /Doublon/);
  assert.equal(validateBook({ ...ok, isbn: '9782070360024' }, s.books, 7).book.isbn, '9782070360024');
  const r = validateBook({ ...ok, isbn: '9780000000002' }, s.books);
  assert.deepEqual([r.book.titre, r.book.catId, r.book.pages, r.book.qte], ['T', 2, 12, 1]);
});

test('CSV : aller-retour avec guillemets, « ; » et retours à la ligne', () => {
  const s = seed();
  s.books[0].quatrieme = 'Ligne 1\nLigne "2"; fin';
  s.books[0].titre = 'Dune; le début';
  const csv = toCsv(s);
  assert.ok(csv.startsWith('\ufefftitre;auteur;isbn'));
  const t = seed();
  t.books = [];
  const r = importCsv(t, csv);
  assert.deepEqual(r, { added: 8, skipped: 0 });
  assert.equal(t.books[0].quatrieme, 'Ligne 1\nLigne "2"; fin');
  assert.equal(t.books[0].titre, 'Dune; le début');
  assert.deepEqual(importCsv(t, csv), { added: 0, skipped: 8 });
});

test('CSV : catégorie inconnue créée, lignes vides ignorées', () => {
  const s = seed();
  const before = s.cats.length;
  const r = importCsv(s, 'titre;auteur;isbn;categorie\n"Nouveau";"X";"9780000000019";"Cuisine"\n"Sans ISBN";"X";"";"Cuisine"\n\n;;;\n');
  assert.deepEqual(r, { added: 1, skipped: 1 });
  assert.equal(s.cats.length, before + 1);
  assert.equal(parseCsv('a;b\r\nc;d').length, 2);
});

test('sauvegarde JSON : aller-retour et rejet des fichiers invalides', () => {
  const s = seed();
  s.gbkey = 'AIza-test';
  s.beep = false;
  const b = JSON.parse(JSON.stringify(buildBackup(s)));
  const r = parseBackup(b);
  assert.equal(r.books.length, 8);
  assert.equal(r.gbkey, 'AIza-test');
  assert.equal(r.beep, false);
  assert.throws(() => parseBackup({ app: 'autre' }));
  assert.throws(() => parseBackup(null));
  b.books.push({ ...b.books[0], id: 99 });
  assert.equal(parseBackup(b).books.length, 8, 'doublon d’ISBN écarté');
});

const resp = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('recherche ISBN : Google Books avec description française', async () => {
  const calls = [];
  const fetchImpl = async (u) => {
    calls.push(u);
    return resp({ items: [{ volumeInfo: { title: 'Dune', authors: ['Frank Herbert'], publisher: 'Pocket', publishedDate: '1965', pageCount: 412, language: 'fr', categories: ['Fiction'], description: '<p>' + 'Sur Arrakis, planète désertique, Paul affronte son destin. '.repeat(2) + '</p>', imageLinks: { thumbnail: 'http://x/y.jpg' } } }] });
  };
  const r = await lookupIsbn('978-2-266-32048-1', { fetchImpl, apiKey: 'K' });
  assert.equal(r.found, true);
  assert.equal(r.fields.titre, 'Dune');
  assert.equal(r.fields.date, '1965-01-01');
  assert.equal(r.fields.cover, 'https://x/y.jpg');
  assert.ok(r.fields.quatrieme && !r.fields.quatrieme.includes('<'));
  assert.ok(calls[0].includes('isbn:9782266320481') && calls[0].includes('key=K'));
});

test('recherche ISBN : quota Google puis Open Library en secours', async () => {
  const fetchImpl = async (u) =>
    u.includes('googleapis') ? resp({}, 429) : resp({ 'ISBN:9780132350884': { title: 'Clean Code', authors: [{ name: 'Robert C. Martin' }], number_of_pages: 464 } });
  const r = await lookupIsbn('9780132350884', { fetchImpl });
  assert.equal(r.quota, true);
  assert.equal(r.found, true);
  assert.equal(r.fields.titre, 'Clean Code');
  assert.equal(r.fields.pages, 464);
});

test('recherche ISBN : réseau coupé', async () => {
  const r = await lookupIsbn('9780132350884', { fetchImpl: async () => { throw new TypeError('offline'); } });
  assert.deepEqual([r.found, r.why], [false, 'net']);
});
