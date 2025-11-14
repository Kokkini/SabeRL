/**
 * GameLoop - Manages the main game loop and frame timing
 * Handles game updates, rendering, and performance monitoring
 */

import { GameConfig } from '../config/config.js';
import { Renderer } from './Renderer.js';
import { HumanController } from './controllers/HumanController.js';
import { RandomController } from './controllers/RandomController.js';
import { DemonstrationCollector } from '../MimicRL/bc/DemonstrationCollector.js';

export class GameLoop {
  /**
   * Create a new GameLoop
   * @param {Object} game - Game instance to run
   */
  constructor(core, controller, renderer = null) {
    this.core = core;
    this.controller = controller;  // Controller for player 0
    // Default to RandomController for player 1 if not provided
    // Initialize with actionSpaces if available, otherwise will get them on first use
    const actionSpaces = (core && typeof core.getActionSpaces === 'function') 
      ? core.getActionSpaces() 
      : null;
    this.opponentController = new RandomController(actionSpaces);
    this.renderer = renderer instanceof Renderer ? renderer : null;
    this.lastState = null;  // Store full GameState
    this.playerActionInterval = (GameConfig?.rl?.rollout?.actionIntervalSeconds ?? 0.2);
    this.playerDecisionTimer = this.playerActionInterval; // allow immediate first decision
    this.opponentDecisionTimer = this.playerActionInterval; // allow immediate first decision
    this._lastAction = null;  // Store last action (number array)
    this._lastOpponentAction = null;  // Will be set on first decision
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
    this.onGameEnd = null;
    
    // Behavior Cloning: Demonstration collector
    this.demonstrationCollector = new DemonstrationCollector({
      autoRecord: false  // User must explicitly enable
    });
    this.isRecordingDemonstration = false;
    this.onDemonstrationComplete = null;  // Callback when episode ends and recording is active
    
    // BC recording state: track when to record (respect action intervals)
    this.lastRecordedAction = null;  // Last action that was recorded
    this.lastRecordedTime = 0;      // Timestamp of last recording
    this.bcActionInterval = this.playerActionInterval;  // Use same interval as action decisions
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
    
    // If recording is active, start a new episode
    if (this.isRecordingDemonstration) {
      const episodeId = `episode_${Date.now()}`;
      this.demonstrationCollector.startEpisode(episodeId, {
        playerIndex: 0
      });
    }
    
    // Start the loop
    this.loop();
  }

  setInitialObservation(observation) {
    // Legacy method - now we use lastState
    if (observation) {
      this.lastState = {
        observations: [observation, observation], // Assume same for both players
        rewards: [0, 0],
        done: false,
        outcome: null
      };
    }
    // ensure first frame decides immediately after reset
    this.playerDecisionTimer = this.playerActionInterval;
  }

  /**
   * Enable demonstration recording for current episode
   * @param {string} episodeId - Unique identifier for this episode
   */
  startDemonstrationRecording(episodeId) {
    this.isRecordingDemonstration = true;
    this.lastRecordedAction = null;  // Reset tracking
    this.lastRecordedTime = 0;       // Reset tracking
    this.demonstrationCollector.startEpisode(episodeId, {
      playerIndex: 0  // Assuming player 0 is the human/expert
    });
  }

  /**
   * Disable demonstration recording
   */
  stopDemonstrationRecording() {
    this.isRecordingDemonstration = false;
  }

  /**
   * Check if currently recording demonstrations
   */
  getRecordingDemonstration() {
    return this.isRecordingDemonstration;
  }

  /**
   * Helper method to compare two arrays for equality
   * @param {Array} a - First array
   * @param {Array} b - Second array
   * @returns {boolean} True if arrays are equal
   */
  arraysEqual(a, b) {
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
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
    
    // Clear key states in HumanController to prevent stuck keys
    if (this.controller && typeof this.controller.clearKeyStates === 'function') {
      this.controller.clearKeyStates();
    }
    
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
      // Initialize state if needed
      if (!this.lastState) {
        this.lastState = this.core.reset();
        
        // If recording is active, start a new episode
        if (this.isRecordingDemonstration) {
          const episodeId = `episode_${Date.now()}`;
          this.demonstrationCollector.startEpisode(episodeId, {
            playerIndex: 0
          });
        }
      }
      
      // Throttle player decisions by actionIntervalSeconds (only for non-human controllers)
      const isHuman = this.controller instanceof HumanController;
      let action;
      if (isHuman) {
        // Human controller: no throttling, get fresh decision every frame
        const normalizedObs = this.lastState.observations[0];
        action = this.controller.decide(normalizedObs) || this._lastAction || new Array(this.core.getActionSize()).fill(0);
        this._lastAction = action;
      } else {
        // Policy controller: throttle decisions
        this.playerDecisionTimer += deltaTime;
        if (this.playerDecisionTimer >= this.playerActionInterval) {
          const normalizedObs = this.lastState.observations[0];
          this._lastAction = this.controller.decide(normalizedObs) || this._lastAction || new Array(this.core.getActionSize()).fill(0);
          this.playerDecisionTimer = 0;
        }
        action = this._lastAction;
      }
      
      // Create actions array for all players
      // Player 1 uses opponent controller (defaults to RandomController)
      let opponentAction = new Array(this.core.getActionSize()).fill(0);
      if (this.opponentController && this.lastState && this.lastState.observations && this.lastState.observations[1]) {
        // Throttle opponent decisions
        this.opponentDecisionTimer += deltaTime;
        if (this.opponentDecisionTimer >= this.playerActionInterval || !this._lastOpponentAction) {
          // Make a new decision if timer elapsed or if this is the first decision
          const opponentObs = this.lastState.observations[1];
          const newAction = this.opponentController.decide(opponentObs);
          if (newAction && Array.isArray(newAction) && newAction.length === this.core.getActionSize()) {
            this._lastOpponentAction = newAction;
            opponentAction = newAction;
          } else {
            // Fallback: generate random action if controller didn't return valid action
            console.warn('Opponent controller returned invalid action, using random fallback');
            for (let i = 0; i < this.core.getActionSize(); i++) {
              opponentAction[i] = Math.random() < 0.5 ? 1 : 0;
            }
            this._lastOpponentAction = opponentAction;
          }
          this.opponentDecisionTimer = 0;
        } else {
          // Use last action
          if (this._lastOpponentAction && Array.isArray(this._lastOpponentAction) && this._lastOpponentAction.length === this.core.getActionSize()) {
            opponentAction = this._lastOpponentAction;
          }
        }
      } else if (this.opponentController) {
        // If lastState not ready yet, still try to get an action (fallback to random)
        const fallbackAction = this.opponentController.decide(new Array(this.core.getObservationSize()).fill(0));
        if (fallbackAction && Array.isArray(fallbackAction) && fallbackAction.length === this.core.getActionSize()) {
          opponentAction = fallbackAction;
          this._lastOpponentAction = fallbackAction;
        }
      }
      
      const actions = [
        action,  // Player 0 action
        opponentAction  // Player 1 action
      ];
      
      const result = this.core.step(actions, deltaTime);
      this.lastState = result || this.lastState;
      
      // Record demonstration step if recording (respect action intervals like RL training)
      if (this.isRecordingDemonstration && this.lastState && action) {
        // Check if we should record:
        // 1. Action changed from last recorded action
        // 2. Enough time has passed since last recording (action interval)
        const actionChanged = !this.lastRecordedAction || 
          !this.arraysEqual(action, this.lastRecordedAction);
        const currentTime = Date.now();
        const timeSinceLastRecord = (currentTime - this.lastRecordedTime) / 1000;
        const shouldRecord = actionChanged || 
          (timeSinceLastRecord >= this.bcActionInterval);
        
        if (shouldRecord) {
          const observation = this.lastState.observations[0];  // Player 0's observation
          this.demonstrationCollector.recordStep(observation, action);
          // Update tracking state
          this.lastRecordedAction = [...action];  // Copy action array
          this.lastRecordedTime = currentTime;
        }
      }
      
      if (result && result.done) {
        // End demonstration recording if active
        if (this.isRecordingDemonstration) {
          const episode = this.demonstrationCollector.endEpisode({
            outcome: result.outcome
          });
          
          // Trigger callback to ask user if they want to save
          if (this.onDemonstrationComplete && episode) {
            this.onDemonstrationComplete(episode);
          }
          
          // Don't stop recording here - let it continue for next episode
          // Recording only stops when user explicitly clicks "Stop Recording"
        }
        
        if (this.onGameEnd) {
          // Convert outcome array to legacy format for compatibility
          const legacyOutcome = result.outcome ? {
            isTie: result.outcome[0] === 'tie',
            winnerId: result.outcome[0] === 'win' ? 'player-1' : (result.outcome[0] === 'loss' ? 'ai-1' : null)
          } : null;
          this.onGameEnd(legacyOutcome);
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
