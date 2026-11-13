/** Rôles, permissions et comptes utilisateurs (sans interface). */

export const ROLES = ['administrateur', 'gestionnaire', 'lecteur'];
export const ROLE_LABEL = { administrateur: 'Administrateur', gestionnaire: 'Gestionnaire', lecteur: 'Lecteur' };

/** Permissions : identifiant → { label, roles autorisés }. Tout le reste (consulter, thème, son compte…) est ouvert à tous. */
export const PERMISSIONS = {
  'livres.ecrire': { label: 'Ajouter, modifier et supprimer des livres (scan, recherche ISBN)', roles: ['administrateur', 'gestionnaire'] },
  'referentiels.ecrire': { label: 'Gérer les catégories, auteurs et éditeurs', roles: ['administrateur', 'gestionnaire'] },
  'csv.importer': { label: 'Importer un CSV', roles: ['administrateur', 'gestionnaire'] },
  'csv.exporter': { label: 'Exporter le catalogue en CSV', roles: ['administrateur', 'gestionnaire'] },
  'reglages': { label: 'Modifier les réglages (nom de la bibliothèque, clé API)', roles: ['administrateur'] },
  'sauvegarde': { label: 'Sauvegarde JSON complète, restauration et réinitialisation', roles: ['administrateur'] },
  'utilisateurs': { label: 'Gérer les utilisateurs et leurs rôles', roles: ['administrateur'] },
};

export const hasPermission = (user, perm) => !!user && !!PERMISSIONS[perm] && PERMISSIONS[perm].roles.includes(user.role);

/* ───────── Mots de passe ───────── */

export const MIN_PASSWORD = 8;
const enc = new TextEncoder();
const toHex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (h) => Uint8Array.from((h.match(/../g) || []).map((x) => parseInt(x, 16)));
const concat = (...a) => {
  const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0));
  let i = 0;
  a.forEach((x) => { o.set(x, i); i += x.length; });
  return o;
};

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const rotr = (x, n) => (x >>> n) | (x << (32 - n));

/** SHA-256 en JavaScript pur : repli quand WebCrypto est absent (page servie en HTTP hors localhost). */
export function sha256(data) {
  const l = data.length, n = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(n);
  m.set(data);
  m[l] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(n - 8, Math.floor(l / 0x20000000));
  dv.setUint32(n - 4, (l << 3) >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  for (let i = 0; i < n; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + w[t]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, h].forEach((v, j) => { H[j] = (H[j] + v) >>> 0; });
  }
  const out = new Uint8Array(32), ov = new DataView(out.buffer);
  H.forEach((v, j) => ov.setUint32(j * 4, v));
  return out;
}

const hasSubtle = () => !!(globalThis.crypto && globalThis.crypto.subtle);

async function derive(pwd, salt, algo, iter) {
  if (algo === 'pbkdf2') {
    if (!hasSubtle()) throw new Error('WebCrypto indisponible');
    const key = await globalThis.crypto.subtle.importKey('raw', enc.encode(pwd), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await globalThis.crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
  }
  const p = enc.encode(pwd);
  let h = sha256(concat(salt, p));
  for (let i = 1; i < iter; i++) h = sha256(concat(h, salt, p));
  return h;
}

/** Hache un mot de passe (PBKDF2-SHA256 salé ; repli SHA-256 itéré sans WebCrypto). */
export async function hashPassword(pwd, opts = {}) {
  const salt = opts.salt ? fromHex(opts.salt) : globalThis.crypto.getRandomValues(new Uint8Array(16));
  const algo = opts.algo || (hasSubtle() ? 'pbkdf2' : 'sha256x');
  const iter = opts.iter || (algo === 'pbkdf2' ? 150000 : 20000);
  return { algo, iter, salt: toHex(salt), hash: toHex(await derive(String(pwd), salt, algo, iter)) };
}

export async function verifyPassword(user, pwd) {
  if (!user || !user.hash || !user.salt) return false;
  try {
    const h = await derive(String(pwd), fromHex(user.salt), user.algo, user.iter);
    const a = toHex(h), b = String(user.hash);
    let diff = a.length ^ b.length;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0);
    return diff === 0;
  } catch (e) {
    return false;
  }
}

/* ───────── Comptes ───────── */

/** Renvoie un message d’erreur, ou '' si le mot de passe (et sa confirmation, si fournie) est valide. */
export function validatePassword(p, confirm) {
  if (String(p ?? '').length < MIN_PASSWORD) return `Le mot de passe doit contenir au moins ${MIN_PASSWORD} caractères.`;
  if (confirm !== undefined && p !== confirm) return 'Les deux mots de passe ne correspondent pas.';
  return '';
}

/** Valide un nouvel utilisateur { name, role, password, confirm? } ; renvoie un message d’erreur ou ''. */
export function validateNewUser(users, raw) {
  const name = String(raw.name ?? '').trim();
  if (name.length < 2 || name.length > 40) return 'Le nom doit contenir entre 2 et 40 caractères.';
  if (users.some((u) => u.name.toLowerCase() === name.toLowerCase())) return 'Ce nom d’utilisateur existe déjà.';
  if (!ROLES.includes(raw.role)) return 'Rôle invalide.';
  return validatePassword(raw.password, raw.confirm);
}

/** Crée l’enregistrement d’un utilisateur (sans l’ajouter à la liste). */
export async function createUser(users, raw) {
  const error = validateNewUser(users, raw);
  if (error) return { error };
  const id = Math.max(0, ...users.map((u) => u.id)) + 1;
  return { user: { id, name: String(raw.name).trim(), role: raw.role, created: new Date().toISOString().slice(0, 10), ...(await hashPassword(raw.password)) } };
}

const admins = (users) => users.filter((u) => u.role === 'administrateur').length;

/** Message d’erreur si le changement de rôle laisserait l’application sans administrateur, sinon ''. */
export function roleChangeError(users, id, role) {
  const u = users.find((x) => x.id === id);
  if (!u) return 'Utilisateur introuvable.';
  if (!ROLES.includes(role)) return 'Rôle invalide.';
  if (u.role === 'administrateur' && role !== 'administrateur' && admins(users) < 2) return 'Il doit rester au moins un administrateur.';
  return '';
}

/** Message d’erreur si la suppression est interdite (soi-même, dernier administrateur), sinon ''. */
export function deleteUserError(users, id, meId) {
  const u = users.find((x) => x.id === id);
  if (!u) return 'Utilisateur introuvable.';
  if (u.id === meId) return 'Vous ne pouvez pas supprimer votre propre compte.';
  if (u.role === 'administrateur' && admins(users) < 2) return 'Il doit rester au moins un administrateur.';
  return '';
}
