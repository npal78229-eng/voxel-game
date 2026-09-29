// ============================================================================
// Phase 2 — Player Status Effect Manager & HUD Visuals (src/statusEffects.js)
// Effects: poison, bleed, stagger (Poise Break), fear, weakness, drain (Soul Drain)
// ============================================================================

export const STATUS_EFFECT_SPECS = {
  poison: {
    id: 'poison',
    label: 'POISON',
    icon: '☣️',
    badgeBg: 'rgba(22, 163, 74, 0.88)',
    borderColor: '#4ade80',
    defaultDuration: 6.0,
    maxStacks: 1,
  },
  bleed: {
    id: 'bleed',
    label: 'BLEED',
    icon: '🩸',
    badgeBg: 'rgba(185, 28, 28, 0.88)',
    borderColor: '#f87171',
    defaultDuration: 5.0,
    maxStacks: 3,
  },
  stagger: {
    id: 'stagger',
    label: 'STAGGERED',
    icon: '⚡',
    badgeBg: 'rgba(217, 119, 6, 0.92)',
    borderColor: '#facc15',
    defaultDuration: 0.8,
    maxStacks: 1,
  },
  fear: {
    id: 'fear',
    label: 'FEAR / DARKNESS',
    icon: '👁️',
    badgeBg: 'rgba(15, 23, 42, 0.94)',
    borderColor: '#94a3b8',
    defaultDuration: 5.0,
    maxStacks: 1,
  },
  weakness: {
    id: 'weakness',
    label: 'WEAKNESS',
    icon: '🛡️',
    badgeBg: 'rgba(71, 85, 105, 0.9)',
    borderColor: '#cbd5e1',
    defaultDuration: 8.0,
    maxStacks: 1,
  },
  drain: {
    id: 'drain',
    label: 'SOUL DRAIN',
    icon: '💀',
    badgeBg: 'rgba(8, 145, 178, 0.92)',
    borderColor: '#22d3ee',
    defaultDuration: 1.5,
    maxStacks: 1,
  },
};

export class PlayerStatusEffects {
  constructor(playerStats, sfx = null, onStatsChanged = null) {
    this.playerStats = playerStats;
    this.sfx = sfx;
    this.onStatsChanged = onStatsChanged;
    this.effects = new Map(); // id -> { id, timeLeft, duration, power, stacks, tickAccum }
    this.staggerImmunityTimer = 0; // 3.0s immunity after Poise Break ends so it can NEVER chain-lock
    this.cameraShakeOffset = { x: 0, y: 0, pitch: 0, yaw: 0 };

    this._initDOMOverlays();
  }

  _initDOMOverlays() {
    if (typeof document === 'undefined') return;

    // 1. Full-screen vignette overlay for Poison (green), Bleed (red drip), Fear (tight black), Soul Drain (cyan)
    let vignette = document.getElementById('status-effect-vignette');
    if (!vignette) {
      vignette = document.createElement('div');
      vignette.id = 'status-effect-vignette';
      Object.assign(vignette.style, {
        position: 'fixed',
        inset: '0',
        pointerEvents: 'none',
        zIndex: '28',
        transition: 'box-shadow 0.2s ease, background 0.2s ease',
      });
      document.body.appendChild(vignette);
    }
    this.vignetteEl = vignette;

    // 2. Boss-style warning banner ("SOUL STEAL!" / "STAGGERED!")
    let banner = document.getElementById('combat-warning-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'combat-warning-banner';
      Object.assign(banner.style, {
        position: 'fixed',
        top: '22%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        padding: '8px 22px',
        borderRadius: '8px',
        fontFamily: 'monospace',
        fontSize: '22px',
        fontWeight: '900',
        letterSpacing: '2px',
        color: '#ffffff',
        background: 'rgba(15, 23, 42, 0.85)',
        border: '2px solid #22d3ee',
        textShadow: '0 0 12px #22d3ee',
        pointerEvents: 'none',
        zIndex: '45',
        display: 'none',
      });
      document.body.appendChild(banner);
    }
    this.bannerEl = banner;

    // 3. Active Status Effects Bar right next to #hearts-bar
    let bar = document.getElementById('status-effects-hud-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'status-effects-hud-bar';
      Object.assign(bar.style, {
        position: 'fixed',
        bottom: '84px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: '8px',
        pointerEvents: 'none',
        zIndex: '35',
      });
      document.body.appendChild(bar);
    }
    this.barEl = bar;
  }

  showWarningBanner(text, borderColor = '#22d3ee', durationMs = 1500) {
    if (!this.bannerEl) return;
    this.bannerEl.textContent = text;
    this.bannerEl.style.borderColor = borderColor;
    this.bannerEl.style.textShadow = `0 0 12px ${borderColor}`;
    this.bannerEl.style.display = 'block';
    clearTimeout(this._bannerTimeout);
    this._bannerTimeout = setTimeout(() => {
      if (this.bannerEl) this.bannerEl.style.display = 'none';
    }, durationMs);
  }

  /**
   * Applies or refreshes a status effect on the player.
   * - Applying an active effect refreshes duration (Bleed stacks up to 3x).
   * - Stagger checks the 3.0s immunity window first.
   * - Soul Drain ('drain') immediately halves current HP (rounded down, never below 1 HP).
   */
  applyEffect(rawId, duration = null, power = 1) {
    const id = String(rawId || '').toLowerCase();
    const spec = STATUS_EFFECT_SPECS[id];
    if (!spec) return false;

    // Stagger Poise Break check: cannot chain-lock during 3s immunity window
    if (id === 'stagger') {
      if (this.staggerImmunityTimer > 0 || this.effects.has('stagger')) {
        return false;
      }
      this.showWarningBanner('⚡ POISE BROKEN — STAGGERED!', '#facc15', 900);
      this.cameraShakeOffset.x = (Math.random() - 0.5) * 0.14;
      this.cameraShakeOffset.y = (Math.random() - 0.5) * 0.14;
      this.cameraShakeOffset.pitch = this.cameraShakeOffset.y;
      this.cameraShakeOffset.yaw = this.cameraShakeOffset.x;
    }

    // Soul Drain instant effect: removes 50% of current HP (rounded down, never below 1 HP)
    if (id === 'drain') {
      const currentHp = this.playerStats.hp;
      const drainedAmount = Math.floor(currentHp * 0.5);
      this.playerStats.hp = Math.max(1, currentHp - drainedAmount);
      this.showWarningBanner(
        `💀 SOUL DRAINED (-${drainedAmount} HP)!`,
        '#22d3ee',
        1600
      );
      if (typeof this.onStatsChanged === 'function') {
        this.onStatsChanged();
      }
    }

    const dur = duration !== null ? Number(duration) : spec.defaultDuration;
    const existing = this.effects.get(id);

    if (existing) {
      existing.timeLeft = Math.max(existing.timeLeft, dur);
      existing.duration = Math.max(existing.duration, dur);
      if (id === 'bleed') {
        existing.stacks = Math.min(spec.maxStacks, existing.stacks + 1);
      }
    } else {
      this.effects.set(id, {
        id,
        spec,
        timeLeft: dur,
        duration: dur,
        power: Number(power) || 1,
        stacks: 1,
        tickAccum: 0,
      });
    }

    this._syncHUDVisuals();
    return true;
  }

  hasEffect(id) {
    return this.effects.has(String(id || '').toLowerCase());
  }

  clearAllEffects() {
    this.effects.clear();
    this.staggerImmunityTimer = 0;
    this.cameraShakeOffset.x = 0;
    this.cameraShakeOffset.y = 0;
    this.cameraShakeOffset.pitch = 0;
    this.cameraShakeOffset.yaw = 0;
    this._syncHUDVisuals();
  }

  getMovementSpeedMultiplier() {
    if (this.effects.has('stagger')) return 0.2; // Poise Break: speed x0.2
    return 1.0;
  }

  getMeleeDamageMultiplier() {
    if (this.effects.has('weakness')) return 0.5; // Weakness: player melee damage x0.5
    return 1.0;
  }

  getMiningSpeedMultiplier() {
    if (this.effects.has('weakness')) return 0.55;
    return 1.0;
  }

  canPlayerAttack() {
    return !this.effects.has('stagger');
  }

  canPlayerSprint() {
    return !this.effects.has('stagger') && !this.effects.has('fear');
  }

  canNaturalRegen() {
    return !this.effects.has('poison') && !this.effects.has('fear');
  }

  /**
   * Updates all active status effects every frame.
   */
  update(deltaTime) {
    if (this.staggerImmunityTimer > 0) {
      this.staggerImmunityTimer = Math.max(
        0,
        this.staggerImmunityTimer - deltaTime
      );
    }

    if (this.effects.has('stagger')) {
      this.cameraShakeOffset.x = Math.sin(performance.now() * 0.055) * 0.08;
      this.cameraShakeOffset.y = Math.cos(performance.now() * 0.048) * 0.06;
    } else {
      this.cameraShakeOffset.x = 0;
      this.cameraShakeOffset.y = 0;
    }

    if (this.effects.size === 0) {
      this.cameraShakeOffset.pitch *= 0.8;
      this.cameraShakeOffset.yaw *= 0.8;
      return;
    }

    let statsDirty = false;

    for (const [id, entry] of this.effects.entries()) {
      entry.timeLeft -= deltaTime;
      entry.tickAccum += deltaTime;

      if (id === 'poison') {
        // 1 HP per second for duration. Cannot kill (stops at 1 HP).
        if (entry.tickAccum >= 1.0) {
          entry.tickAccum -= 1.0;
          if (this.playerStats.hp > 1) {
            this.playerStats.hp = Math.max(1, this.playerStats.hp - 1);
            statsDirty = true;
          }
        }
      } else if (id === 'bleed') {
        // 0.5 HP every 1.5s, stacks up to 3 times
        if (entry.tickAccum >= 1.5) {
          entry.tickAccum -= 1.5;
          const dmg = 0.5 * entry.stacks;
          this.playerStats.hp = Math.max(0, this.playerStats.hp - dmg);
          statsDirty = true;
        }
      } else if (id === 'stagger') {
        // Camera jerk while staggered
        this.cameraShakeOffset.pitch =
          Math.sin(performance.now() * 0.045) * 0.035;
        this.cameraShakeOffset.yaw =
          Math.cos(performance.now() * 0.055) * 0.045;
      }

      if (entry.timeLeft <= 0) {
        if (id === 'stagger') {
          // Grant 3.0s stagger immunity window after Poise Break expires
          this.staggerImmunityTimer = 3.0;
          this.cameraShakeOffset.pitch = 0;
          this.cameraShakeOffset.yaw = 0;
        }
        this.effects.delete(id);
      }
    }

    if (statsDirty && typeof this.onStatsChanged === 'function') {
      this.onStatsChanged();
    }
    this._syncHUDVisuals();
  }

  _syncHUDVisuals() {
    if (typeof document === 'undefined') return;

    // 1. Update Status Effect Badges & Timers
    if (this.barEl) {
      this.barEl.innerHTML = '';
      for (const entry of this.effects.values()) {
        const badge = document.createElement('div');
        Object.assign(badge.style, {
          padding: '4px 10px',
          borderRadius: '6px',
          background: entry.spec.badgeBg,
          border: `1.5px solid ${entry.spec.borderColor}`,
          color: '#ffffff',
          fontFamily: 'monospace',
          fontSize: '12px',
          fontWeight: '700',
          boxShadow: '0 2px 6px rgba(0,0,0,0.45)',
        });
        const stackTxt = entry.stacks > 1 ? ` x${entry.stacks}` : '';
        badge.textContent = `${entry.spec.icon} ${entry.spec.label}${stackTxt} (${entry.timeLeft.toFixed(1)}s)`;
        this.barEl.appendChild(badge);
      }
    }

    // 2. Update Heart Bar Tints (Poison = green, Weakness = grey, Bleed = red drip)
    const heartsBar = document.getElementById('hearts-bar');
    if (heartsBar) {
      if (this.effects.has('poison')) {
        heartsBar.style.filter = 'hue-rotate(110deg) saturate(1.6)';
      } else if (this.effects.has('weakness')) {
        heartsBar.style.filter = 'grayscale(0.82) brightness(0.85)';
      } else if (this.effects.has('bleed')) {
        heartsBar.style.filter = 'drop-shadow(0 3px 5px #ef4444) saturate(1.5)';
      } else {
        heartsBar.style.filter = 'none';
      }
    }

    // 3. Update Full-Screen Vignette Overlay
    if (this.vignetteEl) {
      if (this.effects.has('drain')) {
        this.vignetteEl.style.boxShadow =
          'inset 0 0 110px 38px rgba(34, 211, 238, 0.72)';
        this.vignetteEl.style.background = 'rgba(6, 182, 212, 0.16)';
      } else if (this.effects.has('fear')) {
        this.vignetteEl.style.boxShadow =
          'inset 0 0 180px 95px rgba(2, 6, 23, 0.94)';
        this.vignetteEl.style.background = 'rgba(2, 6, 23, 0.52)';
      } else if (this.effects.has('poison')) {
        this.vignetteEl.style.boxShadow =
          'inset 0 0 90px 28px rgba(22, 163, 74, 0.55)';
        this.vignetteEl.style.background = 'transparent';
      } else if (this.effects.has('bleed')) {
        this.vignetteEl.style.boxShadow =
          'inset 0 0 85px 26px rgba(220, 38, 38, 0.58)';
        this.vignetteEl.style.background = 'transparent';
      } else {
        this.vignetteEl.style.boxShadow = 'none';
        this.vignetteEl.style.background = 'transparent';
      }
    }
  }
}
