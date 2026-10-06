import {
  gapDistance,
  inMeleeRange,
  hasLineOfSight,
  getCombatRayEndpoints,
} from './combat/AttackRange.js';

// ============================================================================
// Sections 1, 3, 4, 5, 6 — Night Mob 3-Attack Definitions & Combat State Machine
// ============================================================================

export const NIGHT_MOB_DAMAGE_MULT = 1.0;
export const GLOBAL_ATTACK_DELAY_SECONDS = 0.8; // Mandatory 0.8s recovery delay after any attack

export const NIGHT_MOB_STATS = {
  BloodCrawler: { maxHp: 20, speed: 2.35, canClimbLedge: true, knockbackResist: 0.1 },
  GrimWraith: { maxHp: 30, speed: 1.75, hovers: true, knockbackResist: 0.35 },
  ShadowStalker: { maxHp: 40, speed: 2.1, stalksAtRange: [10, 14], knockbackResist: 0.25 },
  FleshGhoul: { maxHp: 50, speed: 1.85, chargesAboveDist: 8.0, knockbackResist: 0.75 },
};

/**
 * Each of the 4 Night Mobs has exactly 3 attacks:
 * 1) Close melee, 2) Ranged / Mid cone, 3) Special / Summon / Area effect.
 */
export const NIGHT_MOB_ATTACKS = {
  // --------------------------------------------------------------------------
  // Section 3: BloodCrawler (Abyssal Spider) — HP: 20
  // --------------------------------------------------------------------------
  BloodCrawler: [
    {
      id: 'pounce_slam',
      name: 'Pounce Slam',
      range: [0, 3.0],
      windup: 0.5,
      cooldown: 4.5,
      damage: 3,
      type: 'melee',
      weight: 50,
      effect: { id: 'stagger', duration: 0.8, power: 1 },
    },
    {
      id: 'poison_spit',
      name: 'Poison Spit',
      range: [5.0, 16.0],
      windup: 0.6,
      cooldown: 5.0,
      damage: 2,
      type: 'projectile',
      projectileKind: 'poison_spit',
      speed: 11.5,
      gravity: 4.2,
      leavesPuddle: true,
      weight: 70,
      effect: { id: 'poison', duration: 6.0, power: 1 },
    },
    {
      id: 'venom_bite',
      name: 'Venom Bite',
      range: [0, 2.2],
      windup: 0.4,
      cooldown: 2.2,
      damage: 5, // Multiplied x1.5 if target is staggered (Poise Broken)!
      staggerBonusMult: 1.5,
      type: 'melee',
      weight: 50,
      effect: null,
    },
  ],

  // --------------------------------------------------------------------------
  // Section 4: GrimWraith (Hooded Soul Reaper) — HP: 30
  // --------------------------------------------------------------------------
  GrimWraith: [
    {
      id: 'scythe_slash',
      name: 'Scythe Slash',
      range: [0, 3.5],
      windup: 0.6,
      cooldown: 2.4,
      damage: 4,
      knockback: 0.75,
      type: 'melee',
      weight: 60,
      effect: null,
    },
    {
      id: 'summon_skeletons',
      name: 'Summon Skeletons',
      range: [0, 22.0],
      windup: 1.5,
      cooldown: 25.0,
      damage: 0,
      type: 'summon',
      maxSummons: 3,
      weight: 80,
      effect: null,
    },
    {
      id: 'soul_steal',
      name: 'Soul Steal',
      range: [6.0, 20.0],
      windup: 1.5, // 1.5s long cast with cyan beam tether; dodgeable by breaking LOS!
      cooldown: 30.0,
      damage: 0,
      type: 'special',
      weight: 90,
      effect: { id: 'drain', duration: 1.5, power: 0.5 },
    },
  ],

  // --------------------------------------------------------------------------
  // Section 5: ShadowStalker (Wendigo) — HP: 40
  // --------------------------------------------------------------------------
  ShadowStalker: [
    {
      id: 'claw_rake',
      name: 'Claw Rake',
      range: [0, 3.5],
      windup: 0.5,
      cooldown: 2.6,
      damage: 6, // 3 damage x 2 quick swipes
      type: 'melee',
      weight: 55,
      effect: { id: 'bleed', duration: 5.0, power: 1 },
    },
    {
      id: 'bone_javelin',
      name: 'Bone Javelin',
      range: [6.0, 18.0],
      windup: 0.7,
      cooldown: 4.5,
      damage: 4,
      type: 'projectile',
      projectileKind: 'bone_javelin',
      speed: 17.0,
      gravity: 0.35,
      weight: 65,
      effect: null,
    },
    {
      id: 'hunger_screech',
      name: 'Hunger Screech',
      range: [0, 12.0],
      windup: 1.0,
      cooldown: 20.0,
      damage: 1,
      type: 'aoe',
      drainsStamina: true,
      weight: 85,
      effect: { id: 'fear', duration: 5.0, power: 1 },
    },
  ],

  // --------------------------------------------------------------------------
  // Section 6: FleshGhoul (Mutant Night Crawler) — HP: 50
  // --------------------------------------------------------------------------
  FleshGhoul: [
    {
      id: 'bone_blade_swing',
      name: 'Bone Blade Swing',
      range: [0, 3.2],
      windup: 0.6,
      cooldown: 2.5,
      damage: 5,
      knockback: 0.95,
      type: 'melee',
      weight: 60,
      effect: null,
    },
    {
      id: 'toxic_vomit',
      name: 'Toxic Vomit',
      range: [2.0, 8.0],
      windup: 0.8,
      cooldown: 7.0,
      damage: 1, // 1 damage per 0.3s in cone over 1.2s
      coneDuration: 1.2,
      coneTickInterval: 0.3,
      type: 'cone',
      weight: 65,
      effect: { id: 'weakness', duration: 8.0, power: 1 },
    },
    {
      id: 'spike_volley',
      name: 'Spike Volley',
      range: [6.0, 16.0],
      windup: 0.7,
      cooldown: 10.0,
      damage: 2, // 2 damage per spike x 3 spikes in spread
      spikeCount: 3,
      type: 'projectile',
      projectileKind: 'bone_spike',
      speed: 15.0,
      gravity: 0.6,
      weight: 70,
      effect: null,
    },
  ],
};

/**
 * Per-Mob Combat State Machine:
 * Idle -> Wander -> Chase -> Windup -> Attack -> Recover (0.8s global delay) -> Chase
 */
export class NightMobCombatController {
  constructor(mobType) {
    this.mobType = mobType;
    this.attacks = NIGHT_MOB_ATTACKS[mobType] || [];
    this.cooldowns = new Map();
    for (const a of this.attacks) {
      this.cooldowns.set(a.id, 0);
    }
    this.globalDelayTimer = 0;
    this.activeAttack = null;
    this.windupTimer = 0;
    this.coneChannelTimer = 0;
    this.coneTickAccum = 0;
    this.stalkTimer = 2.8;
    this.chargeTimer = 0;
  }

  /**
   * Selects the next ready attack based on distance, LOS, summoned count, and weights.
   */
  selectReadyAttack(mob, dist, hasLOS, statusEffects, playerHp = 20) {
    if (this.globalDelayTimer > 0 || this.activeAttack) return null;

    // BloodCrawler signature combo: if player is staggered within 2.5m, prioritize Venom Bite!
    if (
      this.mobType === 'BloodCrawler' &&
      statusEffects?.hasEffect('stagger') &&
      dist <= 2.5
    ) {
      const bite = this.attacks.find((a) => a.id === 'venom_bite');
      if (bite && (this.cooldowns.get(bite.id) || 0) <= 0) {
        return bite;
      }
    }

    const candidates = [];
    let totalWeight = 0;

    for (const atk of this.attacks) {
      const cd = this.cooldowns.get(atk.id) || 0;
      if (cd > 0) continue;

      const [minR, maxR] = atk.range;
      if (dist < minR || dist > maxR) continue;

      // Ranged / special attacks require clear DDA line of sight
      if (
        (atk.type === 'projectile' || atk.type === 'special' || atk.type === 'cone') &&
        !hasLOS
      ) {
        continue;
      }

      // GrimWraith Summon Skeletons: cannot summon while 3 skeletons are already alive
      if (atk.id === 'summon_skeletons') {
        const aliveSummons = Array.isArray(mob.summoned)
          ? mob.summoned.filter((s) => s && s.hp > 0).length
          : 0;
        if (aliveSummons >= (atk.maxSummons || 3)) continue;
      }

      let w = atk.weight || 50;
      // ShadowStalker becomes more aggressive with Claw Rake when player < 6 HP
      if (this.mobType === 'ShadowStalker' && atk.id === 'claw_rake' && playerHp < 6) {
        w *= 2.2;
      }

      candidates.push({ atk, weight: w });
      totalWeight += w;
    }

    if (candidates.length === 0) return null;

    let r = Math.random() * totalWeight;
    for (const c of candidates) {
      r -= c.weight;
      if (r <= 0) return c.atk;
    }
    return candidates[0].atk;
  }

  /**
   * Starts the mandatory WINDUP telegraph for the chosen attack.
   */
  startWindup(mob, atk, statusEffects, sfx) {
    this.activeAttack = atk;
    // Section 7.3: Burning mobs have attack windups +30% slower (weakened)
    const burnMult = mob.burning ? 1.3 : 1.0;
    this.windupTimer = atk.windup * burnMult;
    mob.attackPhase = 'WINDUP';
    mob.state = 'Windup';
    mob.activeAttackName = atk.name;
    mob.lastAttackOutcome = `WINDUP: ${atk.name}`;

    // Trigger telegraph pose / sound / boss banner
    if (atk.id === 'soul_steal') {
      statusEffects?.showWarningBanner(
        '💀 SOUL STEAL! BREAK LINE OF SIGHT!',
        '#22d3ee',
        1500
      );
      sfx?.playCastTelegraph();
    } else if (atk.id === 'hunger_screech') {
      sfx?.playCastTelegraph();
    } else if (atk.id === 'pounce_slam') {
      // Crouch low before leaping
      mob.group.scale.y = 0.68;
    }
  }

  /**
   * Updates cooldowns, Windup -> Attack execution -> Recover (0.8s global delay).
   */
  update(
    deltaTime,
    mob,
    playerTarget,
    world,
    nightProjectiles,
    statusEffects,
    onPlayerDamaged,
    onSummonSkeletons,
    sfx
  ) {
    // Tick all per-attack cooldowns
    for (const [id, cd] of this.cooldowns.entries()) {
      if (cd > 0) {
        this.cooldowns.set(id, Math.max(0, cd - deltaTime));
      }
    }

    if (this.globalDelayTimer > 0) {
      this.globalDelayTimer = Math.max(0, this.globalDelayTimer - deltaTime);
      if (this.globalDelayTimer <= 0 && mob.attackPhase === 'RECOVERY') {
        mob.attackPhase = 'IDLE';
        mob.activeAttackName = '';
      }
    }

    if (this.chargeTimer > 0) {
      this.chargeTimer = Math.max(0, this.chargeTimer - deltaTime);
    }

    const { from: eyePos, to: chestPos } = getCombatRayEndpoints(mob, playerTarget);
    const hasLOS = hasLineOfSight(world, eyePos, chestPos);
    const gap = gapDistance(mob, playerTarget);

    // Handle active Toxic Vomit 1.2s cone spray channel (FleshGhoul)
    if (this.coneChannelTimer > 0 && this.activeAttack?.id === 'toxic_vomit') {
      this.coneChannelTimer -= deltaTime;
      this.coneTickAccum += deltaTime;
      if (this.coneTickAccum >= 0.3) {
        this.coneTickAccum -= 0.3;
        if (gap <= 8.0 && hasLOS) {
          const rawDmg = Math.round(
            this.activeAttack.damage * NIGHT_MOB_DAMAGE_MULT
          );
          if (typeof onPlayerDamaged === 'function') {
            onPlayerDamaged(rawDmg, 'FleshGhoul (Toxic Vomit)');
          }
          statusEffects?.applyEffect('weakness', 8.0, 1);
        }
      }
      if (this.coneChannelTimer <= 0) {
        this._finishAttackToRecovery(mob);
      }
      return;
    }

    // Handle active WINDUP telegraph countdown
    if (this.activeAttack && mob.attackPhase === 'WINDUP') {
      this.windupTimer -= deltaTime;

      // Update GrimWraith cyan Soul Steal beam line during the 1.5s channel
      if (this.activeAttack.id === 'soul_steal') {
        nightProjectiles?.setSoulBeam(true, eyePos, chestPos);
      }

      if (this.windupTimer <= 0) {
        mob.group.scale.y = 1.0;
        nightProjectiles?.setSoulBeam(false);
        this._executeAttackAtInstant(
          mob,
          this.activeAttack,
          playerTarget,
          eyePos,
          chestPos,
          gap,
          hasLOS,
          world,
          nightProjectiles,
          statusEffects,
          onPlayerDamaged,
          onSummonSkeletons,
          sfx
        );
      }
    }
  }

  _executeAttackAtInstant(
    mob,
    atk,
    playerTarget,
    eyePos,
    chestPos,
    gap,
    hasLOS,
    world,
    nightProjectiles,
    statusEffects,
    onPlayerDamaged,
    onSummonSkeletons,
    sfx
  ) {
    mob.attackPhase = 'STRIKE';

    if (atk.type === 'melee') {
      // Leap forward slightly on Pounce Slam
      if (atk.id === 'pounce_slam') {
        mob.group.position.x += Math.sin(mob.yaw) * 1.35;
        mob.group.position.z += Math.cos(mob.yaw) * 1.35;
      }
      const newGap = gapDistance(mob, playerTarget);
      const maxReach = atk.range[1] + 0.6;
      if (newGap <= maxReach && (newGap <= 2.2 || hasLOS)) {
        let dmg = atk.damage * NIGHT_MOB_DAMAGE_MULT;
        if (atk.staggerBonusMult && statusEffects?.hasEffect('stagger')) {
          dmg = Math.round(dmg * atk.staggerBonusMult);
        }
        if (typeof onPlayerDamaged === 'function') {
          onPlayerDamaged(dmg, `${this.mobType} (${atk.name})`);
        }
        if (atk.effect && statusEffects) {
          statusEffects.applyEffect(
            atk.effect.id,
            atk.effect.duration,
            atk.effect.power
          );
        }
        mob.lastAttackOutcome = `HIT (${atk.name})`;
      } else {
        mob.lastAttackOutcome = `WHOOSH MISS (${atk.name})`;
        sfx?.playWhooshMiss();
      }
      this._finishAttackToRecovery(mob);
      return;
    }

    if (atk.type === 'projectile') {
      if (atk.id === 'spike_volley') {
        // FleshGhoul fires 3 bone spikes in a small spread (-10 deg, 0, +10 deg)
        for (const deg of [-10, 0, 10]) {
          nightProjectiles?.fireProjectile({
            kind: 'bone_spike',
            ownerType: this.mobType,
            origin: eyePos,
            targetPos: chestPos,
            speed: atk.speed,
            gravity: atk.gravity,
            damage: Math.round(atk.damage * NIGHT_MOB_DAMAGE_MULT),
            yawOffset: (deg * Math.PI) / 180,
          });
        }
      } else {
        nightProjectiles?.fireProjectile({
          kind: atk.projectileKind || 'poison_spit',
          ownerType: this.mobType,
          origin: eyePos,
          targetPos: chestPos,
          speed: atk.speed,
          gravity: atk.gravity,
          damage: Math.round(atk.damage * NIGHT_MOB_DAMAGE_MULT),
          effect: atk.effect,
          leavesPuddle: Boolean(atk.leavesPuddle),
        });
      }
      mob.lastAttackOutcome = `FIRED ${atk.name}`;
      this._finishAttackToRecovery(mob);
      return;
    }

    if (atk.type === 'summon' && atk.id === 'summon_skeletons') {
      if (typeof onSummonSkeletons === 'function') {
        onSummonSkeletons(mob, atk.maxSummons || 3);
      }
      mob.lastAttackOutcome = 'SUMMONED SKELETONS!';
      this._finishAttackToRecovery(mob);
      return;
    }

    if (atk.type === 'special' && atk.id === 'soul_steal') {
      // Counterplay: if player broke line of sight behind a block before 1.5s cast finished, Soul Steal misses!
      if (hasLOS && gap <= atk.range[1]) {
        statusEffects?.applyEffect('drain', 1.5, 0.5);
        sfx?.playPlayerHurt();
        mob.lastAttackOutcome = 'SOUL STEAL HIT (-50% HP)!';
      } else {
        statusEffects?.showWarningBanner(
          '🛡️ DODGED SOUL STEAL (LINE OF SIGHT BROKEN)!',
          '#4ade80',
          1400
        );
        mob.lastAttackOutcome = 'SOUL STEAL DODGED!';
      }
      this._finishAttackToRecovery(mob);
      return;
    }

    if (atk.type === 'aoe' && atk.id === 'hunger_screech') {
      nightProjectiles?.spawnScreechRing(
        mob.group.position.x,
        mob.group.position.y,
        mob.group.position.z,
        12.0
      );
      if (gap <= 12.0) {
        if (typeof onPlayerDamaged === 'function') {
          onPlayerDamaged(
            Math.round(atk.damage * NIGHT_MOB_DAMAGE_MULT),
            'ShadowStalker (Hunger Screech)',
            { drainStamina: true }
          );
        }
        statusEffects?.applyEffect('fear', 5.0, 1);
      }
      mob.lastAttackOutcome = 'HUNGER SCREECH!';
      this._finishAttackToRecovery(mob);
      return;
    }

    if (atk.type === 'cone' && atk.id === 'toxic_vomit') {
      this.coneChannelTimer = atk.coneDuration || 1.2;
      this.coneTickAccum = 0.3; // Immediate first spray tick
      mob.attackPhase = 'CHANNELING_CONE';
      mob.lastAttackOutcome = 'SPRAYING TOXIC VOMIT!';
      return;
    }

    this._finishAttackToRecovery(mob);
  }

  _finishAttackToRecovery(mob) {
    if (this.activeAttack) {
      this.cooldowns.set(this.activeAttack.id, this.activeAttack.cooldown);
    }
    this.activeAttack = null;
    this.coneChannelTimer = 0;
    this.globalDelayTimer = GLOBAL_ATTACK_DELAY_SECONDS; // 0.8s mandatory global attack delay
    mob.attackPhase = 'RECOVERY';
    mob.state = 'Recover';
  }

  cancel(mob, nightProjectiles) {
    if (this.activeAttack?.id === 'soul_steal') {
      nightProjectiles?.setSoulBeam(false);
    }
    this.activeAttack = null;
    this.windupTimer = 0;
    this.coneChannelTimer = 0;
    if (mob) {
      mob.group.scale.y = 1.0;
      mob.attackPhase = 'IDLE';
    }
  }
}
