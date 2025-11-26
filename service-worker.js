/**
 * service-worker.js - Progressive Web App Service Worker
 * Handles offline caching, update notifications, and performance optimization
 * Version: 2.0
 */

// ========================================
// Configuration
// ========================================
const CACHE_VERSION = 'v2.0.0';
const CACHE_NAME = `revenue-mgmt-${CACHE_VERSION}`;

const STATIC_CACHE = `${CACHE_NAME}-static`;
const DYNAMIC_CACHE = `${CACHE_NAME}-dynamic`;
const CDN_CACHE = `${CACHE_NAME}-cdn`;

// Cache duration
const CACHE_DURATION = {
    static: 7 * 24 * 60 * 60 * 1000,      // 7 days
    dynamic: 24 * 60 * 60 * 1000,          // 1 day
    cdn: 30 * 24 * 60 * 60 * 1000          // 30 days
};

// Static assets to cache immediately
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/state.js',
    '/storage.js',
    '/utils.js',
    '/dataManager.js',
    '/eopyyClawback.js',
    '/uiRenderers.js',
    '/formHandlers.js',
    '/eventHandlers.js',
    '/filters.js',
    '/backup.js',
    '/pdfExport.js',
    '/csvValidator.js',
    '/cdnChecker.js',
    '/reports.js',
    '/comparison.js'
];

// CDN libraries (cache with long TTL)
const CDN_URLS = [
    'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];

// ========================================
// Install Event - Cache Static Assets
// ========================================
self.addEventListener('install', (event) => {
    console.log('[SW] Installing Service Worker v' + CACHE_VERSION);
    
    event.waitUntil(
        Promise.all([
            // Cache static assets
            caches.open(STATIC_CACHE).then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            }),
            
            // Cache CDN libraries
            caches.open(CDN_CACHE).then((cache) => {
                console.log('[SW] Caching CDN libraries');
                return Promise.all(
                    CDN_URLS.map(url => 
                        cache.add(url).catch(err => {
                            console.warn('[SW] Failed to cache CDN:', url, err);
                        })
                    )
                );
            })
        ]).then(() => {
            console.log('[SW] Installation complete');
            return self.skipWaiting(); // Activate immediately
        })
    );
});

// ========================================
// Activate Event - Clean Old Caches
// ========================================
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating Service Worker v' + CACHE_VERSION);
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // Delete old caches
                    if (cacheName.startsWith('revenue-mgmt-') && 
                        !cacheName.includes(CACHE_VERSION)) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('[SW] Activation complete');
            return self.clients.claim(); // Take control immediately
        })
    );
});

// ========================================
// Fetch Event - Network Strategy
// ========================================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Skip chrome-extension and other protocols
    if (!url.protocol.startsWith('http')) {
        return;
    }
    
    // Strategy selection based on resource type
    if (isCDNRequest(url)) {
        // CDN: Cache-first (long TTL)
        event.respondWith(cacheFirstStrategy(request, CDN_CACHE, CACHE_DURATION.cdn));
    } else if (isStaticAsset(url)) {
        // Static assets: Cache-first with network fallback
        event.respondWith(cacheFirstStrategy(request, STATIC_CACHE, CACHE_DURATION.static));
    } else {
        // Dynamic content: Network-first with cache fallback
        event.respondWith(networkFirstStrategy(request, DYNAMIC_CACHE, CACHE_DURATION.dynamic));
    }
});

// ========================================
// Caching Strategies
// ========================================

/**
 * Cache-first strategy (for static assets)
 * 1. Check cache
 * 2. If found and not expired, return cached
 * 3. Otherwise fetch from network and update cache
 */
async function cacheFirstStrategy(request, cacheName, maxAge) {
    try {
        const cache = await caches.open(cacheName);
        const cachedResponse = await cache.match(request);
        
        // Check if cached response exists and is not expired
        if (cachedResponse) {
            const dateHeader = cachedResponse.headers.get('date');
            const cachedTime = dateHeader ? new Date(dateHeader).getTime() : 0;
            const now = Date.now();
            
            if (now - cachedTime < maxAge) {
                console.log('[SW] Cache hit:', request.url);
                return cachedResponse;
            }
        }
        
        // Fetch from network
        console.log('[SW] Network fetch:', request.url);
        const networkResponse = await fetch(request);
        
        // Cache the new response
        if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
        
    } catch (error) {
        console.warn('[SW] Cache-first strategy failed:', error);
        
        // Try to return stale cache as fallback
        const cache = await caches.open(cacheName);
        const cachedResponse = await cache.match(request);
        
        if (cachedResponse) {
            console.log('[SW] Returning stale cache:', request.url);
            return cachedResponse;
        }
        
        // Return offline page fallback
        return createOfflineResponse();
    }
}

/**
 * Network-first strategy (for dynamic content)
 * 1. Try network first
 * 2. If network fails, return cache
 * 3. Always update cache with network response
 */
async function networkFirstStrategy(request, cacheName, maxAge) {
    try {
        // Try network first
        console.log('[SW] Network-first fetch:', request.url);
        const networkResponse = await fetch(request);
        
        // Cache the response
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(cacheName);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
        
    } catch (error) {
        console.warn('[SW] Network failed, trying cache:', error);
        
        // Fallback to cache
        const cache = await caches.open(cacheName);
        const cachedResponse = await cache.match(request);
        
        if (cachedResponse) {
            console.log('[SW] Cache fallback:', request.url);
            return cachedResponse;
        }
        
        // Return offline response
        return createOfflineResponse();
    }
}

// ========================================
// Helper Functions
// ========================================

/**
 * Check if request is for CDN resource
 */
function isCDNRequest(url) {
    return url.hostname.includes('cdnjs.cloudflare.com') ||
           url.hostname.includes('cdn.jsdelivr.net') ||
           url.hostname.includes('unpkg.com');
}

/**
 * Check if request is for static asset
 */
function isStaticAsset(url) {
    const staticExtensions = ['.js', '.css', '.html', '.json'];
    return staticExtensions.some(ext => url.pathname.endsWith(ext)) ||
           url.pathname === '/' ||
           STATIC_ASSETS.some(asset => url.pathname === asset);
}

/**
 * Create offline fallback response
 */
function createOfflineResponse() {
    return new Response(
        JSON.stringify({
            offline: true,
            message: 'Εκτός σύνδεσης - Η εφαρμογή λειτουργεί με cached δεδομένα'
        }),
        {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
                'Content-Type': 'application/json'
            })
        }
    );
}

// ========================================
// Message Handler - Communication with App
// ========================================
self.addEventListener('message', (event) => {
    const { type, payload } = event.data;
    
    switch (type) {
        case 'SKIP_WAITING':
            // Force activation of new service worker
            self.skipWaiting();
            break;
            
        case 'CLEAR_CACHE':
            // Clear all caches
            event.waitUntil(
                caches.keys().then((cacheNames) => {
                    return Promise.all(
                        cacheNames.map((cacheName) => {
                            if (cacheName.startsWith('revenue-mgmt-')) {
                                console.log('[SW] Clearing cache:', cacheName);
                                return caches.delete(cacheName);
                            }
                        })
                    );
                }).then(() => {
                    event.ports[0].postMessage({ success: true });
                })
            );
            break;
            
        case 'CHECK_UPDATE':
            // Check for service worker update
            self.registration.update();
            break;
            
        default:
            console.warn('[SW] Unknown message type:', type);
    }
});

// ========================================
// Background Sync (Future Enhancement)
// ========================================
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-data') {
        event.waitUntil(
            // Implement background sync logic here
            syncDataWithServer()
        );
    }
});

async function syncDataWithServer() {
    // Placeholder for future implementation
    console.log('[SW] Background sync triggered');
}

// ========================================
// Push Notifications (Future Enhancement)
// ========================================
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : {};
    
    const options = {
        body: data.body || 'Νέα ειδοποίηση',
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        vibrate: [200, 100, 200],
        data: data
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title || 'Revenue Management', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    event.waitUntil(
        clients.openWindow(event.notification.data.url || '/')
    );
});

// ========================================
// Error Handler
// ========================================
self.addEventListener('error', (event) => {
    console.error('[SW] Error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
    console.error('[SW] Unhandled rejection:', event.reason);
});

console.log('[SW] Service Worker script loaded');