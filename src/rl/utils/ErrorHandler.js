/**
 * ErrorHandler - Centralized error handling and recovery system
 * Manages errors, implements recovery strategies, and provides user feedback
 */

export class ErrorHandler {
  constructor(options = {}) {
    this.options = {
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000, // ms
      logErrors: options.logErrors !== false,
      showUserAlerts: options.showUserAlerts !== false,
      ...options
    };

    // Error categories
    this.categories = {
      NETWORK: 'network',
      TRAINING: 'training',
      INFERENCE: 'inference',
      MEMORY: 'memory',
      VALIDATION: 'validation',
      SYSTEM: 'system'
    };

    // Error severity levels
    this.severity = {
      LOW: 'low',
      MEDIUM: 'medium',
      HIGH: 'high',
      CRITICAL: 'critical'
    };

    // Error recovery strategies
    this.recoveryStrategies = {
      [this.categories.NETWORK]: ['retry', 'fallback', 'offline'],
      [this.categories.TRAINING]: ['retry', 'reduce_batch_size', 'pause_training'],
      [this.categories.INFERENCE]: ['retry', 'fallback_model', 'disable_ai'],
      [this.categories.MEMORY]: ['cleanup', 'reduce_parallel', 'restart'],
      [this.categories.VALIDATION]: ['validate_input', 'use_defaults'],
      [this.categories.SYSTEM]: ['restart', 'fallback', 'shutdown']
    };

    // Error history
    this.errorHistory = [];
    this.maxHistorySize = 100;

    // Callbacks
    this.onError = null;
    this.onRecovery = null;
    this.onAlert = null;

    // Recovery state
    this.recoveryAttempts = new Map();
    this.isRecovering = false;
  }

  /**
   * Handle an error
   * @param {Error} error - Error object
   * @param {Object} context - Error context
   * @param {string} category - Error category
   * @param {string} severity - Error severity
   */
  handleError(error, context = {}, category = this.categories.SYSTEM, severity = this.severity.MEDIUM) {
    const errorInfo = {
      error,
      context,
      category,
      severity,
      timestamp: Date.now(),
      id: this.generateErrorId()
    };

    // Log error
    if (this.options.logErrors) {
      this.logError(errorInfo);
    }

    // Add to history
    this.addToHistory(errorInfo);

    // Notify callbacks
    if (this.onError) {
      this.onError(errorInfo);
    }

    // Attempt recovery
    this.attemptRecovery(errorInfo);

    // Show user alert if needed
    if (this.options.showUserAlerts && severity === this.severity.HIGH || severity === this.severity.CRITICAL) {
      this.showUserAlert(errorInfo);
    }

    return errorInfo;
  }

  /**
   * Attempt error recovery
   * @param {Object} errorInfo - Error information
   */
  async attemptRecovery(errorInfo) {
    if (this.isRecovering) {
      return;
    }

    this.isRecovering = true;

    try {
      const strategies = this.recoveryStrategies[errorInfo.category] || [];
      const attempts = this.recoveryAttempts.get(errorInfo.id) || 0;

      if (attempts >= this.options.maxRetries) {
        console.warn(`Max recovery attempts reached for error ${errorInfo.id}`);
        return;
      }

      for (const strategy of strategies) {
        try {
          const success = await this.executeRecoveryStrategy(strategy, errorInfo);
          if (success) {
            this.recoveryAttempts.set(errorInfo.id, attempts + 1);
            
            if (this.onRecovery) {
              this.onRecovery(strategy, errorInfo);
            }
            
            console.log(`Recovery successful using strategy: ${strategy}`);
            break;
          }
        } catch (recoveryError) {
          console.warn(`Recovery strategy ${strategy} failed:`, recoveryError);
        }
      }
    } finally {
      this.isRecovering = false;
    }
  }

  /**
   * Execute recovery strategy
   * @param {string} strategy - Recovery strategy
   * @param {Object} errorInfo - Error information
   * @returns {boolean} Success status
   */
  async executeRecoveryStrategy(strategy, errorInfo) {
    switch (strategy) {
      case 'retry':
        return await this.retryOperation(errorInfo);
      
      case 'fallback':
        return await this.fallbackOperation(errorInfo);
      
      case 'offline':
        return await this.enableOfflineMode(errorInfo);
      
      case 'reduce_batch_size':
        return await this.reduceBatchSize(errorInfo);
      
      case 'pause_training':
        return await this.pauseTraining(errorInfo);
      
      case 'fallback_model':
        return await this.useFallbackModel(errorInfo);
      
      case 'disable_ai':
        return await this.disableAI(errorInfo);
      
      case 'cleanup':
        return await this.cleanupMemory(errorInfo);
      
      case 'reduce_parallel':
        return await this.reduceParallelGames(errorInfo);
      
      case 'restart':
        return await this.restartSystem(errorInfo);
      
      case 'validate_input':
        return await this.validateInput(errorInfo);
      
      case 'use_defaults':
        return await this.useDefaults(errorInfo);
      
      case 'shutdown':
        return await this.shutdownSystem(errorInfo);
      
      default:
        console.warn(`Unknown recovery strategy: ${strategy}`);
        return false;
    }
  }

  /**
   * Retry operation
   * @param {Object} errorInfo - Error information
   * @returns {boolean} Success status
   */
  async retryOperation(errorInfo) {
    await this.delay(this.options.retryDelay);
    return true; // Placeholder - would retry the actual operation
  }

  /**
   * Fallback operation
   * @param {Object} errorInfo - Error information
   * @returns {boolean} Success status
   */
  async fallbackOperation(errorInfo) {
    // Implement fallback logic based on error context
    console.log('Executing fallback operation');
    return true;
  }

  /**
   * Enable offline mode
   * @param {Object} errorInfo - Error information
   * @returns {boolean} Success status
   */
  async enableOfflineMode(errorInfo) {
    console.log('Enabling offline mode');
    return true;
  }

  /**
   * Reduce batch size
   * @param {Object} errorInfo - Error information
   * @returns {boolean} Success status
   */
  async reduceBatchSize(errorInfo) {
    console.log('Reducing batch size');
    return true;
  }

  /**
   * Pause training
   * @param {Object} errorInfo - Error information
   * @returns {boolean} Success status
   */
  async pauseTraining(errorInfo) {
    console.log('Pausing training');
    return true;
  }

  /**
   * Use fallback model
   * @param {Object} errorInfo - Error information
   * @returns {boolean} Success status
   */
  async useFallbackModel(errorInfo) {
    console.log('Using fallback model');
    return true;
  }

  /**
   * Disable AI
   * @param {Object} errorInfo - Error information
   * @returns {boolean} Success status
   */
  async disableAI(errorInfo) {
    console.log('Disabling AI');
    return true;
  }

  /**
   * Cleanup memory
   * @param {Object} errorInfo - Error information
   * @returns {boolean} Success status
   */
  async cleanupMemory(errorInfo) {
    console.log('Cleaning up memory');
    if (window.gc) {
      window.gc();
    }
    return true;
  }

  /**
   * Reduce parallel games
   * @param {Object} errorInfo - Error information
   * @returns {boolean} Success status
   */
  async reduceParallelGames(errorInfo) {
    console.log('Reducing parallel games');
    return true;
  }

  /**
   * Restart system
   * @param {Object} errorInfo - Error information
   * @returns {boolean} Success status
   */
  async restartSystem(errorInfo) {
    console.log('Restarting system');
    return true;
  }

  /**
   * Validate input
   * @param {Object} errorInfo - Error information
   * @returns {boolean} Success status
   */
  async validateInput(errorInfo) {
    console.log('Validating input');
    return true;
  }

  /**
   * Use defaults
   * @param {Object} errorInfo - Error information
   * @returns {boolean} Success status
   */
  async useDefaults(errorInfo) {
    console.log('Using default values');
    return true;
  }

  /**
   * Shutdown system
   * @param {Object} errorInfo - Error information
   * @returns {boolean} Success status
   */
  async shutdownSystem(errorInfo) {
    console.log('Shutting down system');
    return true;
  }

  /**
   * Log error
   * @param {Object} errorInfo - Error information
   */
  logError(errorInfo) {
    const logMessage = `[${errorInfo.category.toUpperCase()}] ${errorInfo.error.message}`;
    console.error(logMessage, errorInfo);
  }

  /**
   * Add error to history
   * @param {Object} errorInfo - Error information
   */
  addToHistory(errorInfo) {
    this.errorHistory.push(errorInfo);
    
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }
  }

  /**
   * Show user alert
   * @param {Object} errorInfo - Error information
   */
  showUserAlert(errorInfo) {
    const message = this.formatErrorMessage(errorInfo);
    
    if (this.onAlert) {
      this.onAlert(message, errorInfo.severity);
    } else {
      // Default browser alert
      alert(message);
    }
  }

  /**
   * Format error message for user
   * @param {Object} errorInfo - Error information
   * @returns {string} Formatted message
   */
  formatErrorMessage(errorInfo) {
    const severityMessages = {
      [this.severity.LOW]: 'Minor issue detected',
      [this.severity.MEDIUM]: 'An error occurred',
      [this.severity.HIGH]: 'A serious error occurred',
      [this.severity.CRITICAL]: 'Critical error detected'
    };

    const categoryMessages = {
      [this.categories.NETWORK]: 'Network connectivity issue',
      [this.categories.TRAINING]: 'Training process error',
      [this.categories.INFERENCE]: 'AI inference error',
      [this.categories.MEMORY]: 'Memory management issue',
      [this.categories.VALIDATION]: 'Data validation error',
      [this.categories.SYSTEM]: 'System error'
    };

    const severityMessage = severityMessages[errorInfo.severity] || 'An error occurred';
    const categoryMessage = categoryMessages[errorInfo.category] || 'Unknown error';
    
    return `${severityMessage}: ${categoryMessage}. ${errorInfo.error.message}`;
  }

  /**
   * Generate unique error ID
   * @returns {string} Error ID
   */
  generateErrorId() {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Delay execution
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} Promise that resolves after delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get error statistics
   * @returns {Object} Error statistics
   */
  getErrorStatistics() {
    const stats = {
      total: this.errorHistory.length,
      byCategory: {},
      bySeverity: {},
      recent: this.errorHistory.slice(-10)
    };

    for (const error of this.errorHistory) {
      stats.byCategory[error.category] = (stats.byCategory[error.category] || 0) + 1;
      stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;
    }

    return stats;
  }

  /**
   * Clear error history
   */
  clearHistory() {
    this.errorHistory = [];
    this.recoveryAttempts.clear();
  }

  /**
   * Set error callback
   * @param {Function} callback - Callback function
   */
  setOnError(callback) {
    this.onError = callback;
  }

  /**
   * Set recovery callback
   * @param {Function} callback - Callback function
   */
  setOnRecovery(callback) {
    this.onRecovery = callback;
  }

  /**
   * Set alert callback
   * @param {Function} callback - Callback function
   */
  setOnAlert(callback) {
    this.onAlert = callback;
  }

  /**
   * Dispose of error handler
   */
  dispose() {
    this.clearHistory();
    this.onError = null;
    this.onRecovery = null;
    this.onAlert = null;
  }
}
