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
    this.currentDecision = null;
    this.decisionFrameCount = 0; // legacy; retained for compatibility
    this.isActive = false;
    // Removed explorationRate (unused in decision-making)
    
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
    
    // no explorationRate validation
  }

  /**
   * Make a movement decision based on game state
   * @param {GameState} gameState - Current game state
   * @returns {MovementDecision} Movement decision
   */
  makeDecision(gameState) {
    try {
      if (!this.isActive) {
        return this.getRandomDecision();
      }
      // Always compute a fresh decision; external loops handle throttling
      this.currentDecision = this.processGameState(gameState);
      return this.currentDecision;
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
      
      // Use the neural network's prediction directly (now multi-binary)
      const actionDecision = {
        action: prediction.action,
        actionMask: prediction.actionMask,
        confidence: prediction.confidence,
        probabilities: prediction.probabilities,
        method: 'neural_network',
        timestamp: Date.now()
      };
      
      // Collect experience if callback is provided
      if (this.onExperience) {
        // Compute summed Bernoulli log-prob over actions
        const probs = tf.tensor1d(prediction.probabilities, 'float32');
        const mask = tf.tensor1d(actionDecision.actionMask.map(v => v ? 1 : 0), 'float32');
        const logProbPerAction = mask.mul(tf.log(probs.add(1e-8)))
          .add(tf.scalar(1).sub(mask).mul(tf.log(tf.scalar(1).sub(probs).add(1e-8))));
        const logProbValue = logProbPerAction.sum().dataSync()[0];
        probs.dispose();
        mask.dispose();
        
        this.onExperience({
          state: processedState,
          action: actionDecision.actionMask,
          reward: 0, // Will be updated later with actual reward
          isTerminal: false,
          logProb: logProbValue
        });
      }
      
      // Create movement decision
      return new MovementDecision({
        action: actionDecision.action,
        actionMask: actionDecision.actionMask,
        confidence: actionDecision.confidence,
        frameInterval: 0,
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
  // Removed applyExploration; exploration now handled by training entropy

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
      // Sigmoid for Bernoulli per action
      const probs = tf.sigmoid(logits);
      const probabilities = Array.from(probs.dataSync());
      // Sample action mask via Bernoulli per action (allow zero-press)
      const actionMask = probabilities.map(p => Math.random() < p);
      // Sum Bernoulli log-prob
      const probsT = tf.tensor1d(probabilities, 'float32');
      const maskT = tf.tensor1d(actionMask.map(v => v ? 1 : 0), 'float32');
      const logProbValue = maskT.mul(tf.log(probsT.add(1e-8)))
        .add(tf.scalar(1).sub(maskT).mul(tf.log(tf.scalar(1).sub(probsT).add(1e-8))))
        .sum().dataSync()[0];
      
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
      probsT.dispose();
      maskT.dispose();
      
      return {
        action: actionMask,
        value: value,
        logProb: logProbValue
      };
    } catch (error) {
      console.error('Failed to act:', error);
      // Return random action as fallback
      const mask = [Math.random()<0.5, Math.random()<0.5, Math.random()<0.5, Math.random()<0.5];
      return {
        action: mask,
        value: 0,
        logProb: -2.7726 // approx log((0.5)^4)
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
    return MovementDecision.random(0);
  }

  /**
   * Activate the agent
   */
  activate() {
    this.isActive = true;
    this.decisionFrameCount = 0;
    this.currentDecision = null;
    // console.log(`PolicyAgent ${this.id} activated`);
  }

  /**
   * Deactivate the agent
   */
  deactivate() {
    this.isActive = false;
    this.currentDecision = null;
    this.decisionFrameCount = 0;
    // console.log(`PolicyAgent ${this.id} deactivated`);
  }

  /**
   * Update agent configuration
   * @param {Object} config - New configuration
   */
  updateConfig(config) {
    this.validate();
  }

  /**
   * Get current configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    return {
      id: this.id,
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
    return `PolicyAgent(id=${this.id}, active=${this.isActive})`;
  }
}
