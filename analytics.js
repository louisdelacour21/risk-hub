'use strict';
/* Risk-profile, stress and discounting analytics, added to Risk (after risk.js). Simple returns: 0.01 = +1%. */
(function (root) {
  const Risk = root.Risk || require('./risk.js');
  const sum = (a) => a.reduce((s, x) => s + x, 0);

  
  
  
  
  
  
  
            // loss from an instant shock on the portfolio value

  
  

  const TENOR_YEARS = [0.25, 0.5, 0.75, 1, 2, 3, 5, 7, 10, 15, 20, 30];
  
  
  

  

  const api = {            sum, TENOR_YEARS,   };
  Object.assign(Risk, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = Risk;
})(typeof window !== 'undefined' ? window : globalThis);
