/* Optional GA4 bootstrap. The server only supplies an ID in configured deployments. */
(() => {
  'use strict';

  const measurementId = window.EMS_ANALYTICS_MEASUREMENT_ID;
  if (typeof measurementId !== 'string' || !/^G-[A-Z0-9]+$/.test(measurementId)) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  // This simulator does not use advertising features or send player identifiers.
  window.gtag('config', measurementId, { allow_google_signals: false });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);

  const validEvent = /^[a-z][a-z0-9_]{0,39}$/;
  window.EMSAnalytics = Object.freeze({
    track(name, parameters = {}) {
      if (!validEvent.test(name)) return;
      const safeParameters = {};
      for (const [key, value] of Object.entries(parameters)) {
        if (!/^[a-z][a-z0-9_]{0,39}$/.test(key)) continue;
        if (typeof value === 'string') safeParameters[key] = value.slice(0, 100);
        else if (typeof value === 'number' || typeof value === 'boolean') safeParameters[key] = value;
      }
      window.gtag('event', name, safeParameters);
    },
  });
})();
