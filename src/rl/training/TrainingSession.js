/**
 * TrainingSession - Manages RL training sessions with automatic game restarts
 * Handles training loops, experience collection, and model updates
 */

import { GameConfig } from '../../config/config.js';
import { PolicyAgent } from '../agents/PolicyAgent.js';
import { NeuralNetwork } from '../agents/NeuralNetwork.js';
import { TrainingMetrics } from '../entities/TrainingMetrics.js';
import { ModelManager } from '../utils/ModelManager.js';
import { PPOTrainer } from './PPOTrainer.js';
import { RolloutCollector } from './RolloutCollector.js';
import { Game } from '../../game/Game.js';

export class TrainingSession {
  constructor(game, options = {}) {
    this.game = game;
    this.options = {
      maxGames: options.maxGames || 1000,
      autoSaveInterval: options.autoSaveInterval || GameConfig.rl.autoSaveInterval,
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
    this.modelManager = new ModelManager();

    // Rollout collectors for parallel experience collection
    this.rolloutCollectors = [];
    this.numRollouts = GameConfig.rl.parallelGames;

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

    // Old parallel training removed - using rollout system instead
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

      // Create policy agent (no experience callback - rollouts handle collection)
      this.policyAgent = new PolicyAgent({
        neuralNetwork: neuralNetwork,
        decisionInterval: GameConfig.rl.decisionInterval,
        explorationRate: GameConfig.rl.explorationRate
      });

      // Initialize trainer based on algorithm
      await this.initializeTrainer();

      // Initialize rollout collectors
      await this.initializeRolloutCollectors();

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
    // Create value model for PPO
    this.valueModel = new NeuralNetwork({
      architecture: {
        inputSize: 9, // Game state size (4 pos + 2 angles + 2 velocity + 1 distance)
        hiddenLayers: GameConfig.rl.hiddenLayers,
        outputSize: 1, // Single value output
        activation: 'relu'
      }
    });

    // Initialize PPO trainer
    if (this.algorithm !== 'PPO') {
      throw new Error(`Unsupported training algorithm: ${this.algorithm}. Only PPO is supported.`);
    }
    
    this.trainer = new PPOTrainer({
      learningRate: GameConfig.rl.learningRate,
      miniBatchSize: GameConfig.rl.miniBatchSize,
      epochs: GameConfig.rl.epochs
    });
  }

  /**
   * Initialize rollout collectors for parallel experience collection
   */
  async initializeRolloutCollectors() {
    this.rolloutCollectors = [];
    
    const rolloutConfig = GameConfig.rl.rollout;
    
    for (let i = 0; i < this.numRollouts; i++) {
      // Create headless game for each collector
      const headlessGame = new Game();
      await headlessGame.init();
      
      // Create a copy of the policy agent for this collector
      // Note: In a worker-based system, this would be done in the worker
      // For now, we'll use the shared agent (will need to clone properly for workers)
      const collector = new RolloutCollector(
        headlessGame,
        this.policyAgent,
        this.valueModel.model,
        {
          rolloutMaxLength: rolloutConfig.rolloutMaxLength,
          deltaTime: rolloutConfig.deltaTime,
          actionIntervalSeconds: rolloutConfig.actionIntervalSeconds,
          yieldInterval: rolloutConfig.yieldInterval || 50
        }
      );
      
      this.rolloutCollectors.push(collector);
    }
    
    console.log(`Initialized ${this.rolloutCollectors.length} rollout collectors`);
  }

  /**
   * Set up game callbacks for training (for main visible game - optional)
   */
  setupGameCallbacks() {
    // Override game callbacks for training (if main game is used)
    if (this.game) {
      this.originalOnGameEnd = this.game.onGameEnd;
      this.game.onGameEnd = (winner) => this.handleGameEnd(winner);
      console.log('Game callbacks set up for training');
    }
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

      // Reset metrics
      this.trainingMetrics.reset();

      // Start rollout-based training loop (don't await - it runs asynchronously)
      this.runTrainingLoop().catch(error => {
        console.error('Training loop error:', error);
        this.isTraining = false;
      });

      console.log('Training session started');
    } catch (error) {
      console.error('Failed to start training session:', error);
      this.isTraining = false;
    }
  }

  /**
   * Main training loop: collect rollouts -> train -> update weights -> repeat
   */
  async runTrainingLoop() {
    while (this.isTraining && !this.isPaused) {
      try {
        // Collect rollouts from all collectors in parallel
        console.log('Collecting rollouts...');
        const rolloutPromises = this.rolloutCollectors.map(collector => 
          collector.collectRollout()
        );
        
        // Wait for all rollouts to complete
        const rolloutResults = await Promise.all(rolloutPromises);
        
        // Combine all experiences from all rollouts
        const allExperiences = [];
        const allLastValues = [];
        
        for (const result of rolloutResults) {
          allExperiences.push(...result.rolloutBuffer);
          allLastValues.push(result.lastValue);
        }
        
        console.log(`Collected ${allExperiences.length} experiences from ${rolloutResults.length} rollouts`);
        
        // Train PPO with collected experiences
        if (allExperiences.length > 0) {
          // Update metrics BEFORE training (so metrics are ready for callback)
          this.updateMetricsFromExperiences(allExperiences);
          
          await this.trainWithRollouts(allExperiences, allLastValues);
          
          // Update weights in all collectors (for next iteration)
          await this.updateCollectorWeights();
          
          // Update UI after training completes
          this.notifyTrainingProgress();
        }
        
        // Check if training should continue
        if (this.gamesCompleted >= this.options.maxGames) {
          await this.completeTraining();
          break;
        }
        
        // Yield to event loop before next iteration
        await new Promise(resolve => setTimeout(resolve, 0));
        
      } catch (error) {
        console.error('Error in training loop:', error);
        // Continue training loop even if one iteration fails
        // Yield even on error to prevent complete freeze
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    console.log('Training loop exited');
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
    
    // Restart the training loop if it exited
    if (this.isTraining && !this.isPaused) {
      this.runTrainingLoop().catch(error => {
        console.error('Training loop error on resume:', error);
        this.isTraining = false;
      });
    }
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

    // Dispose rollout collectors
    if (this.rolloutCollectors) {
      for (const collector of this.rolloutCollectors) {
        if (collector.game) {
          collector.game.dispose();
        }
      }
      this.rolloutCollectors = [];
    }

    // Restore original game callbacks (if main game is used)
    if (this.game && this.originalOnGameEnd) {
      this.game.onGameEnd = this.originalOnGameEnd;
      this.originalOnGameEnd = null;
    }

    // Save final model
    this.saveModel();

    console.log('Training session stopped');
  }

  /**
   * Train with rollout experiences
   * @param {Array} experiences - Rollout experiences
   * @param {Array} lastValues - Last values for bootstrapping
   */
  async trainWithRollouts(experiences, lastValues) {
    if (experiences.length === 0) {
      console.log('No experiences to train on');
      return;
    }

    try {
      console.log(`Training PPO with ${experiences.length} experiences`);
      
      // Use PPO trainer to update model with bootstrapped last values
      await this.trainer.train(experiences, this.policyAgent.neuralNetwork.model, this.valueModel.model, lastValues);

      // Note: gamesCompleted is updated in updateMetricsFromExperiences

    } catch (error) {
      console.error('Training error:', error);
    }
  }

  /**
   * Update metrics from rollout experiences
   * @param {Array} experiences - Rollout experiences
   */
  updateMetricsFromExperiences(experiences) {
    // Calculate statistics from experiences
    let wins = 0;
    let losses = 0;
    let ties = 0;
    
    // Track current game
    let currentGameLength = 0;
    let currentGameTotalReward = 0;
    
    for (const exp of experiences) {
      currentGameTotalReward += exp.reward;
      currentGameLength++;
      
      if (exp.done) {
        // Game ended - determine outcome from the terminal reward
        // When done=true, exp.reward contains the terminal reward (win/loss/tie)
        // Win reward is 1.0, loss is -1.0, tie is 0.0 (from config)
        // But it might have time penalties, so check the magnitude
        const terminalReward = exp.reward;
        let won = false;
        let isTie = false;
        
        // Determine outcome based on terminal reward
        // Win: reward > 0 (typically 1.0, but may have small time penalties)
        // Loss: reward < 0 (typically -1.0, but may have time penalties making it worse)
        // Tie: reward close to 0
        if (terminalReward > 0.3) {
          // Positive reward = win (accounting for possible time penalties)
          won = true;
          wins++;
        } else if (terminalReward < -0.3) {
          // Negative reward = loss
          won = false;
          losses++;
        } else {
          // Close to zero = tie
          won = false;
          isTie = true;
          ties++;
        }
        
        // Update metrics with this game's result
        this.trainingMetrics.updateGameResult({
          won: won,
          gameLength: currentGameLength,
          reward: currentGameTotalReward, // Total reward for the game (includes all step rewards)
          isTie: isTie
        });
        
        // Reset for next game
        currentGameLength = 0;
        currentGameTotalReward = 0;
      }
    }
    
    // Update games completed count
    const completedGames = wins + losses + ties;
    if (completedGames > 0) {
      this.gamesCompleted += completedGames;
      console.log(`[TrainingSession] Updated metrics: ${completedGames} games completed (${wins}W ${losses}L ${ties}T), total games: ${this.gamesCompleted}`);
    }
  }

  /**
   * Notify UI about training progress
   */
  notifyTrainingProgress() {
    // Update training time
    if (this.trainingStartTime > 0) {
      this.trainingMetrics.trainingTime = Date.now() - this.trainingStartTime;
    }
    
    // Call onTrainingProgress callback for UI updates
    if (this.onTrainingProgress) {
      this.onTrainingProgress(this.trainingMetrics);
    }
    
    // Also call onGameEnd for games completed display (using null winner to indicate batch update)
    if (this.onGameEnd && this.gamesCompleted > 0) {
      this.onGameEnd(null, this.gamesCompleted, this.trainingMetrics);
    }
  }

  /**
   * Update weights in all rollout collectors after training
   */
  async updateCollectorWeights() {
    // Since collectors use shared agent/model, weights are automatically updated
    // (they reference the same objects)
    // In a worker-based system, we would send updated weights here
    console.log('Collector weights updated (shared references)');
  }

  /**
   * Train the neural network (legacy method - kept for compatibility)
   */
  async train() {
    // Legacy method - not used in rollout-based training
    console.warn('Legacy train() method called - use trainWithRollouts() instead');
  }

  /**
   * Complete training session
   */
  async completeTraining() {
    console.log('Training session completed');
    
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
   * @param {string} modelId - Model ID to load (optional, defaults to current model)
   */
  async loadModel(modelId = null) {
    try {
      const modelData = await this.modelManager.loadModel(modelId);
      if (modelData) {
        // Create new NeuralNetwork from serialized data
        const loadedNetwork = NeuralNetwork.fromSerialized(modelData);
        
        // Replace the current neural network
        this.policyAgent.neuralNetwork.dispose();
        this.policyAgent.neuralNetwork = loadedNetwork;
        
        console.log(`Model loaded: ${modelId || 'current_model'}`);
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
    
    // Note: experienceBuffer removed - rollouts don't use it
  }
}
