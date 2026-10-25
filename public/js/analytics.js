// The ONE place the site talks to Fullstory.
// - enforces the tracking plan (tracking-plan.md)
// - enriches every event with campaign + variant + page context
// - logs every call to the console so the demo can show exactly what is sent
window.Ledgerly = window.Ledgerly || {};
(function (L) {
  function fs(method, payload) {
    console.log('%c[FS] ' + method, 'color:#0b8a6b;font-weight:bold', payload);
    if (typeof window.FS === 'function') window.FS(method, payload);
  }

  function context() {
    return {
      campaign: L.attribution.lastTouch().campaign,
      variant: L.experiment.exposedVariant() || 'not_exposed',
      page_name: document.body.dataset.page,
    };
  }

  L.track = function (name, properties) {
    fs('trackEvent', { name: name, properties: Object.assign(context(), properties || {}) });
  };

  L.setUserProps = function (properties) {
    fs('setProperties', { type: 'user', properties: properties });
  };

  // uid = our internal CRM id. Never email: stable, non-PII, and it is the
  // join key the billing system uses with the Server API.
  L.identify = function (uid, properties) {
    fs('setIdentity', { uid: uid, properties: properties });
  };

  // Calls to the mock backend (CRM / A/B tool). On GitHub Pages there is no server, so
  // the CRM hands out ids in the browser and the rest is a no-op.
  L.staticMode = /github\.io$/.test(location.hostname);
  L.api = function (path, body) {
    if (L.staticMode) {
      return Promise.resolve(path === '/api/signup' ? { uid: 'usr_' + Math.random().toString(16).slice(2, 10) } : { ok: true });
    }
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json(); });
  };

  // Runs on every page load. ?reset=1 starts a fresh visitor (handy for live demos).
  L.init = function () {
    if (new URLSearchParams(location.search).get('reset') === '1') {
      Object.keys(localStorage).concat(Object.keys(sessionStorage)).forEach(function (k) {
        if (k.indexOf('ledgerly_') === 0) { localStorage.removeItem(k); sessionStorage.removeItem(k); }
      });
      if (typeof window.FS === 'function') window.FS('setIdentity', { anonymous: true });
    }
    // pageName is Fullstory's reserved property: it names the Page in Fullstory automatically.
    fs('setProperties', { type: 'page', properties: { pageName: document.body.dataset.page } });
    L.attribution.capture(); // sets acq_* user properties on first touch
  };
})(window.Ledgerly);
