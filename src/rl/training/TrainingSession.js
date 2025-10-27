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
    this.rewardCalculator = new RewardCalculator();
    this.modelManager = new ModelManager();

    // Experience storage
    this.experienceBuffer = new ExperienceBuffer({
      maxSize: 10000,
      batchSize: this.options.trainingFrequency
    });
    this.currentGameExperiences = [];

    // Callbacks
    this.onGameEnd = null;
    this.onTrainingProgress = null;
    this.onTrainingComplete = null;

    // Training algorithm
    this.algorithm = GameConfig.rl.algorithm;
    this.trainer = null;
    this.valueModel = null;
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

      // Create policy agent
      this.policyAgent = new PolicyAgent({
        neuralNetwork: neuralNetwork,
        decisionInterval: GameConfig.rl.decisionInterval,
        explorationRate: GameConfig.rl.explorationRate
      });

      // Initialize trainer based on algorithm
      await this.initializeTrainer();

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
        batchSize: GameConfig.rl.batchSize
      });
    } else if (this.algorithm === 'A2C') {
      this.trainer = new A2CTrainer({
        learningRate: GameConfig.rl.learningRate,
        batchSize: GameConfig.rl.batchSize
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

      // Set up game callbacks for training
      this.setupGameCallbacks();

      // Reset metrics
      this.trainingMetrics.reset();

      // Start first game
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
   * Start next training game
   */
  async startNextGame() {
    if (!this.isTraining || this.isPaused) {
      return;
    }

    try {
      this.currentGame++;
      this.currentGameExperiences = [];

      // Set player to AI control
      const player = this.game.getPlayer();
      if (player) {
        player.setControlMode('ai', this.policyAgent);
      }

      // Start the game
      this.game.restart();
      this.game.start();

      console.log(`Starting training game ${this.currentGame}`);
    } catch (error) {
      console.error('Failed to start next game:', error);
    }
  }

  /**
   * Handle game end for training
   * @param {string} winner - Winner of the game
   */
  async handleGameEnd(winner) {
    if (!this.isTraining) {
      // If not training, call the original callback to maintain normal game flow
      if (this.originalOnGameEnd) {
        this.originalOnGameEnd(winner);
      }
      return;
    }

    try {
      this.gamesCompleted++;
      const gameLength = (Date.now() - this.game.startTime) / 1000;

      // Calculate reward
      const rewardData = this.rewardCalculator.calculateReward(winner, gameLength);
      
      // Add final experience with reward
      this.addExperience(null, null, rewardData.totalReward, true);

      // Update metrics
      this.trainingMetrics.update(winner, rewardData.totalReward);

      // Store experiences in buffer
      this.experienceBuffer.addBatch(this.currentGameExperiences);

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
   */
  addExperience(state, action, reward, isTerminal = false) {
    this.currentGameExperiences.push({
      state,
      action,
      reward,
      isTerminal,
      timestamp: Date.now()
    });
  }

  /**
   * Train the neural network
   */
  async train() {
    if (this.experienceBuffer.getSize() === 0) {
      return;
    }

    try {
      const experiences = this.experienceBuffer.sample();
      console.log(`Training with ${experiences.length} experiences`);
      
      // Use trainer to update model
      if (this.algorithm === 'PPO') {
        await this.trainer.train(experiences, this.policyAgent.getNeuralNetwork().model, this.valueModel.model);
      } else if (this.algorithm === 'A2C') {
        await this.trainer.train(experiences, this.policyAgent.getNeuralNetwork().model, this.valueModel.model);
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
        this.policyAgent.getNeuralNetwork().model,
        modelId,
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
      const result = await this.modelManager.loadModel(modelId);
      if (result) {
        this.policyAgent.setNeuralNetwork(result.model);
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
    
    this.currentGameExperiences = [];
  }
}
