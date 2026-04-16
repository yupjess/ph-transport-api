const cache = new Map();
const DEFAULT_TTL = 60 * 60 * 1000; // 60 minutes

module.exports = {
  set: (key, value, ttl = DEFAULT_TTL) => {
    cache.set(key, {
      value,
      expiry: Date.now() + ttl
    });
  },
  get: (key) => {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      cache.delete(key);
      return null;
    }
    return entry.value;
  },
  clear: (key) => {
    if (key) cache.delete(key);
    else cache.clear();
  }
};
