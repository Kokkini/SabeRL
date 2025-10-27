/**
 * TrainingWorker - Web Worker for running parallel training games
 * Runs headless games without rendering to collect training data
 */

// Import TensorFlow.js
importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.15.0/dist/tf.min.js');

// Simple TensorFlow.js operations for the worker
const tf = self.tf;

class TrainingWorker {
  constructor() {
    this.isRunning = false;
    this.activeGames = new Map();
    this.gameCounter = 0;
    
    // Game components (simplified versions for headless execution)
    this.gameConfig = null;
    this.neuralNetwork = null;
    this.policyAgent = null;
    
    // Statistics
    this.stats = {
      totalGames: 0,
      completedGames: 0,
      failedGames: 0,
      startTime: 0
    };
  }

  /**
   * Initialize the worker
   */
  async initialize() {
    try {
      // Wait for TensorFlow.js to be ready
      await tf.ready();
      console.log('TrainingWorker initialized');
      this.sendMessage('WORKER_READY');
    } catch (error) {
      console.error('Failed to initialize TrainingWorker:', error);
      this.sendError('INIT_ERROR', error);
    }
  }

  /**
   * Start training games
   * @param {Array} gameIds - Array of game IDs to start
   * @param {Object} config - Training configuration
   */
  async startGames(gameIds, config) {
    try {
      this.isRunning = true;
      this.gameConfig = config.gameConfig;
      this.stats.startTime = Date.now();
      
      // Initialize neural network from serialized data
      this.neuralNetwork = await this.loadNeuralNetwork(config.neuralNetwork);
      
      // Create policy agent
      this.policyAgent = this.createPolicyAgent();
      
      // Start each game
      for (const gameId of gameIds) {
        this.startGame(gameId);
      }
      
      console.log(`Started ${gameIds.length} training games`);
    } catch (error) {
      console.error('Failed to start games:', error);
      this.sendError('START_GAMES_ERROR', error);
    }
  }

  /**
   * Stop all games
   */
  stopGames() {
    this.isRunning = false;
    this.activeGames.clear();
    console.log('All training games stopped');
  }

  /**
   * Start a single game
   * @param {string} gameId - Game ID
   */
  startGame(gameId) {
    if (!this.isRunning) {
      return;
    }

    try {
      const game = this.createHeadlessGame();
      this.activeGames.set(gameId, {
        game,
        startTime: Date.now(),
        status: 'running'
      });
      
      // Run the game asynchronously
      this.runGame(gameId, game);
      
    } catch (error) {
      console.error(`Failed to start game ${gameId}:`, error);
      this.sendGameError(gameId, error);
    }
  }

  /**
   * Run a headless game
   * @param {string} gameId - Game ID
   * @param {Object} game - Game instance
   */
  async runGame(gameId, game) {
    try {
      const maxGameTime = this.gameConfig.rl.rewards.maxGameLength * 1000; // Convert to ms
      const startTime = Date.now();
      
      // Run game loop
      while (this.isRunning && this.activeGames.has(gameId)) {
        const currentTime = Date.now();
        const deltaTime = 16; // ~60 FPS
        
        // Update game
        game.update(deltaTime);
        
        // Check for game end
        if (game.isGameOver() || (currentTime - startTime) > maxGameTime) {
          const result = this.getGameResult(game);
          this.handleGameComplete(gameId, result);
          break;
        }
        
        // Small delay to prevent blocking
        await this.sleep(16);
      }
      
    } catch (error) {
      console.error(`Error running game ${gameId}:`, error);
      this.sendGameError(gameId, error);
    }
  }

  /**
   * Create a headless game instance
   * @returns {Object} Headless game
   */
  createHeadlessGame() {
    const game = {
      player: this.createPlayer(),
      ai: this.createAI(),
      arena: this.createArena(),
      startTime: Date.now(),
      isGameOver: false,
      winner: null
    };
    
    // Set up collision detection
    game.checkCollisions = () => {
      // Simple collision detection between player saber and AI
      const playerSaber = game.player.getSaber();
      const aiPosition = game.ai.getPosition();
      
      if (this.checkSaberHit(playerSaber, aiPosition)) {
        game.isGameOver = true;
        game.winner = 'player';
        return true;
      }
      
      // Check AI saber hit on player
      const aiSaber = game.ai.getSaber();
      const playerPosition = game.player.getPosition();
      
      if (this.checkSaberHit(aiSaber, playerPosition)) {
        game.isGameOver = true;
        game.winner = 'ai';
        return true;
      }
      
      return false;
    };
    
    game.update = (deltaTime) => {
      // Update player (AI controlled)
      game.player.updateAI(deltaTime, game);
      
      // Update AI
      game.ai.update(deltaTime);
      
      // Check collisions
      game.checkCollisions();
    };
    
    return game;
  }

  /**
   * Create a headless player
   * @returns {Object} Headless player
   */
  createPlayer() {
    const position = tf.tensor2d([[8, 8]]); // Center of arena
    const velocity = tf.tensor2d([[0, 0]]);
    
    return {
      position,
      velocity,
      saber: this.createSaber(),
      controlMode: 'ai',
      policyAgent: this.policyAgent,
      
      updateAI(deltaTime, gameState) {
        // Make AI decision
        const decision = this.policyAgent.makeDecision(gameState);
        
        // Apply movement based on decision
        const speed = this.gameConfig.game.playerSpeed;
        const moveVector = this.convertDecisionToMovement(decision);
        
        // Update position
        const newPosition = this.position.add(moveVector.mul(speed * deltaTime));
        this.position.dispose();
        this.position = newPosition;
        
        // Update saber
        this.saber.update(deltaTime);
      },
      
      convertDecisionToMovement(decision) {
        const action = decision.action;
        let moveX = 0, moveY = 0;
        
        switch (action) {
          case 'W': moveY = -1; break;
          case 'A': moveX = -1; break;
          case 'S': moveY = 1; break;
          case 'D': moveX = 1; break;
        }
        
        return tf.tensor2d([[moveX, moveY]]);
      },
      
      getPosition() {
        return this.position;
      },
      
      getSaber() {
        return this.saber;
      },
      
      dispose() {
        this.position.dispose();
        this.velocity.dispose();
        this.saber.dispose();
      }
    };
  }

  /**
   * Create a headless AI
   * @returns {Object} Headless AI
   */
  createAI() {
    const position = tf.tensor2d([[8, 8]]); // Center of arena
    const velocity = tf.tensor2d([[0, 0]]);
    
    return {
      position,
      velocity,
      saber: this.createSaber(),
      direction: Math.random() * 2 * Math.PI,
      directionChangeTime: 0,
      
      update(deltaTime) {
        // Simple random movement
        this.directionChangeTime += deltaTime;
        if (this.directionChangeTime > 1000) { // Change direction every second
          this.direction = Math.random() * 2 * Math.PI;
          this.directionChangeTime = 0;
        }
        
        const speed = this.gameConfig.game.aiSpeed;
        const moveX = Math.cos(this.direction) * speed * deltaTime;
        const moveY = Math.sin(this.direction) * speed * deltaTime;
        
        const newPosition = this.position.add(tf.tensor2d([[moveX, moveY]]));
        this.position.dispose();
        this.position = newPosition;
        
        // Update saber
        this.saber.update(deltaTime);
      },
      
      getPosition() {
        return this.position;
      },
      
      getSaber() {
        return this.saber;
      },
      
      dispose() {
        this.position.dispose();
        this.velocity.dispose();
        this.saber.dispose();
      }
    };
  }

  /**
   * Create a headless saber
   * @returns {Object} Headless saber
   */
  createSaber() {
    return {
      angle: 0,
      angularVelocity: this.gameConfig.arena.saberRotationSpeed,
      length: this.gameConfig.arena.saberLength,
      
      update(deltaTime) {
        this.angle += this.angularVelocity * deltaTime;
      },
      
      getAngle() {
        return this.angle;
      },
      
      getEndPosition(playerPosition) {
        const endX = playerPosition.dataSync()[0] + Math.cos(this.angle) * this.length;
        const endY = playerPosition.dataSync()[1] + Math.sin(this.angle) * this.length;
        return tf.tensor2d([[endX, endY]]);
      },
      
      dispose() {
        // No resources to dispose
      }
    };
  }

  /**
   * Create a headless arena
   * @returns {Object} Headless arena
   */
  createArena() {
    return {
      width: this.gameConfig.arena.width,
      height: this.gameConfig.arena.height,
      
      constrainPosition(position) {
        const x = Math.max(1, Math.min(this.width - 1, position.dataSync()[0]));
        const y = Math.max(1, Math.min(this.height - 1, position.dataSync()[1]));
        return tf.tensor2d([[x, y]]);
      }
    };
  }

  /**
   * Check if saber hits target
   * @param {Object} saber - Saber object
   * @param {tf.Tensor} targetPosition - Target position
   * @returns {boolean} True if hit
   */
  checkSaberHit(saber, targetPosition) {
    // Simple distance check (in real implementation, would check line-circle intersection)
    const saberEnd = saber.getEndPosition(tf.tensor2d([[0, 0]])); // Simplified
    const distance = tf.norm(saberEnd.sub(targetPosition));
    const hit = distance.dataSync()[0] < 1.0; // Player radius
    
    saberEnd.dispose();
    distance.dispose();
    
    return hit;
  }

  /**
   * Get game result
   * @param {Object} game - Game instance
   * @returns {Object} Game result
   */
  getGameResult(game) {
    const gameLength = (Date.now() - game.startTime) / 1000;
    
    return {
      winner: game.winner || 'timeout',
      gameLength,
      metrics: {
        playerPosition: game.player.getPosition().dataSync(),
        aiPosition: game.ai.getPosition().dataSync()
      }
    };
  }

  /**
   * Handle game completion
   * @param {string} gameId - Game ID
   * @param {Object} result - Game result
   */
  handleGameComplete(gameId, result) {
    if (this.activeGames.has(gameId)) {
      const gameInfo = this.activeGames.get(gameId);
      gameInfo.status = 'completed';
      gameInfo.endTime = Date.now();
      gameInfo.duration = gameInfo.endTime - gameInfo.startTime;
      
      // Update statistics
      this.stats.completedGames++;
      
      // Clean up game resources
      gameInfo.game.player.dispose();
      gameInfo.game.ai.dispose();
      
      // Remove from active games
      this.activeGames.delete(gameId);
      
      // Send completion message
      this.sendMessage('GAME_COMPLETE', {
        gameId,
        result,
        metrics: result.metrics
      });
      
      // Check if all games are complete
      if (this.activeGames.size === 0) {
        this.sendMessage('ALL_GAMES_COMPLETE', {
          stats: this.stats
        });
      }
    }
  }

  /**
   * Load neural network from serialized data
   * @param {Object} serializedModel - Serialized model data
   * @returns {tf.LayersModel} Loaded model
   */
  async loadNeuralNetwork(serializedModel) {
    // This would load the actual model in a real implementation
    // For now, return a placeholder
    return {
      predict: (input) => {
        // Random action selection for now
        const actions = ['W', 'A', 'S', 'D'];
        const randomAction = actions[Math.floor(Math.random() * actions.length)];
        return tf.tensor2d([[0.25, 0.25, 0.25, 0.25]]); // Equal probabilities
      }
    };
  }

  /**
   * Create policy agent
   * @returns {Object} Policy agent
   */
  createPolicyAgent() {
    return {
      makeDecision(gameState) {
        // Simple random decision for now
        const actions = ['W', 'A', 'S', 'D', 'NONE'];
        const randomAction = actions[Math.floor(Math.random() * actions.length)];
        
        return {
          action: randomAction,
          confidence: 0.25,
          probabilities: [0.25, 0.25, 0.25, 0.25]
        };
      }
    };
  }

  /**
   * Send message to main thread
   * @param {string} type - Message type
   * @param {*} data - Message data
   */
  sendMessage(type, data = null) {
    self.postMessage({ type, data });
  }

  /**
   * Send error message to main thread
   * @param {string} type - Error type
   * @param {Error} error - Error object
   */
  sendError(type, error) {
    self.postMessage({ 
      type: 'ERROR', 
      data: { errorType: type, error: error.message, stack: error.stack }
    });
  }

  /**
   * Send game error message to main thread
   * @param {string} gameId - Game ID
   * @param {Error} error - Error object
   */
  sendGameError(gameId, error) {
    self.postMessage({
      type: 'GAME_ERROR',
      data: { gameId, error: error.message }
    });
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Initialize worker
const worker = new TrainingWorker();

// Handle messages from main thread
self.onmessage = async (event) => {
  const { type, data } = event.data;
  
  try {
    switch (type) {
      case 'INIT':
        await worker.initialize();
        break;
        
      case 'START_GAMES':
        await worker.startGames(data.gameIds, data.config);
        break;
        
      case 'STOP_GAMES':
        worker.stopGames();
        break;
        
      default:
        console.warn(`Unknown message type: ${type}`);
    }
  } catch (error) {
    console.error(`Worker error handling ${type}:`, error);
    worker.sendError(`${type}_ERROR`, error);
  }
};