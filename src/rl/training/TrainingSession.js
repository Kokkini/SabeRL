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
import { GameCore } from '../../game/GameCore.js';
import { OpponentPolicyManager } from '../utils/OpponentPolicyManager.js';
import { PolicyOpponentController } from '../../game/controllers/PolicyOpponentController.js';

export class TrainingSession {
  constructor(game, options = {}) {
    this.game = game;
    this.options = {
      maxGames: options.maxGames || GameConfig.rl.maxGames || 1000,
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
    
    // Create MessageChannel for non-throttled yielding (works in background tabs)
    this.yieldChannel = new MessageChannel();
    this.yieldChannelResolve = null;
    this.yieldChannel.port1.onmessage = () => {
      if (this.yieldChannelResolve) {
        this.yieldChannelResolve();
        this.yieldChannelResolve = null;
      }
    };
    this.yieldChannel.port2.onmessage = () => {}; // Empty handler

    // Training algorithm
    this.algorithm = GameConfig.rl.algorithm;
    this.trainer = null;
    this.valueModel = null;

    // Opponent manager for rollouts
    this.opponentManager = new OpponentPolicyManager();

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
      epochs: GameConfig.rl.epochs,
      clipRatio: GameConfig.rl.clipRatio,
      valueLossCoeff: GameConfig.rl.valueLossCoeff,
      entropyCoeff: GameConfig.rl.entropyCoeff,
      maxGradNorm: GameConfig.rl.maxGradNorm,
      gaeLambda: GameConfig.rl.gaeLambda
    });
  }

  /**
   * Initialize rollout collectors for parallel experience collection
   */
  async initializeRolloutCollectors() {
    this.rolloutCollectors = [];
    
    const rolloutConfig = GameConfig.rl.rollout;
    
    for (let i = 0; i < this.numRollouts; i++) {
      // Create headless core for each collector
      const core = new GameCore();
      
      // Create a copy of the policy agent for this collector
      // Note: In a worker-based system, this would be done in the worker
      // For now, we'll use the shared agent (will need to clone properly for workers)
      const collector = new RolloutCollector(
        core,
        this.policyAgent,
        this.valueModel.model,
        {
          rolloutMaxLength: rolloutConfig.rolloutMaxLength,
          deltaTime: rolloutConfig.deltaTime,
          actionIntervalSeconds: rolloutConfig.actionIntervalSeconds,
          yieldInterval: rolloutConfig.yieldInterval || 50
        },
        {
          sampleOpponent: () => {
            // Refresh from storage before sampling to reflect UI changes
            try { this.opponentManager.load(); } catch (_) {}
            const sel = this.opponentManager.sample();
            if (sel.type === 'policy' && sel.agent) {
              sel.agent.decisionIntervalSec = rolloutConfig.actionIntervalSeconds;
              return new PolicyOpponentController(sel.agent);
            }
            return null; // null => random AI
          }
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
   * Yield to event loop with smart strategy based on tab visibility
   * - Visible: setTimeout(0) allows UI updates and painting
   * - Hidden: MessageChannel.postMessage is not throttled
   */
  async yieldToEventLoop() {
    // Check if tab is hidden using Page Visibility API
    const isHidden = typeof document !== 'undefined' && 
                     (document.hidden || document.visibilityState === 'hidden');
    
    if (isHidden) {
      // Tab is hidden: use MessageChannel (not throttled)
      return new Promise(resolve => {
        this.yieldChannelResolve = resolve;
        this.yieldChannel.port2.postMessage(null);
      });
    } else {
      // Tab is visible: use setTimeout(0) to allow UI updates
      // Using 0 instead of 4ms - browser will use minimum ~4ms anyway, but this ensures UI responsiveness
      return new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  /**
   * Main training loop: collect rollouts -> train -> update weights -> repeat
   */
  async runTrainingLoop() {
    while (this.isTraining && !this.isPaused) {
      try {
        // Yield before collecting rollouts to ensure UI is responsive
        await this.yieldToEventLoop();
        
        // Collect rollouts from all collectors in parallel
        console.log('Collecting rollouts...');
        const rolloutPromises = this.rolloutCollectors.map(collector => 
          collector.collectRollout()
        );
        
        // Wait for all rollouts to complete
        const rolloutResults = await Promise.all(rolloutPromises);
        
        // Yield after collecting rollouts to allow UI updates
        await this.yieldToEventLoop();
        
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
          
          // Calculate rollout-specific statistics for charts
          const rolloutStats = this.calculateRolloutStatistics(allExperiences);
          
          // Yield before training to allow UI updates
          await this.yieldToEventLoop();
          
          await this.trainWithRollouts(allExperiences, allLastValues);
          
          // Update weights in all collectors (for next iteration)
          await this.updateCollectorWeights();
          
          // Yield before UI update to ensure responsiveness
          await this.yieldToEventLoop();
          
          // Update UI after training completes with rollout-specific stats
          this.notifyTrainingProgress(rolloutStats);
        }
        
        // Check if training should continue
        if (this.gamesCompleted >= this.options.maxGames) {
          await this.completeTraining();
          break;
        }
        
        // Yield to event loop before next iteration
        // Use different strategy based on tab visibility:
        // - Visible: setTimeout allows UI updates and painting
        // - Hidden: MessageChannel port.postMessage is not throttled
        await this.yieldToEventLoop();
        
      } catch (error) {
        console.error('Error in training loop:', error);
        // Continue training loop even if one iteration fails
        // Yield even on error to prevent complete freeze
        await this.yieldToEventLoop();
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
        // Game ended - determine outcome from outcome metadata when available
        let won = false;
        let isTie = false;
        if (exp.outcome) {
          isTie = !!exp.outcome.isTie;
          if (isTie) {
            ties++;
          } else if (exp.outcome.winnerId === 'player-1') {
            won = true;
            wins++;
          } else {
            losses++;
          }
        } else {
          // Fallback to terminal reward threshold if outcome not provided
          const terminalReward = exp.reward;
          if (terminalReward > 0.3) {
            won = true;
            wins++;
          } else if (terminalReward < -0.3) {
            losses++;
          } else {
            isTie = true;
            ties++;
          }
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
   * Calculate rollout-specific statistics (for current rollout only)
   * @param {Array} experiences - Rollout experiences
   * @returns {Object} Rollout statistics
   */
  calculateRolloutStatistics(experiences) {
    let wins = 0;
    let losses = 0;
    let ties = 0;
    const gameLengths = [];
    const rewards = [];
    
    // Track current game
    let currentGameLength = 0;
    let currentGameTotalReward = 0;
    
    for (const exp of experiences) {
      currentGameTotalReward += exp.reward;
      currentGameLength++;
      
      if (exp.done) {
        // Game ended - determine outcome from the terminal reward
        const terminalReward = exp.reward;
        let won = false;
        let isTie = false;
        
        if (terminalReward > 0.3) {
          won = true;
          wins++;
        } else if (terminalReward < -0.3) {
          won = false;
          losses++;
        } else {
          won = false;
          isTie = true;
          ties++;
        }
        
        // Store this game's statistics
        gameLengths.push(currentGameLength);
        rewards.push(currentGameTotalReward);
        
        // Reset for next game
        currentGameLength = 0;
        currentGameTotalReward = 0;
      }
    }
    
    // Calculate averages for this rollout only
    const gamesCompleted = wins + losses + ties;
    const avgGameLength = gameLengths.length > 0 
      ? gameLengths.reduce((sum, len) => sum + len, 0) / gameLengths.length 
      : 0;
    
    const winRate = gamesCompleted > 0 ? wins / gamesCompleted : 0;
    const lossRate = gamesCompleted > 0 ? losses / gamesCompleted : 0;
    const tieRate = gamesCompleted > 0 ? ties / gamesCompleted : 0;
    
    // Calculate reward statistics for this rollout
    const rewardAvg = rewards.length > 0 
      ? rewards.reduce((sum, r) => sum + r, 0) / rewards.length 
      : 0;
    const rewardMin = rewards.length > 0 ? Math.min(...rewards) : 0;
    const rewardMax = rewards.length > 0 ? Math.max(...rewards) : 0;
    
    return {
      gamesCompleted,
      wins,
      losses,
      ties,
      winRate,
      lossRate,
      tieRate,
      averageGameLength: avgGameLength,
      rewardStats: {
        avg: rewardAvg,
        min: rewardMin,
        max: rewardMax
      }
    };
  }

  /**
   * Notify UI about training progress
   * @param {Object} rolloutStats - Optional rollout-specific statistics (if not provided, uses cumulative metrics)
   */
  notifyTrainingProgress(rolloutStats = null) {
    // Update training time
    if (this.trainingStartTime > 0) {
      this.trainingMetrics.trainingTime = Date.now() - this.trainingStartTime;
    }
    
    // Schedule UI updates asynchronously to avoid blocking training
    // Use setTimeout to ensure UI updates happen in next event loop cycle
    setTimeout(() => {
      // If rolloutStats provided, merge with trainingMetrics for chart updates
      // This allows charts to show rollout-specific averages while other metrics remain cumulative
      const metricsToSend = rolloutStats 
        ? {
            ...this.trainingMetrics,
            // Override with rollout-specific stats for charts
            averageGameLength: rolloutStats.averageGameLength,
            gamesCompleted: rolloutStats.gamesCompleted, // Use rollout-specific count for rate calculations
            wins: rolloutStats.wins,
            losses: rolloutStats.losses,
            ties: rolloutStats.ties,
            winRate: rolloutStats.winRate,
            rewardStats: rolloutStats.rewardStats,
            // Policy entropy from trainer stats (per update)
            policyEntropy: (this.trainer && this.trainer.getStats) ? (this.trainer.getStats().entropy || 0) : 0
          }
        : {
            ...this.trainingMetrics,
            policyEntropy: (this.trainer && this.trainer.getStats) ? (this.trainer.getStats().entropy || 0) : 0
          };
      
      // Call onTrainingProgress callback for UI updates
      if (this.onTrainingProgress) {
        this.onTrainingProgress(metricsToSend);
      }
      
      // Also call onGameEnd for games completed display (using null winner to indicate batch update)
      if (this.onGameEnd && this.gamesCompleted > 0) {
        this.onGameEnd(null, this.gamesCompleted, this.trainingMetrics);
      }
    }, 0);
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
   * Export both policy and value network weights to a serializable object
   * @returns {Object} Export bundle
   */
  exportAgentWeights() {
    if (!this.policyAgent || !this.policyAgent.neuralNetwork || !this.valueModel) {
      throw new Error('Networks are not initialized');
    }

    const bundle = {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      algorithm: this.algorithm,
      rlConfig: {
        hiddenLayers: GameConfig.rl.hiddenLayers,
        inputSize: 9,
        policyOutputSize: 4,
        valueOutputSize: 1
      },
      policy: this.policyAgent.neuralNetwork.serialize(),
      value: this.valueModel.serialize()
    };

    return bundle;
  }

  /**
   * Import both policy and value networks from a serialized bundle
   * @param {Object} bundle - Object previously produced by exportAgentWeights()
   */
  async importAgentWeights(bundle) {
    if (!bundle || typeof bundle !== 'object') {
      throw new Error('Invalid weights bundle');
    }

    // Basic validation
    if (!bundle.policy || !bundle.value) {
      throw new Error('Bundle missing policy or value weights');
    }

    // Rebuild networks
    const newPolicy = NeuralNetwork.fromSerialized(bundle.policy);
    const newValue = NeuralNetwork.fromSerialized(bundle.value);

    // Optional: validate expected shapes
    const policyOk = newPolicy.architecture.inputSize === 9 && newPolicy.architecture.outputSize === 4;
    const valueOk = newValue.architecture.inputSize === 9 && newValue.architecture.outputSize === 1;
    if (!policyOk || !valueOk) {
      console.warn('Imported network architectures differ from expected (input=9, policy out=4, value out=1). Proceeding anyway.');
    }

    // Swap into session
    if (this.policyAgent && this.policyAgent.neuralNetwork) {
      this.policyAgent.neuralNetwork.dispose();
    }
    this.policyAgent.neuralNetwork = newPolicy;

    if (this.valueModel) {
      this.valueModel.dispose();
    }
    this.valueModel = newValue;

    // Update rollout collectors to reference the new value model
    if (Array.isArray(this.rolloutCollectors)) {
      for (const collector of this.rolloutCollectors) {
        collector.valueModel = this.valueModel.model;
      }
    }

    console.log('Imported agent weights applied');
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
