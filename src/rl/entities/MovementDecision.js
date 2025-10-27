/**
 * MovementDecision - Represents the AI's chosen action for the next frame interval
 * Contains the action, confidence, and timing information
 */

export class MovementDecision {
  constructor(data = {}) {
    this.action = data.action || 'W';
    this.confidence = data.confidence || 0.5;
    this.timestamp = data.timestamp || Date.now();
    this.frameInterval = data.frameInterval || 4;
    this.actionIndex = data.actionIndex || 0;
    this.probabilities = data.probabilities || [0.25, 0.25, 0.25, 0.25];
    
    this.validate();
  }

  /**
   * Validate the movement decision
   * @throws {Error} If validation fails
   */
  validate() {
    const validActions = ['W', 'A', 'S', 'D'];
    
    if (!validActions.includes(this.action)) {
      throw new Error(`Invalid action: ${this.action}. Must be one of: ${validActions.join(', ')}`);
    }
    
    if (this.confidence < 0 || this.confidence > 1) {
      throw new Error(`Invalid confidence: ${this.confidence}. Must be in range [0, 1]`);
    }
    
    if (this.frameInterval <= 0) {
      throw new Error(`Invalid frame interval: ${this.frameInterval}. Must be positive`);
    }
    
    if (this.actionIndex < 0 || this.actionIndex > 3) {
      throw new Error(`Invalid action index: ${this.actionIndex}. Must be in range [0, 3]`);
    }
    
    if (!Array.isArray(this.probabilities) || this.probabilities.length !== 4) {
      throw new Error('Probabilities must be an array of 4 elements');
    }
    
    const sum = this.probabilities.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1.0) > 0.001) {
      throw new Error(`Probabilities must sum to 1.0, got: ${sum}`);
    }
  }

  /**
   * Get the action as a key code
   * @returns {string} Key code for the action
   */
  getKeyCode() {
    const keyMap = {
      'W': 'KeyW',
      'A': 'KeyA', 
      'S': 'KeyS',
      'D': 'KeyD'
    };
    
    return keyMap[this.action] || 'KeyW';
  }

  /**
   * Get the action as a movement vector
   * @returns {Object} Movement vector {x, y}
   */
  getMovementVector() {
    const movementMap = {
      'W': { x: 0, y: -1 },  // Up
      'A': { x: -1, y: 0 },  // Left
      'S': { x: 0, y: 1 },   // Down
      'D': { x: 1, y: 0 }    // Right
    };
    
    return movementMap[this.action] || { x: 0, y: 0 };
  }

  /**
   * Get the action as a normalized movement vector
   * @returns {tf.Tensor} Normalized movement vector
   */
  getNormalizedMovementVector() {
    const vector = this.getMovementVector();
    return tf.tensor([vector.x, vector.y]);
  }

  /**
   * Check if this is a valid decision
   * @returns {boolean} True if decision is valid
   */
  isValid() {
    try {
      this.validate();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get the second most likely action
   * @returns {string} Second best action
   */
  getSecondBestAction() {
    const actions = ['W', 'A', 'S', 'D'];
    const probabilities = [...this.probabilities];
    
    // Find second highest probability
    let maxIndex = 0;
    let secondMaxIndex = 1;
    
    if (probabilities[1] > probabilities[0]) {
      maxIndex = 1;
      secondMaxIndex = 0;
    }
    
    for (let i = 2; i < probabilities.length; i++) {
      if (probabilities[i] > probabilities[maxIndex]) {
        secondMaxIndex = maxIndex;
        maxIndex = i;
      } else if (probabilities[i] > probabilities[secondMaxIndex]) {
        secondMaxIndex = i;
      }
    }
    
    return actions[secondMaxIndex];
  }

  /**
   * Get the entropy of the decision (measure of uncertainty)
   * @returns {number} Entropy value
   */
  getEntropy() {
    let entropy = 0;
    for (const prob of this.probabilities) {
      if (prob > 0) {
        entropy -= prob * Math.log2(prob);
      }
    }
    return entropy;
  }

  /**
   * Check if the decision is uncertain (high entropy)
   * @param {number} threshold - Entropy threshold (default: 1.5)
   * @returns {boolean} True if decision is uncertain
   */
  isUncertain(threshold = 1.5) {
    return this.getEntropy() > threshold;
  }

  /**
   * Get decision as plain object (for serialization)
   * @returns {Object} Plain object representation
   */
  toObject() {
    return {
      action: this.action,
      confidence: this.confidence,
      timestamp: this.timestamp,
      frameInterval: this.frameInterval,
      actionIndex: this.actionIndex,
      probabilities: [...this.probabilities]
    };
  }

  /**
   * Create MovementDecision from plain object
   * @param {Object} data - Plain object data
   * @returns {MovementDecision} New MovementDecision instance
   */
  static fromObject(data) {
    return new MovementDecision(data);
  }

  /**
   * Create MovementDecision from neural network output
   * @param {Object} nnOutput - Neural network prediction output
   * @param {number} frameInterval - Frame interval for the decision
   * @returns {MovementDecision} New MovementDecision instance
   */
  static fromNeuralNetworkOutput(nnOutput, frameInterval = 4) {
    return new MovementDecision({
      action: nnOutput.action,
      confidence: nnOutput.confidence,
      frameInterval: frameInterval,
      actionIndex: nnOutput.actionIndex,
      probabilities: nnOutput.probabilities
    });
  }

  /**
   * Create a random decision (for exploration)
   * @param {number} frameInterval - Frame interval for the decision
   * @returns {MovementDecision} Random decision
   */
  static random(frameInterval = 4) {
    const actions = ['W', 'A', 'S', 'D'];
    const randomIndex = Math.floor(Math.random() * actions.length);
    
    return new MovementDecision({
      action: actions[randomIndex],
      confidence: 0.25,
      frameInterval: frameInterval,
      actionIndex: randomIndex,
      probabilities: [0.25, 0.25, 0.25, 0.25]
    });
  }

  /**
   * Create a greedy decision (highest probability)
   * @param {Array} probabilities - Action probabilities
   * @param {number} frameInterval - Frame interval for the decision
   * @returns {MovementDecision} Greedy decision
   */
  static greedy(probabilities, frameInterval = 4) {
    const actions = ['W', 'A', 'S', 'D'];
    let maxIndex = 0;
    let maxProb = probabilities[0];
    
    for (let i = 1; i < probabilities.length; i++) {
      if (probabilities[i] > maxProb) {
        maxProb = probabilities[i];
        maxIndex = i;
      }
    }
    
    return new MovementDecision({
      action: actions[maxIndex],
      confidence: maxProb,
      frameInterval: frameInterval,
      actionIndex: maxIndex,
      probabilities: [...probabilities]
    });
  }

  /**
   * Clone the movement decision
   * @returns {MovementDecision} Cloned decision
   */
  clone() {
    return new MovementDecision({
      action: this.action,
      confidence: this.confidence,
      timestamp: this.timestamp,
      frameInterval: this.frameInterval,
      actionIndex: this.actionIndex,
      probabilities: [...this.probabilities]
    });
  }

  /**
   * Get string representation
   * @returns {string} String representation
   */
  toString() {
    return `MovementDecision(action=${this.action}, confidence=${this.confidence.toFixed(3)}, interval=${this.frameInterval})`;
  }
}
