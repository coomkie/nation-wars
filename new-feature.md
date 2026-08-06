Nation Wars Live — Combat & Movement System (Upgrade Spec)
1. Purpose

This document upgrades the original static "units appear and stand in place" mechanic into a realtime auto-battler combat system. Units now spawn, march toward the enemy nation's main base, engage enemy units they encounter along the way, and fight based on stats determined by their unit type/tier. This document assumes the base project spec (nation-wars-live-project-spec.md) is already implemented — it only replaces/extends Section 3 ("In-battle Gameplay Mechanics") of that document.

Already implemented (unchanged): on gift received, a unit is spawned with the sender's username attached.

New in this upgrade: unit movement, target detection, combat resolution, unit types/roles, admin-configurable stats, and a base/HQ health mechanic.

2. Core Gameplay Loop
Viewer sends a gift → a unit is spawned at their nation's spawn point (near their own base), tagged with the viewer's username and a unit type (determined by gift mapping — see Section 5).
The unit automatically advances toward the enemy nation's main base along the battlefield.
While advancing, if the unit detects an enemy unit within engagement range and no path around it, it stops advancing and enters combat with that enemy unit.
Combat resolves tick-by-tick based on both units' stats until one dies. The survivor (if any HP remains) resumes advancing.
If a unit reaches the enemy base with no obstruction, it attacks the base directly, dealing damage each tick until it dies (base return-damage, see Section 6) or the base is destroyed.
The match ends either when a base is destroyed, or when the match timer runs out — whichever comes first (see Section 7 for win conditions).
3. Movement & Pathing
3.1 Battlefield model
Single battlefield, with Nation A's base on the left edge and Nation B's base on the right edge.
To avoid all units visually stacking on one line, units are assigned a random lane offset (Y position / row) purely for visual spread..
Units move at a constant speed determined by their unit type (moveSpeed stat) toward the enemy base.
3.2 Target detection
Each tick, a unit checks for the nearest enemy unit ahead of it (further along its movement direction, within its detectionRange).
If an enemy unit is found within engagementRange, the unit stops moving and begins combat with that target.
If no enemy unit is in range, the unit continues moving toward the enemy base.
Ranged unit types (e.g. Archer, Mage) can engage a detected enemy from a distance without closing the gap, as long as the enemy is within their (longer) attackRange; melee types must close to short range first.
3.3 Re-targeting
If a unit's current combat target dies before the unit itself does, the unit immediately re-evaluates: engage the next nearest enemy in range, or resume advancing if none remain.
If a unit dies mid-combat, its (living) opponent resumes advancing immediately.
4. Combat Resolution
4.1 Stats involved

Each unit instance carries stats derived from its unit type template (Section 5), scaled slightly by its tier upgrade level (from cumulative gift value, per the original tier system):

hp — current health.
maxHp — starting health for that unit type/tier.
attackDamage — damage dealt per attack tick.
attackSpeed — attacks per second (or ticks between attacks).
moveSpeed — battlefield movement speed.
attackRange — melee (short) or ranged (long).
detectionRange — how far ahead the unit scans for enemies.
4.2 Damage exchange
While two units are in combat, each applies attackDamage to the other every 1 / attackSpeed seconds (independent attack timers per unit — a faster unit attacks more often).
When a unit's hp reaches 0, it dies: removed from the battlefield with a death animation/effect, and a unit:died event is broadcast.
The surviving unit keeps its remaining hp (damage carries over — a heavily wounded winner is still weak against the next enemy it meets), and resumes advancing or immediately engages the next nearby enemy.
4.3 Multiple simultaneous engagements (optional rule, recommended for later polish)
MVP: 1-on-1 combat only (a unit fights exactly one target at a time, first-detected).
Future enhancement: allow splash/AoE unit types (e.g. Mage) to damage multiple nearby enemies at once — flagged as a stat (isSplash: boolean, splashRadius).
5. Unit Types & Admin Configuration
5.1 Concept

Instead of a single generic unit, the game now supports multiple unit types (roles), each admin-defined with its own stat template. Examples the admin might create:

Unit Type	Suggested role	Notes
Infantry	Cheap, balanced melee unit	High volume, low individual power
Cavalry	Fast melee unit	High move speed, hits hard, lower HP
Archer	Ranged, low HP	Attacks before being reached
Mage	Ranged, possibly splash damage	High damage, slow attack speed, fragile

Admins are not limited to these examples — they can create, edit, or delete unit types freely, each with a custom name, sprite/icon, and full stat block.

5.2 Admin-configurable stat block
typescript
interface UnitType {
  id: string;
  name: string;                // e.g. "Archer"
  spriteKey: string;           // reference to the sprite asset used
  baseHp: number;
  baseAttackDamage: number;
  attackSpeed: number;         // attacks per second
  moveSpeed: number;           // battlefield units per second
  attackRange: 'melee' | 'ranged';
  attackRangeValue: number;    // actual distance value used by combat logic
  detectionRange: number;
  isSplash: boolean;
  splashRadius: number | null;
  tierMultipliers: {           // how stats scale at tier 2 / tier 3 (from cumulative gift value)
    tier2: { hpMult: number; dmgMult: number };
    tier3: { hpMult: number; dmgMult: number };
  };
}
Admin manages these via the Admin UI (extends the Match Setup page from the base spec) — a new "Unit Types" management page: create/edit/delete unit types, adjust stats, upload/select sprite.
5.3 Gift → Unit Type mapping
Extends the existing GiftNationMapping (which decides which nation a gift belongs to) with a second mapping: which unit type a gift spawns.
Recommended structure: each gift maps to exactly one (nationId is implicit from match side, unitTypeId) pair, configured per match setup — e.g., cheap gifts → Infantry, mid-tier gifts → Archer/Cavalry, expensive gifts → Mage.
If a gift has no explicit unit type mapping, fall back to a configurable default unit type.
typescript
interface GiftUnitTypeMapping {
  giftId: number;
  giftName: string;
  unitTypeId: string;
}
6. Base (HQ) Mechanic
6.1 Base stats
Each nation's active match instance has a Base with its own HP pool, configurable per match (default value, e.g. 1000).
typescript
interface Base {
  nationId: string;
  maxHp: number;
  currentHp: number;
}
6.2 Base combat
A unit that reaches the enemy base with no blocking enemy unit begins attacking the base using its own attackDamage / attackSpeed, exactly like fighting an enemy unit.
The base does not deal return damage in the MVP (units attacking the base are only stopped by enemy units intercepting them beforehand, not by the base itself) — this keeps base combat simple and predictable. (Optional future rule: base has passive defense damage per tick, requiring multiple units to break through.)
Units remain at the base attacking it until either the base is destroyed or the match timer ends.
6.3 Base destruction
When a base's currentHp reaches 0: that nation immediately loses the match, regardless of remaining time. A base:destroyed event triggers the match-end celebration sequence for the opposing nation.
7. Updated Win Conditions

A match ends when either of these occurs first:

Base destroyed — the opposing nation wins instantly.
Timer runs out — the nation whose base has more remaining HP (currentHp / maxHp) wins. (This replaces the previous "highest gift score wins" rule, since combat outcomes are now the primary driver of match state — gift score can still be tracked for statistics/leaderboards but no longer directly decides the winner.)
8. Updated Data Model (extends base spec Section 5)
typescript
interface Unit {
  id: string;
  username: string;
  displayName: string;
  nationId: string;
  unitTypeId: string;
  tier: 1 | 2 | 3;
  totalGiftValue: number;
  hp: number;
  maxHp: number;
  position: { x: number; y: number };
  state: 'advancing' | 'engaging' | 'attacking_base' | 'dead';
  targetUnitId: string | null;   // set when state === 'engaging'
  spawnedAt: string;
}

interface Match {
  id: string;
  bracketNodeId: string;
  nationA: MatchNationState;
  nationB: MatchNationState;
  baseA: Base;
  baseB: Base;
  startedAt: string;
  endsAt: string;
  status: 'active' | 'ended';
  winnerNationId: string | null;
}

(MatchNationState.units now holds full Unit objects with position/hp/state as above, instead of the simpler static version in the base spec.)

9. Updated Socket.IO Events

New/changed server → client events (battle overlay channel):

unit:spawned — { nationId, unit: Unit } (unchanged trigger, richer payload).
unit:moved — { unitId, position } — sent at a throttled tick rate (e.g. 10x/sec), not on every server tick, to control bandwidth.
unit:engaged — { unitId, targetUnitId } — combat started between two units.
unit:damaged — { unitId, hp, maxHp } — HP change during combat (throttled or sent per attack tick).
unit:died — { unitId, nationId } — triggers death animation on the overlay.
base:damaged — { nationId, currentHp, maxHp }.
base:destroyed — { nationId } — triggers immediate match-end sequence.
match:ended — extended payload: { winnerNationId, reason: 'base_destroyed' | 'timeout', baseAHpRemaining, baseBHpRemaining, ... }.
10. Edge Cases
Simultaneous arrivals at base: if units from the same nation reach the enemy base at the same time, they all attack it independently (no queueing needed — base HP just takes combined damage per tick).
Unit tier vs. unit type stacking: a tier-3 Infantry might out-damage a tier-1 Mage or vice versa — admins should be warned in the Admin UI (tooltip/preview) that tier multipliers apply on top of unit type base stats, to help them balance the game.
Congestion near base: if many units from one nation reach the enemy base and stay there attacking, visually stack them with slight offsets so they remain readable (art/animation concern, not logic).
Very fast matches (an early rush destroys the base in minutes): acceptable and can be an exciting outcome, but admins should be able to tune base HP and unit stats to control average match pacing.
Performance: with potentially hundreds of units in a busy stream, movement/combat ticks should be batched server-side (fixed tick rate, e.g. 10 ticks/sec) rather than recalculating on every gift event, to avoid overwhelming the Socket.IO broadcast.
Unit type deleted while in use: prevent admins from deleting a unit type that's referenced by an active gift mapping in an ongoing match; require reassignment first.
No unit type configured for a gift: fall back to a default unit type (configurable, must always exist) rather than failing to spawn a unit.
11. Implementation Notes (extends base spec roadmap Phase 1–2)
Add UnitType CRUD (entity + admin endpoints + Admin UI page) before combat logic, so unit types exist to reference.
Extend GiftNationMapping with GiftUnitTypeMapping in match setup.
Implement a fixed-tick game loop in MatchService (e.g., setInterval at 100ms) that:
Moves all units without a combat target toward the enemy base.
Detects and assigns combat targets within range.
Resolves attack ticks for units in combat or attacking the base.
Removes dead units, updates base HP, checks win conditions.
Add Base to match initialization (spawn with configured maxHp).
Update the battle overlay (battle-overlay) to interpolate unit positions between unit:moved updates for smooth movement (client-side lerp), and play appropriate animations per unit:engaged / unit:died / base:damaged events.
Keep the original tier-upgrade system (cumulative gift value → tier 1/2/3) but apply it as a stat multiplier on top of the unit's UnitType base stats, per Section 5.2's tierMultipliers.
12. MVP Acceptance Criteria (additions to base spec Section 11)
 Admin can create, edit, and delete unit types with custom stats and sprites.
 Admin can map specific gifts to specific unit types per match.
 Units spawned from gifts move automatically toward the enemy base.
 Units correctly detect and engage enemy units in range, stopping their advance during combat.
 Combat correctly resolves based on each unit's HP/damage/attack speed stats.
 A unit that reaches the enemy base with no obstruction deals damage to the base each tick.
 Base HP is tracked per nation and visible on the overlay.
 Match ends immediately when a base is destroyed, with the correct nation declared winner.
 If the timer runs out first, the nation with higher remaining base HP is declared winner.
 Overlay smoothly animates unit movement, combat, and death without noticeable stutter under realistic gift volume.