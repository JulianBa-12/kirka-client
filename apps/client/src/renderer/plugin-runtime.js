/* Polaris plugin runtime — runs inside the sandboxed plugin frame (opaque origin, no network,
 * no Node.js, no access to the Polaris window). Exposes window.polaris. Every call is checked
 * again by the host against the permissions the user granted. */
(function () {
  'use strict';
  var pending = new Map();
  var handlers = Object.create(null);
  var seq = 0;
  function call(method) {
    var args = Array.prototype.slice.call(arguments, 1);
    return new Promise(function (resolve, reject) {
      var id = ++seq;
      pending.set(id, { resolve: resolve, reject: reject });
      parent.postMessage({ __polaris: 1, id: id, method: method, args: args }, '*');
      setTimeout(function () { if (pending.has(id)) { pending.delete(id); reject(new Error('Polaris did not answer ' + method)); } }, 10000);
    });
  }
  window.addEventListener('message', function (e) {
    if (e.source !== parent) return;
    var d = e.data;
    if (!d || d.__polaris !== 1) return;
    if (d.reply) {
      var p = pending.get(d.reply);
      if (!p) return;
      pending.delete(d.reply);
      if (d.error) p.reject(new Error(d.error)); else p.resolve(d.result);
    } else if (d.event) {
      (handlers[d.event] || []).forEach(function (fn) { try { fn(d.data); } catch (err) { console.error(err); } });
    }
  });
  var api = Object.freeze({
    version: '1',
    root: document.getElementById('root'),
    storage: Object.freeze({
      get: function (key) { return call('storage.get', key); },
      set: function (key, value) { return call('storage.set', key, value); },
    }),
    notify: function (text) { return call('notify', String(text)); },
    hud: Object.freeze({
      set: function (text) { return call('hud.set', text == null ? null : String(text)); },
      clear: function () { return call('hud.set', null); },
    }),
    theme: Object.freeze({ get: function () { return call('theme.get'); } }),
    info: function () { return call('info'); },
    on: function (event, fn) { if (typeof fn === 'function') (handlers[event] = handlers[event] || []).push(fn); },
  });
  Object.defineProperty(window, 'polaris', { value: api, writable: false, configurable: false });
})();
