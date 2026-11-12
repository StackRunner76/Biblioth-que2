// Lecture de code-barres ISBN (EAN-13) : caméra en direct ou photo.
import { isEan13Isbn } from '@biblio/core';

export const H5_URL = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';

let ctx = { say() {}, showForm() {}, onCode() {}, beepOn: () => true };
export const configureScanner = (c) => (ctx = { ...ctx, ...c });

let scanStop = null;
let scanTok = null;
let AC = null;

export const beepInit = () => {
  try {
    if (!AC) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (C) AC = new C();
    }
    if (AC && AC.state === 'suspended') AC.resume();
  } catch (e) {}
};

export const beep = () => {
  try {
    if (!ctx.beepOn()) return;
    beepInit();
    if (!AC) return;
    const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
    o.type = 'square';
    o.frequency.value = 1800;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g);
    g.connect(AC.destination);
    o.start(t);
    o.stop(t + 0.22);
  } catch (e) {}
};

const loadH5 = () =>
  new Promise((ok, ko) => {
    if (window.Html5Qrcode) return ok();
    const sc = document.createElement('script');
    sc.src = H5_URL;
    sc.onload = ok;
    sc.onerror = () => ko(new Error('load'));
    document.head.appendChild(sc);
  });

const h5new = (id) =>
  new Html5Qrcode(id, {
    formatsToSupport: [Html5QrcodeSupportedFormats.EAN_13],
    verbose: false,
    useBarCodeDetectorIfSupported: true,
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
  });

const killScanner = (q) => {
  try {
    const v = document.querySelector('#reader video');
    if (v && v.srcObject) v.srcObject.getTracks().forEach((t) => t.stop());
  } catch (e) {}
  Promise.resolve()
    .then(() => q.stop())
    .catch(() => {})
    .then(() => {
      try {
        q.clear();
      } catch (e) {}
    });
};

export function stopScan() {
  scanTok = null;
  if (scanStop) {
    try {
      scanStop();
    } catch (e) {}
    scanStop = null;
  }
  const b = document.getElementById('vbox');
  if (b) b.classList.add('hidden');
}

export async function scan() {
  beepInit();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    ctx.showForm();
    return ctx.say('Caméra indisponible sur cette page (HTTPS requis). Saisissez l’ISBN à la main.');
  }
  stopScan();
  const tok = (scanTok = Symbol());
  document.getElementById('vbox').classList.remove('hidden');
  ctx.say('Chargement du lecteur…');
  try {
    await loadH5();
    if (scanTok !== tok) return;
    const q = h5new('reader');
    let locked = false, lastBad = 0;
    scanStop = () => killScanner(q);
    const onOk = (t) => {
      if (locked) return;
      if (isEan13Isbn(t)) {
        locked = true;
        if (navigator.vibrate) try { navigator.vibrate(80); } catch (e) {}
        try { q.pause(true); } catch (e) {}
        ctx.onCode(t);
      } else if (Date.now() - lastBad > 1500) {
        lastBad = Date.now();
        ctx.say('Code lu (' + t + ') mais ce n’est pas un ISBN (978/979). Cadrez le code-barres du livre.');
      }
    };
    const box = (w, h) => ({ width: Math.max(120, Math.floor(Math.min(w * 0.9, 520))), height: Math.max(80, Math.floor(Math.min(h * 0.55, 220))) });
    const base = { fps: 15, qrbox: box, disableFlip: true };
    const vc = { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 }, advanced: [{ focusMode: 'continuous' }] };
    try {
      await q.start({ facingMode: 'environment' }, { ...base, videoConstraints: vc }, onOk, () => {});
    } catch (e1) {
      const m = String(e1 && (e1.name || e1.message || e1));
      if (/NotAllowed|Permission|NotFound|Devices/i.test(m)) throw e1;
      try { q.clear(); } catch (e) {}
      await q.start({ facingMode: 'environment' }, base, onOk, () => {});
    }
    if (scanTok !== tok) {
      killScanner(q);
      return;
    }
    ctx.say('Placez le code-barres ISBN (978 ou 979) à l’intérieur du cadre, à 15–25 cm, bien à plat et sans reflet. Sinon, utilisez « Lire depuis une photo ».');
  } catch (x) {
    ctx.showForm();
    const m = String((x && x.name) || '') + ' ' + String((x && x.message) || x);
    ctx.say(
      /NotAllowed|Permission/i.test(m) ? 'Accès à la caméra refusé ou bloqué : autorisez la caméra pour ce site dans les réglages du navigateur.'
      : /NotFound|Requested device|no camera/i.test(m) ? 'Aucune caméra détectée sur cet appareil.'
      : /NotReadable|TrackStart|in use/i.test(m) ? 'La caméra est utilisée par une autre application. Fermez-la puis réessayez.'
      : navigator.onLine ? 'Scan impossible ici (lecteur non chargé ou caméra indisponible). Saisissez l’ISBN à la main.'
      : 'Lecteur non disponible hors connexion tant qu’il n’a pas été chargé une première fois. Saisissez l’ISBN à la main.'
    );
  }
}

const shrink = (f, max) =>
  new Promise((ok, ko) => {
    const u = URL.createObjectURL(f), im = new Image();
    im.onload = () => {
      const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = Math.round(im.width * k);
      c.height = Math.round(im.height * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      c.toBlob((b) => (b ? ok(new File([b], 'p.jpg', { type: 'image/jpeg' })) : ko()), 'image/jpeg', 0.92);
    };
    im.onerror = ko;
    im.src = u;
  });

export async function scanPhoto(i) {
  const f = i.files[0];
  if (!f) return;
  beepInit();
  stopScan();
  ctx.say('Lecture de la photo…');
  const bad = 'Aucun code-barres ISBN valide lu : rapprochez-vous, cadrez bien le code et évitez les reflets.';
  try {
    let c = '';
    if ('BarcodeDetector' in window) {
      try {
        const r = await new BarcodeDetector({ formats: ['ean_13'] }).detect(await createImageBitmap(f));
        c = r[0] && r[0].rawValue;
      } catch (e) {}
    }
    if (!(c && isEan13Isbn(c))) {
      await loadH5();
      const q = h5new('reader-file');
      for (const m of [1600, 1000, 2400]) {
        try {
          const t = await q.scanFile(await shrink(f, m), false);
          if (t && isEan13Isbn(t)) {
            c = t;
            break;
          }
        } catch (e) {}
      }
      try { q.clear(); } catch (e) {}
    }
    if (c && isEan13Isbn(c)) ctx.onCode(c);
    else ctx.say(bad);
  } catch (x) {
    ctx.say(bad);
  }
  i.value = '';
}
