/**
 * TrainingSession - Manages RL training sessions with automatic game restarts
 * Handles training loops, experience collection, and model updates
 */

import { GameConfig } from '../../config/config.js';
import { PolicyAgent } from '../agents/PolicyAgent.js';
import { NeuralNetwork } from '../agents/NeuralNetwork.js';
import { TrainingMetrics } from '../entities/TrainingMetrics.js';
import { RewardCalculator } from '../utils/RewardCalculator.js';
import { ModelManager } from '../utils/ModelManager.js';
import { PPOTrainer } from './PPOTrainer.js';
import { A2CTrainer } from './A2CTrainer.js';
import { ExperienceBuffer } from './ExperienceBuffer.js';
import { Game } from '../../game/Game.js';

export class TrainingSession {
  constructor(game, options = {}) {
    this.game = game;
    this.options = {
      maxGames: options.maxGames || 1000,
      autoSaveInterval: options.autoSaveInterval || GameConfig.rl.autoSaveInterval,
      trainingFrequency: options.trainingFrequency || GameConfig.rl.trainingFrequency,
      ...options
    };

    // Training state
    this.isTraining = false;
    this.isPaused = false;
    this.currentGame = 0;
    this.gamesCompleted = 0;
    this.trainingStartTime = 0;
    this.lastSaveTime = 0;

    // AI and training components
    this.policyAgent = null;
    this.trainingMetrics = new TrainingMetrics();
    // Initialize RewardCalculator with config from GameConfig.rl.rewards
    const rc = GameConfig.rl.rewards || {};
    const rewardConfig = {
      winReward: rc.win,
      lossReward: rc.loss,
      tieReward: rc.tie ?? 0,
      timePenalty: rc.timePenalty,
      maxGameLength: rc.maxGameLength,
      timePenaltyThreshold: rc.timePenaltyThreshold ?? 0
    };
    console.log('[TrainingSession] Initializing RewardCalculator with config:', rewardConfig);
    this.rewardCalculator = new RewardCalculator(rewardConfig);
    this.modelManager = new ModelManager();

    // Experience storage
    this.experienceBuffer = new ExperienceBuffer({
      maxSize: 10000,
      batchSize: GameConfig.rl.batchSize // Use config batch size for sampling
    });

    // Track last game result for UI
    this.lastGameResult = null;

    // Callbacks
    this.onGameEnd = null;
    this.onTrainingProgress = null;
    this.onTrainingComplete = null;

    // Training algorithm
    this.algorithm = GameConfig.rl.algorithm;
    this.trainer = null;
    this.valueModel = null;

    // Parallel training (simplified - no Web Workers)
    this.parallelGames = GameConfig.rl.parallelGames;
    this.activeParallelGames = [];
    this.parallelGamesCompleted = 0;
    this.parallelGameCounter = 0;
  }

  /**
   * Initialize training session
   */
  async initialize() {
    try {
      console.log('Initializing training session...');

      // Create neural network
      const neuralNetwork = new NeuralNetwork({
        architecture: {
          inputSize: 9, // Game state size (4 pos + 2 angles + 2 velocity + 1 distance)
          hiddenLayers: GameConfig.rl.hiddenLayers,
          outputSize: 4, // WASD actions
          activation: 'relu'
        }
      });

      // Create policy agent with experience collection callback
      this.policyAgent = new PolicyAgent({
        neuralNetwork: neuralNetwork,
        decisionInterval: GameConfig.rl.decisionInterval,
        explorationRate: GameConfig.rl.explorationRate,
        onExperience: (experience) => this.addExperience(
          experience.state,
          experience.action,
          experience.reward,
          experience.isTerminal
        )
      });

      // Initialize trainer based on algorithm
      await this.initializeTrainer();

      // Initialize parallel training (no setup needed for simplified version)

      // Don't set up game callbacks yet - only when training starts

      console.log('Training session initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize training session:', error);
      return false;
    }
  }

  /**
   * Initialize the training algorithm
   */
  async initializeTrainer() {
    // Create value model for A2C
    this.valueModel = new NeuralNetwork({
      architecture: {
        inputSize: 9, // Game state size (4 pos + 2 angles + 2 velocity + 1 distance)
        hiddenLayers: GameConfig.rl.hiddenLayers,
        outputSize: 1, // Single value output
        activation: 'relu'
      }
    });

    // Initialize trainer based on algorithm
    if (this.algorithm === 'PPO') {
      this.trainer = new PPOTrainer({
        learningRate: GameConfig.rl.learningRate,
        miniBatchSize: GameConfig.rl.miniBatchSize
      });
    } else if (this.algorithm === 'A2C') {
      this.trainer = new A2CTrainer({
        learningRate: GameConfig.rl.learningRate,
        miniBatchSize: GameConfig.rl.miniBatchSize
      });
    } else {
      throw new Error(`Unsupported training algorithm: ${this.algorithm}`);
    }
  }

  /**
   * Set up game callbacks for training
   */
  setupGameCallbacks() {
    // Override game callbacks for training
    this.originalOnGameEnd = this.game.onGameEnd;
    this.game.onGameEnd = (winner) => this.handleGameEnd(winner);
    console.log('Game callbacks set up for training');
  }


  /**
   * Start training session
   */
  async start() {
    if (this.isTraining) {
      console.warn('Training session already running');
      return;
    }

    try {
      console.log('Starting training session...');
      this.isTraining = true;
      this.isPaused = false;
      this.trainingStartTime = Date.now();
      this.currentGame = 0;
      this.gamesCompleted = 0;
      this.parallelGamesCompleted = 0;

      // Set up game callbacks for training (for the main visible game)
      this.setupGameCallbacks();

      // Reset metrics
      this.trainingMetrics.reset();

      // Start parallel training games
      this.startParallelTraining();

      // Start the main visible game
      console.log('Starting main visible game...');
      await this.startNextGame();

      console.log('Training session started');
    } catch (error) {
      console.error('Failed to start training session:', error);
      this.isTraining = false;
    }
  }

  /**
   * Pause training session
   */
  pause() {
    if (!this.isTraining || this.isPaused) {
      return;
    }

    this.isPaused = true;
    console.log('Training session paused');
  }

  /**
   * Resume training session
   */
  resume() {
    if (!this.isTraining || !this.isPaused) {
      return;
    }

    this.isPaused = false;
    console.log('Training session resumed');
  }

  /**
   * Stop training session
   */
  stop() {
    if (!this.isTraining) {
      return;
    }

    this.isTraining = false;
    this.isPaused = false;

    // Stop parallel training
    this.stopParallelTraining();

    // Restore original game callbacks
    if (this.originalOnGameEnd) {
      this.game.onGameEnd = this.originalOnGameEnd;
      this.originalOnGameEnd = null;
    }

    // Save final model
    this.saveModel();

    console.log('Training session stopped');
  }

  /**
   * Start parallel training games (simplified version)
   */
  startParallelTraining() {
    console.log('startParallelTraining (simplified version) called: isTraining=', this.isTraining, 'isPaused=', this.isPaused);
    if (!this.isTraining || this.isPaused) {
      return;
    }

    try {
      // Start multiple parallel games using setTimeout to avoid blocking
      for (let i = 0; i < this.parallelGames; i++) {
        setTimeout(() => {
          this.runParallelGame();
        }, i * 100); // Stagger start times slightly
      }
      
      console.log(`Started ${this.parallelGames} parallel training games`);
    } catch (error) {
      console.error('Failed to start parallel training:', error);
    }
  }

  /**
   * Stop parallel training
   */
  stopParallelTraining() {
    this.activeParallelGames = [];
    console.log('Parallel training stopped');
  }

  /**
   * Run a single parallel game (headless, no rendering)
   */
  async runParallelGame() {
    if (!this.isTraining || this.isPaused) {
      return;
    }

    const gameId = `parallel_${this.parallelGameCounter++}`;
    const startTime = Date.now();
    
    try {
      // Create a headless game instance (no canvas/context)
      const headlessGame = new Game();
      await headlessGame.init();
      
      // Use the shared policy agent (no need to clone - agent is stateless)
      // Each game's Player maintains its own decision state
      const player = headlessGame.getPlayer();
      if (player) {
        player.setControlMode('ai', this.policyAgent, true); // true = isSharedAgent
      }
      
      // Set game end callback
      let gameEnded = false;
      headlessGame.onGameEnd = (winner, steps) => {
        gameEnded = true;
        const gameResult = {
          winner,
          gameLength: steps
        };
        this.handleParallelGameComplete(gameResult, gameId, Date.now() - startTime);
        
        // Clean up (no agent to dispose, just the game)
        headlessGame.dispose();
      };
      
      // Start the game
      headlessGame.start();
      
      // Run game loop (fast forward without rendering)
      const targetFPS = GameConfig.rl.headless?.targetFPS || 10;
      const deltaTime = 1 / targetFPS; // Fixed time step
      const maxSteps = GameConfig.rl.rewards.maxGameLength * targetFPS;
      const yieldEverySteps = GameConfig.rl.headless?.yieldEverySteps ?? 0;

      for (let step = 0; step < maxSteps && !gameEnded; step++) {
        headlessGame.update(deltaTime);
        
        // Yield control periodically to avoid blocking (configurable)
        if (yieldEverySteps > 0 && step % yieldEverySteps === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      
      // If game didn't end naturally, manually trigger end callback
      if (!gameEnded) {
        const gameResult = {
          winner: 'tie',
          gameLength: headlessGame.stepCount
        };
        this.handleParallelGameComplete(gameResult, gameId, Date.now() - startTime);
        
        // Clean up (no agent to dispose, just the game)
        headlessGame.dispose();
      }
      
    } catch (error) {
      console.error(`Parallel game ${gameId} failed:`, error);
    }
  }

  /**
   * Start next training game (main visible game)
   */
  async startNextGame() {
    if (!this.isTraining || this.isPaused) {
      console.log('startNextGame: not training or paused');
      return;
    }

    try {
      this.currentGame++;
      console.log(`Starting training game ${this.currentGame}`);

      // Set player to AI control
      const player = this.game.getPlayer();
      if (player) {
        player.setControlMode('ai', this.policyAgent);
        console.log('Player set to AI control with policy agent');
      } else {
        console.log('No player found!');
      }

      // Start the game
      this.game.restart();
      this.game.start();
      console.log('Game restarted and started');
    } catch (error) {
      console.error('Failed to start next game:', error);
    }
  }

  /**
   * Handle parallel game completion
   * @param {Object} result - Game result
   * @param {string} gameId - Game ID
   * @param {number} duration - Game duration in ms
   */
  async handleParallelGameComplete(result, gameId, duration) {
    console.log('handleParallelGameComplete called: isTraining=', this.isTraining, ', result=', result);
    if (!this.isTraining) {
      console.log('handleParallelGameComplete: not isTraining. Skipping...');
      return;
    }

    try {
      this.parallelGamesCompleted++;
      this.gamesCompleted++;

      // Calculate reward
      const rewardData = this.rewardCalculator.calculateReward({
        won: result.winner && result.winner.id === 'player-1',
        lost: result.winner && result.winner.id === 'ai-1',
        isTie: result.winner === 'tie',
        gameLength: result.gameLength
      });
      
      // Update metrics
      this.trainingMetrics.updateGameResult({
        won: result.winner && result.winner.id === 'player-1',
        gameLength: result.gameLength,
        reward: rewardData.totalReward,
        isTie: result.winner === 'tie'
      });
      console.log('[TrainingSession] parallel game metrics:', {
        winner: result.winner,
        won: result.winner && result.winner.id === 'player-1',
        isTie: result.winner === 'tie',
        gameLength: result.gameLength,
        reward: rewardData.totalReward,
        gamesCompleted: this.trainingMetrics.gamesCompleted,
        wins: this.trainingMetrics.wins,
        winRateRaw: this.trainingMetrics.winRate,
        winRatePercent: this.trainingMetrics.winRate * 100
      });

      // Add to experience buffer
      this.addExperience(result.gameState, result.decision, rewardData.totalReward, false);
      // Train if needed
      if (this.gamesCompleted % this.options.trainingFrequency === 0) {
        await this.train();
      }

      // Auto-save if needed
      if (this.gamesCompleted % this.options.autoSaveInterval === 0) {
        await this.saveModel();
      }

      // Check if training should continue
      if (this.gamesCompleted >= this.options.maxGames) {
        await this.completeTraining();
      } else {
        // Start another parallel game to maintain the parallel count
        setTimeout(() => {
          this.runParallelGame();
        }, Math.random() * 1000); // Random delay between 0-1 seconds
      }

      // Notify callbacks
      if (this.onGameEnd) {
        console.log('handleParallelGameComplete: calling onGameEnd callback');
        this.onGameEnd(result.winner, this.gamesCompleted, this.trainingMetrics);
      }

      // console.log(`Parallel game ${gameId} completed. Total games: ${this.gamesCompleted}/${this.options.maxGames}`);

    } catch (error) {
      console.error('Error handling parallel game completion:', error);
    }
  }


  /**
   * Handle game end for training (main visible game)
   * @param {string} winner - Winner of the game
   */
  async handleGameEnd(winner) {
    console.log(`handleGameEnd called: winner=${winner}, isTraining=${this.isTraining}`);
    
    if (!this.isTraining) {
      // If not training, call the original callback to maintain normal game flow
      if (this.originalOnGameEnd) {
        this.originalOnGameEnd(winner);
      }
      return;
    }

    try {
      this.gamesCompleted++;
      const gameLength = this.game.stepCount;
      console.log(`Game ${this.gamesCompleted} ended: winner=${winner}, length=${gameLength} steps`);

      // Calculate reward
      const rewardData = this.rewardCalculator.calculateReward({
        won: winner && winner.id === 'player-1',
        lost: winner && winner.id === 'ai-1',
        isTie: winner === 'tie',
        gameLength: gameLength
      });
      
      // Store last game result for UI
      this.lastGameResult = {
        won: winner && winner.id === 'player-1',
        gameLength: gameLength,
        reward: rewardData.totalReward
      };
      
      // Add final experience with reward
      this.addExperience(null, null, rewardData.totalReward, true);

      // Update metrics
      this.trainingMetrics.updateGameResult({
        won: winner && winner.id === 'player-1',
        gameLength: gameLength,
        reward: rewardData.totalReward,
        isTie: winner === 'tie'
      });
      console.log('[TrainingSession] main game metrics:', {
        winner,
        won: winner && winner.id === 'player-1',
        isTie: winner === 'tie',
        gameLength,
        reward: rewardData.totalReward,
        gamesCompleted: this.trainingMetrics.gamesCompleted,
        wins: this.trainingMetrics.wins,
        winRateRaw: this.trainingMetrics.winRate,
        winRatePercent: this.trainingMetrics.winRate * 100
      });

      // Experiences are added live to the buffer during gameplay
      console.log('Experiences are added live to buffer; skipping batch add');

      // Train if needed
      if (this.gamesCompleted % this.options.trainingFrequency === 0) {
        await this.train();
      }

      // Auto-save if needed
      if (this.gamesCompleted % this.options.autoSaveInterval === 0) {
        await this.saveModel();
      }

      // Check if training should continue
      if (this.gamesCompleted >= this.options.maxGames) {
        await this.completeTraining();
      } else {
        // Start next game after a short delay
        setTimeout(() => {
          this.startNextGame();
        }, 100);
      }

      // Notify callbacks
      if (this.onGameEnd) {
        this.onGameEnd(winner, this.gamesCompleted, this.trainingMetrics);
      }

    } catch (error) {
      console.error('Error handling game end:', error);
    }
  }

  /**
   * Add experience to current game
   * @param {Object} state - Game state
   * @param {Object} action - Action taken
   * @param {number} reward - Reward received
   * @param {boolean} isTerminal - Whether this is the final state
   * @param {number} logProb - Log probability of the action (optional)
   */
  addExperience(state, action, reward, isTerminal = false, logProb = 0) {
    const experience = {
      state,
      action,
      reward,
      isTerminal,
      logProb,
      timestamp: Date.now()
    };

    // Add directly to the shared experience buffer
    this.experienceBuffer.add(experience);
  }

  /**
   * Train the neural network
   */
  async train() {
    console.log(`Training check: experienceBuffer size = ${this.experienceBuffer.getSize()}`);
    
    if (this.experienceBuffer.getSize() === 0) {
      console.log('No experiences to train on');
      return;
    }

    try {
      const experiences = this.experienceBuffer.sample();
      console.log(`Training with ${experiences.length} experiences`);
      
      // Use trainer to update model
      if (this.algorithm === 'PPO') {
        await this.trainer.train(experiences, this.policyAgent.neuralNetwork.model, this.valueModel.model);
      } else if (this.algorithm === 'A2C') {
        await this.trainer.train(experiences, this.policyAgent.neuralNetwork.model, this.valueModel.model);
      }

      // Notify training progress
      if (this.onTrainingProgress) {
        this.onTrainingProgress(this.trainingMetrics);
      }

    } catch (error) {
      console.error('Training error:', error);
    }
  }

  /**
   * Complete training session
   */
  async completeTraining() {
    console.log('Training session completed');
    
    // Final training
    await this.train();
    
    // Save final model
    await this.saveModel();

    // Stop training
    this.stop();

    // Notify completion
    if (this.onTrainingComplete) {
      this.onTrainingComplete(this.trainingMetrics);
    }
  }

  /**
   * Save model to localStorage
   */
  async saveModel() {
    try {
      const modelId = `training_${Date.now()}`;
      const metadata = {
        gamesCompleted: this.gamesCompleted,
        trainingTime: Date.now() - this.trainingStartTime,
        metrics: this.trainingMetrics,
        timestamp: Date.now()
      };

      await this.modelManager.saveModel(
        this.policyAgent.neuralNetwork,
        metadata
      );

      this.lastSaveTime = Date.now();
      console.log(`Model saved: ${modelId}`);
    } catch (error) {
      console.error('Failed to save model:', error);
    }
  }

  /**
   * Load model from localStorage
   * @param {string} modelId - Model ID to load
   */
  async loadModel(modelId) {
    try {
      const modelData = await this.modelManager.loadModel(modelId);
      if (modelData) {
        // Create new NeuralNetwork from serialized data
        const loadedNetwork = NeuralNetwork.fromSerialized(modelData);
        
        // Replace the current neural network
        this.policyAgent.neuralNetwork.dispose();
        this.policyAgent.neuralNetwork = loadedNetwork;
        
        console.log(`Model loaded: ${modelId}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to load model:', error);
      return false;
    }
  }

  /**
   * Get training status
   * @returns {Object} Training status
   */
  getStatus() {
    return {
      isTraining: this.isTraining,
      isPaused: this.isPaused,
      currentGame: this.currentGame,
      gamesCompleted: this.gamesCompleted,
      maxGames: this.options.maxGames,
      trainingTime: Date.now() - this.trainingStartTime,
      metrics: this.trainingMetrics
    };
  }

  /**
   * Dispose of training session
   */
  dispose() {
    this.stop();
    
    if (this.policyAgent) {
      this.policyAgent.dispose();
    }
    
    if (this.valueModel) {
      this.valueModel.dispose();
    }
    
    if (this.trainer) {
      this.trainer.dispose();
    }
    
    if (this.experienceBuffer) {
      this.experienceBuffer.dispose();
    }

    this.activeParallelGames = [];
  }
}
