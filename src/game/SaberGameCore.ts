import { GameConfig } from '../config/config.js';
import { Arena } from './entities/Arena.js';
import { Player } from './entities/Player.js';
import { AI } from './entities/AI.js';
import { MovementSystem } from './systems/MovementSystem.js';
import { CollisionSystem } from './systems/CollisionSystem.js';
import { Vector2 } from '../utils/Vector2.js';
import { GameCore, GameState, Action, ActionSpace } from '../MimicRL/core/GameCore.js';

/**
 * SaberGameCore - Game-specific implementation of the GameCore interface
 * 
 * This class implements the GameCore interface for the Saber game.
 * It handles all game-specific logic (arena, players, sabers, collisions, etc.)
 * while providing a standardized interface for the RL library.
 */
export class SaberGameCore implements GameCore {
  private config: any;
  private arena: Arena | null;
  private entities: any[];
  private players: Player[];
  private ais: AI[];
  private movementSystem: MovementSystem | null;
  private collisionSystem: CollisionSystem | null;

  private episodeState: 'waiting' | 'playing' | 'tie' | 'gameOver';
  private stepCount: number;
  private startTimeMs: number;
  private endTimeMs: number;
  private previousDistance: number | null;

  // Constants for normalization
  private readonly MAX_ANGULAR_VELOCITY: number;
  private readonly MAX_STEPS: number;

  constructor(config: any = GameConfig) {
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

    // Constants for normalization
    this.MAX_ANGULAR_VELOCITY = this.config?.arena?.saberRotationSpeed ?? (2 * Math.PI);
    this.MAX_STEPS = Math.floor((this.config?.rl?.rewards?.maxGameLength ?? 60) / 0.05); // maxGameLength / deltaTime
  }

  /**
   * Reset the game to initial state
   * @returns {GameState} Initial game state with observations and rewards for all players
   */
  reset(): GameState {
    // Initialize arena and entities
    // Arena constructor: (id, width?, height?) - width and height are optional
    this.arena = new (Arena as any)('arena-1');
    const playerRadius = this.config?.player?.radius ?? 0.5;
    const minDistance = this.config?.game?.spawnMinDistance ?? 3;
    const maxAttempts = 100;
    const positions: Vector2[] = [];
    for (let i = 0; i < 2; i++) {
      let attempts = 0;
      let pos: Vector2 | null = null;
      let valid = false;
      while (!valid && attempts < maxAttempts) {
        pos = this.arena!.getRandomPosition(playerRadius);
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
        const center = this.arena!.getCenter() as { x: number; y: number };
        pos = i === 0 
          ? new Vector2(playerRadius + 1, center.y) 
          : new Vector2(this.arena!.width - (playerRadius + 1), center.y);
      }
      positions.push(pos);
    }
    this.players = [new Player('player-1', positions[0])];
    this.ais = [new AI('ai-1', positions[1])];
    this.entities = [...this.players, ...this.ais];

    // Systems
    this.movementSystem = new MovementSystem(this.arena!);
    this.collisionSystem = new CollisionSystem(this.arena!);

    // Episode
    this.episodeState = 'playing';
    this.stepCount = 0;
    this.startTimeMs = Date.now();
    this.endTimeMs = 0;
    this.previousDistance = this.computePlayersDistance();

    // Return GameState with observations for all players
    return {
      observations: [
        this.buildObservationFor(0),  // Player 0 (player-1)
        this.buildObservationFor(1)   // Player 1 (ai-1)
      ],
      rewards: [0, 0],
      done: false,
      outcome: null
    };
  }

  private isDone(): boolean {
    return this.episodeState === 'tie' || this.episodeState === 'gameOver';
  }

  /**
   * Advance game by one step with actions from all players
   * @param {Action[]} actions - Array of actions, index = player index
   * @param {number} deltaTime - Time step in seconds
   * @returns {GameState} New game state after step
   */
  step(actions: Action[], deltaTime: number): GameState {
    if (this.isDone() || this.episodeState !== 'playing') {
      const obs = this.buildObservationFor(0);
      return {
        observations: [obs, obs], // Return current state
        rewards: [0, 0],
        done: true,
        outcome: this.getOutcome()
      };
    }

    this.stepCount++;

    // Apply actions to all players uniformly
    // actions[0] is for player-1, actions[1] is for ai-1
    if (this.players[0] && actions && actions[0] && Array.isArray(actions[0])) {
      this.applyActionToPlayer(this.players[0], actions[0], deltaTime);
    }
    if (this.ais[0] && actions && actions[1] && Array.isArray(actions[1])) {
      this.applyActionToPlayer(this.ais[0], actions[1], deltaTime);
    }

    // Update sabers
    if (this.players[0]?.saber) this.players[0].saber.update(deltaTime);
    if (this.ais[0]?.saber) this.ais[0].saber.update(deltaTime);

    // Collisions
    const collisionResults: any = this.collisionSystem!.checkCollisions(this.players, this.ais, deltaTime);

    // Terminal conditions
    let done = false;
    let outcome: ('win' | 'loss' | 'tie')[] | null = null;

    if (this.shouldTimeout(deltaTime)) {
      done = true;
      this.episodeState = 'tie';
      this.endTimeMs = Date.now();
      outcome = ['tie', 'tie'];
      this.killAll();
    } else if (collisionResults && (collisionResults.gameOver || collisionResults.tie)) {
      done = true;
      const winner = collisionResults.winner || null;
      const isTie = !!collisionResults.tie;
      this.episodeState = isTie ? 'tie' : 'gameOver';
      this.endTimeMs = Date.now();
      if (isTie) {
        outcome = ['tie', 'tie'];
      } else {
        const winnerId = winner ? winner.id : null;
        if (winnerId === 'player-1') {
          outcome = ['win', 'loss'];
        } else {
          outcome = ['loss', 'win'];
        }
      }
      this.killAll();
    }

    // Calculate rewards for each player
    const rewards = [
      this.calculateReward(0, done, outcome),
      this.calculateReward(1, done, outcome)
    ];

    return {
      observations: [
        this.buildObservationFor(0),
        this.buildObservationFor(1)
      ],
      rewards: rewards,
      done: done,
      outcome: outcome
    };
  }

  /**
   * Get number of players in the game
   */
  getNumPlayers(): number {
    return 2;
  }

  /**
   * Get observation size (same for all players)
   */
  getObservationSize(): number {
    return 9; // Size of normalized observation array
  }

  /**
   * Get action size (same for all players)
   */
  getActionSize(): number {
    return 4; // [W, A, S, D] - discrete actions
  }

  /**
   * Get action space for each action index
   */
  getActionSpaces(): ActionSpace[] {
    return [
      { type: 'discrete' },  // W
      { type: 'discrete' },  // A
      { type: 'discrete' },  // S
      { type: 'discrete' }   // D
    ];
  }

  /**
   * Get episode outcome
   * @returns {('win'|'loss'|'tie')[]|null} Outcome array or null if not done
   */
  getOutcome(): ('win' | 'loss' | 'tie')[] | null {
    if (!this.isDone()) {
      return null;
    }
    if (this.episodeState === 'tie') {
      return ['tie', 'tie'];
    }
    // Determine winner from collision results or game state
    const alivePlayers = this.players.filter(p => p.isAlive);
    const aliveAIs = this.ais.filter(a => a.isAlive);
    if (alivePlayers.length === 1 && aliveAIs.length === 0) {
      return ['win', 'loss'];
    } else if (aliveAIs.length === 1 && alivePlayers.length === 0) {
      return ['loss', 'win'];
    } else {
      return ['tie', 'tie'];
    }
  }

  // Internal methods
  private shouldTimeout(deltaTime: number): boolean {
    const maxGameLengthSec = this.config?.rl?.rewards?.maxGameLength ?? 60;
    const elapsedSec = this.stepCount * deltaTime;
    return elapsedSec >= maxGameLengthSec;
  }

  /**
   * Calculate reward for a specific player
   * @param {number} playerIndex - Player index (0 or 1)
   * @param {boolean} done - Whether episode is done
   * @param {('win'|'loss'|'tie')[]|null} outcome - Episode outcome array
   * @returns {number} Reward for the player
   */
  private calculateReward(playerIndex: number, done: boolean, outcome: ('win' | 'loss' | 'tie')[] | null): number {
    const rewards = this.config?.rl?.rewards || {};
    
    if (done && outcome) {
      // Terminal reward
      const playerOutcome = outcome[playerIndex];
      if (playerOutcome === 'win') {
        return rewards.win ?? 1.0;
      } else if (playerOutcome === 'loss') {
        return rewards.loss ?? -1.0;
      } else {
        return rewards.tie ?? 0;
      }
    } else {
      // Step reward (shaping)
      const timePenaltyPerSec = rewards.timePenalty ?? 0;
      const distFactor = rewards.distancePenaltyFactor ?? 0;
      const deltaDistFactor = rewards.deltaDistanceRewardFactor ?? 0;

      let r = 0;

      // Time penalty
      r += timePenaltyPerSec * 0.05; // deltaTime is typically 0.05

      // Distance shaping (only for player 0, can be extended)
      if (playerIndex === 0) {
        const currentDistance = this.computePlayersDistance();
        if (currentDistance != null) {
          r += -distFactor * currentDistance * 0.05;
          if (this.previousDistance != null) {
            const delta = this.previousDistance - currentDistance;
            r += deltaDistFactor * delta;
          }
          this.previousDistance = currentDistance;
        }
      }

      return r;
    }
  }

  /**
   * Apply action to a player entity
   * Converts Action (number array) to player movement
   * @param {Player|AI} player - Player entity
   * @param {Action} action - Action array [W, A, S, D] where each is 0 or 1
   * @param {number} deltaTime - Time step
   */
  private applyActionToPlayer(player: Player | AI, action: Action, deltaTime: number): void {
    if (!player || !player.isAlive) return;
    
    // action is number[]: [W, A, S, D] where each is 0 or 1
    // Convert to movement direction
    const up = action[0] ? -1 : 0;
    const left = action[1] ? -1 : 0;
    const down = action[2] ? 1 : 0;
    const right = action[3] ? 1 : 0;
    
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
    const constrained = this.arena!.constrainPosition(newX, newY, player.radius) as { x: number; y: number };
    player.position.x = constrained.x;
    player.position.y = constrained.y;
  }

  private currentOutcome(): null { return null; }

  private detectWinner(): Player | null {
    // Prefer collision system knowledge if available
    const alivePlayers = this.players.filter(p => p.isAlive);
    if (alivePlayers.length === 1) return alivePlayers[0];
    return null;
  }

  private killAll(): void {
    for (const p of this.players) p.kill();
    for (const a of this.ais) a.kill();
  }

  private computePlayersDistance(): number | null {
    if (!this.players[0] || !this.ais[0]) return null;
    const p = this.players[0].position;
    const a = this.ais[0].position;
    if (!p || !a) return null;
    const dx = p.x - a.x;
    const dy = p.y - a.y;
    return Math.hypot(dx, dy);
  }

  /**
   * Build normalized observation for a specific player
   * This replaces the old #buildObservation() method
   * Returns normalized number array (game-agnostic)
   * @param {number} playerIndex - Player index (0 or 1)
   * @returns {number[]} Normalized observation array
   */
  private buildObservationFor(playerIndex: number): number[] {
    const p = playerIndex === 0 ? this.players[0] : this.ais[0];
    const o = playerIndex === 0 ? this.ais[0] : this.players[0];
    
    const playerPos = p?.position || { x: 0, y: 0 };
    const opponentPos = o?.position || { x: 0, y: 0 };
    const playerSaber = p?.saber || null;
    const opponentSaber = o?.saber || null;
    
    // Normalize to [0, 1] or [-1, 1] range
    return [
      playerPos.x / this.arena!.width,      // normalized x
      playerPos.y / this.arena!.height,     // normalized y
      opponentPos.x / this.arena!.width,
      opponentPos.y / this.arena!.height,
      ((playerSaber?.getAngle ? playerSaber.getAngle() : 0) + Math.PI) / (2 * Math.PI),  // normalized angle [0, 1]
      ((opponentSaber?.getAngle ? opponentSaber.getAngle() : 0) + Math.PI) / (2 * Math.PI),
      (playerSaber?.getRotationSpeed ? playerSaber.getRotationSpeed() : 0) / this.MAX_ANGULAR_VELOCITY,
      (opponentSaber?.getRotationSpeed ? opponentSaber.getRotationSpeed() : 0) / this.MAX_ANGULAR_VELOCITY,
      this.stepCount / this.MAX_STEPS  // normalized time
    ];
  }
}

