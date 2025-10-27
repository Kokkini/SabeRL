/**
 * MetricsTracker - Tracks and analyzes training metrics and performance
 * Provides comprehensive metrics collection, analysis, and reporting
 */

export class MetricsTracker {
  constructor(options = {}) {
    this.options = {
      windowSize: options.windowSize || 100,
      updateInterval: options.updateInterval || 1000, // ms
      ...options
    };

    // Core metrics
    this.metrics = {
      games: {
        total: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        winRate: 0,
        averageLength: 0,
        lengths: []
      },
      rewards: {
        total: 0,
        average: 0,
        min: 0,
        max: 0,
        history: [],
        recent: []
      },
      training: {
        episodes: 0,
        updates: 0,
        learningRate: 0,
        explorationRate: 0,
        policyLoss: 0,
        valueLoss: 0,
        entropy: 0
      },
      performance: {
        fps: 0,
        memoryUsage: 0,
        trainingTime: 0,
        inferenceTime: 0
      }
    };

    // Rolling windows for recent metrics
    this.rollingWindows = {
      rewards: [],
      gameLengths: [],
      losses: [],
      inferenceTimes: []
    };

    // Callbacks
    this.onMetricsUpdate = null;
    this.onPerformanceAlert = null;

    // Performance monitoring
    this.performanceThresholds = {
      minFPS: 30,
      maxMemoryUsage: 2 * 1024 * 1024 * 1024, // 2GB
      maxInferenceTime: 16 // ms
    };

    // Start performance monitoring
    this.startPerformanceMonitoring();
  }

  /**
   * Update game metrics
   * @param {Object} gameResult - Game result data
   */
  updateGameMetrics(gameResult) {
    this.metrics.games.total++;
    
    if (gameResult.winner === 'player') {
      this.metrics.games.wins++;
    } else if (gameResult.winner === 'ai') {
      this.metrics.games.losses++;
    } else {
      this.metrics.games.ties++;
    }

    // Update win rate
    this.metrics.games.winRate = this.metrics.games.wins / this.metrics.games.total;

    // Update game length
    if (gameResult.length) {
      this.metrics.games.lengths.push(gameResult.length);
      this.rollingWindows.gameLengths.push(gameResult.length);
      
      // Keep only recent game lengths
      if (this.rollingWindows.gameLengths.length > this.options.windowSize) {
        this.rollingWindows.gameLengths.shift();
      }
      
      this.metrics.games.averageLength = this.calculateAverage(this.rollingWindows.gameLengths);
    }

    this.notifyUpdate();
  }

  /**
   * Update reward metrics
   * @param {number} reward - Reward value
   */
  updateRewardMetrics(reward) {
    this.metrics.rewards.total += reward;
    this.metrics.rewards.history.push(reward);
    this.rollingWindows.rewards.push(reward);

    // Keep only recent rewards
    if (this.rollingWindows.rewards.length > this.options.windowSize) {
      this.rollingWindows.rewards.shift();
    }

    // Update reward statistics
    this.metrics.rewards.recent = [...this.rollingWindows.rewards];
    this.metrics.rewards.average = this.calculateAverage(this.rollingWindows.rewards);
    this.metrics.rewards.min = Math.min(...this.rollingWindows.rewards);
    this.metrics.rewards.max = Math.max(...this.rollingWindows.rewards);

    this.notifyUpdate();
  }

  /**
   * Update training metrics
   * @param {Object} trainingData - Training data
   */
  updateTrainingMetrics(trainingData) {
    this.metrics.training.episodes = trainingData.episodes || this.metrics.training.episodes;
    this.metrics.training.updates = trainingData.updates || this.metrics.training.updates;
    this.metrics.training.learningRate = trainingData.learningRate || this.metrics.training.learningRate;
    this.metrics.training.explorationRate = trainingData.explorationRate || this.metrics.training.explorationRate;
    this.metrics.training.policyLoss = trainingData.policyLoss || this.metrics.training.policyLoss;
    this.metrics.training.valueLoss = trainingData.valueLoss || this.metrics.training.valueLoss;
    this.metrics.training.entropy = trainingData.entropy || this.metrics.training.entropy;

    this.notifyUpdate();
  }

  /**
   * Update performance metrics
   * @param {Object} performanceData - Performance data
   */
  updatePerformanceMetrics(performanceData) {
    this.metrics.performance.fps = performanceData.fps || this.metrics.performance.fps;
    this.metrics.performance.memoryUsage = performanceData.memoryUsage || this.metrics.performance.memoryUsage;
    this.metrics.performance.trainingTime = performanceData.trainingTime || this.metrics.performance.trainingTime;
    this.metrics.performance.inferenceTime = performanceData.inferenceTime || this.metrics.performance.inferenceTime;

    // Track inference times
    if (performanceData.inferenceTime) {
      this.rollingWindows.inferenceTimes.push(performanceData.inferenceTime);
      if (this.rollingWindows.inferenceTimes.length > this.options.windowSize) {
        this.rollingWindows.inferenceTimes.shift();
      }
    }

    // Check performance thresholds
    this.checkPerformanceThresholds();

    this.notifyUpdate();
  }

  /**
   * Start performance monitoring
   */
  startPerformanceMonitoring() {
    setInterval(() => {
      this.updatePerformanceMetrics({
        fps: this.calculateFPS(),
        memoryUsage: this.getMemoryUsage()
      });
    }, this.options.updateInterval);
  }

  /**
   * Calculate current FPS
   * @returns {number} Current FPS
   */
  calculateFPS() {
    // Simple FPS calculation - in a real implementation, this would be more sophisticated
    return 60; // Placeholder
  }

  /**
   * Get current memory usage
   * @returns {number} Memory usage in bytes
   */
  getMemoryUsage() {
    if (performance.memory) {
      return performance.memory.usedJSHeapSize;
    }
    return 0;
  }

  /**
   * Check performance thresholds and alert if needed
   */
  checkPerformanceThresholds() {
    const alerts = [];

    if (this.metrics.performance.fps < this.performanceThresholds.minFPS) {
      alerts.push({
        type: 'low_fps',
        message: `Low FPS detected: ${this.metrics.performance.fps}`,
        severity: 'warning'
      });
    }

    if (this.metrics.performance.memoryUsage > this.performanceThresholds.maxMemoryUsage) {
      alerts.push({
        type: 'high_memory',
        message: `High memory usage: ${this.formatBytes(this.metrics.performance.memoryUsage)}`,
        severity: 'error'
      });
    }

    const avgInferenceTime = this.calculateAverage(this.rollingWindows.inferenceTimes);
    if (avgInferenceTime > this.performanceThresholds.maxInferenceTime) {
      alerts.push({
        type: 'slow_inference',
        message: `Slow inference: ${avgInferenceTime.toFixed(2)}ms`,
        severity: 'warning'
      });
    }

    if (alerts.length > 0 && this.onPerformanceAlert) {
      this.onPerformanceAlert(alerts);
    }
  }

  /**
   * Calculate average of array
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
   * @returns {number} Standard deviation
   */
  calculateStandardDeviation(values) {
    if (values.length === 0) return 0;
    const avg = this.calculateAverage(values);
    const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Get comprehensive metrics report
   * @returns {Object} Complete metrics report
   */
  getMetricsReport() {
    return {
      ...this.metrics,
      statistics: {
        rewardStdDev: this.calculateStandardDeviation(this.rollingWindows.rewards),
        gameLengthStdDev: this.calculateStandardDeviation(this.rollingWindows.gameLengths),
        inferenceTimeStdDev: this.calculateStandardDeviation(this.rollingWindows.inferenceTimes)
      },
      trends: this.calculateTrends(),
      performance: this.getPerformanceScore()
    };
  }

  /**
   * Calculate trends for recent metrics
   * @returns {Object} Trend data
   */
  calculateTrends() {
    const recentRewards = this.rollingWindows.rewards.slice(-20);
    const recentLengths = this.rollingWindows.gameLengths.slice(-20);

    return {
      rewardTrend: this.calculateTrend(recentRewards),
      gameLengthTrend: this.calculateTrend(recentLengths),
      winRateTrend: this.calculateWinRateTrend()
    };
  }

  /**
   * Calculate trend for a series of values
   * @param {Array} values - Array of values
   * @returns {string} Trend direction ('up', 'down', 'stable')
   */
  calculateTrend(values) {
    if (values.length < 2) return 'stable';
    
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    
    const firstAvg = this.calculateAverage(firstHalf);
    const secondAvg = this.calculateAverage(secondHalf);
    
    const change = (secondAvg - firstAvg) / firstAvg;
    
    if (change > 0.1) return 'up';
    if (change < -0.1) return 'down';
    return 'stable';
  }

  /**
   * Calculate win rate trend
   * @returns {string} Win rate trend
   */
  calculateWinRateTrend() {
    const recentGames = Math.min(50, this.metrics.games.total);
    if (recentGames < 10) return 'stable';
    
    const recentWins = this.metrics.games.wins - Math.max(0, this.metrics.games.wins - recentGames);
    const recentWinRate = recentWins / recentGames;
    
    if (recentWinRate > this.metrics.games.winRate + 0.1) return 'up';
    if (recentWinRate < this.metrics.games.winRate - 0.1) return 'down';
    return 'stable';
  }

  /**
   * Get performance score (0-100)
   * @returns {number} Performance score
   */
  getPerformanceScore() {
    let score = 100;
    
    // FPS score
    if (this.metrics.performance.fps < 60) {
      score -= (60 - this.metrics.performance.fps) * 2;
    }
    
    // Memory score
    const memoryUsagePercent = this.metrics.performance.memoryUsage / this.performanceThresholds.maxMemoryUsage;
    if (memoryUsagePercent > 0.8) {
      score -= (memoryUsagePercent - 0.8) * 100;
    }
    
    // Inference time score
    const avgInferenceTime = this.calculateAverage(this.rollingWindows.inferenceTimes);
    if (avgInferenceTime > 8) {
      score -= (avgInferenceTime - 8) * 5;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Format bytes to human readable string
   * @param {number} bytes - Bytes to format
   * @returns {string} Formatted string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics = {
      games: { total: 0, wins: 0, losses: 0, ties: 0, winRate: 0, averageLength: 0, lengths: [] },
      rewards: { total: 0, average: 0, min: 0, max: 0, history: [], recent: [] },
      training: { episodes: 0, updates: 0, learningRate: 0, explorationRate: 0, policyLoss: 0, valueLoss: 0, entropy: 0 },
      performance: { fps: 0, memoryUsage: 0, trainingTime: 0, inferenceTime: 0 }
    };
    
    this.rollingWindows = {
      rewards: [],
      gameLengths: [],
      losses: [],
      inferenceTimes: []
    };
  }

  /**
   * Notify metrics update
   */
  notifyUpdate() {
    if (this.onMetricsUpdate) {
      this.onMetricsUpdate(this.getMetricsReport());
    }
  }

  /**
   * Set metrics update callback
   * @param {Function} callback - Callback function
   */
  setOnMetricsUpdate(callback) {
    this.onMetricsUpdate = callback;
  }

  /**
   * Set performance alert callback
   * @param {Function} callback - Callback function
   */
  setOnPerformanceAlert(callback) {
    this.onPerformanceAlert = callback;
  }

  /**
   * Dispose of metrics tracker
   */
  dispose() {
    // Stop performance monitoring
    if (this.performanceInterval) {
      clearInterval(this.performanceInterval);
    }
    
    this.onMetricsUpdate = null;
    this.onPerformanceAlert = null;
  }
}
