/**
 * TrainingMetrics - Represents performance data collected during training
 * Tracks win rate, game length, rewards, and other training statistics
 */

export class TrainingMetrics {
  constructor(data = {}) {
    this.winRate = data.winRate || 0;
    this.averageGameLength = data.averageGameLength || 0;
    this.rewardStats = data.rewardStats || { avg: 0, min: 0, max: 0, std: 0 };
    this.trainingTime = data.trainingTime || 0;
    this.gamesCompleted = data.gamesCompleted || 0;
    this.learningRate = data.learningRate || 0.001;
    this.explorationRate = data.explorationRate || 0.1;
    
    // Additional metrics
    this.totalReward = data.totalReward || 0;
    this.wins = data.wins || 0;
    this.losses = data.losses || 0;
    this.ties = data.ties || 0;
    this.rewardHistory = data.rewardHistory || [];
    this.gameLengthHistory = data.gameLengthHistory || [];
    this.startTime = data.startTime || Date.now();
    this.lastUpdate = data.lastUpdate || Date.now();
    
    this.validate();
  }

  /**
   * Validate the training metrics
   * @throws {Error} If validation fails
   */
  validate() {
    if (this.winRate < 0 || this.winRate > 1) {
      throw new Error(`Invalid win rate: ${this.winRate}. Must be in range [0, 1]`);
    }
    
    if (this.averageGameLength < 0) {
      throw new Error(`Invalid average game length: ${this.averageGameLength}. Must be non-negative`);
    }
    
    if (this.trainingTime < 0) {
      throw new Error(`Invalid training time: ${this.trainingTime}. Must be non-negative`);
    }
    
    if (this.gamesCompleted < 0) {
      throw new Error(`Invalid games completed: ${this.gamesCompleted}. Must be non-negative`);
    }
    
    if (this.learningRate <= 0) {
      throw new Error(`Invalid learning rate: ${this.learningRate}. Must be positive`);
    }
    
    if (this.explorationRate < 0 || this.explorationRate > 1) {
      throw new Error(`Invalid exploration rate: ${this.explorationRate}. Must be in range [0, 1]`);
    }
  }

  /**
   * Update metrics with a new game result
   * @param {Object} gameResult - Game result data
   */
  updateGameResult(gameResult) {
    const {
      won = false,
      gameLength = 0,
      reward = 0,
      isTie = false
    } = gameResult;
    
    // Update counters
    this.gamesCompleted++;
    if (won) {
      this.wins++;
    } else if (isTie) {
      this.ties++;
    } else {
      this.losses++;
    }
    
    // Update win rate
    this.winRate = this.wins / this.gamesCompleted;
    console.log('[TrainingMetrics] updateGameResult:', {
      won,
      isTie,
      gameLength,
      reward,
      wins: this.wins,
      losses: this.losses,
      ties: this.ties,
      gamesCompleted: this.gamesCompleted,
      winRateRaw: this.winRate,
      winRatePercent: this.winRate * 100
    });
    
    // Update game length
    this.gameLengthHistory.push(gameLength);
    this.averageGameLength = this.calculateAverage(this.gameLengthHistory);
    
    // Update rewards
    this.totalReward += reward;
    this.rewardHistory.push(reward);
    this.updateRewardStats();
    
    // Update training time
    this.trainingTime = (Date.now() - this.startTime) / 1000; // Convert to seconds
    this.lastUpdate = Date.now();
  }

  /**
   * Update reward statistics
   */
  updateRewardStats() {
    if (this.rewardHistory.length === 0) {
      this.rewardStats = { avg: 0, min: 0, max: 0, std: 0 };
      return;
    }
    
    const rewards = this.rewardHistory;
    const avg = this.calculateAverage(rewards);
    const min = Math.min(...rewards);
    const max = Math.max(...rewards);
    const std = this.calculateStandardDeviation(rewards, avg);
    
    this.rewardStats = { avg, min, max, std };
  }

  /**
   * Calculate average of an array
   * @param {Array} values - Array of values
   * @returns {number} Average value
   */
  calculateAverage(values) {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * Calculate standard deviation
   * @param {Array} values - Array of values
   * @param {number} mean - Mean value
   * @returns {number} Standard deviation
   */
  calculateStandardDeviation(values, mean) {
    if (values.length === 0) return 0;
    
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Get recent reward statistics (last N games)
   * @param {number} n - Number of recent games
   * @returns {Object} Recent reward stats
   */
  getRecentRewardStats(n = 100) {
    const recentRewards = this.rewardHistory.slice(-n);
    if (recentRewards.length === 0) {
      return { avg: 0, min: 0, max: 0, std: 0 };
    }
    
    const avg = this.calculateAverage(recentRewards);
    const min = Math.min(...recentRewards);
    const max = Math.max(...recentRewards);
    const std = this.calculateStandardDeviation(recentRewards, avg);
    
    return { avg, min, max, std };
  }

  /**
   * Get training progress percentage
   * @param {number} targetGames - Target number of games
   * @returns {number} Progress percentage (0-100)
   */
  getProgressPercentage(targetGames = 1000) {
    return Math.min((this.gamesCompleted / targetGames) * 100, 100);
  }

  /**
   * Get training efficiency (rewards per hour)
   * @returns {number} Rewards per hour
   */
  getTrainingEfficiency() {
    if (this.trainingTime === 0) return 0;
    const hours = this.trainingTime / 3600;
    return this.totalReward / hours;
  }

  /**
   * Get games per hour
   * @returns {number} Games per hour
   */
  getGamesPerHour() {
    if (this.trainingTime === 0) return 0;
    const hours = this.trainingTime / 3600;
    return this.gamesCompleted / hours;
  }

  /**
   * Check if training is improving
   * @param {number} window - Window size for comparison
   * @returns {boolean} True if recent performance is better
   */
  isImproving(window = 50) {
    if (this.rewardHistory.length < window * 2) return false;
    
    const recent = this.rewardHistory.slice(-window);
    const previous = this.rewardHistory.slice(-window * 2, -window);
    
    const recentAvg = this.calculateAverage(recent);
    const previousAvg = this.calculateAverage(previous);
    
    return recentAvg > previousAvg;
  }

  /**
   * Get training summary
   * @returns {Object} Training summary
   */
  getSummary() {
    return {
      gamesCompleted: this.gamesCompleted,
      winRate: this.winRate,
      averageGameLength: this.averageGameLength,
      totalReward: this.totalReward,
      trainingTime: this.trainingTime,
      learningRate: this.learningRate,
      explorationRate: this.explorationRate,
      isImproving: this.isImproving(),
      efficiency: this.getTrainingEfficiency(),
      gamesPerHour: this.getGamesPerHour()
    };
  }

  /**
   * Reset metrics
   */
  reset() {
    this.winRate = 0;
    this.averageGameLength = 0;
    this.rewardStats = { avg: 0, min: 0, max: 0, std: 0 };
    this.trainingTime = 0;
    this.gamesCompleted = 0;
    this.totalReward = 0;
    this.wins = 0;
    this.losses = 0;
    this.ties = 0;
    this.rewardHistory = [];
    this.gameLengthHistory = [];
    this.startTime = Date.now();
    this.lastUpdate = Date.now();
  }

  /**
   * Get metrics as plain object (for serialization)
   * @returns {Object} Plain object representation
   */
  toObject() {
    return {
      winRate: this.winRate,
      averageGameLength: this.averageGameLength,
      rewardStats: { ...this.rewardStats },
      trainingTime: this.trainingTime,
      gamesCompleted: this.gamesCompleted,
      learningRate: this.learningRate,
      explorationRate: this.explorationRate,
      totalReward: this.totalReward,
      wins: this.wins,
      losses: this.losses,
      ties: this.ties,
      rewardHistory: [...this.rewardHistory],
      gameLengthHistory: [...this.gameLengthHistory],
      startTime: this.startTime,
      lastUpdate: this.lastUpdate
    };
  }

  /**
   * Create TrainingMetrics from plain object
   * @param {Object} data - Plain object data
   * @returns {TrainingMetrics} New TrainingMetrics instance
   */
  static fromObject(data) {
    return new TrainingMetrics(data);
  }

  /**
   * Clone the training metrics
   * @returns {TrainingMetrics} Cloned metrics
   */
  clone() {
    return new TrainingMetrics(this.toObject());
  }

  /**
   * Get string representation
   * @returns {string} String representation
   */
  toString() {
    return `TrainingMetrics(games=${this.gamesCompleted}, winRate=${this.winRate.toFixed(3)}, avgLength=${this.averageGameLength.toFixed(2)}s)`;
  }
}
