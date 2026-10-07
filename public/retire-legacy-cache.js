self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => /^tiny-rex-v[0-9]+$/.test(key)).map(key => caches.delete(key)))));
});
