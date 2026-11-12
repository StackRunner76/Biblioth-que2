# 📚 Biblio — gestion de catalogue (PWA)

Application web progressive pour gérer une bibliothèque : catalogue, scan du code-barres ISBN (caméra ou photo),
remplissage automatique via Google Books / Open Library, catégories, auteurs, éditeurs, statistiques, thème clair/sombre,
import/export CSV et JSON.

- **Sans authentification** : l’application s’ouvre directement, sans compte ni mot de passe.
- **Hors ligne** : installable (ordinateur, Android, iPhone/iPad) et utilisable sans connexion.
- **Données locales** : tout est enregistré dans le navigateur de l’appareil (`localStorage`). Aucun serveur, aucune base de données.
- **Aucune dépendance** : seulement Node.js ≥ 20 pour construire le site.

## Structure du monorepo

```
.
├── apps/
│   └── web/                 Application PWA (interface, service worker, manifeste, icônes)
│       ├── public/          index.html, manifest.webmanifest, sw.js (modèle), icons/
│       └── src/             main.js (interface), scanner.js (code-barres), pwa.js (installation/mises à jour), styles.css
├── packages/
│   └── core/                Logique métier sans interface, testée (ISBN, stockage, CSV, sauvegarde JSON, recherche ISBN)
├── scripts/
│   ├── build.mjs            Assemble apps/web + packages/core dans dist/ et génère le service worker
│   └── serve.mjs            Serveur local pour prévisualiser dist/
└── .github/workflows/       Tests + déploiement automatique sur GitHub Pages
```

## Commandes

```bash
npm test          # tests du package core (node:test)
npm run build     # construit dist/
npm run dev       # construit puis sert http://127.0.0.1:8080
npm run check     # tests + build
```

`localhost` est un contexte sécurisé : service worker, installation et caméra fonctionnent sans HTTPS sur votre machine.
Pour tester sur un téléphone, déployez sur GitHub Pages (HTTPS) : la caméra et l’installation l’exigent.

## Lancer avec Docker Desktop

Docker Desktop doit être démarré. Dans le dossier du projet :

```bash
docker compose up -d --build
```

Ouvrez ensuite **http://localhost:8080** : l'application est installable et fonctionne hors ligne (`localhost` est un contexte sécurisé).
Le conteneur `biblio` apparaît dans Docker Desktop, onglet *Containers*. Pour l'arrêter : `docker compose down`.

Sans compose : `docker build -t biblio-pwa .` puis `docker run -d -p 8080:80 --name biblio biblio-pwa`.

Pour utiliser la caméra depuis un téléphone, il faut du HTTPS (par exemple via GitHub Pages ci-dessous) : l'adresse IP de votre PC en HTTP ne suffit pas.

## Déployer sur GitHub Pages

1. Créez un dépôt GitHub vide, puis poussez ce code sur la branche `main` :

   ```bash
   git remote add origin https://github.com/<votre-compte>/<votre-depot>.git
   git push -u origin main
   ```

2. Dans le dépôt : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
3. Le workflow `Tests et déploiement GitHub Pages` se lance à chaque push sur `main`.
   L’application est publiée sur `https://<votre-compte>.github.io/<votre-depot>/`.

Tous les chemins sont relatifs : l’application fonctionne aussi bien à la racine d’un domaine que dans un sous-dossier.

## Utiliser l’application

- **Installer** : bouton « Installer l’application » (menu latéral ou Paramètres) ; sur iPhone/iPad : Partager → « Sur l’écran d’accueil ».
- **Hors ligne** : après le premier chargement, tout fonctionne sans réseau, sauf la recherche par ISBN.
  Le lecteur de code-barres (bibliothèque `html5-qrcode`, chargée depuis jsDelivr) est mis en cache après la première ouverture en ligne ;
  la lecture depuis une photo utilise l’API native `BarcodeDetector` quand elle existe.
- **Mises à jour** : quand une nouvelle version est déployée, un message propose « Actualiser ».
- **Sauvegarde** : les données restent sur l’appareil. Exportez régulièrement le **JSON complet** (Paramètres), surtout avant
  de vider les données du navigateur. « Protéger mes données » demande au navigateur de ne pas effacer le stockage automatiquement.
- **Clé API Google Books** (facultative, gratuite) : à saisir dans Paramètres si le quota anonyme est atteint. Elle est enregistrée
  localement et incluse dans l’export JSON : ne partagez pas ce fichier.
- Raccourci d’icône « Scanner un livre » (appui long sur l’icône sur Android) : ouvre directement le formulaire d’ajout avec la caméra.

## Notes techniques

- `@biblio/core` est résolu dans le navigateur par une *import map* (`index.html`) qui pointe vers `dist/core/`.
- `scripts/build.mjs` calcule une empreinte de tous les fichiers : le service worker change de version (et propose la mise à jour)
  uniquement quand le contenu change.
- Stratégies de cache : application pré-cachée (cache d’abord), lecteur de code-barres en *stale-while-revalidate*,
  couvertures en cache d’abord (200 maximum), API Google Books / Open Library toujours sur le réseau.
