let mycache = 'store';
let FilesToCache = [
    './',
    './index.html',
		'./convert.js',
	  './promises.js',
    './css/style.css',
    
]



self.addEventListener('install', (e) => {
    console.log('[ServiceWorker] Installed');

    // e.waitUntil Delays the event until the Promise is resolved
    e.waitUntil(

    	// Open the cache
	    caches.open(mycache).then((cache) => {

	    	// Add all the default files to the cache
			console.log('[ServiceWorker] Caching cacheFiles');
			return cache.addAll(cacheFiles);
	    })
	); // end e.waitUntil
});


self.addEventListener('activate', (e) => {
    console.log('[ServiceWorker] Activated');

    e.waitUntil(

    	// Get all the cache keys (cacheName)
		caches.keys().then((cacheNames) => {
			return Promise.all(mycache.map((thisCacheName) => {

				// If a cached item is saved under a previous cacheName
				if (thisCacheName !== mycache) {

					// Delete that cached file
					console.log('[ServiceWorker] Removing Cached Files from Cache - ', thisCacheName);
					return caches.delete(thisCacheName);
				}
			}));
		})
	); // end e.waitUntil

});


self.addEventListener("activate", event => {
	event.waitUntil(
	  caches.keys().then(cacheNames => {
		return Promise.all(
		  cacheNames
			.filter(cacheName => {
			  return (
				mycache.startsWith("currency-converter-") &&
				mycache !== staticCacheName
			  );
			})
			.map(cacheName => caches.delete(mycache))
		);
	  })
	);
  });
  
  self.addEventListener("fetch", event => {
	event.respondWith(
	  caches.match(event.request).then(response => {
		return response || fetch(event.request);
	  })
	);
  });