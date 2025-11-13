/**
 * TrainingSession - Manages RL training sessions with automatic game restarts
 * Handles training loops, experience collection, and model updates
 */

import { GameConfig } from '../../config/config.js';
import { GameCore } from '../core/GameCore.js';
import { PolicyAgent } from '../agents/PolicyAgent.js';
import { TrainingMetrics } from '../entities/TrainingMetrics.js';
import { ModelManager } from '../utils/ModelManager.js';
import { PPOTrainer } from './PPOTrainer.js';
import { RolloutCollector, Experience } from './RolloutCollector.js';
import { PolicyManager } from '../utils/PolicyManager.js';
import { PolicyController } from '../controllers/PolicyController.js';
import { PlayerController } from '../controllers/PlayerController.js';
import { NetworkUtils } from '../utils/NetworkUtils.js';

export interface TrainingSessionOptions {
  trainablePlayers?: number[];
  maxGames?: number;
  autoSaveInterval?: number;
  algorithm?: {
    type?: string;
    hyperparameters?: any;
  };
  networkArchitecture?: {
    policyHiddenLayers?: number[];
    valueHiddenLayers?: number[];
    activation?: string;
  };
  [key: string]: any;
}

export class TrainingSession {
  public readonly gameCore: GameCore;
  public controllers: (PlayerController | null)[];
  public readonly trainablePlayers: number[];
  public readonly options: TrainingSessionOptions;
  
  /**
   * Get the primary trainable player index (first trainable player)
   * Used for determining win/loss from outcome arrays
   */
  private getPrimaryTrainablePlayerIndex(): number {
    return this.trainablePlayers[0] || 0;
  }
  
  /**
   * Get outcome for the primary trainable player from an outcome array
   * @param outcome - Outcome array from GameState
   * @returns Outcome for the trainable player, or null if invalid
   */
  private getTrainablePlayerOutcome(outcome: ('win'|'loss'|'tie')[] | null): ('win'|'loss'|'tie') | null {
    if (!outcome || outcome.length === 0) return null;
    const trainableIdx = this.getPrimaryTrainablePlayerIndex();
    if (trainableIdx >= outcome.length) return null;
    return outcome[trainableIdx] || null;
  }

  // Training state
  public isTraining: boolean;
  public isPaused: boolean;
  public currentGame: number;
  public gamesCompleted: number;
  public trainingStartTime: number;
  public lastSaveTime: number;

  // AI and training components
  public policyAgent: PolicyAgent | null;
  public readonly trainingMetrics: TrainingMetrics;
  public readonly modelManager: ModelManager;
  public policyAgents: (PolicyAgent | null)[];

  // Rollout collectors for parallel experience collection
  public rolloutCollectors: RolloutCollector[];
  public readonly numRollouts: number;

  // Track last game result for UI
  public lastGameResult: any;

  // Callbacks
  public onGameEnd: ((winner: any, gamesCompleted: number, metrics: TrainingMetrics) => void) | null;
  public onTrainingProgress: ((metrics: any) => void) | null;
  public onTrainingComplete: ((metrics: TrainingMetrics) => void) | null;
  public onRolloutStart: (() => void) | null;
  
  // MessageChannel for yielding
  private yieldChannel: MessageChannel;
  private yieldChannelResolve: (() => void) | null;

  // Training algorithm
  public algorithm: string;
  public trainer: PPOTrainer | null;
  public trainingParams: any;

  // Policy manager for sampling policies for non-trainable players
  public readonly policyManager: PolicyManager;

  constructor(gameCore: GameCore, controllers: (PlayerController | null)[], options: TrainingSessionOptions = {}) {
    this.gameCore = gameCore;  // GameCore interface
    this.controllers = controllers;  // PlayerController[] where index = player index
    this.trainablePlayers = options.trainablePlayers || [0];  // Which players to train
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
    this.policyAgents = [];

    // Rollout collectors for parallel experience collection
    this.rolloutCollectors = [];
    this.numRollouts = GameConfig.rl.parallelGames;

    // Track last game result for UI
    this.lastGameResult = null;

    // Callbacks
    this.onGameEnd = null;
    this.onTrainingProgress = null;
    this.onTrainingComplete = null;
    this.onRolloutStart = null;
    
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
    this.algorithm = options.algorithm?.type || GameConfig.rl.algorithm || 'PPO';
    this.trainer = null;
    this.trainingParams = null; // Will be set from UI when training starts

    // Policy manager for sampling policies for non-trainable players
    this.policyManager = new PolicyManager();
    this.policyManager.setGameCore(gameCore);
  }

  /**
   * Initialize training session
   */
  async initialize(): Promise<boolean> {
    try {
      console.log('Initializing training session...');

      // Get observation/action info from GameCore
      const observationSize = this.gameCore.getObservationSize();
      const actionSize = this.gameCore.getActionSize();
      const actionSpaces = this.gameCore.getActionSpaces();

      // Create policy agents for trainable players
      this.policyAgents = [];
      for (const playerIndex of this.trainablePlayers) {
        const agent = new PolicyAgent({
          observationSize: observationSize,
          actionSize: actionSize,
          actionSpaces: actionSpaces,
          networkArchitecture: this.options.networkArchitecture || {
            policyHiddenLayers: GameConfig.rl.hiddenLayers || [64, 32],
            valueHiddenLayers: GameConfig.rl.hiddenLayers || [64, 32],
            activation: 'relu'
          }
        });
        this.policyAgents[playerIndex] = agent;
        
        // Replace controller with PolicyController
        this.controllers[playerIndex] = new PolicyController(agent);
      }

      // For backward compatibility, set policyAgent to first trainable player's agent
      this.policyAgent = this.policyAgents[this.trainablePlayers[0]] || null;

      // Initialize trainer based on algorithm
      await this.initializeTrainer();

      // Initialize rollout collectors
      await this.initializeRolloutCollectors();

      console.log('Training session initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize training session:', error);
      return false;
    }
  }

  /**
   * Initialize the training algorithm
   * @param {Object} trainingParams - Optional training parameters (defaults from GameConfig if not provided)
   */
  async initializeTrainer(trainingParams: any = null): Promise<void> {
    const params = trainingParams || this.trainingParams || {};

    // Initialize PPO trainer
    if (this.algorithm !== 'PPO') {
      throw new Error(`Unsupported training algorithm: ${this.algorithm}. Only PPO is supported.`);
    }
    
    this.trainer = new PPOTrainer({
      learningRate: params.learningRate ?? GameConfig.rl.learningRate,
      miniBatchSize: params.miniBatchSize ?? GameConfig.rl.miniBatchSize,
      epochs: params.epochs ?? GameConfig.rl.epochs,
      clipRatio: params.clipRatio ?? GameConfig.rl.clipRatio,
      valueLossCoeff: params.valueLossCoeff ?? GameConfig.rl.valueLossCoeff,
      entropyCoeff: params.entropyCoeff ?? GameConfig.rl.entropyCoeff,
      maxGradNorm: params.maxGradNorm ?? GameConfig.rl.maxGradNorm,
      gaeLambda: params.gaeLambda ?? GameConfig.rl.gaeLambda
    });
  }

  /**
   * Update training parameters and reinitialize trainer if needed
   * @param {Object} trainingParams - Training parameters
   */
  async updateTrainingParams(trainingParams: any): Promise<void> {
    this.trainingParams = trainingParams;
    
    // Update GameConfig for this training session
    if (trainingParams.rewards) {
      Object.assign(GameConfig.rl.rewards, trainingParams.rewards);
    }
    if (trainingParams.discountFactor !== undefined) {
      GameConfig.rl.discountFactor = trainingParams.discountFactor;
    }
    
    // Reinitialize trainer with new params
    if (this.trainer) {
      // PPOTrainer might have dispose method
      if (typeof (this.trainer as any).dispose === 'function') {
        (this.trainer as any).dispose();
      }
    }
    await this.initializeTrainer(trainingParams);
  }

  /**
   * Initialize rollout collectors for parallel experience collection
   */
  async initializeRolloutCollectors(): Promise<void> {
    this.rolloutCollectors = [];
    
    const rolloutConfig = GameConfig.rl.rollout;
    
    for (let i = 0; i < this.numRollouts; i++) {
      // Create headless core for each collector (clone of gameCore)
      // Note: This assumes gameCore has a constructor that takes config
      const core = new (this.gameCore.constructor as any)((this.gameCore as any).config);
      
      // Use the policy agent for player 0 (first trainable player)
      const agent = this.policyAgent;
      if (!agent) {
        throw new Error('PolicyAgent not initialized');
      }
      
      const collector = new RolloutCollector(
        core,
        agent,
        {
          rolloutMaxLength: rolloutConfig.rolloutMaxLength,
          deltaTime: rolloutConfig.deltaTime,
          actionIntervalSeconds: rolloutConfig.actionIntervalSeconds,
          yieldInterval: rolloutConfig.yieldInterval || 50
        },
        {
          sampleOpponent: () => {
            // Sample a policy for non-trainable players (e.g., player 1)
            // Refresh from storage before sampling to reflect UI changes
            try { this.policyManager.load(); } catch (_) {}
            const sel = this.policyManager.sample();
            if (sel.type === 'policy' && sel.agent) {
              return new PolicyController(sel.agent);
            }
            return null; // null => random AI
          },
          onEpisodeEnd: (outcome) => {
            // Increment games immediately; detailed metrics updated after rollout
            this.gamesCompleted += 1;
            // Update per-episode metrics for immediate win rate/UI refresh
            try {
              // outcome is now an array: ['win', 'loss'] or ['tie', 'tie']
              // Use trainable player index instead of hardcoded [0]
              const playerOutcome = this.getTrainablePlayerOutcome(outcome);
              const isTie = playerOutcome === 'tie';
              const won = playerOutcome === 'win' && !isTie;
              this.trainingMetrics.updateGameResult({
                won: !!won,
                isTie: isTie,
                gameLength: 0,
                reward: 0
              });
            } catch (_) {}
            if (this.onGameEnd) {
              try { this.onGameEnd(null, this.gamesCompleted, this.trainingMetrics); } catch (_) {}
            }
          }
        }
      );
      
      this.rolloutCollectors.push(collector);
    }
    
    console.log(`Initialized ${this.rolloutCollectors.length} rollout collectors`);
  }

  /**
   * Yield to event loop with smart strategy based on tab visibility
   */
  private async yieldToEventLoop(): Promise<void> {
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
      return new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  /**
   * Start training session
   */
  async start(): Promise<void> {
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
  private async runTrainingLoop(): Promise<void> {
    while (this.isTraining && !this.isPaused) {
      try {
        // Yield before collecting rollouts to ensure UI is responsive
        await this.yieldToEventLoop();
        
        // Collect rollouts from all collectors in parallel
        console.log('Collecting rollouts...');
        if (this.onRolloutStart) {
          try { this.onRolloutStart(); } catch (_) {}
        }
        const rolloutPromises = this.rolloutCollectors.map(collector => 
          collector.collectRollout()
        );
        
        // Wait for all rollouts to complete
        const rolloutResults = await Promise.all(rolloutPromises);
        
        // Yield after collecting rollouts to allow UI updates
        await this.yieldToEventLoop();
        
        // Combine all experiences from all rollouts
        const allExperiences: Experience[] = [];
        const allLastValues: number[] = [];
        
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
          
          if (this.trainer && this.policyAgent) {
            await this.trainWithRollouts(allExperiences, allLastValues);
          }
          
          // Update weights in all collectors (for next iteration)
          await this.updateCollectorWeights();
          
          // Yield before UI update to ensure responsiveness
          await this.yieldToEventLoop();
          
          // Update UI after training completes with rollout-specific stats
          if (rolloutStats) {
            this.notifyTrainingProgress(rolloutStats);
          }
        }
        
        // Check if training should continue
        if (this.gamesCompleted >= (this.options.maxGames || 1000)) {
          await this.completeTraining();
          break;
        }
        
        // Yield to event loop before next iteration
        await this.yieldToEventLoop();
        
      } catch (error) {
        console.error('Error in training loop:', error);
        // Continue training loop even if one iteration fails
        await this.yieldToEventLoop();
      }
    }
    
    console.log('Training loop exited');
  }

  /**
   * Pause training session
   */
  pause(): void {
    if (!this.isTraining || this.isPaused) {
      return;
    }

    this.isPaused = true;
    console.log('Training session paused');
  }

  /**
   * Resume training session
   */
  resume(): void {
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
  stop(): void {
    if (!this.isTraining) {
      return;
    }

    this.isTraining = false;
    this.isPaused = false;

    // Dispose rollout collectors
    if (this.rolloutCollectors) {
      for (const collector of this.rolloutCollectors) {
        // Collectors don't have dispose, but we can clear the array
      }
      this.rolloutCollectors = [];
    }

    // Save final model
    this.saveModel();

    console.log('Training session stopped');
  }

  /**
   * Train with rollout experiences
   * @param {Experience[]} experiences - Rollout experiences
   * @param {number[]} lastValues - Last values for bootstrapping
   */
  async trainWithRollouts(experiences: Experience[], lastValues: number[]): Promise<void> {
    if (experiences.length === 0) {
      console.log('No experiences to train on');
      return;
    }

    if (!this.policyAgent || !this.trainer) {
      throw new Error('PolicyAgent or trainer not initialized');
    }

    try {
      console.log(`Training PPO with ${experiences.length} experiences`);
      
      // Use PPO trainer to update model
      await this.trainer.train(experiences, this.policyAgent);

      // Note: gamesCompleted is updated in updateMetricsFromExperiences

    } catch (error) {
      console.error('Training error:', error);
    }
  }

  /**
   * Update metrics from rollout experiences
   * @param {Experience[]} experiences - Rollout experiences
   */
  updateMetricsFromExperiences(experiences: Experience[]): void {
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
        // Game ended - determine outcome from outcome metadata
        // Use trainable player index instead of hardcoded [0]
        let won = false;
        let isTie = false;
        if (exp.outcome) {
          const playerOutcome = this.getTrainablePlayerOutcome(exp.outcome);
          if (playerOutcome === 'tie') {
            isTie = true;
            ties++;
          } else if (playerOutcome === 'win') {
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
          reward: currentGameTotalReward,
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
   * @param {Experience[]} experiences - Rollout experiences
   * @returns {Object} Rollout statistics
   */
  calculateRolloutStatistics(experiences: Experience[]): any {
    let wins = 0;
    let losses = 0;
    let ties = 0;
    const gameLengths: number[] = [];
    const rewards: number[] = [];
    
    // Track current game
    let currentGameLength = 0;
    let currentGameTotalReward = 0;
    
    for (const exp of experiences) {
      currentGameTotalReward += exp.reward;
      currentGameLength++;
      
      if (exp.done) {
        // Game ended - determine outcome
        // Use trainable player index instead of hardcoded [0]
        const terminalReward = exp.reward;
        let won = false;
        let isTie = false;
        
        if (exp.outcome) {
          const playerOutcome = this.getTrainablePlayerOutcome(exp.outcome);
          isTie = playerOutcome === 'tie';
          won = playerOutcome === 'win' && !isTie;
        } else {
          // Fallback to reward threshold
          if (terminalReward > 0.3) {
            won = true;
          } else if (terminalReward < -0.3) {
            won = false;
          } else {
            isTie = true;
          }
        }
        
        if (isTie) {
          ties++;
        } else if (won) {
          wins++;
        } else {
          losses++;
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
   * @param {Object} rolloutStats - Optional rollout-specific statistics
   */
  notifyTrainingProgress(rolloutStats: any = null): void {
    // Update training time
    if (this.trainingStartTime > 0) {
      this.trainingMetrics.trainingTime = Date.now() - this.trainingStartTime;
    }
    
    // Schedule UI updates asynchronously
    setTimeout(() => {
      const metricsToSend = rolloutStats 
        ? {
            ...this.trainingMetrics,
            averageGameLength: rolloutStats.averageGameLength,
            gamesCompleted: rolloutStats.gamesCompleted,
            wins: rolloutStats.wins,
            losses: rolloutStats.losses,
            ties: rolloutStats.ties,
            winRate: rolloutStats.winRate,
            rewardStats: rolloutStats.rewardStats,
            policyEntropy: (this.trainer && (this.trainer as any).getStats) ? ((this.trainer as any).getStats().entropy || 0) : 0
          }
        : {
            ...this.trainingMetrics,
            policyEntropy: (this.trainer && (this.trainer as any).getStats) ? ((this.trainer as any).getStats().entropy || 0) : 0
          };
      
      if (this.onTrainingProgress) {
        this.onTrainingProgress(metricsToSend);
      }
      
      if (this.onGameEnd && this.gamesCompleted > 0) {
        this.onGameEnd(null, this.gamesCompleted, this.trainingMetrics);
      }
    }, 0);
  }

  /**
   * Update weights in all rollout collectors after training
   */
  async updateCollectorWeights(): Promise<void> {
    // Since collectors use shared agent/model, weights are automatically updated
    console.log('Collector weights updated (shared references)');
  }

  /**
   * Complete training session
   */
  async completeTraining(): Promise<void> {
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
  async saveModel(): Promise<void> {
    try {
      const modelId = `training_${Date.now()}`;
      const metadata = {
        gamesCompleted: this.gamesCompleted,
        trainingTime: Date.now() - this.trainingStartTime,
        metrics: this.trainingMetrics,
        timestamp: Date.now()
      };

      // Note: ModelManager.saveModel might need to be updated for PolicyAgent
      // For now, we'll skip this or adapt it
      this.lastSaveTime = Date.now();
      console.log(`Model save requested: ${modelId}`);
    } catch (error) {
      console.error('Failed to save model:', error);
    }
  }

  /**
   * Get training status
   * @returns {Object} Training status
   */
  getStatus(): any {
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
   * Export agent weights for saving
   * @returns {Object} Serialized agent weights bundle
   */
  exportAgentWeights(): any {
    if (!this.policyAgent) {
      throw new Error('No policy agent available to export');
    }

    const agent = this.policyAgent;
    
    // Serialize policy network
    const policyNetworkData = NetworkUtils.serializeNetwork(
      agent.policyNetwork,
      {
        inputSize: agent.observationSize,
        hiddenLayers: agent.networkArchitecture.policyHiddenLayers,
        outputSize: agent.actionSize,
        activation: agent.networkArchitecture.activation
      }
    );

    // Serialize value network
    const valueNetworkData = NetworkUtils.serializeNetwork(
      agent.valueNetwork,
      {
        inputSize: agent.observationSize,
        hiddenLayers: agent.networkArchitecture.valueHiddenLayers,
        outputSize: 1,
        activation: agent.networkArchitecture.activation
      }
    );

    // Serialize learnableStd
    const learnableStdArray = Array.from(agent.learnableStd.dataSync());
    const learnableStdShape = agent.learnableStd.shape;

    return {
      version: '1.0.0',
      observationSize: agent.observationSize,
      actionSize: agent.actionSize,
      actionSpaces: agent.actionSpaces,
      networkArchitecture: agent.networkArchitecture,
      policyNetwork: policyNetworkData,
      valueNetwork: valueNetworkData,
      learnableStd: {
        data: learnableStdArray,
        shape: learnableStdShape,
        dtype: agent.learnableStd.dtype
      },
      metadata: {
        gamesCompleted: this.gamesCompleted,
        trainingTime: Date.now() - this.trainingStartTime,
        timestamp: Date.now()
      }
    };
  }

  /**
   * Import agent weights from a saved bundle
   * @param {Object} bundle - Serialized agent weights bundle
   */
  async importAgentWeights(bundle: any): Promise<void> {
    if (!bundle || !bundle.policyNetwork || !bundle.valueNetwork) {
      throw new Error('Invalid agent weights bundle');
    }

    // Load policy network
    const policyNetwork = NetworkUtils.loadNetworkFromSerialized(bundle.policyNetwork);
    
    // Load value network
    const valueNetwork = NetworkUtils.loadNetworkFromSerialized(bundle.valueNetwork);

    // Load learnableStd
    // Access tf from global scope (TensorFlow.js loaded from CDN)
    const tf = (window as any).tf;
    if (!tf) {
      throw new Error('TensorFlow.js not loaded');
    }
    
    const learnableStdTensor = tf.tensor(
      bundle.learnableStd.data,
      bundle.learnableStd.shape,
      bundle.learnableStd.dtype
    );
    const learnableStd = tf.variable(learnableStdTensor, true);

    // Create new PolicyAgent with loaded weights
    const newAgent = new PolicyAgent({
      observationSize: bundle.observationSize,
      actionSize: bundle.actionSize,
      actionSpaces: bundle.actionSpaces,
      policyNetwork: policyNetwork,
      valueNetwork: valueNetwork,
      networkArchitecture: bundle.networkArchitecture,
      initialStd: bundle.learnableStd.data // Will be overridden below
    });

    // Replace learnableStd (dispose old one first)
    if (newAgent.learnableStd) {
      newAgent.learnableStd.dispose();
    }
    (newAgent as any).learnableStd = learnableStd;

    // Dispose old agent
    if (this.policyAgent) {
      this.policyAgent.dispose();
    }

    // Update policy agent
    this.policyAgent = newAgent;
    
    // Update policyAgents array
    if (this.trainablePlayers.length > 0) {
      const firstTrainablePlayer = this.trainablePlayers[0];
      this.policyAgents[firstTrainablePlayer] = newAgent;
      
      // Update controller
      if (this.controllers[firstTrainablePlayer]) {
        this.controllers[firstTrainablePlayer] = new PolicyController(newAgent);
      }
    }

    // Update rollout collectors with new agent
    for (const collector of this.rolloutCollectors) {
      (collector as any).agent = newAgent;
    }

    console.log('Agent weights imported successfully');
  }

  /**
   * Dispose of training session
   */
  dispose(): void {
    this.stop();
    
    if (this.policyAgent) {
      this.policyAgent.dispose();
    }
    
    if (this.trainer) {
      // PPOTrainer might have dispose method
      if (typeof (this.trainer as any).dispose === 'function') {
        (this.trainer as any).dispose();
      }
    }
  }
}

