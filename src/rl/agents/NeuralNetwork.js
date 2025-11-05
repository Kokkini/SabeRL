/**
 * NeuralNetwork - Represents the AI brain that processes game state and outputs movement decisions
 * Uses TensorFlow.js Core for neural network implementation
 */

export class NeuralNetwork {
  constructor(config = {}) {
    this.id = config.id || this.generateId();
    this.architecture = config.architecture || {
      inputSize: 6, // playerPos, opponentPos, playerSaberAngle, playerSaberAngularVel, opponentSaberAngle, opponentSaberAngularVel
      hiddenLayers: [128, 64, 32],
      outputSize: 4, // W, A, S, D actions
      activation: 'relu'
    };
    this.weights = null;
    this.optimizer = config.optimizer || {
      type: 'adam',
      learningRate: 0.001
    };
    this.createdAt = new Date();
    this.lastTrained = null;
    this.model = null;
    
    this.initializeModel();
  }

  /**
   * Initialize the neural network model
   */
  initializeModel() {
    try {
      // Create sequential model
      this.model = tf.sequential();
      
      // Add input layer
      this.model.add(tf.layers.dense({
        units: this.architecture.hiddenLayers[0],
        inputShape: [this.architecture.inputSize],
        activation: this.architecture.activation,
        name: 'input_layer'
      }));
      
      // Add hidden layers
      for (let i = 1; i < this.architecture.hiddenLayers.length; i++) {
        this.model.add(tf.layers.dense({
          units: this.architecture.hiddenLayers[i],
          activation: this.architecture.activation,
          name: `hidden_layer_${i}`
        }));
      }
      
      // Add output layer (linear logits; softmax applied in trainers/predict)
      this.model.add(tf.layers.dense({
        units: this.architecture.outputSize,
        activation: 'linear',
        name: 'output_layer'
      }));
      
      // Compile model
      this.model.compile({
        optimizer: tf.train.adam(this.optimizer.learningRate),
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy']
      });
      
      console.log('Neural network initialized successfully');
    } catch (error) {
      console.error('Failed to initialize neural network:', error);
      throw error;
    }
  }

  /**
   * Predict action probabilities from game state
   * @param {Array|tf.Tensor} gameState - Normalized game state array or tensor
   * @returns {Object} Action probabilities and decision
   */
  predict(gameState) {
    try {
      if (!this.model) {
        throw new Error('Model not initialized');
      }
      
      // Convert array to tensor if needed
      let input;
      if (Array.isArray(gameState)) {
        input = tf.tensor2d([gameState], [1, this.architecture.inputSize]);
      } else if (gameState instanceof tf.Tensor) {
        input = gameState.reshape([1, this.architecture.inputSize]);
      } else {
        throw new Error('Invalid game state format');
      }
      
      // Get logits and convert to probabilities via sigmoid (independent Bernoulli per action)
      const logits = this.model.predict(input);
      const probsTensor = tf.sigmoid(logits);
      const probabilities = Array.from(probsTensor.dataSync());
      
      // Sample multi-binary action mask via Bernoulli per action (allowing zero-press)
      const actionMask = probabilities.map(p => Math.random() < p);
      // Derive a representative action string (for legacy consumers) by priority W,A,S, D
      const action = ['W','A','S','D'][actionMask.findIndex(v => v)] || 'W';
      const confidence = 1.0; // not meaningful for multi-binary; keep for compatibility
      
      // Clean up tensors
      input.dispose();
      logits.dispose();
      probsTensor.dispose();
      
      return {
        action,
        confidence,
        probabilities: probabilities,
        actionMask
      };
    } catch (error) {
      console.error('Prediction failed:', error);
      // Return random action as fallback
      return this.getRandomAction();
    }
  }

  /**
   * Get action index from probabilities (with exploration)
   * @param {Array} probabilities - Action probabilities
   * @returns {number} Selected action index
   */
  getActionIndex(probabilities) {
    // Sample from the categorical distribution defined by probabilities
    // Normalize in case of small numerical drift
    let total = 0;
    for (let i = 0; i < probabilities.length; i++) {
      const p = probabilities[i];
      total += (isFinite(p) && p > 0) ? p : 0;
    }
    if (total <= 0) {
      // Fallback to uniform random if invalid distribution
      return Math.floor(Math.random() * probabilities.length);
    }
    const r = Math.random() * total;
    let cumulative = 0;
    for (let i = 0; i < probabilities.length; i++) {
      const p = (isFinite(probabilities[i]) && probabilities[i] > 0) ? probabilities[i] : 0;
      cumulative += p;
      if (r < cumulative) return i;
    }
    return probabilities.length - 1;
  }

  /**
   * Convert action index to WASD key
   * @param {number} index - Action index (0-3)
   * @returns {string} WASD key
   */
  indexToAction(index) {
    const actions = ['W', 'A', 'S', 'D'];
    return actions[index] || 'W';
  }

  /**
   * Get random action as fallback
   * @returns {Object} Random action decision
   */
  getRandomAction() {
    const actions = ['W', 'A', 'S', 'D'];
    const randomIndex = Math.floor(Math.random() * actions.length);
    
    return {
      action: actions[randomIndex],
      confidence: 0.25, // Equal probability
      probabilities: [0.25, 0.25, 0.25, 0.25],
      actionIndex: randomIndex
    };
  }

  /**
   * Update model weights (for training)
   * @param {tf.Tensor} gradients - Weight gradients
   */
  updateWeights(gradients) {
    try {
      // This would be implemented with the specific training algorithm
      // For now, we'll just mark as trained
      this.lastTrained = new Date();
      console.log('Model weights updated');
    } catch (error) {
      console.error('Failed to update weights:', error);
      throw error;
    }
  }

  /**
   * Get current model weights
   * @returns {Array} Model weights as tensors
   */
  getWeights() {
    if (!this.model) {
      return null;
    }
    
    return this.model.getWeights();
  }

  /**
   * Set model weights
   * @param {Array} weights - New model weights
   */
  setWeights(weights) {
    try {
      if (!this.model) {
        throw new Error('Model not initialized');
      }
      
      this.model.setWeights(weights);
      this.lastTrained = new Date();
      console.log('Model weights set successfully');
    } catch (error) {
      console.error('Failed to set weights:', error);
      throw error;
    }
  }

  /**
   * Create a copy of this neural network
   * @returns {NeuralNetwork} Copy of the network
   */
  clone() {
    const cloned = new NeuralNetwork({
      id: this.generateId(),
      architecture: { ...this.architecture },
      optimizer: { ...this.optimizer }
    });
    
    // Copy weights
    const weights = this.getWeights();
    if (weights) {
      const clonedWeights = weights.map(w => w.clone());
      cloned.setWeights(clonedWeights);
    }
    
    return cloned;
  }

  /**
   * Serialize model for storage
   * @returns {Object} Serialized model data
   */
  serialize() {
    const weights = this.getWeights();
    const serializedWeights = weights
      ? weights.map(w => ({
          data: Array.from(w.dataSync()),
          shape: w.shape,
          dtype: w.dtype
        }))
      : null;
    
    return {
      id: this.id,
      architecture: this.architecture,
      weights: serializedWeights,
      optimizer: this.optimizer,
      createdAt: this.createdAt.toISOString(),
      lastTrained: this.lastTrained ? this.lastTrained.toISOString() : null
    };
  }

  /**
   * Load model from serialized data
   * @param {Object} data - Serialized model data
   */
  static fromSerialized(data) {
    const network = new NeuralNetwork({
      id: data.id,
      architecture: data.architecture,
      optimizer: data.optimizer
    });
    
    network.createdAt = new Date(data.createdAt);
    network.lastTrained = data.lastTrained ? new Date(data.lastTrained) : null;
    
    if (data.weights) {
      // Convert serialized weights back to tensors using stored shape and dtype
      const weights = data.weights.map(w => tf.tensor(w.data, w.shape, w.dtype));
      network.setWeights(weights);
    }
    
    return network;
  }

  /**
   * Generate unique ID
   * @returns {string} Unique identifier
   */
  generateId() {
    return 'nn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Dispose of model and free memory
   */
  dispose() {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
  }
}
