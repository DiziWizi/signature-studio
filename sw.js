/* Signature Studio — cache-first service worker. No build step: bump VERSION
   to invalidate the cache and ship a new precache set. */
'use strict';

const VERSION = 'sigstudio-v0.64.0';

const PRECACHE = [
  './',
  'index.html',
  'assets/styles.css',
  'assets/favicon.svg',
  'assets/js/state.js',
  'assets/js/socials.js',
  'assets/js/templates.js',
  'assets/js/import.js',
  'assets/js/export.js',
  'assets/js/storage.js',
  'assets/js/i18n.js',
  'assets/js/lzw.js',
  'assets/js/audit.js',
  'assets/js/zip.js',
  'assets/js/bulk.js',
  'assets/js/vcard-import.js',
  'assets/locales/en.js',
  'assets/locales/de.js',
  'assets/locales/es.js',
  'assets/locales/fr.js',
  'assets/js/app.js',
  'assets/js/vcard.js',
  'assets/js/qrcode.js',
  'manifest.webmanifest',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== VERSION).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(resp => {
        if (resp.ok) {
          const copy = resp.clone();
          caches.open(VERSION).then(cache => cache.put(req, copy));
        }
        return resp;
      });
    })
  );
});
