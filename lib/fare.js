const fs = require('fs');
const path = require('path');

const FARE_MATRIX_PATH = path.join(__dirname, '../data/fare-matrix.json');
const VEHICLE_PROFILES_PATH = path.join(__dirname, '../data/vehicle-profiles.json');

function calculateCommuterFare(type, distance) {
  const matrix = JSON.parse(fs.readFileSync(FARE_MATRIX_PATH, 'utf8'));
  const config = matrix.find(i => i.type === type);

  if (!config) throw new Error(`Unsupported transport type: ${type}`);

  let fare = config.base_fare || 0;

  if (config.pickup_fee) {
    fare += config.pickup_fee;
  }

  if (config.base_distance) {
    const extraKm = Math.max(0, distance - config.base_distance);
    fare += extraKm * config.per_km;
  } else {
    fare += distance * config.per_km;
  }

  if (config.multiplier) {
    fare *= config.multiplier;
  }

  return Math.ceil(fare * 100) / 100;
}

function calculateVehicleCost(km, fuelType, consumption) {
  // This is a simplified calculation for the API
  // Cost = (km / consumption) * fuelPrice
  // The fuelPrice would be fetched from the scraper
  return (km / consumption);
}

module.exports = {
  calculateCommuterFare,
  calculateVehicleCost
};
