/**
 * ParallelRunner - Manages parallel training games using Web Workers
 * Runs multiple training games simultaneously without blocking the main thread
 */

export class ParallelRunner {
  constructor(options = {}) {
    this.options = {
      maxWorkers: options.maxWorkers || navigator.hardwareConcurrency || 4,
      parallelGames: options.parallelGames || 10,
      workerScript: options.workerScript || '/src/MimicRL/workers/TrainingWorker.js',
      ...options
    };

    this.workers = [];
    this.activeGames = new Map();
    this.gameResults = [];
    this.isRunning = false;
    this.gameCounter = 0;

    // Callbacks
    this.onGameComplete = null;
    this.onAllGamesComplete = null;
    this.onError = null;

    // Statistics
    this.stats = {
      totalGames: 0,
      completedGames: 0,
      failedGames: 0,
      averageGameTime: 0,
      startTime: 0
    };
  }

  /**
   * Initialize parallel runner
   */
  async initialize() {
    try {
      // Create Web Workers
      for (let i = 0; i < this.options.maxWorkers; i++) {
        const worker = new Worker(this.options.workerScript);
        worker.id = i;
        
        // Set up worker event handlers
        worker.onmessage = (event) => this.handleWorkerMessage(worker, event);
        worker.onerror = (error) => this.handleWorkerError(worker, error);
        
        this.workers.push(worker);
      }

      console.log(`ParallelRunner initialized with ${this.workers.length} workers`);
      return true;
    } catch (error) {
      console.error('Failed to initialize ParallelRunner:', error);
      return false;
    }
  }

  /**
   * Start parallel training games
   * @param {Object} config - Training configuration
   */
  async start(config = {}) {
    if (this.isRunning) {
      console.warn('ParallelRunner is already running');
      return;
    }

    this.isRunning = true;
    this.stats.startTime = Date.now();
    this.gameResults = [];
    this.activeGames.clear();

    try {
      // Distribute games across workers
      const gamesPerWorker = Math.ceil(this.options.parallelGames / this.workers.length);
      
      for (let i = 0; i < this.workers.length; i++) {
        const worker = this.workers[i];
        const gamesToRun = Math.min(gamesPerWorker, this.options.parallelGames - (i * gamesPerWorker));
        
        if (gamesToRun > 0) {
          this.startWorkerGames(worker, gamesToRun, config);
        }
      }

      console.log(`Started ${this.options.parallelGames} parallel games across ${this.workers.length} workers`);
    } catch (error) {
      console.error('Failed to start parallel games:', error);
      this.isRunning = false;
    }
  }

  /**
   * Start games on a specific worker
   * @param {Worker} worker - Web Worker
   * @param {number} gameCount - Number of games to run
   * @param {Object} config - Training configuration
   */
  startWorkerGames(worker, gameCount, config) {
    const gameIds = [];
    
    for (let i = 0; i < gameCount; i++) {
      const gameId = this.generateGameId();
      gameIds.push(gameId);
      this.activeGames.set(gameId, {
        workerId: worker.id,
        startTime: Date.now(),
        status: 'running'
      });
    }

    // Send start command to worker
    worker.postMessage({
      type: 'START_GAMES',
      gameIds,
      config
    });
  }

  /**
   * Stop all parallel games
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Send stop command to all workers
    for (const worker of this.workers) {
      worker.postMessage({ type: 'STOP_GAMES' });
    }

    // Clear active games
    this.activeGames.clear();

    console.log('ParallelRunner stopped');
  }

  /**
   * Handle worker message
   * @param {Worker} worker - Web Worker
   * @param {MessageEvent} event - Message event
   */
  handleWorkerMessage(worker, event) {
    const { type, data } = event.data;

    switch (type) {
      case 'GAME_COMPLETE':
        this.handleGameComplete(data);
        break;
      
      case 'GAME_ERROR':
        this.handleGameError(data);
        break;
      
      case 'WORKER_READY':
        console.log(`Worker ${worker.id} is ready`);
        break;
      
      default:
        console.warn(`Unknown message type from worker ${worker.id}:`, type);
    }
  }

  /**
   * Handle worker error
   * @param {Worker} worker - Web Worker
   * @param {ErrorEvent} error - Error event
   */
  handleWorkerError(worker, error) {
    console.error(`Worker ${worker.id} error:`, error);
    this.stats.failedGames++;
    
    if (this.onError) {
      this.onError(error, worker.id);
    }
  }

  /**
   * Handle game completion
   * @param {Object} data - Game completion data
   */
  handleGameComplete(data) {
    const { gameId, result, metrics } = data;
    
    if (this.activeGames.has(gameId)) {
      const gameInfo = this.activeGames.get(gameId);
      gameInfo.status = 'completed';
      gameInfo.endTime = Date.now();
      gameInfo.duration = gameInfo.endTime - gameInfo.startTime;
      
      // Update statistics
      this.stats.completedGames++;
      this.updateAverageGameTime(gameInfo.duration);
      
      // Store result
      this.gameResults.push({
        gameId,
        result,
        metrics,
        duration: gameInfo.duration,
        workerId: gameInfo.workerId
      });
      
      // Remove from active games
      this.activeGames.delete(gameId);
      
      // Notify callback
      if (this.onGameComplete) {
        this.onGameComplete(result, metrics, gameId);
      }
      
      // Check if all games are complete
      if (this.activeGames.size === 0) {
        this.handleAllGamesComplete();
      }
    }
  }

  /**
   * Handle game error
   * @param {Object} data - Game error data
   */
  handleGameError(data) {
    const { gameId, error } = data;
    
    if (this.activeGames.has(gameId)) {
      const gameInfo = this.activeGames.get(gameId);
      gameInfo.status = 'failed';
      gameInfo.error = error;
      
      this.stats.failedGames++;
      this.activeGames.delete(gameId);
      
      if (this.onError) {
        this.onError(error, gameInfo.workerId);
      }
    }
  }

  /**
   * Handle all games completion
   */
  handleAllGamesComplete() {
    this.isRunning = false;
    this.stats.totalGames = this.stats.completedGames + this.stats.failedGames;
    
    if (this.onAllGamesComplete) {
      this.onAllGamesComplete(this.gameResults, this.stats);
    }
    
    console.log(`All parallel games completed. Results: ${this.stats.completedGames} successful, ${this.stats.failedGames} failed`);
  }

  /**
   * Update average game time
   * @param {number} gameTime - Game duration in milliseconds
   */
  updateAverageGameTime(gameTime) {
    const totalTime = this.stats.averageGameTime * (this.stats.completedGames - 1) + gameTime;
    this.stats.averageGameTime = totalTime / this.stats.completedGames;
  }

  /**
   * Generate unique game ID
   * @returns {string} Game ID
   */
  generateGameId() {
    return `game_${Date.now()}_${this.gameCounter++}`;
  }

  /**
   * Get current statistics
   * @returns {Object} Current statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      activeGames: this.activeGames.size,
      isRunning: this.isRunning,
      totalDuration: Date.now() - this.stats.startTime
    };
  }

  /**
   * Get game results
   * @returns {Array} Game results
   */
  getGameResults() {
    return [...this.gameResults];
  }

  /**
   * Get active games
   * @returns {Array} Active games information
   */
  getActiveGames() {
    return Array.from(this.activeGames.values());
  }

  /**
   * Set game complete callback
   * @param {Function} callback - Callback function
   */
  setOnGameComplete(callback) {
    this.onGameComplete = callback;
  }

  /**
   * Set all games complete callback
   * @param {Function} callback - Callback function
   */
  setOnAllGamesComplete(callback) {
    this.onAllGamesComplete = callback;
  }

  /**
   * Set error callback
   * @param {Function} callback - Callback function
   */
  setOnError(callback) {
    this.onError = callback;
  }

  /**
   * Dispose of parallel runner
   */
  dispose() {
    this.stop();
    
    // Terminate all workers
    for (const worker of this.workers) {
      worker.terminate();
    }
    
    this.workers = [];
    this.activeGames.clear();
    this.gameResults = [];
    
    this.onGameComplete = null;
    this.onAllGamesComplete = null;
    this.onError = null;
  }
}
