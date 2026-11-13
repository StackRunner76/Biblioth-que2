import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isEan13Isbn, cleanIsbn, isValidIsbnFormat, seed, loadState, saveState, STORAGE_KEY, nextId, uniqueValues, countBy,
  validateBook, toCsv, parseCsv, importCsv, buildBackup, parseBackup, lookupIsbn,
  DASH_WIDGETS, normalizeLayout, isDefaultLayout,
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
  const ok = { titre: ' T ', auteur: 'A', isbn: '978-2-07-036002-4', catId: '2', pages: '12' };
  assert.match(validateBook({ ...ok, isbn: '' }, s.books).error, /obligatoires/);
  assert.match(validateBook({ ...ok, isbn: '12' }, s.books).error, /invalide/);
  assert.match(validateBook({ ...ok, isbn: '9782070360024' }, s.books).error, /Doublon/);
  assert.equal(validateBook({ ...ok, isbn: '9782070360024' }, s.books, 7).book.isbn, '9782070360024');
  const r = validateBook({ ...ok, isbn: '9780000000002' }, s.books);
  assert.deepEqual([r.book.titre, r.book.catId, r.book.pages], ['T', 2, 12]);
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

test('tableau de bord : normalisation de la disposition', () => {
  assert.deepEqual(normalizeLayout(undefined), DASH_WIDGETS);
  assert.deepEqual(normalizeLayout('oups'), DASH_WIDGETS);
  const custom = ['recents', 'livres', 'inconnu', 'recents'];
  const n = normalizeLayout(custom);
  assert.equal(n.length, DASH_WIDGETS.length);
  assert.deepEqual(n.slice(0, 2), ['recents', 'livres']);
  assert.deepEqual([...n].sort(), [...DASH_WIDGETS].sort(), 'inconnus/doublons écartés, manquants ajoutés');
  assert.equal(isDefaultLayout(DASH_WIDGETS), true);
  assert.equal(isDefaultLayout(['recents']), false);
});

test('tableau de bord : la disposition survit au stockage et à la sauvegarde JSON', () => {
  const st = fakeStorage();
  const s = loadState(st);
  assert.deepEqual(s.layout, DASH_WIDGETS);
  s.layout = [...DASH_WIDGETS].reverse();
  saveState(st, s);
  assert.deepEqual(loadState(st).layout, [...DASH_WIDGETS].reverse());
  const b = JSON.parse(JSON.stringify(buildBackup(s)));
  assert.deepEqual(parseBackup(b).layout, [...DASH_WIDGETS].reverse());
  delete b.layout; // ancienne sauvegarde sans disposition
  assert.deepEqual(parseBackup(b).layout, DASH_WIDGETS);
});

test('état et quantité : retirés du modèle, anciennes données nettoyées', () => {
  assert.equal('qte' in seed().books[0] || 'etat' in seed().books[0], false);
  const old = seed();
  old.books.forEach((b) => { b.qte = 2; b.etat = 'Bon'; });
  const s = loadState(fakeStorage({ [STORAGE_KEY]: JSON.stringify(old) }));
  assert.equal(s.books.some((b) => 'qte' in b || 'etat' in b), false);
  assert.equal(toCsv(seed()).split('\n')[0].includes('qte'), false);
});

/* ───────── Rôles et comptes ───────── */
import { createHash } from 'node:crypto';
import {
  ROLES, PERMISSIONS, hasPermission, sha256, hashPassword, verifyPassword, validatePassword, validateNewUser, createUser, roleChangeError, deleteUserError,
} from '../src/index.js';

test('permissions : matrice des trois rôles', () => {
  const u = (role) => ({ role });
  Object.keys(PERMISSIONS).forEach((p) => assert.equal(hasPermission(u('administrateur'), p), true, 'admin ' + p));
  ['livres.ecrire', 'referentiels.ecrire', 'csv.importer', 'csv.exporter'].forEach((p) => {
    assert.equal(hasPermission(u('gestionnaire'), p), true, 'gestionnaire ' + p);
    assert.equal(hasPermission(u('lecteur'), p), false, 'lecteur ' + p);
  });
  ['reglages', 'sauvegarde', 'utilisateurs'].forEach((p) => {
    assert.equal(hasPermission(u('gestionnaire'), p), false, 'gestionnaire ' + p);
    assert.equal(hasPermission(u('lecteur'), p), false, 'lecteur ' + p);
  });
  assert.equal(hasPermission(null, 'livres.ecrire'), false);
  assert.equal(hasPermission(u('administrateur'), 'inconnue'), false);
  assert.deepEqual(ROLES, ['administrateur', 'gestionnaire', 'lecteur']);
});

test('SHA-256 JS pur = SHA-256 de Node (multi-blocs compris)', () => {
  for (const s of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'é'.repeat(100), 'x'.repeat(1000)]) {
    const b = new TextEncoder().encode(s);
    assert.equal(Buffer.from(sha256(b)).toString('hex'), createHash('sha256').update(b).digest('hex'), `longueur ${b.length}`);
  }
});

test('mots de passe : hachage salé, vérification, repli sans WebCrypto', async () => {
  const a = await hashPassword('Secret123');
  const b = await hashPassword('Secret123');
  assert.equal(a.algo, 'pbkdf2');
  assert.notEqual(a.hash, b.hash, 'sel aléatoire');
  assert.equal(await verifyPassword(a, 'Secret123'), true);
  assert.equal(await verifyPassword(a, 'secret123'), false);
  assert.equal(await verifyPassword(null, 'x'), false);
  const f = await hashPassword('Secret123', { algo: 'sha256x', iter: 50 });
  assert.equal(await verifyPassword(f, 'Secret123'), true);
  assert.equal(await verifyPassword(f, 'Autre1234'), false);
  assert.equal(JSON.stringify(a).includes('Secret123'), false);
});

test('comptes : validation, création, dernier administrateur', async () => {
  assert.match(validatePassword('court'), /au moins 8/);
  assert.match(validatePassword('longenough', 'different'), /correspondent/);
  assert.equal(validatePassword('longenough', 'longenough'), '');
  const r = await createUser([], { name: ' Alice ', role: 'administrateur', password: 'motdepasse1' });
  assert.equal(r.user.name, 'Alice');
  assert.equal(r.user.id, 1);
  assert.equal('password' in r.user, false);
  const users = [r.user];
  assert.match(validateNewUser(users, { name: 'alice', role: 'lecteur', password: 'motdepasse1' }), /existe déjà/);
  assert.match(validateNewUser(users, { name: 'Bob', role: 'root', password: 'motdepasse1' }), /Rôle/);
  assert.match(validateNewUser(users, { name: 'B', role: 'lecteur', password: 'motdepasse1' }), /entre 2 et 40/);
  const bob = (await createUser(users, { name: 'Bob', role: 'lecteur', password: 'motdepasse1' })).user;
  assert.equal(bob.id, 2);
  users.push(bob);
  assert.match(roleChangeError(users, 1, 'lecteur'), /au moins un administrateur/);
  assert.equal(roleChangeError(users, 2, 'gestionnaire'), '');
  assert.match(deleteUserError(users, 1, 2), /au moins un administrateur/);
  assert.match(deleteUserError(users, 2, 2), /propre compte/);
  assert.equal(deleteUserError(users, 2, 1), '');
  assert.equal(loadState(null).users.length, 0);
});
