const { calculateCommuterFare, calculateVehicleCost } = require('../lib/fare');
const scraper = require('../lib/scraper');
const cache = require('../lib/cache');
const fs = require('fs');
const path = require('path');

const VEHICLE_PROFILES_PATH = path.join(__dirname, '../data/vehicle-profiles.json');

const PRIVACY_POLICY = {
  api_name: "PH Transport Resources API",
  data_collected: ["fuel prices (public)", "fare matrix (public)"],
  user_data_stored: false,
  logs_retention_days: 7,
  contact: "your-email@example.com"
};

const handleResponse = (res, data, status = 200) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.statusCode = status;
  res.end(JSON.stringify(data));
};

module.exports = async (req, res) => {
  const { method, query } = req;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.statusCode = 204;
    return res.end();
  }

  // Normalize the URL path: strip /api prefix if present, then /transport if present
  let urlPath = req.url.split('?')[0];
  if (urlPath.startsWith('/api')) urlPath = urlPath.slice(4);
  if (urlPath.startsWith('/transport')) urlPath = urlPath.slice(10);
  if (urlPath === '') urlPath = '/';

  try {
    // Root - API index
    if (urlPath === '/' || urlPath === '') {
      return handleResponse(res, {
        name: "PH Transport Resources API",
        version: "1.0.0",
        endpoints: {
          health: "GET /health",
          privacy: "GET /privacy/policy",
          fuel: {
            latest: "GET /fuel/latest",
            brands: "GET /fuel/brands",
            history: "GET /fuel/history",
            refresh: "POST /fuel/refresh"
          },
          fare: {
            types: "GET /fare/commuter/types",
            commuter: "GET /fare/commuter/calculate?type=<type>&km=<km>",
            vehicle: "GET /fare/vehicle/calculate?profile=<profile>&km=<km>"
          }
        }
      });
    }

    // Health Check
    if (urlPath === '/health') {
      const cachedData = cache.get('fuel_prices');
      return handleResponse(res, {
        status: 'ok',
        timestamp: new Date().toISOString(),
        last_scrape: cachedData ? cachedData[0].timestamp : 'never'
      });
    }

    // Privacy Policy
    if (urlPath === '/privacy/policy') {
      return handleResponse(res, PRIVACY_POLICY);
    }

    // Fuel Endpoints
    if (urlPath.startsWith('/fuel')) {
      if (method === 'POST' && urlPath === '/fuel/refresh') {
        const prices = await scraper.scrapeFuelPrices();
        cache.set('fuel_prices', prices);
        return handleResponse(res, { success: true, data: prices });
      }

      let prices = cache.get('fuel_prices');
      let stale = false;
      if (!prices) {
        try {
          prices = await scraper.scrapeFuelPrices();
          cache.set('fuel_prices', prices);
        } catch (e) {
          stale = true;
        }
      }

      if (urlPath === '/fuel/latest') {
        return handleResponse(res, { data: prices, stale });
      }
      if (urlPath === '/fuel/brands') {
        return handleResponse(res, { data: prices ? prices.map(p => p.brand) : [], stale });
      }
      if (urlPath === '/fuel/history') {
        return handleResponse(res, { data: [], note: "History requires persistent DB, returning empty", stale });
      }
    }

    // Fare Endpoints
    if (urlPath.startsWith('/fare')) {
      if (urlPath === '/fare/commuter/calculate') {
        const { type, km } = query;
        if (!type || !km) return handleResponse(res, { error: "Missing type or km" }, 400);
        const fare = calculateCommuterFare(type, parseFloat(km));
        return handleResponse(res, { type, distance: km, fare });
      }

      if (urlPath === '/fare/vehicle/calculate') {
        const { km, profile } = query;
        if (!km || !profile) return handleResponse(res, { error: "Missing km or profile" }, 400);

        const profiles = JSON.parse(fs.readFileSync(VEHICLE_PROFILES_PATH, 'utf8'));
        const p = profiles[profile];
        if (!p) return handleResponse(res, { error: `Invalid profile. Valid profiles: ${Object.keys(profiles).join(', ')}` }, 400);

        const prices = cache.get('fuel_prices') || [{ ron91: 60, ron95: 65, diesel: 55 }];
        const fuelPrice = prices.find(pr => pr.brand === 'Shell') || prices[0];
        const pricePerLitre = p.fuel_type === 'diesel' ? fuelPrice.diesel : (p.fuel_type === 'ron95' ? fuelPrice.ron95 : fuelPrice.ron91);

        const cost = (parseFloat(km) / p.efficiency) * pricePerLitre;
        return handleResponse(res, { profile, distance: km, cost: Math.ceil(cost * 100) / 100, fuel_price: pricePerLitre });
      }

      if (urlPath === '/fare/commuter/types') {
        const matrix = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/fare-matrix.json'), 'utf8'));
        return handleResponse(res, { types: matrix.map(i => i.type) });
      }
    }

    handleResponse(res, { error: "Not Found", path: urlPath }, 404);
  } catch (error) {
    console.error(error);
    handleResponse(res, { error: error.message }, 500);
  }
};
