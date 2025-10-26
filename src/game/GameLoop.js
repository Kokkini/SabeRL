/**
 * GameLoop - Manages the main game loop and frame timing
 * Handles game updates, rendering, and performance monitoring
 */

import { GameConfig } from '../config/config.js';

export class GameLoop {
  /**
   * Create a new GameLoop
   * @param {Object} game - Game instance to run
   */
  constructor(game) {
    this.game = game;
    this._isRunning = false;
    this.lastTime = 0;
    this.accumulator = 0;
    this.frameTime = 1000 / GameConfig.rendering.targetFPS; // Target frame time in ms
    this.maxFrameTime = this.frameTime * 2; // Maximum frame time to prevent spiral of death
    
    // Performance monitoring
    this.frameCount = 0;
    this.lastFPSTime = 0;
    this.currentFPS = 0;
    this.averageFrameTime = 0;
    this.frameTimeHistory = [];
    this.maxFrameHistory = 60; // Keep last 60 frames for averaging
    
    // Animation frame ID for cancellation
    this.animationFrameId = null;
    
    // Game loop callbacks
    this.onUpdate = null;
    this.onRender = null;
    this.onError = null;
  }

  /**
   * Start the game loop
   */
  start() {
    if (this._isRunning) {
      console.warn('Game loop is already running');
      return;
    }
    
    console.log('Starting game loop...');
    this._isRunning = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    
    // Start the loop
    this.loop();
  }

  /**
   * Stop the game loop
   */
  stop() {
    if (!this._isRunning) {
      console.warn('Game loop is not running');
      return;
    }
    
    console.log('Stopping game loop...');
    this._isRunning = false;
    
    // Cancel animation frame if pending
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Main game loop
   */
  loop() {
    if (!this._isRunning) return;
    
    const currentTime = performance.now();
    let deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;
    
    // Prevent spiral of death by limiting delta time
    if (deltaTime > this.maxFrameTime) {
      deltaTime = this.maxFrameTime;
    }
    
    // Add delta time to accumulator
    this.accumulator += deltaTime;
    
    // Update game logic at fixed timestep
    while (this.accumulator >= this.frameTime) {
      try {
        this.update(this.frameTime / 1000); // Convert to seconds
        this.accumulator -= this.frameTime;
      } catch (error) {
        console.error('Error in game update:', error);
        if (this.onError) {
          this.onError(error);
        }
        this.stop();
        return;
      }
    }
    
    // Render the game
    try {
      this.render();
    } catch (error) {
      console.error('Error in game render:', error);
      if (this.onError) {
        this.onError(error);
      }
      this.stop();
      return;
    }
    
    // Update performance metrics
    this.updatePerformanceMetrics(deltaTime);
    
    // Schedule next frame
    this.animationFrameId = requestAnimationFrame(() => this.loop());
  }

  /**
   * Update game logic
   * @param {number} deltaTime - Time since last update in seconds
   */
  update(deltaTime) {
    // Update the game
    if (this.game) {
      this.game.update(deltaTime);
    }
    
    // Call custom update callback
    if (this.onUpdate) {
      this.onUpdate(deltaTime);
    }
  }

  /**
   * Render the game
   */
  render() {
    // Render the game
    if (this.game) {
      this.game.render();
    }
    
    // Call custom render callback
    if (this.onRender) {
      this.onRender();
    }
  }

  /**
   * Update performance metrics
   * @param {number} frameTime - Frame time in milliseconds
   */
  updatePerformanceMetrics(frameTime) {
    this.frameCount++;
    
    // Update frame time history
    this.frameTimeHistory.push(frameTime);
    if (this.frameTimeHistory.length > this.maxFrameHistory) {
      this.frameTimeHistory.shift();
    }
    
    // Calculate average frame time
    this.averageFrameTime = this.frameTimeHistory.reduce((sum, time) => sum + time, 0) / this.frameTimeHistory.length;
    
    // Update FPS counter
    const currentTime = performance.now();
    if (currentTime - this.lastFPSTime >= 1000) {
      this.currentFPS = this.frameCount;
      this.frameCount = 0;
      this.lastFPSTime = currentTime;
    }
  }

  /**
   * Get current FPS
   * @returns {number} Current FPS
   */
  getFPS() {
    return this.currentFPS;
  }

  /**
   * Get average frame time
   * @returns {number} Average frame time in milliseconds
   */
  getAverageFrameTime() {
    return this.averageFrameTime;
  }

  /**
   * Get target FPS
   * @returns {number} Target FPS
   */
  getTargetFPS() {
    return GameConfig.rendering.targetFPS;
  }

  /**
   * Set target FPS
   * @param {number} fps - New target FPS
   */
  setTargetFPS(fps) {
    if (fps <= 0) {
      throw new Error('Target FPS must be positive');
    }
    
    this.frameTime = 1000 / fps;
    this.maxFrameTime = this.frameTime * 2;
  }

  /**
   * Check if game loop is running
   * @returns {boolean} True if running
   */
  isRunning() {
    return this._isRunning;
  }

  /**
   * Set update callback
   * @param {Function} callback - Update callback function
   */
  setOnUpdate(callback) {
    this.onUpdate = callback;
  }

  /**
   * Set render callback
   * @param {Function} callback - Render callback function
   */
  setOnRender(callback) {
    this.onRender = callback;
  }

  /**
   * Set error callback
   * @param {Function} callback - Error callback function
   */
  setOnError(callback) {
    this.onError = callback;
  }

  /**
   * Get performance statistics
   * @returns {Object} Performance statistics
   */
  getPerformanceStats() {
    return {
      fps: this.currentFPS,
      targetFPS: this.getTargetFPS(),
      averageFrameTime: this.averageFrameTime,
      frameTime: this.frameTime,
      maxFrameTime: this.maxFrameTime,
      isRunning: this._isRunning
    };
  }

  /**
   * Reset performance metrics
   */
  resetPerformanceMetrics() {
    this.frameCount = 0;
    this.lastFPSTime = 0;
    this.currentFPS = 0;
    this.averageFrameTime = 0;
    this.frameTimeHistory = [];
  }

  /**
   * Get game loop state for serialization
   * @returns {Object} Game loop state
   */
  getState() {
    return {
      isRunning: this._isRunning,
      frameTime: this.frameTime,
      maxFrameTime: this.maxFrameTime,
      currentFPS: this.currentFPS,
      averageFrameTime: this.averageFrameTime
    };
  }

  /**
   * Set game loop state from serialization
   * @param {Object} state - Game loop state
   */
  setState(state) {
    this._isRunning = state.isRunning;
    this.frameTime = state.frameTime;
    this.maxFrameTime = state.maxFrameTime;
    this.currentFPS = state.currentFPS;
    this.averageFrameTime = state.averageFrameTime;
  }

  /**
   * Get string representation
   * @returns {string} String representation
   */
  toString() {
    return `GameLoop(running: ${this._isRunning}, fps: ${this.currentFPS}, target: ${this.getTargetFPS()})`;
  }
}
