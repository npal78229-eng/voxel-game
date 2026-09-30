import {
  gapDistance,
  hasLineOfSight,
  getCombatRayEndpoints,
} from '../AttackRange.js';

// ============================================================================
// Section 1.3: Soul Steal (SoulBeamAttack)
// 1.5s channel telegraph with cyan beam; counterplay by breaking line of sight.
// Re-checks hasLineOfSight at STRIKE instant.
// Deals Math.min(Math.floor(currentHP / 2), currentHP - 1), non-lethal (min 1 HP).
// ============================================================================

export class SoulBeamAttack {
  constructor(config = {}) {
    this.id = config.id || 'soul_steal';
    this.name = config.name || 'Soul Steal';
    this.minRange = config.range ? config.range[0] : 6.0;
    this.maxRange = config.range ? config.range[1] : 20.0;
    this.windupTime = config.windupTime ?? 1.5;
    this.cooldown = config.cooldown ?? 30.0;
  }

  canStart(mob, target, world) {
    if (!mob || !target || mob.hp <= 0) return false;
    if (mob.attackPhase && mob.attackPhase !== 'IDLE') return false;
    if ((mob.attackCooldowns?.get(this.id) || 0) > 0) return false;

    const gap = gapDistance(mob, target);
    if (gap < this.minRange || gap > this.maxRange) return false;

    const { from, to } = getCombatRayEndpoints(mob, target);
    return hasLineOfSight(world, from, to);
  }

  start(mob, statusEffects, sfx) {
    mob.attackPhase = 'WINDUP';
    mob.phaseTimer = this.windupTime;
    mob.activeAttackId = this.id;
    mob.activeAttackName = this.name;
    mob.strikeExecuted = false;
    mob.lastAttackOutcome = 'CASTING: SOUL STEAL!';

    if (statusEffects && typeof statusEffects.showWarningBanner === 'function') {
      statusEffects.showWarningBanner(
        '💀 SOUL STEAL! BREAK LINE OF SIGHT!',
        '#22d3ee',
        1500
      );
    }
    if (sfx && typeof sfx.playCastTelegraph === 'function') {
      sfx.playCastTelegraph();
    }
  }

  update(
    dt,
    mob,
    target,
    world,
    nightProjectiles,
    statusEffects,
    onPlayerDamaged,
    sfx,
    playerCurrentHp = 20
  ) {
    if (!mob || mob.hp <= 0) {
      this.cancel(mob, nightProjectiles);
      return { state: 'IDLE' };
    }

    if (!mob.attackPhase || mob.attackPhase === 'IDLE') {
      return { state: 'IDLE' };
    }

    const { from: eyePos, to: chestPos } = getCombatRayEndpoints(mob, target);

    if (mob.attackPhase === 'WINDUP') {
      mob.phaseTimer -= dt;

      // Draw visible cyan tether beam from the Wraith to the player during 1.5s channel
      if (nightProjectiles && typeof nightProjectiles.setSoulBeam === 'function') {
        nightProjectiles.setSoulBeam(true, eyePos, chestPos);
      }

      if (mob.phaseTimer <= 0) {
        mob.attackPhase = 'STRIKE';
        if (nightProjectiles && typeof nightProjectiles.setSoulBeam === 'function') {
          nightProjectiles.setSoulBeam(false);
        }

        // Counterplay: re-evaluate LOS and distance at current positions!
        const gap = gapDistance(mob, target);
        const hasLOS = hasLineOfSight(world, eyePos, chestPos);
        const inRange = gap <= this.maxRange;

        if (hasLOS && inRange && !mob.strikeExecuted) {
          mob.strikeExecuted = true;
          // Calculate non-lethal 50% HP damage (never kills, player never taken below 1 HP)
          const curHp = Math.max(1, playerCurrentHp);
          const rawDamage = Math.min(Math.floor(curHp / 2), curHp - 1);
          const damage = Math.max(0, rawDamage);

          if (typeof onPlayerDamaged === 'function') {
            onPlayerDamaged(damage, 'GrimWraith (Soul Steal)', {
              isSoulSteal: true,
              cyanFlash: true,
            });
          }

          if (statusEffects && typeof statusEffects.applyEffect === 'function') {
            statusEffects.applyEffect('drain', 1.5, 0.5);
          }
          if (sfx && typeof sfx.playPlayerHurt === 'function') {
            sfx.playPlayerHurt();
          }

          mob.lastAttackOutcome = `SOUL STEAL HIT (-${damage} HP)!`;
        } else {
          mob.strikeExecuted = true;
          mob.lastAttackOutcome = 'SOUL STEAL DODGED (LOS BROKEN)!';
          if (statusEffects && typeof statusEffects.showWarningBanner === 'function') {
            statusEffects.showWarningBanner(
              '🛡️ DODGED SOUL STEAL (LINE OF SIGHT BROKEN)!',
              '#4ade80',
              1400
            );
          }
          if (sfx && typeof sfx.playWhooshMiss === 'function') {
            sfx.playWhooshMiss();
          }
        }

        mob.attackPhase = 'RECOVERY';
        mob.phaseTimer = 0.8; // Global recovery window handled by AttackController
      }

      return { state: mob.attackPhase };
    }

    if (mob.attackPhase === 'RECOVERY') {
      mob.phaseTimer -= dt;
      if (mob.phaseTimer <= 0) {
        mob.attackPhase = 'IDLE';
        mob.activeAttackId = '';
        mob.activeAttackName = '';
      }
      return { state: mob.attackPhase };
    }

    return { state: mob.attackPhase };
  }

  cancel(mob, nightProjectiles) {
    if (!mob) return;
    mob.attackPhase = 'IDLE';
    mob.phaseTimer = 0;
    mob.activeAttackId = '';
    mob.activeAttackName = '';
    mob.strikeExecuted = false;
    if (nightProjectiles && typeof nightProjectiles.setSoulBeam === 'function') {
      nightProjectiles.setSoulBeam(false);
    }
  }
}
