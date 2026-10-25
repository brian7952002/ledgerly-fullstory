// Campaign attribution from UTM parameters.
//   first touch -> user properties (acq_*)  : "which campaign brought this person"
//   last touch  -> event properties (campaign): "which campaign brought this visit"
window.Ledgerly = window.Ledgerly || {};
(function (L) {
  var FIRST = 'ledgerly_first_touch';
  var LAST = 'ledgerly_last_touch';
  var DIRECT = { campaign: 'direct', source: 'direct', medium: 'none' };

  function read(store, key) {
    try { return JSON.parse(store.getItem(key)); } catch (e) { return null; }
  }

  L.attribution = {
    capture: function () {
      var q = new URLSearchParams(location.search);
      var touch = q.get('utm_campaign')
        ? { campaign: q.get('utm_campaign'), source: q.get('utm_source') || 'unknown', medium: q.get('utm_medium') || 'unknown' }
        : null;

      if (touch) sessionStorage.setItem(LAST, JSON.stringify(touch));

      if (!read(localStorage, FIRST)) {
        var first = touch || DIRECT;
        localStorage.setItem(FIRST, JSON.stringify(first));
        L.setUserProps({ acq_campaign: first.campaign, acq_source: first.source, acq_medium: first.medium });
      }
    },
    firstTouch: function () { return read(localStorage, FIRST) || DIRECT; },
    lastTouch: function () { return read(sessionStorage, LAST) || L.attribution.firstTouch(); },
  };
})(window.Ledgerly);
