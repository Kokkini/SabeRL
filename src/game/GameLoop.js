/**
 * GameLoop - Manages the main game loop and frame timing
 * Handles game updates, rendering, and performance monitoring
 */

import { GameConfig } from '../config/config.js';
import { Renderer } from './Renderer.js';
import { HumanController } from './controllers/HumanController.js';

export class GameLoop {
  /**
   * Create a new GameLoop
   * @param {Object} game - Game instance to run
   */
  constructor(core, controller, renderer = null) {
    this.core = core;
    this.controller = controller;
    this.renderer = renderer instanceof Renderer ? renderer : null;
    this.lastObservation = null;
    this.playerActionInterval = (GameConfig?.rl?.rollout?.actionIntervalSeconds ?? 0.2);
    this.playerDecisionTimer = this.playerActionInterval; // allow immediate first decision
    this._lastPlayerMask = [false, false, false, false];
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

  setInitialObservation(observation) {
    this.lastObservation = observation || null;
    // ensure first frame decides immediately after reset
    this.playerDecisionTimer = this.playerActionInterval;
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
    // Decide action, step core
    if (this.core && this.controller) {
      // Throttle player decisions by actionIntervalSeconds (only for non-human controllers)
      const isHuman = this.controller instanceof HumanController;
      let mask;
      if (isHuman) {
        // Human controller: no throttling, get fresh decision every frame
        mask = this.controller.decide(this.lastObservation, deltaTime) || this._lastPlayerMask;
        this._lastPlayerMask = mask;
      } else {
        // Policy controller: throttle decisions
        this.playerDecisionTimer += deltaTime;
        if (this.playerDecisionTimer >= this.playerActionInterval) {
          this._lastPlayerMask = this.controller.decide(this.lastObservation, deltaTime) || this._lastPlayerMask;
          this.playerDecisionTimer = 0;
        }
        mask = this._lastPlayerMask;
      }
      const result = this.core.step(mask, deltaTime);
      this.lastObservation = result ? result.observation : this.lastObservation;
      if (result && result.done) {
        if (this.onGameEnd) {
          this.onGameEnd(result.outcome);
        }
        this.stop();
        return;
      }
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
    // Render from core state
    if (this.renderer && this.core) {
      this.renderer.render(this.core);
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
