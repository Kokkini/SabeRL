/**
 * Game - Main game class that manages all game systems and state
 * Coordinates between all game systems and manages the overall game flow
 */

import { GameConfig } from '../config/config.js';
import { Arena } from './entities/Arena.js';
import { Player } from './entities/Player.js';
import { AI } from './entities/AI.js';
import { InputSystem } from './systems/InputSystem.js';
import { MovementSystem } from './systems/MovementSystem.js';
import { CollisionSystem } from './systems/CollisionSystem.js';
import { RenderSystem } from './systems/RenderSystem.js';
import { Vector2 } from '../utils/Vector2.js';

export class Game {
  /**
   * Create a new Game
   * @param {HTMLCanvasElement} canvas - Canvas element (optional, null for headless)
   * @param {CanvasRenderingContext2D} context - 2D rendering context (optional, null for headless)
   */
  constructor(canvas = null, context = null) {
    this.canvas = canvas;
    this.context = context;
    this.isHeadless = !canvas || !context;
    
    // Game state
    this.state = GameConfig.game.states.WAITING;
    this.winner = null;
    this.startTime = 0;
    this.endTime = 0;
    this.stepCount = 0;
    this.cumPlayerDecisionTime = 0;
    
    // Track previous distance for delta distance reward
    this.previousDistance = null;
    
    // Game entities
    this.arena = null;
    this.players = [];
    this.ais = [];
    
    // Game systems
    this.inputSystem = null;
    this.movementSystem = null;
    this.collisionSystem = null;
    this.renderSystem = null;
    
    // Game configuration
    this.config = GameConfig;
    
    // No auto-restart - only manual restart via SPACE key
  }

  /**
   * Initialize the game
   */
  async init() {
    try {
      if (!this.isHeadless) {
        console.log('Initializing game...');
      }
      
      // Create arena
      const arenaId = this.isHeadless ? `headless-arena-${Date.now()}` : 'main-arena';
      this.arena = new Arena(arenaId, this.config.arena.width, this.config.arena.height);
      
      // Create game systems (skip input and rendering for headless)
      if (!this.isHeadless) {
        this.inputSystem = new InputSystem(this.canvas);
        this.renderSystem = new RenderSystem(this.canvas, this.context);
        this.renderSystem.setArena(this.arena);
      }
      
      this.movementSystem = new MovementSystem(this.arena);
      this.collisionSystem = new CollisionSystem(this.arena);
      
      // Create initial game entities
      this.createGameEntities();
      
      if (!this.isHeadless) {
        console.log('Game initialized successfully');
      }
      return true;
    } catch (error) {
      console.error('Failed to initialize game:', error);
      throw error;
    }
  }

  /**
   * Create game entities (players, AIs, etc.)
   */
  createGameEntities() {
    // Clear existing entities
    this.players = [];
    this.ais = [];
    
    // Generate random positions with minimum distance
    const positions = this.generateRandomPositions(2, 5); // 2 entities, 5 units minimum distance
    
    // Create human player
    const player = new Player('player-1', positions[0]);
    this.players.push(player);
    
    // Create AI opponent
    const ai = new AI('ai-1', positions[1]);
    this.ais.push(ai);
    
    console.log('Game entities created with random positions');
  }

  /**
   * Generate random positions with minimum distance between entities
   * @param {number} count - Number of positions to generate
   * @param {number} minDistance - Minimum distance between positions
   * @returns {Array<Vector2>} Array of position vectors
   */
  generateRandomPositions(count, minDistance) {
    const positions = [];
    const maxAttempts = 100; // Prevent infinite loops
    
    for (let i = 0; i < count; i++) {
      let attempts = 0;
      let position;
      let validPosition = false;
      
      while (!validPosition && attempts < maxAttempts) {
        // Generate random position within arena bounds
        position = this.arena.getRandomPosition(0.5); // 0.5 unit radius for entity
        
        // Check if position is far enough from existing positions
        validPosition = true;
        for (const existingPos of positions) {
          const distance = this.calculateDistance(position, existingPos);
          if (distance < minDistance) {
            validPosition = false;
            break;
          }
        }
        
        attempts++;
      }
      
      // If we couldn't find a valid position, use a fallback
      if (!validPosition) {
        console.warn(`Could not find valid position for entity ${i}, using fallback`);
        position = this.getFallbackPosition(i);
      }
      
      positions.push(position);
    }
    
    return positions;
  }

  /**
   * Calculate distance between two positions
   * @param {Vector2} pos1 - First position
   * @param {Vector2} pos2 - Second position
   * @returns {number} Distance between positions
   */
  calculateDistance(pos1, pos2) {
    return pos1.distance(pos2);
  }

  /**
   * Get fallback position if random generation fails
   * @param {number} index - Entity index
   * @returns {Vector2} Fallback position
   */
  getFallbackPosition(index) {
    // Use predefined positions as fallback
    const fallbackPositions = [
      new Vector2(this.config.player.initialPosition.x, this.config.player.initialPosition.y),
      new Vector2(this.config.ai.initialPosition.x, this.config.ai.initialPosition.y)
    ];
    
    return fallbackPositions[index] || fallbackPositions[0];
  }

  /**
   * Start the game
   */
  start() {
    if (this.state !== GameConfig.game.states.WAITING) {
      console.warn('Game is not in waiting state, cannot start');
      return;
    }
    
    console.log('Starting game...');
    
    // Reset game state
    this.state = GameConfig.game.states.PLAYING;
    this.winner = null;
    this.startTime = Date.now();
    this.endTime = 0;
    this.stepCount = 0;
    
    // No auto-restart timer to clear
    
    // Reset all entities
    this.resetGameEntities();
    
    console.log('Game started');
  }

  /**
   * Stop the game
   */
  stop() {
    console.log('Stopping game...');
    
    this.state = GameConfig.game.states.WAITING;
    this.endTime = Date.now();
    
    // No auto-restart timer to clear
    
    console.log('Game stopped');
  }

  /**
   * Pause the game
   */
  pause() {
    if (this.state === GameConfig.game.states.PLAYING) {
      this.state = GameConfig.game.states.PAUSED;
      console.log('Game paused');
    }
  }

  /**
   * Resume the game
   */
  resume() {
    if (this.state === GameConfig.game.states.PAUSED) {
      this.state = GameConfig.game.states.PLAYING;
      console.log('Game resumed');
    }
  }

  /**
   * Update the game
   * @param {number} deltaTime - Time since last update in seconds
   */
  update(deltaTime) {
    if (this.state !== GameConfig.game.states.PLAYING) {
      return;
    }
    
    // Increment step counter
    this.stepCount++;
    
    // Update input system (skip if headless)
    if (!this.isHeadless && this.inputSystem) {
      this.inputSystem.update(deltaTime);
    }
    
    // Update movement system
    this.movementSystem.update(deltaTime);
    
    // Update collision system
    this.collisionSystem.update(deltaTime);
    
    // Update render system (skip if headless)
    if (!this.isHeadless && this.renderSystem) {
      this.renderSystem.update(deltaTime);
    }
    
    // Update all players
    for (const player of this.players) {
      // Create game state for AI decisions
      const gameState = this.createGameState(player);
      const startTime = Date.now();
      player.update(this.inputSystem, deltaTime, gameState);
      this.cumPlayerDecisionTime += Date.now() - startTime;
    }
    
    // Update all AIs
    for (const ai of this.ais) {
      ai.update(deltaTime);
    }
    
    // Check for collisions
    const collisionResults = this.collisionSystem.checkCollisions(
      this.players, this.ais, deltaTime
    );
    
    // Handle collision results
    this.handleCollisionResults(collisionResults);
  }

  /**
   * Handle collision results
   * @param {Object} results - Collision results
   */
  handleCollisionResults(results) {
    if (results.gameOver) {
      this.endGame(results.winner, results.tie);
    }
  }

  /**
   * Start rollout and return initial observation (for rollout-based training)
   * @returns {Object} Initial game state/observation
   */
  startRollout() {
    // Reset game state
    this.state = GameConfig.game.states.PLAYING;
    this.winner = null;
    this.startTime = Date.now();
    this.endTime = 0;
    this.stepCount = 0;
    
    // Reset all entities
    this.resetGameEntities();
    
    // Initialize previous distance for delta distance reward calculation
    const player = this.getPlayer();
    const ai = this.getAI();
    if (player && ai) {
      const playerPos = player.getPosition();
      const aiPos = ai.getPosition();
      this.previousDistance = playerPos.distance(aiPos);
    } else {
      this.previousDistance = null;
    }
    
    // Return initial observation
    return this.createGameState(player);
  }

  /**
   * Update game for rollout with given action (for rollout-based training)
   * @param {number} actionIndex - Action index (0=W, 1=A, 2=S, 3=D)
   * @param {number} deltaTime - Time since last update in seconds
   * @returns {Object} {observation, done, reward}
   */
  updateRollout(actionIndex, deltaTime) {
    if (this.state !== GameConfig.game.states.PLAYING) {
      // Game already ended, return final state
      const player = this.getPlayer();
      const observation = this.createGameState(player);
      return {
        observation,
        done: true,
        reward: 0 // No reward change after game ended
      };
    }
    
    // Increment step counter
    this.stepCount++;
    
    // Apply action to player
    const player = this.getPlayer();
    if (player) {
      player.applyActionByIndex(actionIndex);
      
      // Update player position
      const velocity = player.getVelocity();
      const newPosition = player.getPosition().clone().add(velocity.clone().multiplyScalar(deltaTime));
      
      // Check arena boundaries
      if (this.arena && this.arena.isPositionValidVector(newPosition, player.getRadius())) {
        player.setPosition(newPosition);
      } else if (this.arena) {
        const constrainedPos = this.arena.constrainPositionVector(newPosition, player.getRadius());
        player.setPosition(constrainedPos);
      }
    }
    
    // Update AI movement (already includes saber update internally)
    for (const ai of this.ais) {
      ai.update(deltaTime);
    }
    
    // Update saber rotations
    if (player) {
      player.getSaber().update(deltaTime);
    }
    
    // Check for collisions
    const collisionResults = this.collisionSystem.checkCollisions(
      this.players, this.ais, deltaTime
    );
    
    // Handle collision results and check if game ended
    let done = false;
    let reward = 0;
    
    // Calculate elapsed time
    const timeInSeconds = this.stepCount * deltaTime;
    const maxGameLength = GameConfig.rl.rewards.maxGameLength || 60;
    
    // Check for timeout (game ran too long)
    if (timeInSeconds >= maxGameLength) {
      done = true;
      // Force tie game on timeout
      reward = GameConfig.rl.rewards.tie || 0;
      
      // Update game state
      this.state = GameConfig.game.states.TIE;
      this.winner = null;
      this.endTime = Date.now();
      
      // Kill all entities
      for (const p of this.players) {
        p.kill();
      }
      for (const ai of this.ais) {
        ai.kill();
      }
    } else if (collisionResults.gameOver) {
      done = true;
      const winner = collisionResults.winner;
      const isTie = collisionResults.tie;
      
      // Calculate terminal reward (win/loss/tie)
      if (isTie) {
        reward = GameConfig.rl.rewards.tie || 0;
      } else if (winner && winner.id === 'player-1') {
        reward = GameConfig.rl.rewards.win || 1.0;
      } else {
        reward = GameConfig.rl.rewards.loss || -1.0;
      }
      
      // Update game state
      this.state = isTie ? GameConfig.game.states.TIE : GameConfig.game.states.GAME_OVER;
      this.winner = winner;
      this.endTime = Date.now();
      
      // Kill all entities
      for (const p of this.players) {
        p.kill();
      }
      for (const ai of this.ais) {
        ai.kill();
      }
    } else {
      // Calculate time penalty per step (only if after threshold)
      // timePenalty is per second, so multiply by deltaTime to get per-step penalty
      const timePenaltyThreshold = GameConfig.rl.rewards.timePenaltyThreshold || 0;
      if (timeInSeconds > timePenaltyThreshold) {
        const timePenaltyPerSecond = GameConfig.rl.rewards.timePenalty;
        reward = timePenaltyPerSecond * deltaTime; // Convert per-second to per-step
      }
      
      // Calculate distance-based penalty per second
      // distancePenaltyFactor is per second, so multiply by deltaTime to get per-step penalty
      const distancePenaltyFactor = GameConfig.rl.rewards.distancePenaltyFactor || 0;
      if (distancePenaltyFactor !== 0 && player) {
        const ai = this.getAI();
        if (ai) {
          const playerPos = player.getPosition();
          const aiPos = ai.getPosition();
          const distance = playerPos.distance(aiPos);
          const distancePenaltyPerSecond = distance * distancePenaltyFactor;
          reward += distancePenaltyPerSecond * deltaTime; // Convert per-second to per-step
        }
      }
      
      // Calculate delta distance reward (reward for getting closer)
      const deltaDistanceRewardFactor = GameConfig.rl.rewards.deltaDistanceRewardFactor || 0;
      if (deltaDistanceRewardFactor !== 0 && player && this.previousDistance !== null) {
        const ai = this.getAI();
        if (ai) {
          const playerPos = player.getPosition();
          const aiPos = ai.getPosition();
          const currentDistance = playerPos.distance(aiPos);
          const deltaDistance = this.previousDistance - currentDistance; // Positive if getting closer
          const deltaDistanceReward = deltaDistanceRewardFactor * deltaDistance * deltaTime;
          reward += deltaDistanceReward;
          
          // Update previous distance for next step
          this.previousDistance = currentDistance;
        }
      } else if (player && this.previousDistance === null) {
        // Initialize previous distance if not set
        const ai = this.getAI();
        if (ai) {
          const playerPos = player.getPosition();
          const aiPos = ai.getPosition();
          this.previousDistance = playerPos.distance(aiPos);
        }
      }
    }
    
    // Build outcome metadata for terminal transitions
    let outcome = null;
    if (done) {
      const isTie = this.state === GameConfig.game.states.TIE;
      let winnerId = null;
      if (!isTie && this.winner) {
        winnerId = this.winner.id || this.winner;
      }
      outcome = { isTie, winnerId };
    }
    
    // Return new observation
    const observation = this.createGameState(player);
    
    return {
      observation,
      done,
      reward,
      outcome
    };
  }

  /**
   * End the game
   * @param {Object} winner - Winning entity
   * @param {boolean} tie - Whether it's a tie game
   */
  endGame(winner, tie = false) {
    console.log('Game ended:', tie ? 'Tie' : `Winner: ${winner ? winner.id : 'None'}`);
    
    this.state = tie ? GameConfig.game.states.TIE : GameConfig.game.states.GAME_OVER;
    this.winner = winner;
    this.endTime = Date.now();
    
    // Kill all entities
    for (const player of this.players) {
      player.kill();
    }
    for (const ai of this.ais) {
      ai.kill();
    }
    
    // Stop the game loop immediately when game ends
    if (this.onGameEnd) {
      this.onGameEnd(winner, this.stepCount);
      let gameDur = this.endTime - this.startTime;
      console.log("Average FPS: ", this.stepCount / gameDur * 1000, " Game Duration: ", gameDur, " Steps: ", this.stepCount, "  Cumulative Player Decision Time: ", this.cumPlayerDecisionTime);
    }
  }


  /**
   * Restart the game (manual restart only)
   */
  restart() {
    console.log('Restarting game...');
    
    // Reset game state
    this.state = GameConfig.game.states.WAITING;
    this.winner = null;
    this.startTime = 0;
    this.endTime = 0;
    this.stepCount = 0;
    
    // Reset all entities
    this.resetGameEntities();
    
    // Call restart callback if set
    if (this.onRestart) {
      this.onRestart();
    }
    
    console.log('Game restarted');
  }

  /**
   * Reset all game entities
   */
  resetGameEntities() {
    // Generate new random positions with minimum distance
    const positions = this.generateRandomPositions(2, 5); // 2 entities, 5 units minimum distance
    
    // Reset players
    for (let i = 0; i < this.players.length; i++) {
      this.players[i].resurrect(positions[i]);
    }
    
    // Reset AIs
    for (let i = 0; i < this.ais.length; i++) {
      this.ais[i].resurrect(positions[i + this.players.length]);
    }
  }

  /**
   * Render the game
   */
  render() {
    // Clear canvas
    this.renderSystem.clear();
    
    // Render arena
    this.renderSystem.renderArena();
    
    // Render entities
    this.renderSystem.renderEntities(this.players, this.ais);
    
    // Render UI
    this.renderSystem.renderUI({
      state: this.state,
      winner: this.winner,
      players: this.players,
      ais: this.ais
    });
  }

  /**
   * Get current game state
   * @returns {Object} Game state
   */
  getState() {
    return {
      state: this.state,
      winner: this.winner,
      startTime: this.startTime,
      endTime: this.endTime,
      players: this.players.map(p => p.getState()),
      ais: this.ais.map(a => a.getState()),
      arena: this.arena.getState()
    };
  }

  /**
   * Set game state
   * @param {Object} state - Game state
   */
  setState(state) {
    this.state = state.state;
    this.winner = state.winner;
    this.startTime = state.startTime;
    this.endTime = state.endTime;
    
    // Restore entities
    if (state.players) {
      this.players = state.players.map(pState => {
        const player = new Player(pState.id, new Vector2(pState.position.x, pState.position.y));
        player.setState(pState);
        return player;
      });
    }
    
    if (state.ais) {
      this.ais = state.ais.map(aState => {
        const ai = new AI(aState.id, new Vector2(aState.position.x, aState.position.y));
        ai.setState(aState);
        return ai;
      });
    }
    
    if (state.arena) {
      this.arena.setState(state.arena);
    }
  }

  /**
   * Get game statistics
   * @returns {Object} Game statistics
   */
  getStats() {
    const gameDuration = this.endTime > 0 ? this.endTime - this.startTime : Date.now() - this.startTime;
    
    return {
      state: this.state,
      gameDuration: gameDuration,
      playerCount: this.players.length,
      aiCount: this.ais.length,
      winner: this.winner ? this.winner.id : null,
      fps: this.renderSystem.getFPS()
    };
  }

  /**
   * Check if game is running
   * @returns {boolean} True if game is running
   */
  isRunning() {
    return this.state === GameConfig.game.states.PLAYING;
  }

  /**
   * Check if game is paused
   * @returns {boolean} True if game is paused
   */
  isPaused() {
    return this.state === GameConfig.game.states.PAUSED;
  }

  /**
   * Check if game is over
   * @returns {boolean} True if game is over
   */
  isGameOver() {
    return this.state === GameConfig.game.states.GAME_OVER || 
           this.state === GameConfig.game.states.TIE;
  }

  /**
   * Get the player entity
   * @returns {Player} Player entity
   */
  getPlayer() {
    return this.players.length > 0 ? this.players[0] : null;
  }

  /**
   * Get the AI entity
   * @returns {AI} AI entity
   */
  getAI() {
    return this.ais.length > 0 ? this.ais[0] : null;
  }

  /**
   * Create game state for AI decisions
   * @param {Player} player - Player entity
   * @returns {Object} Game state object
   */
  createGameState(player) {
    const ai = this.getAI();
    if (!ai) {
      return null;
    }

    return {
      playerPosition: player.getPosition(),
      opponentPosition: ai.getPosition(),
      playerSaberAngle: player.getSaber().getAngle(),
      playerSaberAngularVelocity: player.getSaber().getRotationSpeed(),
      opponentSaberAngle: ai.getSaber().getAngle(),
      opponentSaberAngularVelocity: ai.getSaber().getRotationSpeed(),
      timestamp: Date.now()
    };
  }

  /**
   * Get string representation
   * @returns {string} String representation
   */
  toString() {
    return `Game(state: ${this.state}, players: ${this.players.length}, ais: ${this.ais.length})`;
  }

  /**
   * Dispose of resources
   */
  dispose() {
    // Dispose of all players
    for (const player of this.players) {
      player.dispose();
    }
    
    // Dispose of all AIs
    for (const ai of this.ais) {
      ai.dispose();
    }
    
    // Dispose of render system
    if (this.renderSystem) {
      this.renderSystem.dispose();
    }
  }
}
