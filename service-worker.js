/**
 * service-worker.js - Service Worker for Offline Support
 * Caching strategy για offline-first functionality
 */

const CACHE_NAME = 'revenue-manager-v1.2';
const RUNTIME_CACHE = 'revenue-manager-runtime';

// Assets to cache on install
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/utils.js',
    '/storage.js',
    '/backup.js',
    '/cloudAdapters.js',
    '/comparison.js',
    '/forecasting.js',
    '/charts.js',
    '/eopyyClawback.js',
    '/pdfExport.js',
    '/csvValidator.js',
    '/cdnChecker.js'
];

// CDN libraries to cache
const CDN_ASSETS = [
    'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

// ========================================
// Install Event
// ========================================
self.addEventListener('install', (event) => {
    console.log('[ServiceWorker] Installing...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[ServiceWorker] Caching static assets');
                
                // Cache static assets
                return cache.addAll(STATIC_ASSETS)
                    .then(() => {
                        // Try to cache CDN assets (non-blocking)
                        return cache.addAll(CDN_ASSETS).catch((err) => {
                            console.warn('[ServiceWorker] Some CDN assets failed to cache:', err);
                            // Don't fail the install if CDN caching fails
                        });
                    });
            })
            .then(() => {
                console.log('[ServiceWorker] Install complete');
                return self.skipWaiting(); // Activate immediately
            })
    );
});

// ========================================
// Activate Event
// ========================================
self.addEventListener('activate', (event) => {
    console.log('[ServiceWorker] Activating...');

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                // Delete old caches
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
                            console.log('[ServiceWorker] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[ServiceWorker] Activation complete');
                return self.clients.claim(); // Take control immediately
            })
    );
});

// ========================================
// Fetch Event
// ========================================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip chrome-extension and other non-http(s) requests
    if (!url.protocol.startsWith('http')) {
        return;
    }

    // Apply different strategies based on request type
    if (isStaticAsset(url)) {
        // Cache-first strategy για static assets
        event.respondWith(cacheFirst(request));
    } else if (isCDNAsset(url)) {
        // Stale-while-revalidate για CDN
        event.respondWith(staleWhileRevalidate(request));
    } else if (isAPIRequest(url)) {
        // Network-first για API requests
        event.respondWith(networkFirst(request));
    } else {
        // Default: network-first
        event.respondWith(networkFirst(request));
    }
});

// ========================================
// Caching Strategies
// ========================================

/**
 * Cache-first strategy
 * Χρησιμοποιείται για static assets που δεν αλλάζουν συχνά
 */
async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    if (cached) {
        return cached;
    }

    try {
        const response = await fetch(request);
        
        if (response.ok) {
            cache.put(request, response.clone());
        }
        
        return response;
    } catch (error) {
        console.error('[ServiceWorker] Cache-first fetch failed:', error);
        
        // Return offline fallback if available
        return new Response('Offline - Asset not cached', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
}

/**
 * Stale-while-revalidate strategy
 * Return cached version immediately, update cache in background
 */
async function staleWhileRevalidate(request) {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(request);

    // Fetch fresh version in background
    const fetchPromise = fetch(request).then((response) => {
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    }).catch((error) => {
        console.warn('[ServiceWorker] Background fetch failed:', error);
    });

    // Return cached version immediately if available
    return cached || fetchPromise;
}

/**
 * Network-first strategy
 * Try network first, fallback to cache
 */
async function networkFirst(request) {
    const cache = await caches.open(RUNTIME_CACHE);

    try {
        const response = await fetch(request);
        
        if (response.ok) {
            cache.put(request, response.clone());
        }
        
        return response;
    } catch (error) {
        console.warn('[ServiceWorker] Network request failed, trying cache:', error);
        
        const cached = await cache.match(request);
        
        if (cached) {
            return cached;
        }

        // Return offline fallback
        return new Response('Offline - No cached version available', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

// ========================================
// Helper Functions
// ========================================

/**
 * Check if request is for static asset
 */
function isStaticAsset(url) {
    return STATIC_ASSETS.some(asset => url.pathname.endsWith(asset));
}

/**
 * Check if request is for CDN asset
 */
function isCDNAsset(url) {
    return url.hostname.includes('cdnjs.cloudflare.com') ||
           url.hostname.includes('cdn.jsdelivr.net') ||
           url.hostname.includes('unpkg.com');
}

/**
 * Check if request is API request
 */
function isAPIRequest(url) {
    return url.pathname.includes('/api/') ||
           url.hostname.includes('api.');
}

// ========================================
// Message Event (για cache management από main thread)
// ========================================
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => caches.delete(cacheName))
                );
            }).then(() => {
                event.ports[0].postMessage({ success: true });
            })
        );
    }

    if (event.data && event.data.type === 'CACHE_STATUS') {
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map(async (cacheName) => {
                        const cache = await caches.open(cacheName);
                        const keys = await cache.keys();
                        return {
                            name: cacheName,
                            count: keys.length
                        };
                    })
                );
            }).then((status) => {
                event.ports[0].postMessage({ status });
            })
        );
    }
});

// ========================================
// Periodic Cache Cleanup
// ========================================

/**
 * Clean old cache entries (called periodically)
 */
async function cleanOldCaches() {
    const cache = await caches.open(RUNTIME_CACHE);
    const requests = await cache.keys();
    const now = Date.now();
    const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

    for (const request of requests) {
        const response = await cache.match(request);
        if (response) {
            const dateHeader = response.headers.get('date');
            if (dateHeader) {
                const age = now - new Date(dateHeader).getTime();
                if (age > MAX_AGE) {
                    await cache.delete(request);
                    console.log('[ServiceWorker] Deleted old cache entry:', request.url);
                }
            }
        }
    }
}

// Run cleanup on activation
self.addEventListener('activate', (event) => {
    event.waitUntil(cleanOldCaches());
});

console.log('[ServiceWorker] Loaded');