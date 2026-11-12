// Fonctions PWA : service worker, installation, mises à jour, état réseau, notifications.
let deferred = null;
let reg = null;
let onChange = () => {};
const status = { offlineReady: false, version: '', persisted: false };

export function toast(msg, { action, onAction, ms = 5000 } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  root.innerHTML = '';
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  const s = document.createElement('span');
  s.textContent = msg;
  t.appendChild(s);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action;
    b.onclick = () => {
      t.remove();
      onAction && onAction();
    };
    t.appendChild(b);
  }
  root.appendChild(t);
  if (ms) setTimeout(() => t.remove(), ms);
}

export const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const canInstall = () => !!deferred && !isStandalone();

export const pwaStatus = () => ({ ...status, standalone: isStandalone(), canInstall: canInstall(), ios: isIos(), online: navigator.onLine });

export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  onChange();
  return outcome === 'accepted';
}

export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) status.persisted = await navigator.storage.persist();
  } catch (e) {
    /* non pris en charge */
  }
  onChange();
  return status.persisted;
}

export async function checkForUpdate() {
  if (!reg) return toast('Mises à jour indisponibles : le service worker n’est pas actif sur cette page.');
  try {
    await reg.update();
    if (!reg.waiting && !reg.installing) toast('Biblio est à jour.');
  } catch (e) {
    toast('Vérification impossible : êtes-vous connecté à Internet ?');
  }
}

function netPill() {
  let p = document.getElementById('netpill');
  if (!navigator.onLine) {
    if (!p) {
      p = document.createElement('div');
      p.id = 'netpill';
      p.className = 'netpill';
      p.textContent = 'Hors connexion — vos données sont conservées';
      document.body.appendChild(p);
    }
  } else if (p) p.remove();
  onChange();
}

export function initPwa({ onChange: cb, warmUrls = [] } = {}) {
  onChange = cb || onChange;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    onChange();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    toast('Biblio est installée.');
    onChange();
  });
  window.addEventListener('online', netPill);
  window.addEventListener('offline', netPill);
  netPill();

  if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then((p) => ((status.persisted = p), onChange()));
  if (isStandalone()) requestPersistence();

  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'VERSION') {
      status.version = e.data.version;
      onChange();
    }
  });

  const offer = (w) => toast('Une nouvelle version de Biblio est disponible.', { action: 'Actualiser', onAction: () => w.postMessage('SKIP_WAITING'), ms: 0 });
  window.addEventListener('load', async () => {
    try {
      reg = await navigator.serviceWorker.register('./sw.js');
    } catch (e) {
      return;
    }
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state !== 'installed') return;
        if (navigator.serviceWorker.controller) offer(w);
        else toast('Biblio est prête à fonctionner hors ligne.');
      });
    });
    navigator.serviceWorker.ready.then((r) => {
      status.offlineReady = true;
      if (r.active) r.active.postMessage('GET_VERSION');
      onChange();
      // Précharge le lecteur de code-barres pour qu’il marche aussi hors ligne.
      setTimeout(() => navigator.onLine && warmUrls.forEach((u) => fetch(u, { mode: 'no-cors' }).catch(() => {})), 1500);
    });
  });
}
