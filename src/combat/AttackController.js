import {
  gapDistance,
  inMeleeRange,
  hasLineOfSight,
  getCombatRayEndpoints,
} from './AttackRange.js';
import { MeleeAttack } from './attacks/MeleeAttack.js';
import { SoulBeamAttack } from './attacks/SoulBeamAttack.js';

export const GLOBAL_ATTACK_DELAY_SECONDS = 0.8;

// ============================================================================
// Multi-Attack Controller (Task 1.2 & 1.3)
// - Supports mobs with multiple attacks (e.g. GrimWraith: Scythe, Summon, Soul Steal)
// - Automatically wraps single-attack mobs into an attacks array
// - Tracks separate cooldowns per attack
// - Enforces 0.8s global delay after any attack finishes
// - Manages WINDUP (mob stops moving) -> STRIKE -> RECOVERY
// - Provides /forceattack testing entry point
// ============================================================================

export class AttackController {
  constructor(config = {}) {
    this.config = config;
    this.mobType = config.id || config.type || 'Mob';
    this.globalDelayTimer = 0;
    this.activeAttack = null;
    this.cooldowns = new Map();

    // Instantiate sub-handlers for specialized attack types
    this.meleeHandler = new MeleeAttack(config);
    this.soulBeamHandler = new SoulBeamAttack({
      id: 'soul_steal',
      name: 'Soul Steal',
      range: [6.0, 20.0],
      windupTime: 1.5,
      cooldown: 30.0,
    });

    // Wrap single-attack mobs or load attacks array
    this.attacks = this._initAttacks(config);
    for (const atk of this.attacks) {
      this.cooldowns.set(atk.id, 0);
    }
  }

  _initAttacks(config) {
    if (Array.isArray(config.attacks) && config.attacks.length > 0) {
      return config.attacks.map((a) => ({
        id: a.id || 'attack',
        name: a.name || a.label || a.id,
        type: a.type || 'melee',
        weight: a.weight ?? 1,
        range: a.range || [0, a.meleeRange || 1.5],
        meleeRange: a.meleeRange ?? (a.range ? a.range[1] : 1.5),
        reachY: a.reachY ?? config.reachY ?? 1.0,
        windupTime: a.windupTime ?? a.windup ?? 0.45,
        cooldown: a.cooldown ?? 1.4,
        damage: a.damage ?? config.damage ?? 3,
        knockback: a.knockback ?? config.knockback ?? 0.5,
        maxSummons: a.maxSummons ?? 3,
        ...a,
      }));
    }

    // Wrap single attackType mob into attacks array
    const atkType = config.attackType || 'melee';
    return [
      {
        id: 'primary_attack',
        name: config.label || `${atkType} attack`,
        type: atkType,
        weight: 1,
        range: [0, config.meleeRange || 1.5],
        meleeRange: config.meleeRange || 1.5,
        castRange: config.castRange || 14.0,
        reachY: config.reachY || 1.0,
        windupTime: config.windupTime || 0.45,
        cooldown: config.cooldown || 1.4,
        damage: config.damage ?? 3,
        knockback: config.knockback ?? 0.5,
        minComfortDist: config.minComfortDist,
        retreatDuration: config.retreatDuration,
      },
    ];
  }

  /**
   * Selection logic:
   * - Respects cooldowns and global 0.8s delay
   * - GrimWraith priority rules:
   *    * gap > 6: prefer Soul Steal if ready, else Summon if < 3 alive, else move closer
   *    * gap <= 3.5: Scythe Slash (or Summon only if Scythe not ready)
   * - General mobs: weighted random selection among ready attacks within range and line-of-sight.
   */
  selectReadyAttack(mob, playerTarget, world, options = {}) {
    if (this.globalDelayTimer > 0 || this.activeAttack) return null;
    if (mob.attackPhase && mob.attackPhase !== 'IDLE') return null;

    const gap = gapDistance(mob, playerTarget);
    const { from: eyePos, to: chestPos } = getCombatRayEndpoints(mob, playerTarget);
    const hasLOS = hasLineOfSight(world, eyePos, chestPos);

    const aliveSummons = Array.isArray(mob.summoned)
      ? mob.summoned.filter((s) => s && s.hp > 0).length
      : 0;

    // GrimWraith Signature Selection Logic
    if (this.mobType === 'GrimWraith') {
      const scytheAtk = this.attacks.find((a) => a.id === 'scythe_slash');
      const summonAtk = this.attacks.find((a) => a.id === 'summon_skeletons');
      const soulStealAtk = this.attacks.find((a) => a.id === 'soul_steal');

      const scytheCd = scytheAtk ? this.cooldowns.get(scytheAtk.id) || 0 : 999;
      const summonCd = summonAtk ? this.cooldowns.get(summonAtk.id) || 0 : 999;
      const soulCd = soulStealAtk ? this.cooldowns.get(soulStealAtk.id) || 0 : 999;

      const scytheReady =
        scytheAtk &&
        scytheCd <= 0 &&
        inMeleeRange(mob, playerTarget, scytheAtk.meleeRange || 3.5, scytheAtk.reachY || 1.2) &&
        hasLOS;

      const summonReady =
        summonAtk &&
        summonCd <= 0 &&
        aliveSummons < (summonAtk.maxSummons || 3);

      const soulReady =
        soulStealAtk &&
        soulCd <= 0 &&
        gap >= 6.0 &&
        gap <= 20.0 &&
        hasLOS;

      // 1. Player farther than 6: prefer Soul Steal when ready, otherwise Summon, otherwise move closer
      if (gap > 6.0) {
        if (soulReady) return soulStealAtk;
        if (summonReady) return summonAtk;
        return null;
      }

      // 2. Player within 3.5: Scythe Slash! Never cast Summon in melee range unless Scythe on CD
      if (gap <= 3.5) {
        if (scytheReady) return scytheAtk;
        if (summonReady && scytheCd > 0) return summonAtk;
        return null;
      }

      // 3. Distance 3.5 to 6.0: Summon if ready, otherwise close distance
      if (summonReady) return summonAtk;
      return null;
    }

    // General Mob Selection Logic
    const candidates = [];
    let totalWeight = 0;

    for (const atk of this.attacks) {
      const cd = this.cooldowns.get(atk.id) || 0;
      if (cd > 0) continue;

      const [minR, maxR] = atk.range || [0, 2];
      if (gap < minR || gap > maxR) continue;

      if (atk.type === 'melee') {
        if (!inMeleeRange(mob, playerTarget, atk.meleeRange || maxR, atk.reachY || 1.0)) {
          continue;
        }
      }

      if (atk.type === 'summon') {
        if (aliveSummons >= (atk.maxSummons || 3)) continue;
      }

      // All attacks require line of sight
      if (!hasLOS) continue;

      const w = atk.weight || 1;
      candidates.push({ atk, weight: w });
      totalWeight += w;
    }

    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0].atk;

    let r = Math.random() * totalWeight;
    for (const c of candidates) {
      r -= c.weight;
      if (r <= 0) return c.atk;
    }
    return candidates[0].atk;
  }

  /**
   * Starts WINDUP telegraph for the chosen attack.
   */
  startAttack(mob, atk, statusEffects = null, sfx = null) {
    this.activeAttack = atk;
    const burnMult = mob.burning ? 1.3 : 1.0;
    mob.phaseTimer = (atk.windupTime || 0.5) * burnMult;
    mob.attackPhase = 'WINDUP';
    mob.state = 'WindupStop';
    mob.activeAttackId = atk.id;
    mob.activeAttackName = atk.name || atk.id;
    mob.lastAttackOutcome = `WINDUP: ${atk.name || atk.id}`;
    mob.strikeExecuted = false;

    // Visual & audio telegraph hooks
    if (atk.id === 'soul_steal' || atk.type === 'soul_beam') {
      if (statusEffects?.showWarningBanner) {
        statusEffects.showWarningBanner(
          '💀 SOUL STEAL! BREAK LINE OF SIGHT!',
          '#22d3ee',
          1500
        );
      }
      sfx?.playCastTelegraph();
    } else if (atk.id === 'summon_skeletons' || atk.type === 'summon') {
      if (statusEffects?.showWarningBanner) {
        statusEffects.showWarningBanner(
          '⚡ THE WRAITH CHANTS... SOUL SKELETONS ARISE!',
          '#06b6d4',
          1400
        );
      }
      sfx?.playCastTelegraph();
    } else if (atk.id === 'scythe_slash') {
      // Pose scythe overhead
      if (mob.arms && mob.arms[0]) {
        mob.arms[0].rotation.y = 1.6;
        mob.arms[0].rotation.x = -0.4;
      }
    } else if (atk.id === 'claw_scratch') {
      // Pose skeleton claw arm forward/up
      if (mob.arms && mob.arms[1]) {
        mob.arms[1].rotation.y = 1.5;
      }
    }
  }

  /**
   * Updates attack state machine: WINDUP -> STRIKE -> RECOVERY (0.8s global delay) -> IDLE.
   */
  update(
    dt,
    mob,
    playerTarget,
    world,
    callbacks = {}
  ) {
    const {
      onPlayerDamaged,
      onSummon,
      nightProjectiles,
      statusEffects,
      sfx,
      playerCurrentHp = 20,
    } = callbacks;

    // Tick per-attack cooldowns
    for (const [id, cd] of this.cooldowns.entries()) {
      if (cd > 0) {
        this.cooldowns.set(id, Math.max(0, cd - dt));
      }
    }

    // Tick global delay timer
    if (this.globalDelayTimer > 0) {
      this.globalDelayTimer = Math.max(0, this.globalDelayTimer - dt);
      if (this.globalDelayTimer <= 0 && mob.attackPhase === 'RECOVERY') {
        mob.attackPhase = 'IDLE';
        mob.activeAttackId = '';
        mob.activeAttackName = '';
        this.activeAttack = null;
      }
    }

    if (!this.activeAttack || mob.attackPhase === 'IDLE') {
      return { state: 'IDLE' };
    }

    const atk = this.activeAttack;
    const { from: eyePos, to: chestPos } = getCombatRayEndpoints(mob, playerTarget);

    if (mob.attackPhase === 'WINDUP') {
      mob.phaseTimer -= dt;

      // Soul Steal cyan tether line update during channel
      if (atk.id === 'soul_steal' || atk.type === 'soul_beam') {
        nightProjectiles?.setSoulBeam(true, eyePos, chestPos);
      }

      // Procedural Windup Poses
      if (atk.id === 'scythe_slash' && mob.arms && mob.arms[0]) {
        // Scythe raised overhead, pulsing
        const p = 1.5 + Math.sin(performance.now() * 0.02) * 0.2;
        mob.arms[0].rotation.y = p;
        mob.arms[0].rotation.x = -0.3;
      } else if ((atk.id === 'summon_skeletons' || atk.type === 'summon') && mob.arms) {
        if (mob.arms[0]) mob.arms[0].rotation.y = 1.8;
        if (mob.arms[1]) mob.arms[1].rotation.y = 1.8;
      } else if (atk.id === 'claw_scratch' && mob.arms && mob.arms[1]) {
        mob.arms[1].rotation.y = 1.4 + Math.sin(performance.now() * 0.03) * 0.25;
      }

      if (mob.phaseTimer <= 0) {
        // STRIKE Instant!
        this._executeStrike(
          mob,
          atk,
          playerTarget,
          world,
          eyePos,
          chestPos,
          callbacks,
          playerCurrentHp
        );
      }

      return { state: mob.attackPhase };
    }

    if (mob.attackPhase === 'RECOVERY') {
      mob.phaseTimer -= dt;
      if (mob.phaseTimer <= 0) {
        mob.attackPhase = 'IDLE';
        mob.activeAttackId = '';
        mob.activeAttackName = '';
        this.activeAttack = null;
      }
      return { state: mob.attackPhase };
    }

    return { state: mob.attackPhase };
  }

  _executeStrike(
    mob,
    atk,
    playerTarget,
    world,
    eyePos,
    chestPos,
    callbacks,
    playerCurrentHp
  ) {
    const {
      onPlayerDamaged,
      onSummon,
      nightProjectiles,
      statusEffects,
      sfx,
    } = callbacks;

    mob.attackPhase = 'STRIKE';
    mob.strikeExecuted = true;
    nightProjectiles?.setSoulBeam(false);

    // 1. Melee Attacks (Scythe Slash, Claw Scratch, standard Melee)
    if (atk.type === 'melee') {
      const inRange = inMeleeRange(
        mob,
        playerTarget,
        atk.meleeRange || (atk.range ? atk.range[1] : 1.5),
        atk.reachY || 1.0
      );
      const hasLOS = hasLineOfSight(world, eyePos, chestPos);

      // Swing scythe down / swipe claw arm forward
      if (atk.id === 'scythe_slash' && mob.arms && mob.arms[0]) {
        mob.arms[0].rotation.y = -0.7;
        mob.arms[0].rotation.x = 0.5;
      } else if (atk.id === 'claw_scratch' && mob.arms && mob.arms[1]) {
        mob.arms[1].rotation.y = -0.6;
      }

      if (inRange && hasLOS) {
        const dmg = atk.damage ?? 3;
        const kb = atk.knockback ?? 0.5;
        if (typeof onPlayerDamaged === 'function') {
          onPlayerDamaged(dmg, `${this.mobType} (${atk.name})`, { knockback: kb });
        }
        mob.lastAttackOutcome = `HIT (${atk.name})!`;
      } else {
        mob.lastAttackOutcome = `WHOOSH MISS (${atk.name})!`;
        mob.missAnimTimer = 0.45;
        sfx?.playWhooshMiss();
      }
    }

    // 2. Summon Skeletons
    else if (atk.type === 'summon' || atk.id === 'summon_skeletons') {
      if (typeof onSummon === 'function') {
        const count = onSummon(mob, atk.maxSummons || 3);
        mob.lastAttackOutcome = `SUMMONED ${count}x SKELETONS!`;
      }
    }

    // 3. Soul Steal
    else if (atk.type === 'soul_beam' || atk.id === 'soul_steal') {
      const gap = gapDistance(mob, playerTarget);
      const hasLOS = hasLineOfSight(world, eyePos, chestPos);
      const inRange = gap <= (atk.range ? atk.range[1] : 20.0);

      if (hasLOS && inRange) {
        const curHp = Math.max(1, playerCurrentHp);
        const rawDmg = Math.min(Math.floor(curHp / 2), curHp - 1);
        const damage = Math.max(0, rawDmg);

        if (typeof onPlayerDamaged === 'function') {
          onPlayerDamaged(damage, 'GrimWraith (Soul Steal)', {
            isSoulSteal: true,
            cyanFlash: true,
          });
        }
        statusEffects?.applyEffect('drain', 1.5, 0.5);
        sfx?.playPlayerHurt();
        mob.lastAttackOutcome = `SOUL STEAL HIT (-${damage} HP)!`;
      } else {
        mob.lastAttackOutcome = 'SOUL STEAL DODGED (LOS BROKEN)!';
        statusEffects?.showWarningBanner(
          '🛡️ DODGED SOUL STEAL (LINE OF SIGHT BROKEN)!',
          '#4ade80',
          1400
        );
        sfx?.playWhooshMiss();
      }
    }

    // Set cooldown for this specific attack
    this.cooldowns.set(atk.id, atk.cooldown || 2.0);

    // Enter RECOVERY with mandatory 0.8s global delay
    mob.attackPhase = 'RECOVERY';
    this.globalDelayTimer = GLOBAL_ATTACK_DELAY_SECONDS;
    mob.phaseTimer = GLOBAL_ATTACK_DELAY_SECONDS;
  }

  /**
   * Forces the mob to execute a specific attack immediately (testing tool /forceattack).
   */
  forceAttack(mob, attackId, playerTarget, world, statusEffects = null, sfx = null) {
    const targetAtk = this.attacks.find(
      (a) => a.id.toLowerCase() === attackId.toLowerCase()
    );
    if (!targetAtk) return false;

    this.cooldowns.set(targetAtk.id, 0);
    this.globalDelayTimer = 0;
    this.startAttack(mob, targetAtk, statusEffects, sfx);
    return true;
  }

  cancel(mob, nightProjectiles = null) {
    if (!mob) return;
    mob.attackPhase = 'IDLE';
    mob.phaseTimer = 0;
    mob.activeAttackId = '';
    mob.activeAttackName = '';
    mob.strikeExecuted = false;
    this.activeAttack = null;
    this.globalDelayTimer = 0;
    nightProjectiles?.setSoulBeam(false);
  }
}
