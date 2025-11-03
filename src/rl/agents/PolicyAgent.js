/**
 * PolicyAgent - Neural network agent that controls player movement
 * Uses a neural network to make movement decisions based on game state
 */

import { NeuralNetwork } from './NeuralNetwork.js';
import { GameState } from '../entities/GameState.js';
import { MovementDecision } from '../entities/MovementDecision.js';
import { GameStateProcessor } from '../utils/GameStateProcessor.js';
import { ActionMapper } from '../utils/ActionMapper.js';
import { GameConfig } from '../../config/config.js';
// TensorFlow.js is loaded from CDN as a global 'tf' object

export class PolicyAgent {
  constructor(config = {}) {
    this.id = config.id || this.generateId();
    this.neuralNetwork = config.neuralNetwork || new NeuralNetwork();
    // decisionInterval is interpreted in seconds
    this.decisionIntervalSec = config.decisionInterval || GameConfig.rl.decisionInterval;
    this.currentDecision = null;
    this.decisionFrameCount = 0; // legacy; no longer used for timing
    this.accumulatedDecisionSec = 0;
    this.isActive = false;
    this.explorationRate = config.explorationRate || GameConfig.rl.explorationRate;
    
    // Experience collection callback
    this.onExperience = config.onExperience || null;
    
    // Perception and action systems
    this.stateProcessor = new GameStateProcessor({
      normalizePositions: true,
      normalizeAngles: true,
      includeVelocity: true,
      includeDistance: true
    });
    
    this.actionMapper = new ActionMapper({
      actionSpace: ['W', 'A', 'S', 'D'],
      includeNoAction: true
    });
    
    this.validate();
  }

  /**
   * Validate agent configuration
   * @throws {Error} If validation fails
   */
  validate() {
    if (!this.neuralNetwork) {
      throw new Error('Neural network is required');
    }
    
    if (this.decisionInterval <= 0) {
      throw new Error(`Invalid decision interval: ${this.decisionInterval}. Must be positive`);
    }
    
    if (this.explorationRate < 0 || this.explorationRate > 1) {
      throw new Error(`Invalid exploration rate: ${this.explorationRate}. Must be in range [0, 1]`);
    }
  }

  /**
   * Make a movement decision based on game state
   * @param {GameState} gameState - Current game state
   * @returns {MovementDecision} Movement decision
   */
  makeDecision(gameState, deltaTime) {
    try {
      if (!this.isActive) {
        return this.getRandomDecision();
      }
      
      // Accumulate simulated time (deltaTime is in seconds)
      if (typeof deltaTime === 'number' && !Number.isNaN(deltaTime)) {
        this.accumulatedDecisionSec += deltaTime;
      }

      // Check if we need to make a new decision based on elapsed seconds
      if (this.accumulatedDecisionSec >= this.decisionIntervalSec) {
        this.currentDecision = this.processGameState(gameState);
        this.accumulatedDecisionSec = 0;
      }
      
      return this.currentDecision || this.getRandomDecision();
    } catch (error) {
      console.error('Failed to make decision:', error);
      return this.getRandomDecision();
    }
  }

  /**
   * Process game state through neural network
   * @param {Object} gameState - Current game state object
   * @returns {MovementDecision} Movement decision
   */
  processGameState(gameState) {
    try {
      // Process game state into normalized features
      const processedState = this.stateProcessor.processState(gameState);
      
      // Get neural network prediction
      const prediction = this.neuralNetwork.predict(processedState);
      
      // Use the neural network's prediction directly (it already handles exploration)
      const actionDecision = {
        action: prediction.action,
        actionIndex: prediction.actionIndex,
        confidence: prediction.confidence,
        probabilities: prediction.probabilities,
        method: 'neural_network',
        timestamp: Date.now()
      };
      
      // Collect experience if callback is provided
      if (this.onExperience) {
        // Compute per-action log-prob from probabilities
        const probs = tf.tensor1d(prediction.probabilities, 'float32');
        const logProbs = tf.log(probs.add(1e-8));
        const actionIdx = actionDecision.actionIndex;
        const logProbValue = logProbs.gather(actionIdx).dataSync()[0];
        probs.dispose();
        logProbs.dispose();
        
        this.onExperience({
          state: processedState,
          action: actionDecision.actionIndex,
          reward: 0, // Will be updated later with actual reward
          isTerminal: false,
          logProb: logProbValue
        });
      }
      
      // Create movement decision
      return new MovementDecision({
        action: actionDecision.action,
        confidence: actionDecision.confidence,
        frameInterval: this.decisionIntervalSec,
        actionIndex: actionDecision.actionIndex,
        probabilities: actionDecision.probabilities,
        timestamp: actionDecision.timestamp
      });
    } catch (error) {
      console.error('Failed to process game state:', error);
      return this.getRandomDecision();
    }
  }

  /**
   * Apply exploration to neural network prediction
   * @param {Object} prediction - Neural network prediction
   * @returns {Object} Modified prediction with exploration
   */
  applyExploration(prediction) {
    if (Math.random() < this.explorationRate) {
      // Random exploration
      return this.getRandomPrediction();
    }
    
    return prediction;
  }

  /**
   * Get random prediction for exploration
   * @returns {Object} Random prediction
   */
  getRandomPrediction() {
    const actions = ['W', 'A', 'S', 'D'];
    const randomIndex = Math.floor(Math.random() * actions.length);
    
    return {
      action: actions[randomIndex],
      confidence: 0.25,
      actionIndex: randomIndex,
      probabilities: [0.25, 0.25, 0.25, 0.25]
    };
  }

  /**
   * Act on observation (for rollout-based training)
   * @param {Object} observation - Game state observation
   * @param {Object} valueModel - Optional value model for value estimation
   * @returns {Object} {action: number, value: number, logProb: number}
   */
  act(observation, valueModel = null) {
    try {
      if (!this.isActive) {
        // Return random action if not active
        const randomIndex = Math.floor(Math.random() * 4);
        return {
          action: randomIndex,
          value: 0,
          logProb: Math.log(0.25) // log(1/4) for uniform random
        };
      }

      // Process game state into normalized features
      const processedState = this.stateProcessor.processState(observation);
      
      // Get logits directly from the model (before softmax)
      let input;
      if (Array.isArray(processedState)) {
        input = tf.tensor2d([processedState], [1, this.neuralNetwork.architecture.inputSize]);
      } else if (processedState instanceof tf.Tensor) {
        input = processedState.reshape([1, this.neuralNetwork.architecture.inputSize]);
      } else {
        throw new Error('Invalid processed state format');
      }
      
      // Get raw logits from model
      const logits = this.neuralNetwork.model.predict(input);
      
      // Apply softmax to get probabilities
      const probs = tf.softmax(logits);
      const logProbs = tf.log(probs.add(1e-8));
      
      // Get probabilities as array for action selection
      const probabilities = probs.dataSync();
      
      // Sample action from the policy distribution (categorical sampling)
      let actionIndex;
      {
        const total = probabilities.reduce((s, p) => s + p, 0) || 1;
        const normalized = Array.from(probabilities).map(p => (p < 0 ? 0 : p) / total);
        const r = Math.random();
        let cum = 0;
        actionIndex = 0;
        for (let i = 0; i < normalized.length; i++) {
          cum += normalized[i];
          if (r <= cum) { actionIndex = i; break; }
        }
      }
      
      // Get log probability of selected action (gather along the action dimension)
      const logProbValue = tf.squeeze(logProbs).gather(actionIndex).dataSync()[0];
      
      // Get value estimate if value model provided
      let value = 0;
      if (valueModel) {
        const valuePred = valueModel.predict(input);
        value = valuePred.dataSync()[0];
        valuePred.dispose();
      }
      
      // Clean up tensors
      input.dispose();
      logits.dispose();
      probs.dispose();
      logProbs.dispose();
      
      return {
        action: actionIndex,
        value: value,
        logProb: logProbValue
      };
    } catch (error) {
      console.error('Failed to act:', error);
      // Return random action as fallback
      return {
        action: Math.floor(Math.random() * 4),
        value: 0,
        logProb: Math.log(0.25)
      };
    }
  }

  /**
   * Get value estimate for observation (for bootstrapping)
   * @param {Object} observation - Game state observation
   * @param {Object} valueModel - Value model for value estimation
   * @returns {number} Value estimate
   */
  getValue(observation, valueModel) {
    try {
      if (!valueModel) {
        return 0;
      }

      // Process game state into normalized features
      const processedState = this.stateProcessor.processState(observation);
      
      // Prepare input tensor
      let input;
      if (Array.isArray(processedState)) {
        input = tf.tensor2d([processedState], [1, this.neuralNetwork.architecture.inputSize]);
      } else if (processedState instanceof tf.Tensor) {
        input = processedState.reshape([1, this.neuralNetwork.architecture.inputSize]);
      } else {
        throw new Error('Invalid processed state format');
      }
      
      // Get value estimate
      const valuePred = valueModel.predict(input);
      const value = valuePred.dataSync()[0];
      
      // Clean up
      input.dispose();
      valuePred.dispose();
      
      return value;
    } catch (error) {
      console.error('Failed to get value:', error);
      return 0;
    }
  }

  /**
   * Get random decision as fallback
   * @returns {MovementDecision} Random decision
   */
  getRandomDecision() {
    return MovementDecision.random(this.decisionInterval);
  }

  /**
   * Activate the agent
   */
  activate() {
    this.isActive = true;
    this.decisionFrameCount = 0;
    this.currentDecision = null;
    console.log(`PolicyAgent ${this.id} activated`);
  }

  /**
   * Deactivate the agent
   */
  deactivate() {
    this.isActive = false;
    this.currentDecision = null;
    this.decisionFrameCount = 0;
    console.log(`PolicyAgent ${this.id} deactivated`);
  }

  /**
   * Update agent configuration
   * @param {Object} config - New configuration
   */
  updateConfig(config) {
    if (config.decisionInterval !== undefined) {
      this.decisionInterval = config.decisionInterval;
    }
    
    if (config.explorationRate !== undefined) {
      this.explorationRate = config.explorationRate;
    }
    
    this.validate();
  }

  /**
   * Get current configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    return {
      id: this.id,
      decisionInterval: this.decisionInterval,
      explorationRate: this.explorationRate,
      isActive: this.isActive
    };
  }

  /**
   * Get agent status
   * @returns {Object} Agent status
   */
  getStatus() {
    return {
      id: this.id,
      isActive: this.isActive,
      decisionInterval: this.decisionInterval,
      explorationRate: this.explorationRate,
      currentDecision: this.currentDecision ? this.currentDecision.toObject() : null,
      decisionFrameCount: this.decisionFrameCount,
      neuralNetworkId: this.neuralNetwork.id
    };
  }

  /**
   * Clone the agent with a new neural network
   * @returns {PolicyAgent} Cloned agent
   */
  clone() {
    const clonedNetwork = this.neuralNetwork.clone();
    return new PolicyAgent({
      id: this.generateId(),
      neuralNetwork: clonedNetwork,
      decisionInterval: this.decisionInterval,
      explorationRate: this.explorationRate
    });
  }

  /**
   * Update neural network weights
   * @param {Array} weights - New weights
   */
  updateWeights(weights) {
    this.neuralNetwork.setWeights(weights);
  }

  /**
   * Get neural network weights
   * @returns {Array} Current weights
   */
  getWeights() {
    return this.neuralNetwork.getWeights();
  }

  /**
   * Save agent to storage
   * @param {ModelManager} modelManager - Model manager instance
   * @returns {Promise<string>} Saved model ID
   */
  async save(modelManager) {
    try {
      const serializedAgent = {
        id: this.id,
        neuralNetwork: this.neuralNetwork.serialize(),
        config: this.getConfig(),
        savedAt: new Date().toISOString()
      };
      
      return await modelManager.saveModel(serializedAgent, {
        type: 'PolicyAgent',
        version: '1.0.0'
      });
    } catch (error) {
      console.error('Failed to save agent:', error);
      throw error;
    }
  }

  /**
   * Load agent from storage
   * @param {ModelManager} modelManager - Model manager instance
   * @param {string} modelId - Model ID
   * @returns {Promise<PolicyAgent>} Loaded agent
   */
  static async load(modelManager, modelId) {
    try {
      const modelData = await modelManager.loadModel(modelId);
      const neuralNetwork = NeuralNetwork.fromSerialized(modelData.neuralNetwork);
      
      return new PolicyAgent({
        id: modelData.id,
        neuralNetwork: neuralNetwork,
        decisionInterval: modelData.config.decisionInterval,
        explorationRate: modelData.config.explorationRate
      });
    } catch (error) {
      console.error('Failed to load agent:', error);
      throw error;
    }
  }

  /**
   * Generate unique agent ID
   * @returns {string} Unique ID
   */
  generateId() {
    return `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Dispose of agent resources
   */
  dispose() {
    if (this.neuralNetwork) {
      this.neuralNetwork.dispose();
    }
    if (this.stateProcessor) {
      this.stateProcessor.dispose();
    }
    if (this.actionMapper) {
      this.actionMapper.dispose();
    }
    this.isActive = false;
    this.currentDecision = null;
  }

  /**
   * Get string representation
   * @returns {string} String representation
   */
  toString() {
    return `PolicyAgent(id=${this.id}, active=${this.isActive}, interval=${this.decisionInterval})`;
  }
}
