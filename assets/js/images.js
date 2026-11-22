/* Signature Studio — image store (v0.88).
   localStorage is ~5 MB of text; photos do not belong in it. Images above
   IMG_THRESHOLD are written to IndexedDB and replaced by an `idb:<id>` ref in
   whatever is persisted. State in memory always holds data URLs, so every
   renderer, exporter and share path stays unchanged.

   Save stays synchronous: data URLs are packed ahead of time into
   `imageIdCache`; saveDraft/saveSnapshot swap cached values for refs. If
   IndexedDB is unavailable the cache stays empty and everything behaves
   exactly as before. */
'use strict';

const IMG_DB_NAME = 'sigstudio.images';
const IMG_STORE = 'images';
const IMG_THRESHOLD = 32 * 1024; /* characters of data URL */

const imageIdCache = new Map(); /* dataUrl -> id */
let imgDbPromise = null;
let imagesReady = Promise.resolve(true);
let persistState = 'unknown'; /* granted | denied | unsupported */
let imageHydrateMisses = 0;

function idbAvailable() {
  try { return !!window.indexedDB; } catch (e) { return false; }
}

function imgDb() {
  if (!idbAvailable()) return Promise.reject(new Error('no-indexeddb'));
  if (!imgDbPromise) {
    imgDbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(IMG_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IMG_STORE)) db.createObjectStore(IMG_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('idb-open'));
    });
  }
  return imgDbPromise;
}

function imgPut(id, blob) {
  return imgDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, 'readwrite');
    tx.objectStore(IMG_STORE).put(blob, id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error('idb-put'));
  }));
}

function imgGet(id) {
  return imgDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, 'readonly');
    const req = tx.objectStore(IMG_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error || new Error('idb-get'));
  }));
}

function imgDelete(id) {
  return imgDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, 'readwrite');
    tx.objectStore(IMG_STORE).delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error('idb-del'));
  })).catch(() => false);
}

function imgKeys() {
  return imgDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, 'readonly');
    const req = tx.objectStore(IMG_STORE).getAllKeys();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error || new Error('idb-keys'));
  })).catch(() => []);
}

/* Ask the browser to keep this origin's storage. Chrome/Firefox may grant it
   silently for installed or frequently used sites; a refusal is not fatal,
   it just means images can be evicted — which the Saved panel says plainly. */
async function requestPersistence() {
  if (!navigator.storage || typeof navigator.storage.persist !== 'function') {
    persistState = 'unsupported';
    return persistState;
  }
  try {
    if (typeof navigator.storage.persisted === 'function' && await navigator.storage.persisted()) {
      persistState = 'granted';
    } else {
      persistState = (await navigator.storage.persist()) ? 'granted' : 'denied';
    }
  } catch (e) {
    persistState = 'unsupported';
  }
  return persistState;
}

async function persistenceStatus() {
  if (persistState !== 'unknown') return persistState;
  if (!navigator.storage || typeof navigator.storage.persisted !== 'function') {
    persistState = 'unsupported';
    return persistState;
  }
  try {
    persistState = (await navigator.storage.persisted()) ? 'granted' : 'denied';
  } catch (e) {
    persistState = 'unsupported';
  }
  return persistState;
}

function imageMisses() {
  return imageHydrateMisses;
}

function dataUrlToBlob(dataUrl) {
  const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  const mime = m[1] || 'application/octet-stream';
  try {
    const binary = m[2] ? atob(m[3].replace(/\s+/g, '')) : decodeURIComponent(m[3]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch (e) {
    return null;
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('read'));
    reader.readAsDataURL(blob);
  });
}

/* Content-derived, stable id: re-saving the same image reuses one blob. */
function imageIdFor(dataUrl) {
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < dataUrl.length; i++) {
    const c = dataUrl.charCodeAt(i);
    h1 = ((h1 * 33) ^ c) >>> 0;
    h2 = ((h2 * 31) + c) >>> 0;
  }
  return `img-${dataUrl.length.toString(36)}-${h1.toString(36)}-${h2.toString(36)}`;
}

/* Every mutable slot that can hold an image data URL. */
function imageSlots(state) {
  const slots = [];
  const d = state && state.design;
  if (d) {
    for (const key of ['logoUrl', 'logoDarkUrl', 'portraitUrl', 'bannerUrl', 'footerLeftImg', 'footerCenterImg', 'footerRightImg']) {
      if (typeof d[key] === 'string') slots.push({ obj: d, key });
    }
  }
  for (const social of (state && Array.isArray(state.socials) ? state.socials : [])) {
    if (social && typeof social.iconUrl === 'string') slots.push({ obj: social, key: 'iconUrl' });
  }
  return slots;
}

function needsOffload(value) {
  return typeof value === 'string' && value.length >= IMG_THRESHOLD && /^data:image\//i.test(value);
}

async function ensureImagePacked(dataUrl) {
  if (!needsOffload(dataUrl)) return '';
  if (imageIdCache.has(dataUrl)) return imageIdCache.get(dataUrl);
  const blob = dataUrlToBlob(dataUrl);
  if (!blob) return '';
  const id = imageIdFor(dataUrl);
  try {
    await imgPut(id, blob);
  } catch (e) {
    return '';
  }
  imageIdCache.set(dataUrl, id);
  return id;
}

/* Pack every offloadable image in a state object (mutating it). */
async function packImages(state) {
  let changed = false;
  for (const { obj, key } of imageSlots(state)) {
    if (!needsOffload(obj[key])) continue;
    const id = await ensureImagePacked(obj[key]);
    if (id) {
      obj[key] = `idb:${id}`;
      changed = true;
    }
  }
  return changed;
}

/* Resolve refs back to data URLs; also teach the cache so the next save
   does not write the bytes back into localStorage. */
async function unpackImages(state) {
  let changed = false;
  for (const { obj, key } of imageSlots(state)) {
    const value = obj[key];
    if (!value.startsWith('idb:')) continue;
    const id = value.slice(4);
    try {
      const blob = await imgGet(id);
      if (blob) {
        const dataUrl = await blobToDataUrl(blob);
        obj[key] = dataUrl;
        imageIdCache.set(dataUrl, id);
      } else {
        obj[key] = '';
        imageHydrateMisses += 1;
      }
    } catch (e) {
      obj[key] = '';
      imageHydrateMisses += 1;
    }
    changed = true;
  }
  return changed;
}

/* A synchronous copy with cached data URLs swapped for refs — this is what
   saveDraft/saveSnapshot persist. Uncached images stay inline until packed. */
function refsForStorage(state) {
  const copy = JSON.parse(JSON.stringify(state));
  for (const { obj, key } of imageSlots(copy)) {
    const id = imageIdCache.get(obj[key]);
    if (id) obj[key] = `idb:${id}`;
  }
  return copy;
}

/* Collect every image id referenced by a draft and/or snapshots. */
function referencedImageIds(draft, snapshots) {
  const ids = new Set();
  const states = [];
  if (draft) states.push(draft);
  for (const snap of (snapshots || [])) if (snap && snap.state) states.push(snap.state);
  for (const state of states) {
    for (const { obj, key } of imageSlots(state)) {
      const value = String(obj[key] || '');
      if (value.startsWith('idb:')) ids.add(value.slice(4));
    }
  }
  return ids;
}

/* Delete blobs nothing points at. Safe to call opportunistically. */
async function gcImages(extraIds) {
  if (!idbAvailable()) return 0;
  const keep = referencedImageIds(loadDraft(), listSnapshots());
  /* Undo/redo entries reference blobs too; deleting those would make an
     undo restore a blank image. */
  if (extraIds) for (const id of extraIds) keep.add(id);
  let removed = 0;
  for (const id of await imgKeys()) {
    if (!keep.has(id)) {
      await imgDelete(id);
      removed += 1;
    }
  }
  return removed;
}

/* Called after the draft has loaded: resolve refs, then re-render. The
   promise is exposed for tests and the helper. */
function hydrateStateImages(state) {
  if (!idbAvailable()) return Promise.resolve(false);
  imageHydrateMisses = 0;
  return unpackImages(state).then(changed => {
    if (changed && typeof rebuildAll === 'function') rebuildAll();
    if (imageHydrateMisses && typeof showToast === 'function') {
      showToast(t('toast.imagesMissing', { n: imageHydrateMisses }), 'warn', {
        key: 'toast.imagesMissing',
        action: {
          label: t('topbar.restore'),
          fn: () => {
            const input = document.getElementById('restore-file');
            if (input) input.click();
          },
        },
      });
    }
    return changed;
  }).catch(() => false);
}

/* After saving, move any newly added data URLs into IndexedDB and save the
   now-smaller draft once more. */
function packCurrentImages() {
  if (!state || !idbAvailable()) return Promise.resolve(false);
  let pending = false;
  for (const { obj, key } of imageSlots(state)) {
    if (needsOffload(obj[key]) && !imageIdCache.has(obj[key])) pending = true;
  }
  if (!pending) return Promise.resolve(false);
  /* Pack a copy: the cache is what drafts need, and the live state must keep
     its data URLs or every preview image turns into a broken idb: URL. */
  const copy = JSON.parse(JSON.stringify(state));
  return packImages(copy).then(changed => {
    if (changed) {
      requestPersistence();
      if (typeof flushSave === 'function') flushSave();
    }
    return changed;
  }).catch(() => false);
}
