import {
  gapDistance,
  inMeleeRange,
  hasLineOfSight,
  getCombatRayEndpoints,
} from '../AttackRange.js';

// ============================================================================
// Task F1 & F3 — 3-Phase Melee Attack Sequence (WINDUP -> STRIKE -> RECOVERY)
// Shared Attack Interface: canStart(mob, target, world), start(mob), update(dt, ...), cancel(mob)
// ============================================================================

export class MeleeAttack {
  constructor(config = {}) {
    this.meleeRange = config.meleeRange ?? 1.5;
    this.reachY = config.reachY ?? 1.0;
    this.windupTime = config.windupTime ?? 0.45;
    this.cooldown = config.cooldown ?? 1.35;
    this.damage = config.damage ?? 3;
    this.knockback = config.knockback ?? 0.5;
  }

  /**
   * A melee mob walks toward the player until gapDistance <= meleeRange - 0.2
   * (or <= meleeRange if stationary), with valid vertical reach and line of sight.
   */
  canStart(mob, target, world) {
    if (!mob || !target || mob.hp <= 0) return false;
    if ((mob.attackPhase && mob.attackPhase !== 'IDLE') || mob.attackCooldown > 0) {
      return false;
    }
    const startThreshold = this.meleeRange;
    if (!inMeleeRange(mob, target, startThreshold, this.reachY)) {
      return false;
    }
    const { from, to } = getCombatRayEndpoints(mob, target);
    return hasLineOfSight(world, from, to);
  }

  start(mob) {
    mob.attackPhase = 'WINDUP';
    mob.phaseTimer = this.windupTime;
    mob.strikeExecuted = false;
    mob.lastAttackOutcome = 'TELEGRAPH!';
    mob.telegraphTimer = this.windupTime;
  }

  /**
   * Advances the 3-phase sequence:
   * - WINDUP: mob telegraphs attack while tracking target.
   * - STRIKE: exact instant when timer hits 0; re-checks inMeleeRange & hasLineOfSight
   *   at CURRENT positions.
   * - COOLDOWN/RECOVERY: waits out cooldown before returning to IDLE.
   */
  update(dt, mob, target, world, onStrikeHit = null, onStrikeMiss = null) {
    if (!mob || mob.hp <= 0) {
      this.cancel(mob);
      return { state: 'IDLE' };
    }

    if (!mob.attackPhase || mob.attackPhase === 'IDLE') {
      if (mob.attackCooldown > 0) {
        mob.attackCooldown = Math.max(0, mob.attackCooldown - dt);
      }
      return { state: 'IDLE' };
    }

    if (mob.attackPhase === 'WINDUP') {
      mob.phaseTimer -= dt;
      if (mob.phaseTimer <= 0) {
        // Transition to instantaneous STRIKE verification
        mob.attackPhase = 'STRIKE';
        const stillInRange = inMeleeRange(
          mob,
          target,
          this.meleeRange + 0.65,
          this.reachY + 0.5
        );
        const { from, to } = getCombatRayEndpoints(mob, target);
        const stillHasLOS = hasLineOfSight(world, from, to);

        if (stillInRange && stillHasLOS && !mob.strikeExecuted) {
          mob.strikeExecuted = true;
          mob.lastAttackOutcome = 'HIT!';
          if (typeof onStrikeHit === 'function') {
            onStrikeHit({
              mob,
              damage: this.damage,
              knockback: this.knockback,
              gap: gapDistance(mob, target),
            });
          }
        } else {
          mob.strikeExecuted = true;
          mob.lastAttackOutcome = 'WHOOSH (MISS!)';
          mob.missAnimTimer = 0.45;
          if (typeof onStrikeMiss === 'function') {
            onStrikeMiss({
              mob,
              reason: !stillInRange ? 'OUT_OF_RANGE' : 'BLOCKED_LOS',
              gap: gapDistance(mob, target),
            });
          }
        }

        // Immediately enter RECOVERY / COOLDOWN
        mob.attackPhase = 'RECOVERY';
        mob.phaseTimer = this.cooldown;
        mob.attackCooldown = this.cooldown;
      }
      return { state: mob.attackPhase };
    }

    if (mob.attackPhase === 'RECOVERY') {
      mob.phaseTimer -= dt;
      mob.attackCooldown = Math.max(0, mob.phaseTimer);
      if (mob.phaseTimer <= 0) {
        mob.attackPhase = 'IDLE';
        mob.phaseTimer = 0;
        mob.lastAttackOutcome = '';
      }
      return { state: mob.attackPhase };
    }

    return { state: mob.attackPhase };
  }

  cancel(mob) {
    if (!mob) return;
    mob.attackPhase = 'IDLE';
    mob.phaseTimer = 0;
    mob.strikeExecuted = false;
    mob.lastAttackOutcome = '';
  }
}
