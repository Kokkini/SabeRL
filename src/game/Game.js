/**
 * Game - Main game class that manages all game systems and state
 * Coordinates between all game systems and manages the overall game flow
 */

// TensorFlow.js is loaded from CDN as a global 'tf' object
import { GameConfig } from '../config/config.js';
import { Arena } from './entities/Arena.js';
import { Player } from './entities/Player.js';
import { AI } from './entities/AI.js';
import { InputSystem } from './systems/InputSystem.js';
import { MovementSystem } from './systems/MovementSystem.js';
import { CollisionSystem } from './systems/CollisionSystem.js';
import { RenderSystem } from './systems/RenderSystem.js';

export class Game {
  /**
   * Create a new Game
   * @param {HTMLCanvasElement} canvas - Canvas element
   * @param {CanvasRenderingContext2D} context - 2D rendering context
   */
  constructor(canvas, context) {
    this.canvas = canvas;
    this.context = context;
    
    // Game state
    this.state = GameConfig.game.states.WAITING;
    this.winner = null;
    this.startTime = 0;
    this.endTime = 0;
    
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
      console.log('Initializing game...');
      
      // Create arena
      this.arena = new Arena('main-arena', this.config.arena.width, this.config.arena.height);
      
      // Create game systems
      this.inputSystem = new InputSystem(this.canvas);
      this.movementSystem = new MovementSystem(this.arena);
      this.collisionSystem = new CollisionSystem(this.arena);
      this.renderSystem = new RenderSystem(this.canvas, this.context);
      
      // Set arena in render system
      this.renderSystem.setArena(this.arena);
      
      // Create initial game entities
      this.createGameEntities();
      
      console.log('Game initialized successfully');
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
   * @returns {Array<tf.Tensor>} Array of position tensors
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
   * @param {tf.Tensor} pos1 - First position
   * @param {tf.Tensor} pos2 - Second position
   * @returns {number} Distance between positions
   */
  calculateDistance(pos1, pos2) {
    const distance = tf.norm(pos1.sub(pos2));
    const result = distance.dataSync()[0];
    distance.dispose();
    return result;
  }

  /**
   * Get fallback position if random generation fails
   * @param {number} index - Entity index
   * @returns {tf.Tensor} Fallback position
   */
  getFallbackPosition(index) {
    // Use predefined positions as fallback
    const fallbackPositions = [
      tf.tensor2d([[this.config.player.initialPosition.x, this.config.player.initialPosition.y]]),
      tf.tensor2d([[this.config.ai.initialPosition.x, this.config.ai.initialPosition.y]])
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
    
    // Update input system
    this.inputSystem.update(deltaTime);
    
    // Update movement system
    this.movementSystem.update(deltaTime);
    
    // Update collision system
    this.collisionSystem.update(deltaTime);
    
    // Update render system
    this.renderSystem.update(deltaTime);
    
    // Update all players
    for (const player of this.players) {
      player.update(this.inputSystem, deltaTime);
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
      this.onGameEnd(winner);
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
        const player = new Player(pState.id, tf.tensor2d([[pState.position.x, pState.position.y]]));
        player.setState(pState);
        return player;
      });
    }
    
    if (state.ais) {
      this.ais = state.ais.map(aState => {
        const ai = new AI(aState.id, tf.tensor2d([[aState.position.x, aState.position.y]]));
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
