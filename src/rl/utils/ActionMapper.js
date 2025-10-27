/**
 * ActionMapper - Maps between neural network outputs and game actions
 * Handles action encoding, decoding, and validation
 */

export class ActionMapper {
  constructor(options = {}) {
    this.options = {
      actionSpace: options.actionSpace || ['W', 'A', 'S', 'D'],
      includeNoAction: options.includeNoAction !== false,
      ...options
    };

    // Build action mapping
    this.actionToIndexMap = new Map();
    this.indexToActionMap = new Map();
    
    let index = 0;
    for (const action of this.options.actionSpace) {
      this.actionToIndexMap.set(action, index);
      this.indexToActionMap.set(index, action);
      index++;
    }

    if (this.options.includeNoAction) {
      this.actionToIndexMap.set('NONE', index);
      this.indexToActionMap.set(index, 'NONE');
    }

    this.numActions = this.actionToIndexMap.size;
  }

  /**
   * Convert action to index
   * @param {string} action - Action string
   * @returns {number} Action index
   */
  actionToIndex(action) {
    return this.actionToIndexMap.get(action) || 0;
  }

  /**
   * Convert index to action
   * @param {number} index - Action index
   * @returns {string} Action string
   */
  indexToAction(index) {
    return this.indexToActionMap.get(index) || this.options.actionSpace[0];
  }

  /**
   * Convert neural network output to action
   * @param {Array|tf.Tensor} probabilities - Action probabilities
   * @param {string} method - Selection method ('argmax', 'sample', 'epsilon_greedy')
   * @param {number} epsilon - Epsilon for epsilon-greedy (default: 0.1)
   * @returns {Object} Action decision object
   */
  convertToAction(probabilities, method = 'argmax', epsilon = 0.1) {
    let actionIndex;
    let confidence;

    if (probabilities instanceof tf.Tensor) {
      const probs = probabilities.dataSync();
      actionIndex = this.selectAction(probs, method, epsilon);
      confidence = probs[actionIndex];
    } else {
      actionIndex = this.selectAction(probabilities, method, epsilon);
      confidence = probabilities[actionIndex];
    }

    const action = this.indexToAction(actionIndex);
    
    return {
      action,
      actionIndex,
      confidence,
      probabilities: probabilities instanceof tf.Tensor ? probabilities.dataSync() : probabilities,
      method,
      timestamp: Date.now()
    };
  }

  /**
   * Select action based on probabilities
   * @param {Array} probabilities - Action probabilities
   * @param {string} method - Selection method
   * @param {number} epsilon - Epsilon for epsilon-greedy
   * @returns {number} Selected action index
   */
  selectAction(probabilities, method, epsilon) {
    switch (method) {
      case 'argmax':
        return this.argmax(probabilities);
      
      case 'sample':
        return this.sample(probabilities);
      
      case 'epsilon_greedy':
        return this.epsilonGreedy(probabilities, epsilon);
      
      default:
        return this.argmax(probabilities);
    }
  }

  /**
   * Argmax selection (greedy)
   * @param {Array} probabilities - Action probabilities
   * @returns {number} Index of maximum probability
   */
  argmax(probabilities) {
    let maxIndex = 0;
    let maxProb = probabilities[0];

    for (let i = 1; i < probabilities.length; i++) {
      if (probabilities[i] > maxProb) {
        maxProb = probabilities[i];
        maxIndex = i;
      }
    }

    return maxIndex;
  }

  /**
   * Sample from probability distribution
   * @param {Array} probabilities - Action probabilities
   * @returns {number} Sampled action index
   */
  sample(probabilities) {
    const random = Math.random();
    let cumulative = 0;

    for (let i = 0; i < probabilities.length; i++) {
      cumulative += probabilities[i];
      if (random <= cumulative) {
        return i;
      }
    }

    return probabilities.length - 1;
  }

  /**
   * Epsilon-greedy selection
   * @param {Array} probabilities - Action probabilities
   * @param {number} epsilon - Exploration rate
   * @returns {number} Selected action index
   */
  epsilonGreedy(probabilities, epsilon) {
    if (Math.random() < epsilon) {
      // Random action
      return Math.floor(Math.random() * probabilities.length);
    } else {
      // Greedy action
      return this.argmax(probabilities);
    }
  }

  /**
   * Convert action to one-hot encoding
   * @param {string} action - Action string
   * @returns {Array} One-hot encoded action
   */
  actionToOneHot(action) {
    const oneHot = new Array(this.numActions).fill(0);
    const index = this.actionToIndex(action);
    if (index !== undefined) {
      oneHot[index] = 1;
    }
    return oneHot;
  }

  /**
   * Convert action index to one-hot encoding
   * @param {number} index - Action index
   * @returns {Array} One-hot encoded action
   */
  indexToOneHot(index) {
    const oneHot = new Array(this.numActions).fill(0);
    if (index >= 0 && index < this.numActions) {
      oneHot[index] = 1;
    }
    return oneHot;
  }

  /**
   * Get action mask for valid actions
   * @param {Object} gameState - Current game state
   * @returns {Array} Action mask (1 for valid, 0 for invalid)
   */
  getActionMask(gameState) {
    // For now, all actions are valid
    // In the future, this could implement action masking based on game state
    return new Array(this.numActions).fill(1);
  }

  /**
   * Apply action mask to probabilities
   * @param {Array} probabilities - Action probabilities
   * @param {Array} mask - Action mask
   * @returns {Array} Masked probabilities
   */
  applyActionMask(probabilities, mask) {
    const masked = probabilities.map((prob, index) => prob * mask[index]);
    
    // Renormalize
    const sum = masked.reduce((acc, prob) => acc + prob, 0);
    if (sum > 0) {
      return masked.map(prob => prob / sum);
    } else {
      // If all actions are masked, return uniform distribution
      return new Array(probabilities.length).fill(1 / probabilities.length);
    }
  }

  /**
   * Validate action
   * @param {string} action - Action to validate
   * @returns {boolean} True if valid
   */
  isValidAction(action) {
    return this.actionToIndexMap.has(action);
  }

  /**
   * Get all valid actions
   * @returns {Array} Array of valid actions
   */
  getValidActions() {
    return Array.from(this.actionToIndexMap.keys());
  }

  /**
   * Get action space size
   * @returns {number} Number of possible actions
   */
  getActionSpaceSize() {
    return this.numActions;
  }

  /**
   * Get action statistics
   * @param {Array} actions - Array of action decisions
   * @returns {Object} Action statistics
   */
  getActionStatistics(actions) {
    if (actions.length === 0) {
      return {};
    }

    const actionCounts = {};
    const confidenceSum = {};
    const methodCounts = {};

    for (const action of actions) {
      // Count actions
      actionCounts[action.action] = (actionCounts[action.action] || 0) + 1;
      
      // Sum confidences
      confidenceSum[action.action] = (confidenceSum[action.action] || 0) + action.confidence;
      
      // Count methods
      methodCounts[action.method] = (methodCounts[action.method] || 0) + 1;
    }

    // Calculate averages
    const actionStats = {};
    for (const action in actionCounts) {
      actionStats[action] = {
        count: actionCounts[action],
        percentage: (actionCounts[action] / actions.length) * 100,
        avgConfidence: confidenceSum[action] / actionCounts[action]
      };
    }

    return {
      totalActions: actions.length,
      actionStats,
      methodCounts,
      mostUsedAction: Object.keys(actionCounts).reduce((a, b) => 
        actionCounts[a] > actionCounts[b] ? a : b
      )
    };
  }

  /**
   * Dispose of mapper resources
   */
  dispose() {
    // No resources to dispose
  }
}
