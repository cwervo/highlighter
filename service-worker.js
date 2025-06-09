const CACHE_NAME = 'ocr-pwa-cache-v1';
const APP_SHELL_FILES = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    // Note: Tesseract.js is loaded from CDN, so it won't be part of this app shell cache directly
    // unless we implement more complex caching for external resources.
    // For basic offline functionality of the app itself, caching the above is key.
    // Also, any actual icon files would be listed here if they were local.
    'icons/icon-192x192.png', // Add placeholders to cache list if they are expected
    'icons/icon-512x512.png'
];

// Install event: cache app shell
self.addEventListener('install', event => {
    console.log('Service Worker: Install event');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Caching app shell');
                // Add all APP_SHELL_FILES, but be tolerant to individual failures
                // if some files (like icons) don't exist yet.
                // However, for core files like index.html, script.js, style.css, failure is problematic.
                const promises = APP_SHELL_FILES.map(url => {
                    return fetch(new Request(url, { cache: 'reload' })) // Fetch fresh from network
                        .then(response => {
                            if (response.ok) {
                                return cache.put(url, response);
                            }
                            // Don't cache non-OK responses, log error for missing files
                            console.warn(`Service Worker: Failed to fetch and cache ${url}. Status: ${response.status}`);
                            return Promise.resolve(); // Resolve so one failure doesn't stop all caching
                        })
                        .catch(err => {
                            console.warn(`Service Worker: Fetch error for ${url}: ${err}`);
                            return Promise.resolve(); // Resolve on error
                        });
                });
                return Promise.all(promises);
            })
            .then(() => self.skipWaiting()) // Activate new SW immediately
            .catch(error => {
                console.error('Service Worker: Cache open/add failed during install:', error);
            })
    );
});

// Activate event: clean up old caches
self.addEventListener('activate', event => {
    console.log('Service Worker: Activate event');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('Service Worker: Clearing old cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Claim clients for the new SW
    );
});

// Fetch event: serve app shell from cache, then network
self.addEventListener('fetch', event => {
    // Let browser handle requests for Tesseract CDN and other external resources
    if (event.request.url.startsWith(self.location.origin)) {
        event.respondWith(
            caches.match(event.request)
                .then(cachedResponse => {
                    if (cachedResponse) {
                        // console.log('Service Worker: Serving from cache:', event.request.url);
                        return cachedResponse;
                    }
                    // console.log('Service Worker: Fetching from network:', event.request.url);
                    return fetch(event.request).then(response => {
                        // Optionally, add non-app-shell resources to cache here if needed,
                        // but be careful about caching everything.
                        // For now, only app shell is pre-cached.
                        return response;
                    }).catch(error => {
                         console.error('Service Worker: Network fetch failed for:', event.request.url, error);
                         // Optionally, return a custom offline page here for navigation requests
                         // if (event.request.mode === 'navigate') {
                         // return caches.match('/offline.html'); // You'd need an offline.html
                         // }
                    });
                })
        );
    }
});
