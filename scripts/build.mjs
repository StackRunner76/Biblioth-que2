// Assemble le site statique dans dist/ : apps/web (public + src) + packages/core, puis génère le service worker.
// Aucune dépendance : uniquement Node.js (>= 20).
import { cpSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, 'apps', 'web');
const core = join(root, 'packages', 'core');
const dist = join(root, 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(web, 'public'), dist, { recursive: true });
cpSync(join(web, 'src'), join(dist, 'src'), { recursive: true });
cpSync(join(core, 'src'), join(dist, 'core'), { recursive: true }); // résolu par l’import map : "@biblio/core" → ./core/index.js
writeFileSync(join(dist, '.nojekyll'), '');

const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const files = walk(dist)
  .map((p) => relative(dist, p).split(sep).join('/'))
  .filter((f) => f !== 'sw.js' && f !== '.nojekyll')
  .sort();

const hash = createHash('sha256');
for (const f of files) hash.update(f).update(readFileSync(join(dist, f)));
const version = hash.digest('hex').slice(0, 10);

const swPath = join(dist, 'sw.js');
const sw = readFileSync(swPath, 'utf8').replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(files.map((f) => './' + f), null, 2));
if (sw.includes('__VERSION__') || sw.includes('__PRECACHE__')) throw new Error('Placeholders du service worker non remplacés');
writeFileSync(swPath, sw);

console.log(`✔ dist/ prêt — version ${version}, ${files.length} fichiers pré-cachés`);
