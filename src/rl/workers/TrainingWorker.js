/**
 * TrainingWorker - Web Worker for running training games in parallel
 * Executes training games without blocking the main thread
 */

// Import necessary modules (Web Workers have limited import support)
// In a real implementation, you would need to use importScripts or bundle the worker

class TrainingWorker {
  constructor() {
    this.activeGames = new Map();
    this.isRunning = false;
  }

  /**
   * Handle messages from main thread
   * @param {MessageEvent} event - Message event
   */
  handleMessage(event) {
    const { type, data } = event.data;

    switch (type) {
      case 'START_GAMES':
        this.startGames(data);
        break;
      
      case 'STOP_GAMES':
        this.stopGames();
        break;
      
      case 'PAUSE_GAMES':
        this.pauseGames();
        break;
      
      case 'RESUME_GAMES':
        this.resumeGames();
        break;
      
      default:
        console.warn(`Unknown message type: ${type}`);
    }
  }

  /**
   * Start training games
   * @param {Object} data - Game data
   */
  async startGames(data) {
    const { gameIds, config } = data;
    
    this.isRunning = true;
    
    for (const gameId of gameIds) {
      this.startGame(gameId, config);
    }
    
    // Notify main thread that worker is ready
    self.postMessage({ type: 'WORKER_READY' });
  }

  /**
   * Start a single training game
   * @param {string} gameId - Game ID
   * @param {Object} config - Game configuration
   */
  async startGame(gameId, config) {
    try {
      const game = {
        id: gameId,
        config,
        startTime: Date.now(),
        status: 'running'
      };
      
      this.activeGames.set(gameId, game);
      
      // Simulate game execution
      // In a real implementation, this would run the actual game logic
      await this.runGame(game);
      
    } catch (error) {
      this.handleGameError(gameId, error);
    }
  }

  /**
   * Run a training game
   * @param {Object} game - Game object
   */
  async runGame(game) {
    const { id, config } = game;
    
    try {
      // Simulate game execution with configurable duration
      const gameDuration = config.gameDuration || 5000; // 5 seconds default
      const maxSteps = config.maxSteps || 1000;
      
      let step = 0;
      let gameState = this.initializeGameState(config);
      let totalReward = 0;
      
      // Game loop
      while (step < maxSteps && this.isRunning) {
        // Simulate game step
        const stepResult = this.simulateGameStep(gameState, config);
        gameState = stepResult.state;
        totalReward += stepResult.reward;
        
        step++;
        
        // Check for game end conditions
        if (stepResult.terminated) {
          break;
        }
        
        // Small delay to prevent blocking
        if (step % 10 === 0) {
          await this.delay(1);
        }
      }
      
      // Calculate final result
      const result = this.calculateGameResult(gameState, totalReward, step);
      const metrics = this.calculateGameMetrics(game, result);
      
      // Complete the game
      this.completeGame(id, result, metrics);
      
    } catch (error) {
      this.handleGameError(id, error);
    }
  }

  /**
   * Initialize game state
   * @param {Object} config - Game configuration
   * @returns {Object} Initial game state
   */
  initializeGameState(config) {
    return {
      playerPosition: { x: 0, y: 0 },
      opponentPosition: { x: 10, y: 10 },
      playerSaberAngle: 0,
      opponentSaberAngle: Math.PI,
      step: 0,
      terminated: false
    };
  }

  /**
   * Simulate a game step
   * @param {Object} state - Current game state
   * @param {Object} config - Game configuration
   * @returns {Object} Step result
   */
  simulateGameStep(state, config) {
    // Simple simulation - in reality this would run the actual game logic
    const stepSize = 0.1;
    const reward = Math.random() * 0.1 - 0.05; // Small random reward
    
    // Update positions (random walk)
    state.playerPosition.x += (Math.random() - 0.5) * stepSize;
    state.playerPosition.y += (Math.random() - 0.5) * stepSize;
    state.opponentPosition.x += (Math.random() - 0.5) * stepSize;
    state.opponentPosition.y += (Math.random() - 0.5) * stepSize;
    
    // Update saber angles
    state.playerSaberAngle += 0.1;
    state.opponentSaberAngle += 0.1;
    
    state.step++;
    
    // Random termination
    const terminated = Math.random() < 0.01; // 1% chance per step
    
    return {
      state,
      reward,
      terminated
    };
  }

  /**
   * Calculate game result
   * @param {Object} state - Final game state
   * @param {number} totalReward - Total reward earned
   * @param {number} steps - Number of steps taken
   * @returns {Object} Game result
   */
  calculateGameResult(state, totalReward, steps) {
    // Simple result calculation
    const winner = totalReward > 0 ? 'player' : 'ai';
    
    return {
      winner,
      totalReward,
      steps,
      finalState: state
    };
  }

  /**
   * Calculate game metrics
   * @param {Object} game - Game object
   * @param {Object} result - Game result
   * @returns {Object} Game metrics
   */
  calculateGameMetrics(game, result) {
    const duration = Date.now() - game.startTime;
    
    return {
      duration,
      rewardPerStep: result.totalReward / result.steps,
      efficiency: result.steps / duration,
      winRate: result.winner === 'player' ? 1 : 0
    };
  }

  /**
   * Complete a game
   * @param {string} gameId - Game ID
   * @param {Object} result - Game result
   * @param {Object} metrics - Game metrics
   */
  completeGame(gameId, result, metrics) {
    if (this.activeGames.has(gameId)) {
      const game = this.activeGames.get(gameId);
      game.status = 'completed';
      game.endTime = Date.now();
      
      // Notify main thread
      self.postMessage({
        type: 'GAME_COMPLETE',
        data: {
          gameId,
          result,
          metrics
        }
      });
      
      this.activeGames.delete(gameId);
    }
  }

  /**
   * Handle game error
   * @param {string} gameId - Game ID
   * @param {Error} error - Error object
   */
  handleGameError(gameId, error) {
    if (this.activeGames.has(gameId)) {
      const game = this.activeGames.get(gameId);
      game.status = 'failed';
      game.error = error.message;
      
      // Notify main thread
      self.postMessage({
        type: 'GAME_ERROR',
        data: {
          gameId,
          error: error.message
        }
      });
      
      this.activeGames.delete(gameId);
    }
  }

  /**
   * Stop all games
   */
  stopGames() {
    this.isRunning = false;
    
    // Clear all active games
    for (const [gameId, game] of this.activeGames) {
      game.status = 'stopped';
    }
    
    this.activeGames.clear();
  }

  /**
   * Pause all games
   */
  pauseGames() {
    this.isRunning = false;
    
    // Update game statuses
    for (const game of this.activeGames.values()) {
      if (game.status === 'running') {
        game.status = 'paused';
      }
    }
  }

  /**
   * Resume all games
   */
  resumeGames() {
    this.isRunning = true;
    
    // Resume paused games
    for (const game of this.activeGames.values()) {
      if (game.status === 'paused') {
        game.status = 'running';
        // Restart the game
        this.startGame(game.id, game.config);
      }
    }
  }

  /**
   * Delay execution
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} Promise that resolves after delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Create worker instance
const worker = new TrainingWorker();

// Set up message handler
self.onmessage = (event) => {
  worker.handleMessage(event);
};

// Handle errors
self.onerror = (error) => {
  console.error('TrainingWorker error:', error);
  self.postMessage({
    type: 'WORKER_ERROR',
    data: { error: error.message }
  });
};

// Notify that worker is ready
self.postMessage({ type: 'WORKER_READY' });
