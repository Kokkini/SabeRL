/**
 * MovementDecision - Represents the AI's chosen action for the next frame interval
 * Contains the action, confidence, and timing information
 */

export class MovementDecision {
  constructor(data = {}) {
    this.action = data.action || 'W';
    this.actionMask = Array.isArray(data.actionMask) ? data.actionMask.slice(0, 4) : [false, false, false, false];
    this.confidence = data.confidence || 0.5;
    this.timestamp = data.timestamp || Date.now();
    this.frameInterval = data.frameInterval || 4;
    this.probabilities = data.probabilities || [0.5, 0.5, 0.5, 0.5];
    
    this.validate();
  }

  /**
   * Validate the movement decision
   * @throws {Error} If validation fails
   */
  validate() {
    // Accept any action string for legacy, but require a valid mask
    if (!Array.isArray(this.actionMask) || this.actionMask.length !== 4) {
      throw new Error('actionMask must be an array of 4 booleans');
    }
    if (this.confidence < 0 || this.confidence > 1) {
      throw new Error(`Invalid confidence: ${this.confidence}. Must be in range [0, 1]`);
    }
    
    if (this.frameInterval <= 0) {
      throw new Error(`Invalid frame interval: ${this.frameInterval}. Must be positive`);
    }
    if (!Array.isArray(this.probabilities) || this.probabilities.length !== 4) {
      throw new Error('Probabilities must be an array of 4 elements');
    }
    // No requirement to sum to 1 for independent Bernoulli
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
      actionMask: [...this.actionMask],
      confidence: this.confidence,
      timestamp: this.timestamp,
      frameInterval: this.frameInterval,
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
      actionMask: nnOutput.actionMask,
      confidence: nnOutput.confidence,
      frameInterval: frameInterval,
      probabilities: nnOutput.probabilities
    });
  }

  /**
   * Create a random decision (for exploration)
   * @param {number} frameInterval - Frame interval for the decision
   * @returns {MovementDecision} Random decision
   */
  static random(frameInterval = 4) {
    const mask = [Math.random()<0.5, Math.random()<0.5, Math.random()<0.5, Math.random()<0.5];
    return new MovementDecision({
      action: ['W','A','S','D'][mask.findIndex(v=>v)],
      actionMask: mask,
      confidence: 0.5,
      frameInterval: frameInterval,
      probabilities: [0.5, 0.5, 0.5, 0.5]
    });
  }

  /**
   * Create a greedy decision (highest probability)
   * @param {Array} probabilities - Action probabilities
   * @param {number} frameInterval - Frame interval for the decision
   * @returns {MovementDecision} Greedy decision
   */
  static greedy(probabilities, frameInterval = 4) {
    // For Bernoulli heads, greedy becomes thresholding
    const mask = probabilities.map(p => p > 0.5);
    if (!mask.some(Boolean)) mask[probabilities.indexOf(Math.max(...probabilities))] = true;
    return new MovementDecision({
      action: ['W','A','S','D'][mask.findIndex(v=>v)],
      actionMask: mask,
      confidence: 1.0,
      frameInterval: frameInterval,
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
      actionMask: [...this.actionMask],
      confidence: this.confidence,
      timestamp: this.timestamp,
      frameInterval: this.frameInterval,
      probabilities: [...this.probabilities]
    });
  }

  /**
   * Get string representation
   * @returns {string} String representation
   */
  toString() {
    return `MovementDecision(mask=${JSON.stringify(this.actionMask)}, interval=${this.frameInterval})`;
  }
}
