import { GameConfig } from '../config/config.js';
import { Arena } from './entities/Arena.js';
import { Player } from './entities/Player.js';
import { AI } from './entities/AI.js';
import { MovementSystem } from './systems/MovementSystem.js';
import { CollisionSystem } from './systems/CollisionSystem.js';

export class GameCore {
  constructor(config = GameConfig) {
    this.config = config;
    this.arena = null;
    this.entities = [];
    this.players = [];
    this.ais = [];
    this.movementSystem = null;
    this.collisionSystem = null;

    this.episodeState = 'waiting';
    this.stepCount = 0;
    this.startTimeMs = 0;
    this.endTimeMs = 0;
    this.previousDistance = null;

    // Optional opponent controller (when using policy-driven opponent)
    this.opponentController = null;
    this._opponentActionInterval = (this.config?.rl?.rollout?.actionIntervalSeconds ?? 0.2);
    this._opponentDecisionTimer = this._opponentActionInterval; // allow immediate first decision
    this._lastOpponentMask = [false, false, false, false];
  }

  reset() {
    // Initialize arena and entities
    this.arena = new Arena('arena-1');
    const playerRadius = this.config?.player?.radius ?? 0.5;
    const minDistance = this.config?.game?.spawnMinDistance ?? 3;
    const maxAttempts = 100;
    const positions = [];
    for (let i = 0; i < 2; i++) {
      let attempts = 0;
      let pos = null;
      let valid = false;
      while (!valid && attempts < maxAttempts) {
        pos = this.arena.getRandomPosition(playerRadius);
        valid = true;
        for (const existing of positions) {
          const dx = pos.x - existing.x;
          const dy = pos.y - existing.y;
          const dist = Math.hypot(dx, dy);
          if (dist < minDistance) { valid = false; break; }
        }
        attempts++;
      }
      if (!valid || !pos) {
        // Fallback to opposite sides
        const center = this.arena.getCenter();
        pos = i === 0 ? { x: playerRadius + 1, y: center.y } : { x: this.arena.width - (playerRadius + 1), y: center.y };
      }
      positions.push(pos);
    }
    this.players = [new Player('player-1', positions[0])];
    this.ais = [new AI('ai-1', positions[1])];
    this.entities = [...this.players, ...this.ais];

    // Systems
    this.movementSystem = new MovementSystem(this.arena);
    this.collisionSystem = new CollisionSystem(this.arena);

    // Episode
    this.episodeState = 'playing';
    this.stepCount = 0;
    this.startTimeMs = Date.now();
    this.endTimeMs = 0;
    this.previousDistance = this.#computePlayersDistance();
    // reset opponent decision timer for immediate first decision
    this._opponentDecisionTimer = this._opponentActionInterval;

    return this.#buildObservation();
  }

  isDone() {
    return this.episodeState === 'tie' || this.episodeState === 'gameOver';
  }

  step(actionMask, deltaTime) {
    if (this.isDone() || this.episodeState !== 'playing') {
      return { observation: this.#buildObservation(), reward: 0, done: true, outcome: null };
    }

    this.stepCount++;

    // Apply action mask to the controlled player (player-1)
    const player = this.players[0];
    if (player) {
      // Expect MovementSystem to read desired inputs from player flags
      player.setDesiredActionMask(actionMask);
    }

    // Advance physics: move player from desiredActionMask, update sabers, update AI/opponent
    this.#updatePlayerFromMask(player, deltaTime);
    if (player?.saber) player.saber.update(deltaTime);
    // Opponent control: if a controller is present, throttle decisions; otherwise run built-in AI
    if (this.opponentController && this.ais[0]) {
      this._opponentDecisionTimer += deltaTime;
      if (this._opponentDecisionTimer >= this._opponentActionInterval) {
        const obs = this.#buildObservation();
        this._lastOpponentMask = this.opponentController.decide(obs, deltaTime) || this._lastOpponentMask;
        this._opponentDecisionTimer = 0;
      }
      this.#updateOpponentFromMask(this.ais[0], deltaTime, this._lastOpponentMask);
      if (this.ais[0]?.saber) this.ais[0].saber.update(deltaTime);
    } else {
      for (const ai of this.ais) {
        ai.update(deltaTime);
      }
    }

    // Collisions
    const collisionResults = this.collisionSystem.checkCollisions(this.players, this.ais, deltaTime);

    // Terminal conditions
    let done = false;
    let reward = 0;
    let outcome = null;

    if (this.#shouldTimeout(deltaTime)) {
      done = true;
      this.episodeState = 'tie';
      this.endTimeMs = Date.now();
      reward = this.#computeTerminalReward({ tie: true, winnerId: null });
      outcome = { isTie: true, winnerId: null };
      this.#killAll();
    } else if (collisionResults && (collisionResults.gameOver || collisionResults.tie)) {
      done = true;
      const winner = collisionResults.winner || null;
      const isTie = !!collisionResults.tie;
      this.episodeState = isTie ? 'tie' : 'gameOver';
      this.endTimeMs = Date.now();
      const winnerId = winner ? winner.id : null;
      reward = this.#computeTerminalReward({ tie: isTie, winnerId });
      outcome = { isTie: isTie, winnerId };
      this.#killAll();
    } else {
      reward = this.#computeStepReward(deltaTime);
    }

    const observation = this.#buildObservation();
    return { observation, reward, done, outcome };
  }

  setOpponentController(controller) {
    this.opponentController = controller || null;
  }

  // Internal methods
  #shouldTimeout(deltaTime) {
    const maxGameLengthSec = this.config?.rl?.rewards?.maxGameLength ?? 60;
    const elapsedSec = this.stepCount * deltaTime;
    return elapsedSec >= maxGameLengthSec;
  }

  #computeStepReward(deltaTime) {
    const rewards = this.config?.rl?.rewards || {};
    const timePenaltyPerSec = rewards.timePenalty ?? 0;
    const distFactor = rewards.distancePenaltyFactor ?? 0;
    const deltaDistFactor = rewards.deltaDistanceRewardFactor ?? 0;

    let r = 0;

    // Time penalty
    r += timePenaltyPerSec * deltaTime;

    // Distance shaping
    const currentDistance = this.#computePlayersDistance();
    if (currentDistance != null) {
      r += -distFactor * currentDistance * deltaTime;
      if (this.previousDistance != null) {
        const delta = this.previousDistance - currentDistance;
        r += deltaDistFactor * delta * (1); // already per-step
      }
      this.previousDistance = currentDistance;
    }

    return r;
  }

  #updatePlayerFromMask(player, deltaTime) {
    if (!player || !player.isAlive) return;
    const mask = player.desiredActionMask || [false, false, false, false];
    const up = mask[0] ? -1 : 0;
    const left = mask[1] ? -1 : 0;
    const down = mask[2] ? 1 : 0;
    const right = mask[3] ? 1 : 0;
    let dx = left + right;
    let dy = up + down;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const speed = player.movementSpeed ?? (this.config?.player?.movementSpeed ?? 50);
    const vx = dx * speed;
    const vy = dy * speed;
    player.velocity.x = vx;
    player.velocity.y = vy;
    const newX = player.position.x + vx * deltaTime;
    const newY = player.position.y + vy * deltaTime;
    const constrained = this.arena.constrainPosition(newX, newY, player.radius);
    player.position.x = constrained.x;
    player.position.y = constrained.y;
  }

  #updateOpponentFromMask(opponent, deltaTime, mask) {
    if (!opponent || !opponent.isAlive) return;
    const up = mask[0] ? -1 : 0;
    const left = mask[1] ? -1 : 0;
    const down = mask[2] ? 1 : 0;
    const right = mask[3] ? 1 : 0;
    let dx = left + right;
    let dy = up + down;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const speed = opponent.movementSpeed ?? (this.config?.ai?.movementSpeed ?? 50);
    const vx = dx * speed;
    const vy = dy * speed;
    opponent.velocity.x = vx;
    opponent.velocity.y = vy;
    const newX = opponent.position.x + vx * deltaTime;
    const newY = opponent.position.y + vy * deltaTime;
    const constrained = this.arena.constrainPosition(newX, newY, opponent.radius);
    opponent.position.x = constrained.x;
    opponent.position.y = constrained.y;
  }

  #computeTerminalReward({ tie, winnerId }) {
    const rewards = this.config?.rl?.rewards || {};
    if (tie) return rewards.tie ?? 0;
    if (winnerId === 'player-1') return rewards.win ?? 1.0;
    return rewards.loss ?? -1.0;
  }

  #currentOutcome() { return null; }

  #detectWinner() {
    // Prefer collision system knowledge if available
    const alivePlayers = this.players.filter(p => p.isAlive);
    if (alivePlayers.length === 1) return alivePlayers[0];
    return null;
  }

  #killAll() {
    for (const p of this.players) p.kill();
    for (const a of this.ais) a.kill();
  }

  #computePlayersDistance() {
    if (!this.players[0] || !this.ais[0]) return null;
    const p = this.players[0].position;
    const a = this.ais[0].position;
    if (!p || !a) return null;
    const dx = p.x - a.x;
    const dy = p.y - a.y;
    return Math.hypot(dx, dy);
  }

  #buildObservation() {
    const p = this.players[0];
    const a = this.ais[0];
    const playerPos = p ? p.getPosition?.() ?? p.position : null;
    const aiPos = a ? a.getPosition?.() ?? a.position : null;
    const playerSaber = p?.getSaber?.() ?? p?.saber ?? null;
    const aiSaber = a?.getSaber?.() ?? a?.saber ?? null;
    return {
      stepCount: this.stepCount,
      playerPosition: playerPos,
      opponentPosition: aiPos,
      playerSaberAngle: playerSaber?.getAngle ? playerSaber.getAngle() : 0,
      playerSaberAngularVelocity: playerSaber?.getRotationSpeed ? playerSaber.getRotationSpeed() : 0,
      opponentSaberAngle: aiSaber?.getAngle ? aiSaber.getAngle() : 0,
      opponentSaberAngularVelocity: aiSaber?.getRotationSpeed ? aiSaber.getRotationSpeed() : 0
    };
  }
}


