// ============================================================================
// Climate, Seasons, Weather & Environment Configuration (src/config/climate.js)
// ============================================================================

import { DAY_LENGTH_SECONDS, TIME_CONFIG } from './time.js';

export const CLIMATE_CONFIG = {
  DAYS_PER_SEASON: 5,
  SEASONS: ['spring', 'summer', 'autumn', 'winter'],
  DAY_DURATION_SECONDS: DAY_LENGTH_SECONDS, // 20 minutes (1200s) per in-game day

  // Day/Night and Sun Variation
  BASE_NIGHT_START: TIME_CONFIG.NIGHT_START, // 0.58
  BASE_NIGHT_END: TIME_CONFIG.NIGHT_END, // 0.92
  SEASON_DAY_LENGTH_SHIFT: {
    spring: 0.0,
    summer: -0.045, // Day lasts ~18% longer (night starts later, ends earlier)
    autumn: 0.0,
    winter: 0.045,  // Day is ~18% shorter (night starts earlier, ends later)
  },

  // Biome Base Temperatures (°C) and Humidity (0..1)
  BIOME_CLIMATES: {
    desert: { baseTemp: 36, humidity: 0.1, name: 'Golden Dunes' },
    savanna: { baseTemp: 28, humidity: 0.3, name: 'Sunscorched Savanna' },
    plains: { baseTemp: 19, humidity: 0.5, name: 'Verdant Meadows' },
    forest: { baseTemp: 18, humidity: 0.65, name: 'Timberland Woods' },
    darkwood: { baseTemp: 16, humidity: 0.88, name: 'Darkwood Forest' },
    birch_forest: { baseTemp: 16, humidity: 0.55, name: 'Silver Birch Grove' },
    maple_forest: { baseTemp: 13, humidity: 0.68, name: 'Autumn Maple Forest' },
    redwood: { baseTemp: 12, humidity: 0.86, name: 'Redwood Giant Forest' },
    taiga: { baseTemp: 3, humidity: 0.6, name: 'Boreal Pine Taiga' },
    mountains: { baseTemp: 1, humidity: 0.35, name: 'Craggy Alpine Peaks' },
    tundra: { baseTemp: -8, humidity: 0.45, name: 'Frostbound Tundra' },
    swamp: { baseTemp: 21, humidity: 0.94, name: 'Misty Fenland' },
    ocean: { baseTemp: 16, humidity: 0.95, name: 'Sapphire Sea' },
  },

  // Season Offsets (°C)
  SEASON_TEMP_OFFSETS: {
    spring: 0.0,
    summer: 10.0,
    autumn: -3.0,
    winter: -15.0,
  },

  // Altitude lapse: °C cooled per 10 blocks above sea level (18)
  ALTITUDE_LAPSE_PER_BLOCK: 0.28,

  // Weather States
  WEATHER_STATES: [
    'clear',
    'partly_cloudy',
    'overcast',
    'light_rain',
    'heavy_rain',
    'thunderstorm',
    'snow',
    'fog',
    'dust_haze',
  ],

  // Weighted weather probabilities by season
  SEASON_WEATHER_WEIGHTS: {
    spring: {
      clear: 35,
      partly_cloudy: 30,
      light_rain: 20,
      heavy_rain: 10,
      thunderstorm: 3,
      fog: 2,
    },
    summer: {
      clear: 50,
      partly_cloudy: 25,
      thunderstorm: 15,
      heavy_rain: 6,
      fog: 4,
    },
    autumn: {
      overcast: 32,
      partly_cloudy: 24,
      light_rain: 22,
      fog: 14,
      heavy_rain: 6,
      clear: 2,
    },
    winter: {
      overcast: 40,
      snow: 35,
      fog: 15,
      clear: 8,
      partly_cloudy: 2,
    },
  },

  // State minimum and maximum durations (seconds)
  WEATHER_DURATION_MIN: 60,
  WEATHER_DURATION_MAX: 180,
  WEATHER_BLEND_TIME: 20, // 20-second smooth transition

  // Foliage Visual Tints (Hex)
  SEASON_TINTS: {
    spring: {
      grass: '#7BC96F',
      leaves: '#52bd3c',
      leafDensity: 1.0,
      snowAmount: 0.0,
      wetDarken: 0.0,
    },
    summer: {
      grass: '#5CAE3A',
      leaves: '#3da82c',
      leafDensity: 1.0,
      snowAmount: 0.0,
      wetDarken: 0.0,
    },
    autumn: {
      grass: '#A5A73C',
      leaves: '#c45a23',
      leafDensity: 0.60,
      snowAmount: 0.0,
      wetDarken: 0.0,
    },
    winter: {
      grass: '#8FA58A',
      leaves: '#7b8f78',
      leafDensity: 0.35,
      snowAmount: 0.85,
      wetDarken: 0.0,
    },
  },
};
