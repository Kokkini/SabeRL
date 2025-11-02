/**
 * RewardCalculator - Computes rewards for reinforcement learning training
 * Implements win/loss rewards with time-based penalties
 */

export class RewardCalculator {
  constructor(config = {}) {
    console.log('config: ', config);
    this.winReward = config.winReward ?? 1.0;
    this.lossReward = config.lossReward ?? -1.0;
    this.tieReward = config.tieReward ?? 0.0;
    this.timePenalty = config.timePenalty ?? -0.01; // Per second penalty
    this.maxGameLength = config.maxGameLength || 60; // Max game length in seconds
    this.timePenaltyThreshold = config.timePenaltyThreshold || 10; // Start penalty after N seconds
    console.log('timePenalty: ', this.timePenalty);
    
    this.validate();
  }

  /**
   * Validate reward calculator configuration
   * @throws {Error} If validation fails
   */
  validate() {
    if (this.maxGameLength <= 0) {
      throw new Error(`Invalid max game length: ${this.maxGameLength}. Must be positive`);
    }
    
    if (this.timePenaltyThreshold < 0) {
      throw new Error(`Invalid time penalty threshold: ${this.timePenaltyThreshold}. Must be non-negative`);
    }
  }

  /**
   * Calculate reward for a game outcome
   * @param {Object} gameResult - Game result data
   * @returns {Object} Reward calculation result
   */
  calculateReward(gameResult) {
    const {
      won = false,
      lost = false,
      isTie = false,
      gameLength = 0,
      additionalFactors = {}
    } = gameResult;
    
    let baseReward = 0;
    let timePenalty = 0;
    let totalReward = 0;
    
    // Calculate base reward
    if (won) {
      baseReward = this.winReward;
    } else if (lost) {
      baseReward = this.lossReward;
    } else if (isTie) {
      baseReward = this.tieReward;
    }
    
    // Calculate total reward
    totalReward = baseReward + timePenalty;
    
    // Apply additional factors
    totalReward = this.applyAdditionalFactors(totalReward, additionalFactors);
    
    return {
      baseReward,
      timePenalty,
      totalReward,
      gameLength,
      factors: {
        won,
        lost,
        isTie,
        gameLength,
        timePenaltyApplied: gameLength > this.timePenaltyThreshold
      }
    };
  }

  /**
   * Apply additional reward factors
   * @param {number} baseReward - Base reward value
   * @param {Object} factors - Additional factors
   * @returns {number} Modified reward
   */
  applyAdditionalFactors(baseReward, factors) {
    let modifiedReward = baseReward;
    
    // Efficiency bonus (quick wins)
    if (factors.quickWin && factors.gameLength < 5) {
      modifiedReward += 0.5;
    }
    
    // Survival bonus (long games)
    if (factors.survived && factors.gameLength > 30) {
      modifiedReward += 0.2;
    }
    
    // Saber hit bonus
    if (factors.saberHits) {
      modifiedReward += factors.saberHits * 0.1;
    }
    
    // Distance penalty (staying too far from opponent)
    if (factors.averageDistance && factors.averageDistance > 10) {
      modifiedReward -= 0.1;
    }
    
    // Movement efficiency bonus
    if (factors.movementEfficiency && factors.movementEfficiency > 0.8) {
      modifiedReward += 0.1;
    }
    
    return modifiedReward;
  }

  /**
   * Calculate reward for a training step
   * @param {Object} stepData - Step data
   * @returns {number} Step reward
   */
  calculateStepReward(stepData) {
    const {
      action,
      state,
      nextState,
      reward = 0,
      done = false,
      info = {}
    } = stepData;
    
    let stepReward = reward;
    
    // Add shaping rewards
    if (!done) {
      stepReward += this.calculateShapingReward(state, nextState, action);
    }
    
    return stepReward;
  }

  /**
   * Calculate shaping reward for intermediate steps
   * @param {Object} state - Current state
   * @param {Object} nextState - Next state
   * @param {string} action - Action taken
   * @returns {number} Shaping reward
   */
  calculateShapingReward(state, nextState, action) {
    let shapingReward = 0;
    
    // Distance-based shaping
    if (state.distanceToOpponent && nextState.distanceToOpponent) {
      const distanceChange = state.distanceToOpponent - nextState.distanceToOpponent;
      shapingReward += distanceChange * 0.01; // Reward getting closer
    }
    
    // Saber angle shaping
    if (state.playerSaberAngle && nextState.playerSaberAngle) {
      const angleChange = Math.abs(nextState.playerSaberAngle - state.playerSaberAngle);
      if (angleChange > 0.1) { // Significant angle change
        shapingReward += 0.05; // Small reward for active saber movement
      }
    }
    
    // Boundary penalty
    if (nextState.playerPosition) {
      const pos = nextState.playerPosition.dataSync();
      const arenaSize = 20;
      const margin = 2;
      
      if (pos[0] < margin || pos[0] > arenaSize - margin ||
          pos[1] < margin || pos[1] > arenaSize - margin) {
        shapingReward -= 0.1; // Penalty for being near boundaries
      }
    }
    
    return shapingReward;
  }

  /**
   * Calculate reward for a complete episode
   * @param {Array} episode - Array of step data
   * @returns {Object} Episode reward summary
   */
  calculateEpisodeReward(episode) {
    let totalReward = 0;
    let stepRewards = [];
    
    for (const step of episode) {
      const stepReward = this.calculateStepReward(step);
      stepRewards.push(stepReward);
      totalReward += stepReward;
    }
    
    return {
      totalReward,
      stepRewards,
      averageStepReward: totalReward / episode.length,
      maxStepReward: Math.max(...stepRewards),
      minStepReward: Math.min(...stepRewards)
    };
  }

  /**
   * Calculate discounted reward (for value function)
   * @param {Array} rewards - Array of rewards
   * @param {number} discountFactor - Discount factor (0-1)
   * @returns {Array} Discounted rewards
   */
  calculateDiscountedRewards(rewards, discountFactor = 0.99) {
    const discounted = [];
    let runningTotal = 0;
    
    // Calculate from end to beginning
    for (let i = rewards.length - 1; i >= 0; i--) {
      runningTotal = rewards[i] + discountFactor * runningTotal;
      discounted.unshift(runningTotal);
    }
    
    return discounted;
  }

  /**
   * Calculate advantage (for PPO)
   * @param {Array} rewards - Array of rewards
   * @param {Array} values - Array of value estimates
   * @param {number} discountFactor - Discount factor
   * @param {number} lambda - GAE lambda parameter
   * @returns {Array} Advantage values
   */
  calculateAdvantage(rewards, values, discountFactor = 0.99, lambda = 0.95) {
    const advantages = [];
    const discountedRewards = this.calculateDiscountedRewards(rewards, discountFactor);
    
    for (let i = 0; i < rewards.length; i++) {
      const advantage = discountedRewards[i] - values[i];
      advantages.push(advantage);
    }
    
    return advantages;
  }

  /**
   * Normalize rewards
   * @param {Array} rewards - Array of rewards
   * @returns {Array} Normalized rewards
   */
  normalizeRewards(rewards) {
    if (rewards.length === 0) return rewards;
    
    const mean = rewards.reduce((sum, r) => sum + r, 0) / rewards.length;
    const variance = rewards.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / rewards.length;
    const std = Math.sqrt(variance);
    
    if (std === 0) return rewards.map(() => 0);
    
    return rewards.map(r => (r - mean) / std);
  }

  /**
   * Get reward statistics
   * @param {Array} rewards - Array of rewards
   * @returns {Object} Reward statistics
   */
  getRewardStatistics(rewards) {
    if (rewards.length === 0) {
      return { mean: 0, std: 0, min: 0, max: 0, sum: 0 };
    }
    
    const sum = rewards.reduce((s, r) => s + r, 0);
    const mean = sum / rewards.length;
    const variance = rewards.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / rewards.length;
    const std = Math.sqrt(variance);
    const min = Math.min(...rewards);
    const max = Math.max(...rewards);
    
    return { mean, std, min, max, sum };
  }

  /**
   * Update configuration
   * @param {Object} newConfig - New configuration
   */
  updateConfig(newConfig) {
    Object.assign(this, newConfig);
    this.validate();
  }

  /**
   * Get current configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    return {
      winReward: this.winReward,
      lossReward: this.lossReward,
      tieReward: this.tieReward,
      timePenalty: this.timePenalty,
      maxGameLength: this.maxGameLength,
      timePenaltyThreshold: this.timePenaltyThreshold
    };
  }

  /**
   * Create reward calculator from configuration
   * @param {Object} config - Configuration object
   * @returns {RewardCalculator} New reward calculator
   */
  static fromConfig(config) {
    return new RewardCalculator(config);
  }

  /**
   * Get string representation
   * @returns {string} String representation
   */
  toString() {
    return `RewardCalculator(win=${this.winReward}, loss=${this.lossReward}, timePenalty=${this.timePenalty})`;
  }
}
