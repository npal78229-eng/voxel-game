import * as THREE from 'three';
import { CLIMATE_CONFIG } from '../config/climate.js';
import { sharedShaderUniforms } from '../world.js';

// ============================================================================
// Centralized Climate, Seasons & Weather Engine (src/climate/ClimateSystem.js)
// Single Source of Truth for Time, Sun/Night, Weather, Seasons & Environmental FX
// ============================================================================

export class ClimateSystem {
  constructor(seed = 133742) {
    this.seed = seed;
    this.timeScale = 1.0;

    // Time & Calendar
    this.dayCount = 0;
    this.timeOfDay = 0.25; // 0.0 = dawn, 0.25 = noon, 0.55 = dusk/night start
    this.dayDurationSeconds = CLIMATE_CONFIG.DAY_DURATION_SECONDS;

    // Weather State Machine
    this.weather = 'clear';
    this.targetWeather = 'clear';
    this.weatherBlend = 0.0; // 0..1
    this.weatherDuration = 120.0;
    this.precipIntensity = 0.0;
    this.cloudCover = 0.15;
    this.fogDensityMult = 1.0;
    this.windVector = { x: 1.0, z: 0.3, strength: 0.2 };

    // Lightning & Thunder
    this.lightning = {
      active: false,
      flash: 0.0,
      timer: 0.0,
      strikePos: null,
      thunderDelay: 0.0,
      thunderTimer: 0.0,
    };

    // Procedural Web Audio Engine
    this.audioCtx = null;
    this.audioInitialized = false;
    this.rainGain = null;
    this.windGain = null;
    this.cricketTimer = 0.0;
    this.leafSoundTimer = 0.0;

    // Cached Season Tint Colors
    this._springTint = new THREE.Color(CLIMATE_CONFIG.SEASON_TINTS.spring.leaves);
    this._summerTint = new THREE.Color(CLIMATE_CONFIG.SEASON_TINTS.summer.leaves);
    this._autumnTint = new THREE.Color(CLIMATE_CONFIG.SEASON_TINTS.autumn.leaves);
    this._winterTint = new THREE.Color(CLIMATE_CONFIG.SEASON_TINTS.winter.leaves);
    this._currentTint = new THREE.Color(1, 1, 1);
  }

  // --- Calendar & Season Properties ---
  get seasonIndex() {
    const daysPerYear = CLIMATE_CONFIG.DAYS_PER_SEASON * 4;
    const dayOfYear = this.dayCount % daysPerYear;
    return Math.floor(dayOfYear / CLIMATE_CONFIG.DAYS_PER_SEASON);
  }

  get season() {
    return CLIMATE_CONFIG.SEASONS[this.seasonIndex];
  }

  get dayOfYear() {
    const daysPerYear = CLIMATE_CONFIG.DAYS_PER_SEASON * 4;
    return this.dayCount % daysPerYear;
  }

  get seasonProgress() {
    const dayInSeason = this.dayCount % CLIMATE_CONFIG.DAYS_PER_SEASON;
    const intraDay = this.timeOfDay;
    return (dayInSeason + intraDay) / CLIMATE_CONFIG.DAYS_PER_SEASON;
  }

  /**
   * Single Source of Truth for Day/Night boundaries and Sun times.
   */
  getSunTimes() {
    const shift = CLIMATE_CONFIG.SEASON_DAY_LENGTH_SHIFT[this.season] || 0;
    const nightStart = CLIMATE_CONFIG.BASE_NIGHT_START - shift;
    const nightEnd = CLIMATE_CONFIG.BASE_NIGHT_END + shift;
    const t = ((this.timeOfDay % 1) + 1) % 1;
    const isNight = t >= nightStart && t <= nightEnd;

    const angle = t * Math.PI * 2;
    const sunElevation = Math.sin(angle);
    const sunHorizontal = Math.cos(angle);

    return {
      nightStart,
      nightEnd,
      isNight,
      timeOfDay: t,
      sunElevation,
      sunHorizontal,
      dayLengthSec: this.dayDurationSeconds,
    };
  }

  isNight() {
    return this.getSunTimes().isNight;
  }

  /**
   * Temperature Model: biomeBase + seasonOffset + dayNightSwing - altitudeLapse
   */
  temperatureAt(biome, y = 20) {
    const bId = biome?.id || 'plains';
    const bData = CLIMATE_CONFIG.BIOME_CLIMATES[bId] || { baseTemp: 18, humidity: 0.5 };
    const seasonOffset = CLIMATE_CONFIG.SEASON_TEMP_OFFSETS[this.season] || 0;

    // Day/Night Swing: dry biomes swing up to 10°C, humid biomes swing 4°C
    const swingAmp = 4.0 + (1.0 - (bData.humidity || 0.5)) * 6.0;
    const swing = Math.sin((this.timeOfDay - 0.25) * Math.PI * 2) * swingAmp;

    // Altitude lapse: -0.28°C per block above sea level
    const altLapse = Math.max(0, y - 18) * CLIMATE_CONFIG.ALTITUDE_LAPSE_PER_BLOCK;

    return Math.round((bData.baseTemp + seasonOffset + swing - altLapse) * 10) / 10;
  }

  /**
   * Precipitation Type based on location & temperature: 'none' | 'rain' | 'snow' | 'dust_haze'
   */
  precipTypeAt(biome, y = 20) {
    if (this.precipIntensity < 0.05) return 'none';
    const bId = biome?.id || 'plains';
    if (bId === 'desert') return 'dust_haze';
    const temp = this.temperatureAt(biome, y);
    if (temp <= 0) return 'snow';
    return 'rain';
  }

  // --- Commands & Testing API ---
  setSeason(seasonName) {
    const idx = CLIMATE_CONFIG.SEASONS.indexOf(seasonName.toLowerCase());
    if (idx === -1) return false;
    const currentYear = Math.floor(this.dayCount / (CLIMATE_CONFIG.DAYS_PER_SEASON * 4));
    this.dayCount = currentYear * (CLIMATE_CONFIG.DAYS_PER_SEASON * 4) + idx * CLIMATE_CONFIG.DAYS_PER_SEASON;
    this._updateShaderUniforms();
    return true;
  }

  nextSeason() {
    const nextIdx = (this.seasonIndex + 1) % 4;
    this.setSeason(CLIMATE_CONFIG.SEASONS[nextIdx]);
  }

  setSeasonProgress(progress) {
    const p = Math.max(0, Math.min(0.999, progress));
    const baseDay = Math.floor(this.dayCount / CLIMATE_CONFIG.DAYS_PER_SEASON) * CLIMATE_CONFIG.DAYS_PER_SEASON;
    const targetOffset = p * CLIMATE_CONFIG.DAYS_PER_SEASON;
    this.dayCount = baseDay + Math.floor(targetOffset);
    this.timeOfDay = targetOffset % 1.0;
    this._updateShaderUniforms();
  }

  setWeather(weatherName) {
    const w = weatherName.toLowerCase();
    if (!CLIMATE_CONFIG.WEATHER_STATES.includes(w)) {
      if (w === 'storm') return this.setWeather('thunderstorm');
      if (w === 'cloudy') return this.setWeather('partly_cloudy');
      return false;
    }
    this.targetWeather = w;
    this.weatherBlend = 0.0;
    this.weatherDuration = CLIMATE_CONFIG.WEATHER_DURATION_MIN + Math.random() * 60;
    return true;
  }

  setTimeSpeed(multiplier) {
    this.timeScale = Math.max(0.0, Math.min(100.0, multiplier));
  }

  // --- Main Update Loop ---
  update(deltaTime, playerPosition, currentBiome) {
    const dt = deltaTime * this.timeScale;

    // 1. Advance Day/Night Time
    this.timeOfDay += dt / this.dayDurationSeconds;
    if (this.timeOfDay >= 1.0) {
      this.timeOfDay -= 1.0;
      this.dayCount++;
    }

    // 2. Weather State Machine & Smooth Transition
    this.weatherDuration -= dt;
    if (this.weatherDuration <= 0) {
      this._pickNextWeather();
    }

    if (this.weather !== this.targetWeather) {
      this.weatherBlend += dt / CLIMATE_CONFIG.WEATHER_BLEND_TIME;
      if (this.weatherBlend >= 1.0) {
        this.weather = this.targetWeather;
        this.weatherBlend = 0.0;
      }
    }

    // Target targets based on weather
    const targetPrecip =
      this.targetWeather === 'thunderstorm'
        ? 1.0
        : this.targetWeather === 'heavy_rain' || this.targetWeather === 'snow'
        ? 0.8
        : this.targetWeather === 'light_rain'
        ? 0.35
        : 0.0;

    const currentPrecip =
      this.weather === 'thunderstorm'
        ? 1.0
        : this.weather === 'heavy_rain' || this.weather === 'snow'
        ? 0.8
        : this.weather === 'light_rain'
        ? 0.35
        : 0.0;

    this.precipIntensity = THREE.MathUtils.lerp(currentPrecip, targetPrecip, this.weatherBlend);

    const targetClouds =
      this.targetWeather === 'clear'
        ? 0.1
        : this.targetWeather === 'partly_cloudy'
        ? 0.35
        : this.targetWeather === 'fog'
        ? 0.6
        : 0.95;
    const currentClouds =
      this.weather === 'clear'
        ? 0.1
        : this.weather === 'partly_cloudy'
        ? 0.35
        : this.weather === 'fog'
        ? 0.6
        : 0.95;
    this.cloudCover = THREE.MathUtils.lerp(currentClouds, targetClouds, this.weatherBlend);

    // 3. Lightning in Thunderstorms
    if (this.weather === 'thunderstorm' || this.targetWeather === 'thunderstorm') {
      this.lightning.timer -= dt;
      if (this.lightning.timer <= 0) {
        this.lightning.timer = 6.0 + Math.random() * 12.0;
        this._triggerLightning(playerPosition);
      }
    }

    if (this.lightning.flash > 0) {
      this.lightning.flash = Math.max(0, this.lightning.flash - dt * 4.5);
    }
    if (this.lightning.thunderTimer > 0) {
      this.lightning.thunderTimer -= dt;
      if (this.lightning.thunderTimer <= 0) {
        this._playThunderSound();
      }
    }

    // 4. Update Shader Uniforms (Zero Re-Meshing!)
    this._updateShaderUniforms();

    // 5. Procedural Web Audio Ambient Sounds
    this._updateAudio(dt, currentBiome, playerPosition);
  }

  _pickNextWeather() {
    const weights = CLIMATE_CONFIG.SEASON_WEATHER_WEIGHTS[this.season] || { clear: 100 };
    const entries = Object.entries(weights);
    const totalWeight = entries.reduce((acc, [, w]) => acc + w, 0);
    let r = Math.random() * totalWeight;
    for (const [wState, weight] of entries) {
      if (r <= weight) {
        this.setWeather(wState);
        return;
      }
      r -= weight;
    }
    this.setWeather('clear');
  }

  _triggerLightning(playerPos) {
    this.lightning.active = true;
    this.lightning.flash = 1.0;
    const dist = 20 + Math.random() * 60;
    const angle = Math.random() * Math.PI * 2;
    this.lightning.strikePos = {
      x: (playerPos?.x || 0) + Math.cos(angle) * dist,
      z: (playerPos?.z || 0) + Math.sin(angle) * dist,
    };
    this.lightning.thunderTimer = dist / 340; // Speed of sound delay!
  }

  _updateShaderUniforms() {
    const seasonData = CLIMATE_CONFIG.SEASON_TINTS[this.season] || CLIMATE_CONFIG.SEASON_TINTS.spring;
    const nextSeason = CLIMATE_CONFIG.SEASONS[(this.seasonIndex + 1) % 4];
    const nextData = CLIMATE_CONFIG.SEASON_TINTS[nextSeason];

    const p = this.seasonProgress;
    this._currentTint
      .copy(this._getSeasonColor(this.season))
      .lerp(this._getSeasonColor(nextSeason), p * 0.7);

    // Apply uniforms
    sharedShaderUniforms.uSeasonTint.value.copy(this._currentTint);
    sharedShaderUniforms.uLeafDensity.value = THREE.MathUtils.lerp(seasonData.leafDensity, nextData.leafDensity, p);
    sharedShaderUniforms.uWetDarken.value = this.precipIntensity;

    if (this.season === 'winter' || this.weather === 'snow') {
      const targetSnow = this.season === 'winter' ? 0.75 : 0.45;
      sharedShaderUniforms.uSnowAmount.value = THREE.MathUtils.lerp(
        sharedShaderUniforms.uSnowAmount.value,
        targetSnow,
        0.05
      );
    } else {
      sharedShaderUniforms.uSnowAmount.value = Math.max(0, sharedShaderUniforms.uSnowAmount.value - 0.01);
    }
  }

  _getSeasonColor(season) {
    if (season === 'spring') return this._springTint;
    if (season === 'summer') return this._summerTint;
    if (season === 'autumn') return this._autumnTint;
    return this._winterTint;
  }

  // --- Procedural Web Audio Engine ---
  _ensureAudio() {
    if (this.audioInitialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.audioCtx = new AudioCtx();

      // Rain Noise Generator
      const bufferSize = this.audioCtx.sampleRate * 2;
      const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = this.audioCtx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      const rainFilter = this.audioCtx.createBiquadFilter();
      rainFilter.type = 'lowpass';
      rainFilter.frequency.value = 1200;

      this.rainGain = this.audioCtx.createGain();
      this.rainGain.gain.value = 0.0;

      whiteNoise.connect(rainFilter);
      rainFilter.connect(this.rainGain);
      this.rainGain.connect(this.audioCtx.destination);
      whiteNoise.start();

      // Wind Brownian Loop
      const windSource = this.audioCtx.createBufferSource();
      windSource.buffer = noiseBuffer;
      windSource.loop = true;

      const windFilter = this.audioCtx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 240;
      windFilter.Q.value = 3.0;

      this.windGain = this.audioCtx.createGain();
      this.windGain.gain.value = 0.02;

      windSource.connect(windFilter);
      windFilter.connect(this.windGain);
      this.windGain.connect(this.audioCtx.destination);
      windSource.start();

      this.audioInitialized = true;
    } catch (_) {
      // Audio auto-play or environment restriction fallback
    }
  }

  _updateAudio(dt, currentBiome, playerPos) {
    if (typeof window === 'undefined') return;
    this._ensureAudio();
    if (!this.audioCtx || this.audioCtx.state !== 'running') return;

    // Adjust rain gain
    if (this.rainGain) {
      const targetGain = this.precipIntensity * 0.16;
      this.rainGain.gain.setTargetAtTime(targetGain, this.audioCtx.currentTime, 0.4);
    }

    // Forest sounds: wind in leaves, twig snaps
    const isForest =
      currentBiome &&
      (currentBiome.id === 'forest' ||
        currentBiome.id === 'darkwood' ||
        currentBiome.id === 'maple_forest' ||
        currentBiome.id === 'redwood');

    if (isForest) {
      this.leafSoundTimer -= dt;
      if (this.leafSoundTimer <= 0) {
        this.leafSoundTimer = 6.0 + Math.random() * 10.0;
        this._playTwigSnapSound();
      }
    }

    // Summer night crickets
    if (this.season === 'summer' && this.isNight() && !this.precipIntensity) {
      this.cricketTimer -= dt;
      if (this.cricketTimer <= 0) {
        this.cricketTimer = 2.5 + Math.random() * 3.0;
        this._playCricketChirp();
      }
    }
  }

  _playThunderSound() {
    if (!this.audioCtx || this.audioCtx.state !== 'running') return;
    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(90, now);
      osc.frequency.exponentialRampToValueAtTime(25, now + 1.8);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.9);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 2.0);
    } catch (_) {}
  }

  _playTwigSnapSound() {
    if (!this.audioCtx || this.audioCtx.state !== 'running') return;
    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(380, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.05);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.07);
    } catch (_) {}
  }

  _playCricketChirp() {
    if (!this.audioCtx || this.audioCtx.state !== 'running') return;
    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(4200, now);
      osc.frequency.setValueAtTime(4600, now + 0.03);

      gain.gain.setValueAtTime(0.025, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.08);
    } catch (_) {}
  }
}

// Global Singleton
export const climateSystem = new ClimateSystem();
