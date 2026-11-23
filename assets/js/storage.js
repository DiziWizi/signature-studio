/* Bowerbird — localStorage: draft autosave + named snapshots. */
'use strict';

const DRAFT_KEY = 'sigstudio.draft.v1';
const SAVED_KEY = 'sigstudio.saved.v1';
const MAX_SAVED = 30;

function storageAvailable() {
  try {
    localStorage.setItem('__sigstudio_probe__', '1');
    localStorage.removeItem('__sigstudio_probe__');
    return true;
  } catch (e) {
    return false;
  }
}

function storageSafeState(state) {
  return (typeof refsForStorage === 'function') ? refsForStorage(state) : state;
}

function saveDraft(state) {
  if (!storageAvailable()) return false;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(storageSafeState(state)));
    return true;
  } catch (e) {
    return false; /* quota exceeded — caller should warn */
  }
}

function loadDraft() {
  if (!storageAvailable()) return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
}

function listSnapshots() {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function persistSnapshots(list) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    return false;
  }
}

function saveSnapshot(state, name) {
  const list = listSnapshots();
  const snap = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: String(name || state.meta.name || 'Signature').trim() || 'Signature',
    savedAt: new Date().toISOString(),
    state: storageSafeState(state),
  };
  list.unshift(snap);
  if (list.length > MAX_SAVED) list.length = MAX_SAVED;
  const ok = persistSnapshots(list);
  return ok ? snap : null;
}

function loadSnapshot(id) {
  const snap = listSnapshots().find(x => x.id === id);
  return snap ? clone(snap.state) : null;
}

/* Refs become data URLs before the state is handed to the editor. */
async function loadSnapshotHydrated(id) {
  const stateCopy = loadSnapshot(id);
  if (stateCopy && typeof unpackImages === 'function') await unpackImages(stateCopy);
  return stateCopy;
}

function deleteSnapshot(id) {
  const list = listSnapshots().filter(x => x.id !== id);
  persistSnapshots(list);
}
