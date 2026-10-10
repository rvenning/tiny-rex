self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => /^tiny-rex-v[0-9]+$/.test(key) || key === "tiny-rex-adventure-art-v1" || key === "tiny-rex-adventure-art-v7").map(key => caches.delete(key)))));
});
