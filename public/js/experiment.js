// MOCK experimentation platform (stands in for Optimizely / LaunchDarkly / Statsig).
// Deterministic 50/50 bucketing on an anonymous id; ?variant=<name> forces a variant for demos.
window.Ledgerly = window.Ledgerly || {};
(function (L) {
  var EXPERIMENT = 'pricing_page_v2';
  var VARIANTS = ['control', 'annual_toggle'];
  var EXPOSED = 'ledgerly_exp_' + EXPERIMENT;

  function anonId() {
    var id = localStorage.getItem('ledgerly_anon_id');
    if (!id) {
      id = 'anon_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('ledgerly_anon_id', id);
    }
    return id;
  }

  function hash(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }

  L.experiment = {
    key: EXPERIMENT,
    anonId: anonId,
    assign: function () {
      var forced = new URLSearchParams(location.search).get('variant');
      if (VARIANTS.indexOf(forced) > -1) return forced;
      var sticky = localStorage.getItem(EXPOSED);
      if (sticky) return sticky;
      return VARIANTS[hash(anonId() + EXPERIMENT) % VARIANTS.length];
    },
    // Call ONLY when the variant actually renders. Users who never reach the
    // pricing page are not in the experiment - otherwise results get diluted.
    expose: function () {
      var variant = L.experiment.assign();
      if (localStorage.getItem(EXPOSED) !== variant) {
        localStorage.setItem(EXPOSED, variant);
        var props = {};
        props['exp_' + EXPERIMENT] = variant;
        L.setUserProps(props);
        L.track('Experiment Viewed', { experiment_key: EXPERIMENT, variant: variant });
        // Forced variants (?variant=) are demo walkthroughs: keep them out of the A/B readout.
        if (!new URLSearchParams(location.search).get('variant')) {
          L.api('/api/exposure', { anon_id: anonId(), experiment_key: EXPERIMENT, variant: variant });
        }
      }
      return variant;
    },
    exposedVariant: function () { return localStorage.getItem(EXPOSED); },
  };
})(window.Ledgerly);
