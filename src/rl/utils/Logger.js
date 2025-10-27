/**
 * Logger - Comprehensive logging system for debugging and monitoring
 * Provides structured logging with different levels and output formats
 */

export class Logger {
  constructor(options = {}) {
    this.options = {
      level: options.level || 'info',
      enableConsole: options.enableConsole !== false,
      enableStorage: options.enableStorage || false,
      maxStorageEntries: options.maxStorageEntries || 1000,
      enableTimestamps: options.enableTimestamps !== false,
      enableColors: options.enableColors !== false,
      ...options
    };

    // Log levels
    this.levels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3,
      TRACE: 4
    };

    // Level names
    this.levelNames = {
      0: 'ERROR',
      1: 'WARN',
      2: 'INFO',
      3: 'DEBUG',
      4: 'TRACE'
    };

    // Colors for console output
    this.colors = {
      ERROR: '#ff4444',
      WARN: '#ffaa00',
      INFO: '#44aaff',
      DEBUG: '#44ff44',
      TRACE: '#aaaaaa'
    };

    // Log storage
    this.logs = [];
    this.currentLevel = this.levels[this.options.level.toUpperCase()] || this.levels.INFO;

    // Performance tracking
    this.performance = {
      startTimes: new Map(),
      counters: new Map()
    };
  }

  /**
   * Set log level
   * @param {string} level - Log level
   */
  setLevel(level) {
    this.currentLevel = this.levels[level.toUpperCase()] || this.levels.INFO;
  }

  /**
   * Log error message
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   * @param {string} category - Log category
   */
  error(message, data = null, category = 'general') {
    this.log('ERROR', message, data, category);
  }

  /**
   * Log warning message
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   * @param {string} category - Log category
   */
  warn(message, data = null, category = 'general') {
    this.log('WARN', message, data, category);
  }

  /**
   * Log info message
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   * @param {string} category - Log category
   */
  info(message, data = null, category = 'general') {
    this.log('INFO', message, data, category);
  }

  /**
   * Log debug message
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   * @param {string} category - Log category
   */
  debug(message, data = null, category = 'general') {
    this.log('DEBUG', message, data, category);
  }

  /**
   * Log trace message
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   * @param {string} category - Log category
   */
  trace(message, data = null, category = 'general') {
    this.log('TRACE', message, data, category);
  }

  /**
   * Log message with specified level
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   * @param {string} category - Log category
   */
  log(level, message, data = null, category = 'general') {
    const levelNum = this.levels[level.toUpperCase()];
    
    if (levelNum > this.currentLevel) {
      return;
    }

    const logEntry = this.createLogEntry(level, message, data, category);
    
    // Console output
    if (this.options.enableConsole) {
      this.outputToConsole(logEntry);
    }

    // Storage
    if (this.options.enableStorage) {
      this.storeLog(logEntry);
    }
  }

  /**
   * Create log entry
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   * @param {string} category - Log category
   * @returns {Object} Log entry
   */
  createLogEntry(level, message, data, category) {
    const timestamp = this.options.enableTimestamps ? new Date().toISOString() : null;
    
    return {
      level: level.toUpperCase(),
      message,
      data,
      category,
      timestamp,
      id: this.generateLogId()
    };
  }

  /**
   * Output log to console
   * @param {Object} logEntry - Log entry
   */
  outputToConsole(logEntry) {
    const { level, message, data, category, timestamp } = logEntry;
    
    let logMessage = `[${level}]`;
    
    if (timestamp) {
      logMessage += ` ${timestamp}`;
    }
    
    if (category !== 'general') {
      logMessage += ` [${category}]`;
    }
    
    logMessage += ` ${message}`;
    
    // Choose console method based on level
    const consoleMethod = level === 'ERROR' ? 'error' :
                         level === 'WARN' ? 'warn' :
                         level === 'DEBUG' ? 'debug' :
                         'log';
    
    if (this.options.enableColors && console[consoleMethod]) {
      console[consoleMethod](
        `%c${logMessage}`,
        `color: ${this.colors[level]}`,
        data || ''
      );
    } else {
      console[consoleMethod](logMessage, data || '');
    }
  }

  /**
   * Store log entry
   * @param {Object} logEntry - Log entry
   */
  storeLog(logEntry) {
    this.logs.push(logEntry);
    
    // Limit storage size
    if (this.logs.length > this.options.maxStorageEntries) {
      this.logs.shift();
    }
  }

  /**
   * Start performance timer
   * @param {string} name - Timer name
   */
  startTimer(name) {
    this.performance.startTimes.set(name, performance.now());
  }

  /**
   * End performance timer and log duration
   * @param {string} name - Timer name
   * @param {string} message - Log message
   * @param {string} category - Log category
   */
  endTimer(name, message = null, category = 'performance') {
    const startTime = this.performance.startTimes.get(name);
    if (!startTime) {
      this.warn(`Timer '${name}' was not started`, null, 'performance');
      return;
    }
    
    const duration = performance.now() - startTime;
    this.performance.startTimes.delete(name);
    
    const logMessage = message || `Timer '${name}' completed`;
    this.info(`${logMessage} (${duration.toFixed(2)}ms)`, { duration }, category);
    
    return duration;
  }

  /**
   * Increment counter
   * @param {string} name - Counter name
   * @param {number} value - Increment value
   */
  incrementCounter(name, value = 1) {
    const current = this.performance.counters.get(name) || 0;
    this.performance.counters.set(name, current + value);
  }

  /**
   * Get counter value
   * @param {string} name - Counter name
   * @returns {number} Counter value
   */
  getCounter(name) {
    return this.performance.counters.get(name) || 0;
  }

  /**
   * Reset counter
   * @param {string} name - Counter name
   */
  resetCounter(name) {
    this.performance.counters.delete(name);
  }

  /**
   * Log performance metrics
   * @param {string} category - Log category
   */
  logPerformanceMetrics(category = 'performance') {
    const metrics = {
      counters: Object.fromEntries(this.performance.counters),
      activeTimers: this.performance.startTimes.size
    };
    
    this.info('Performance metrics', metrics, category);
  }

  /**
   * Get logs by level
   * @param {string} level - Log level
   * @returns {Array} Filtered logs
   */
  getLogsByLevel(level) {
    return this.logs.filter(log => log.level === level.toUpperCase());
  }

  /**
   * Get logs by category
   * @param {string} category - Log category
   * @returns {Array} Filtered logs
   */
  getLogsByCategory(category) {
    return this.logs.filter(log => log.category === category);
  }

  /**
   * Get recent logs
   * @param {number} count - Number of recent logs
   * @returns {Array} Recent logs
   */
  getRecentLogs(count = 100) {
    return this.logs.slice(-count);
  }

  /**
   * Clear all logs
   */
  clearLogs() {
    this.logs = [];
  }

  /**
   * Export logs
   * @param {Object} options - Export options
   * @returns {string} Exported logs
   */
  exportLogs(options = {}) {
    const {
      format = 'json',
      level = null,
      category = null,
      startTime = null,
      endTime = null
    } = options;

    let filteredLogs = this.logs;

    // Apply filters
    if (level) {
      filteredLogs = filteredLogs.filter(log => log.level === level.toUpperCase());
    }
    if (category) {
      filteredLogs = filteredLogs.filter(log => log.category === category);
    }
    if (startTime) {
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= startTime);
    }
    if (endTime) {
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= endTime);
    }

    if (format === 'json') {
      return JSON.stringify(filteredLogs, null, 2);
    } else if (format === 'csv') {
      return this.logsToCSV(filteredLogs);
    } else if (format === 'text') {
      return this.logsToText(filteredLogs);
    }

    return JSON.stringify(filteredLogs, null, 2);
  }

  /**
   * Convert logs to CSV format
   * @param {Array} logs - Log entries
   * @returns {string} CSV string
   */
  logsToCSV(logs) {
    const headers = ['timestamp', 'level', 'category', 'message', 'data'];
    const rows = logs.map(log => [
      log.timestamp || '',
      log.level,
      log.category,
      log.message,
      log.data ? JSON.stringify(log.data) : ''
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  /**
   * Convert logs to text format
   * @param {Array} logs - Log entries
   * @returns {string} Text string
   */
  logsToText(logs) {
    return logs.map(log => {
      let line = `[${log.level}]`;
      if (log.timestamp) line += ` ${log.timestamp}`;
      if (log.category !== 'general') line += ` [${log.category}]`;
      line += ` ${log.message}`;
      if (log.data) line += ` ${JSON.stringify(log.data)}`;
      return line;
    }).join('\n');
  }

  /**
   * Generate unique log ID
   * @returns {string} Log ID
   */
  generateLogId() {
    return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get logger statistics
   * @returns {Object} Logger statistics
   */
  getStatistics() {
    const levelCounts = {};
    const categoryCounts = {};
    
    for (const log of this.logs) {
      levelCounts[log.level] = (levelCounts[log.level] || 0) + 1;
      categoryCounts[log.category] = (categoryCounts[log.category] || 0) + 1;
    }
    
    return {
      totalLogs: this.logs.length,
      levelCounts,
      categoryCounts,
      activeTimers: this.performance.startTimes.size,
      counters: Object.fromEntries(this.performance.counters)
    };
  }

  /**
   * Dispose of logger
   */
  dispose() {
    this.clearLogs();
    this.performance.startTimes.clear();
    this.performance.counters.clear();
  }
}

// Create default logger instance
export const logger = new Logger({
  level: 'info',
  enableConsole: true,
  enableStorage: true,
  enableTimestamps: true,
  enableColors: true
});
