/**
 * CGPA Calculator — Service Worker
 *
 * Strategy: Cache-First with Background Update (Stale-While-Revalidate)
 *  • Offline  : every request is served instantly from the cache.
 *  • Online   : the cached response is returned immediately AND a background
 *               network fetch silently refreshes the cache entry so the next
 *               load gets the latest version.
 *  • Update   : bumping CACHE_VERSION triggers a full cache rebuild on the
 *               next visit while the user is online.
 */

"use strict";

/* ─── Version ────────────────────────────────────────────────────────────────
   Change this string whenever you deploy new files.
   The browser detects the SW script change, installs the new worker, and
   the activate handler below wipes the old cache automatically.
─────────────────────────────────────────────────────────────────────────── */
const CACHE_VERSION = "cgpa-v1";

/* ─── Assets to pre-cache on install ────────────────────────────────────── */
const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json",
  "./libs/html2canvas.min.js",
  "./libs/jspdf.umd.min.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

/* ─── Install ─────────────────────────────────────────────────────────────
   Open the versioned cache and pre-cache every listed asset.
   skipWaiting() makes the new SW take control immediately instead of
   waiting for all existing tabs to close.
─────────────────────────────────────────────────────────────────────────── */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => {
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => {
        console.log("[SW] Pre-cache complete:", CACHE_VERSION);
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error("[SW] Pre-cache failed:", err);
      })
  );
});

/* ─── Activate ────────────────────────────────────────────────────────────
   Delete every cache whose name is NOT the current CACHE_VERSION so stale
   caches from previous deployments are cleaned up automatically.
   clients.claim() lets this SW control already-open pages without a reload.
─────────────────────────────────────────────────────────────────────────── */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        const deletions = cacheNames
          .filter((name) => name !== CACHE_VERSION)
          .map((name) => {
            console.log("[SW] Removing old cache:", name);
            return caches.delete(name);
          });
        return Promise.all(deletions);
      })
      .then(() => {
        console.log("[SW] Activation complete. Claiming clients.");
        return self.clients.claim();
      })
  );
});

/* ─── Fetch ───────────────────────────────────────────────────────────────
   Stale-While-Revalidate for every GET request:
     1. Return the cached response immediately (fast / works offline).
     2. In the background, fetch from the network:
          • On success  → update the cache entry silently.
          • On failure  → ignore (we already served the cached copy).
     3. If there is no cached entry yet (first visit or new asset), wait
        for the network response, cache it, and return it.
─────────────────────────────────────────────────────────────────────────── */
self.addEventListener("fetch", (event) => {
  // Only handle GET requests; let POST / PUT / DELETE pass through.
  if (event.request.method !== "GET") return;

  // Ignore browser-extension and non-http requests.
  const url = new URL(event.request.url);
  if (!url.protocol.startsWith("http")) return;

  event.respondWith(staleWhileRevalidate(event.request));
});

/**
 * Core caching logic.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cachedResponse = await cache.match(request);

  // Fire-and-forget background revalidation whenever we have a cached copy.
  const networkFetchPromise = fetchAndCache(cache, request);

  if (cachedResponse) {
    // Serve stale copy now; cache update happens silently in background.
    networkFetchPromise.catch(() => {
      // Network unavailable — totally fine, cached response already returned.
    });
    return cachedResponse;
  }

  // No cache entry yet → wait for the network (first load / new asset).
  try {
    return await networkFetchPromise;
  } catch (err) {
    console.warn("[SW] Network fetch failed and no cache entry:", request.url);
    // Return a minimal offline fallback for navigation requests.
    if (request.mode === "navigate") {
      const fallback = await cache.match("./index.html");
      if (fallback) return fallback;
    }
    // For other resource types, propagate the error.
    throw err;
  }
}

/**
 * Fetch from the network and, if successful, store the response in the cache.
 * Always clones the response so the caller can still consume the body.
 *
 * @param {Cache}   cache
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function fetchAndCache(cache, request) {
  const networkResponse = await fetch(request);

  // Only cache valid, non-opaque responses to avoid storing error pages.
  if (
    networkResponse &&
    networkResponse.status === 200 &&
    networkResponse.type !== "opaque"
  ) {
    // put() consumes the body, so clone first.
    cache.put(request, networkResponse.clone()).catch((err) => {
      console.warn("[SW] Cache put failed:", request.url, err);
    });
  }

  return networkResponse;
}

/* ─── Message handler ─────────────────────────────────────────────────────
   Allows pages to trigger a controlled SW update via:
     navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' })
─────────────────────────────────────────────────────────────────────────── */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    console.log("[SW] SKIP_WAITING received — activating new SW immediately.");
    self.skipWaiting();
  }
});
