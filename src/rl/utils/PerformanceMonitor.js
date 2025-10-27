/**
 * PerformanceMonitor - Monitors system performance and implements graceful degradation
 * Tracks FPS, memory usage, training performance, and adjusts system behavior accordingly
 */

export class PerformanceMonitor {
  constructor(options = {}) {
    this.options = {
      targetFPS: options.targetFPS || 60,
      minFPS: options.minFPS || 30,
      maxMemoryUsage: options.maxMemoryUsage || 2 * 1024 * 1024 * 1024, // 2GB
      maxInferenceTime: options.maxInferenceTime || 16, // ms
      checkInterval: options.checkInterval || 1000, // ms
      adaptationThreshold: options.adaptationThreshold || 0.8, // 80% of target
      ...options
    };

    // Performance metrics
    this.metrics = {
      fps: 0,
      memoryUsage: 0,
      inferenceTime: 0,
      trainingTime: 0,
      frameTime: 0,
      lastFrameTime: 0
    };

    // Performance history for trend analysis
    this.history = {
      fps: [],
      memoryUsage: [],
      inferenceTime: [],
      trainingTime: []
    };

    // Performance levels
    this.levels = {
      EXCELLENT: 'excellent',
      GOOD: 'good',
      FAIR: 'fair',
      POOR: 'poor',
      CRITICAL: 'critical'
    };

    // Current performance level
    this.currentLevel = this.levels.GOOD;

    // Adaptation strategies
    this.adaptations = {
      reduceParallelGames: false,
      reduceDecisionFrequency: false,
      reduceChartUpdateRate: false,
      enableMemoryCleanup: false,
      reduceBatchSize: false
    };

    // Callbacks
    this.onPerformanceChange = null;
    this.onAdaptationApplied = null;

    // Monitoring state
    this.isMonitoring = false;
    this.monitoringInterval = null;
    this.frameCount = 0;
    this.lastCheckTime = 0;

    // Performance thresholds
    this.thresholds = {
      [this.levels.EXCELLENT]: { fps: 55, memoryUsage: 0.5, inferenceTime: 8 },
      [this.levels.GOOD]: { fps: 45, memoryUsage: 0.7, inferenceTime: 12 },
      [this.levels.FAIR]: { fps: 35, memoryUsage: 0.8, inferenceTime: 16 },
      [this.levels.POOR]: { fps: 25, memoryUsage: 0.9, inferenceTime: 24 },
      [this.levels.CRITICAL]: { fps: 15, memoryUsage: 0.95, inferenceTime: 32 }
    };
  }

  /**
   * Start performance monitoring
   */
  start() {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.lastCheckTime = performance.now();
    this.frameCount = 0;

    // Start frame rate monitoring
    this.startFrameRateMonitoring();

    // Start periodic checks
    this.monitoringInterval = setInterval(() => {
      this.performCheck();
    }, this.options.checkInterval);

    console.log('Performance monitoring started');
  }

  /**
   * Stop performance monitoring
   */
  stop() {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.stopFrameRateMonitoring();

    console.log('Performance monitoring stopped');
  }

  /**
   * Start frame rate monitoring
   */
  startFrameRateMonitoring() {
    const measureFrame = () => {
      if (!this.isMonitoring) {
        return;
      }

      const currentTime = performance.now();
      const deltaTime = currentTime - this.lastFrameTime;
      this.lastFrameTime = currentTime;

      this.frameCount++;
      this.metrics.frameTime = deltaTime;

      if (currentTime - this.lastCheckTime >= 1000) {
        this.metrics.fps = this.frameCount;
        this.frameCount = 0;
        this.lastCheckTime = currentTime;
      }

      requestAnimationFrame(measureFrame);
    };

    requestAnimationFrame(measureFrame);
  }

  /**
   * Stop frame rate monitoring
   */
  stopFrameRateMonitoring() {
    // Frame rate monitoring is handled by requestAnimationFrame
    // No explicit cleanup needed
  }

  /**
   * Perform performance check
   */
  performCheck() {
    this.updateMetrics();
    this.analyzePerformance();
    this.applyAdaptations();
  }

  /**
   * Update performance metrics
   */
  updateMetrics() {
    // Update memory usage
    if (performance.memory) {
      this.metrics.memoryUsage = performance.memory.usedJSHeapSize;
    }

    // Add to history
    this.addToHistory('fps', this.metrics.fps);
    this.addToHistory('memoryUsage', this.metrics.memoryUsage);
    this.addToHistory('inferenceTime', this.metrics.inferenceTime);
    this.addToHistory('trainingTime', this.metrics.trainingTime);
  }

  /**
   * Add metric to history
   * @param {string} metric - Metric name
   * @param {number} value - Metric value
   */
  addToHistory(metric, value) {
    if (!this.history[metric]) {
      this.history[metric] = [];
    }

    this.history[metric].push(value);

    // Keep only recent history
    if (this.history[metric].length > 100) {
      this.history[metric].shift();
    }
  }

  /**
   * Analyze current performance
   */
  analyzePerformance() {
    const newLevel = this.determinePerformanceLevel();
    
    if (newLevel !== this.currentLevel) {
      const oldLevel = this.currentLevel;
      this.currentLevel = newLevel;
      
      if (this.onPerformanceChange) {
        this.onPerformanceChange(newLevel, oldLevel, this.metrics);
      }
    }
  }

  /**
   * Determine current performance level
   * @returns {string} Performance level
   */
  determinePerformanceLevel() {
    const fps = this.getAverageMetric('fps', 10);
    const memoryUsage = this.getAverageMetric('memoryUsage', 10) / this.options.maxMemoryUsage;
    const inferenceTime = this.getAverageMetric('inferenceTime', 10);

    // Check each level from critical to excellent
    for (const level of Object.values(this.levels).reverse()) {
      const threshold = this.thresholds[level];
      
      if (fps >= threshold.fps && 
          memoryUsage <= threshold.memoryUsage && 
          inferenceTime <= threshold.inferenceTime) {
        return level;
      }
    }

    return this.levels.CRITICAL;
  }

  /**
   * Get average metric value
   * @param {string} metric - Metric name
   * @param {number} samples - Number of samples to average
   * @returns {number} Average value
   */
  getAverageMetric(metric, samples = 10) {
    const history = this.history[metric];
    if (!history || history.length === 0) {
      return 0;
    }

    const recent = history.slice(-samples);
    return recent.reduce((sum, val) => sum + val, 0) / recent.length;
  }

  /**
   * Apply performance adaptations
   */
  applyAdaptations() {
    const adaptations = this.calculateAdaptations();
    const appliedAdaptations = [];

    for (const [adaptation, shouldApply] of Object.entries(adaptations)) {
      if (shouldApply && !this.adaptations[adaptation]) {
        this.adaptations[adaptation] = true;
        appliedAdaptations.push(adaptation);
      } else if (!shouldApply && this.adaptations[adaptation]) {
        this.adaptations[adaptation] = false;
        appliedAdaptations.push(adaptation);
      }
    }

    if (appliedAdaptations.length > 0 && this.onAdaptationApplied) {
      this.onAdaptationApplied(appliedAdaptations, this.adaptations);
    }
  }

  /**
   * Calculate which adaptations to apply
   * @returns {Object} Adaptation recommendations
   */
  calculateAdaptations() {
    const adaptations = {};

    // Memory-based adaptations
    const memoryUsage = this.metrics.memoryUsage / this.options.maxMemoryUsage;
    adaptations.enableMemoryCleanup = memoryUsage > 0.8;
    adaptations.reduceBatchSize = memoryUsage > 0.7;

    // FPS-based adaptations
    const fps = this.getAverageMetric('fps', 10);
    adaptations.reduceParallelGames = fps < this.options.minFPS;
    adaptations.reduceDecisionFrequency = fps < this.options.minFPS * 1.2;
    adaptations.reduceChartUpdateRate = fps < this.options.minFPS * 1.5;

    return adaptations;
  }

  /**
   * Record inference time
   * @param {number} time - Inference time in milliseconds
   */
  recordInferenceTime(time) {
    this.metrics.inferenceTime = time;
  }

  /**
   * Record training time
   * @param {number} time - Training time in milliseconds
   */
  recordTrainingTime(time) {
    this.metrics.trainingTime = time;
  }

  /**
   * Get current performance level
   * @returns {string} Current performance level
   */
  getPerformanceLevel() {
    return this.currentLevel;
  }

  /**
   * Get current metrics
   * @returns {Object} Current performance metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Get performance history
   * @returns {Object} Performance history
   */
  getHistory() {
    return { ...this.history };
  }

  /**
   * Get active adaptations
   * @returns {Object} Active adaptations
   */
  getActiveAdaptations() {
    return { ...this.adaptations };
  }

  /**
   * Get performance report
   * @returns {Object} Comprehensive performance report
   */
  getPerformanceReport() {
    return {
      level: this.currentLevel,
      metrics: this.getMetrics(),
      adaptations: this.getActiveAdaptations(),
      trends: this.calculateTrends(),
      recommendations: this.getRecommendations()
    };
  }

  /**
   * Calculate performance trends
   * @returns {Object} Trend analysis
   */
  calculateTrends() {
    const trends = {};

    for (const metric in this.history) {
      const history = this.history[metric];
      if (history.length < 2) {
        trends[metric] = 'stable';
        continue;
      }

      const recent = history.slice(-10);
      const older = history.slice(-20, -10);

      if (recent.length === 0 || older.length === 0) {
        trends[metric] = 'stable';
        continue;
      }

      const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length;
      const olderAvg = older.reduce((sum, val) => sum + val, 0) / older.length;

      const change = (recentAvg - olderAvg) / olderAvg;

      if (change > 0.1) {
        trends[metric] = 'improving';
      } else if (change < -0.1) {
        trends[metric] = 'declining';
      } else {
        trends[metric] = 'stable';
      }
    }

    return trends;
  }

  /**
   * Get performance recommendations
   * @returns {Array} Array of recommendations
   */
  getRecommendations() {
    const recommendations = [];

    if (this.currentLevel === this.levels.CRITICAL) {
      recommendations.push('Consider reducing parallel training games');
      recommendations.push('Enable aggressive memory cleanup');
      recommendations.push('Reduce neural network complexity');
    } else if (this.currentLevel === this.levels.POOR) {
      recommendations.push('Monitor memory usage closely');
      recommendations.push('Consider reducing decision frequency');
    } else if (this.currentLevel === this.levels.FAIR) {
      recommendations.push('Performance is acceptable but could be improved');
    }

    return recommendations;
  }

  /**
   * Force garbage collection (if available)
   */
  forceGarbageCollection() {
    if (window.gc) {
      window.gc();
    }
  }

  /**
   * Set performance change callback
   * @param {Function} callback - Callback function
   */
  setOnPerformanceChange(callback) {
    this.onPerformanceChange = callback;
  }

  /**
   * Set adaptation applied callback
   * @param {Function} callback - Callback function
   */
  setOnAdaptationApplied(callback) {
    this.onAdaptationApplied = callback;
  }

  /**
   * Dispose of performance monitor
   */
  dispose() {
    this.stop();
    this.onPerformanceChange = null;
    this.onAdaptationApplied = null;
  }
}
