/**
 * Main entry point for SabeRL Arena game
 * Initializes the game and handles browser compatibility
 */

// TensorFlow.js is loaded from CDN as a global 'tf' object
import { GameConfig, validateConfig } from './config/config.js';
import { SaberGameCore } from './game/SaberGameCore.js';
import { GameLoop } from './game/GameLoop.js';
import { Renderer } from './game/Renderer.js';
import { HumanController } from './game/controllers/HumanController.js';
import { PolicyController } from './rl/controllers/PolicyController.js';
import { PolicyAgent } from './rl/agents/PolicyAgent.js';
import { TrainingSession } from './rl/training/TrainingSession.js';
import { TrainingUI } from './rl/visualization/TrainingUI.js';
import { OpponentPolicyManager } from './rl/utils/OpponentPolicyManager.js';
import { RandomController } from './game/controllers/RandomController.js';

/**
 * Main game class that manages the entire application
 */
class SabeRLArena {
  constructor() {
    this.core = null;
    this.gameLoop = null;
    this.canvas = null;
    this.context = null;
    this.isInitialized = false;
    this.scores = {
      player: 0,
      ai: 0
    };
    
    // AI Control state
    this.isAIControlEnabled = false;
    this.policyAgent = null;
    this.aiControlToggle = null;
    this.controlStatusElement = null;
    this.controller = null;
    
    // Training state
    this.trainingSession = null;
    this.trainingUI = null;

    // Opponent configuration
    this.opponentManager = null;
    this.opponentController = null;  // Opponent controller for GameLoop
  }

  /**
   * Initialize the game
   */
  async init() {
    try {
      console.log('Initializing SabeRL Arena...');
      
      // Initialize TensorFlow.js
      await tf.ready();
      console.log('TensorFlow.js initialized');
      
      // Check browser compatibility
      if (!this.checkBrowserCompatibility()) {
        this.showCompatibilityError();
        return false;
      }

      // Validate configuration
      if (!validateConfig()) {
        console.error('Configuration validation failed');
        return false;
      }

      // Get canvas element
      this.canvas = document.getElementById('game-canvas');
      if (!this.canvas) {
        console.error('Canvas element not found');
        return false;
      }

      // Get 2D context
      this.context = this.canvas.getContext('2d');
      if (!this.context) {
        console.error('2D context not available');
        return false;
      }

      // Set up canvas
      this.setupCanvas();

      // Initialize core, renderer, controller, and game loop
      this.core = new SaberGameCore();
      const renderer = new Renderer(this.canvas);
      this.controller = new HumanController();
      this.gameLoop = new GameLoop(this.core, this.controller, renderer);
      this.gameLoop.onGameEnd = (outcome) => {
        if (!outcome) return;
        if (outcome.isTie) {
          // no score change on tie
        } else if (outcome.winnerId === 'player-1') {
          this.scores.player++;
        } else if (outcome.winnerId === 'ai-1') {
          this.scores.ai++;
        }
        this.updateScoreboard();
        const startButton = document.getElementById('start-game-button');
        if (startButton) startButton.style.display = 'block';
        const statusElement = document.getElementById('game-status');
        if (statusElement) statusElement.textContent = 'Game Over';
      };
      
      // Set up event listeners
      this.setupEventListeners();

      // Set up UI
      this.setupUI();

      // Initialize AI control
      this.initializeAIControl();

      // Initialize training system
      this.initializeTraining();

      // Initialize opponent manager
      this.opponentManager = new OpponentPolicyManager(this.core);

      // Initialize scoreboard
      this.updateScoreboard();

      this.isInitialized = true;
      console.log('SabeRL Arena initialized successfully');
      
      // Show start screen
      this.showStartScreen();
      
      return true;
    } catch (error) {
      console.error('Failed to initialize game:', error);
      this.showError('Failed to initialize game: ' + error.message);
      return false;
    }
  }

  /**
   * Check browser compatibility
   * @returns {boolean} True if browser is compatible
   */
  checkBrowserCompatibility() {
    const requiredFeatures = GameConfig.compatibility.requiredFeatures;
    
    // Check Canvas support
    if (!document.createElement('canvas').getContext) {
      console.error('Canvas not supported');
      return false;
    }

    // Check requestAnimationFrame
    if (!window.requestAnimationFrame) {
      console.error('requestAnimationFrame not supported');
      return false;
    }

    // Check addEventListener
    if (!document.addEventListener) {
      console.error('addEventListener not supported');
      return false;
    }

    // Check for modern JavaScript features
    if (typeof Symbol === 'undefined') {
      console.error('Symbol not supported (ES6 required)');
      return false;
    }

    // Check TensorFlow.js compatibility
    if (!tf.getBackend()) {
      console.error('TensorFlow.js backend not available');
      return false;
    }

    return true;
  }

  /**
   * Set up canvas for the game
   */
  setupCanvas() {
    const config = GameConfig.rendering;
    
    // Set canvas size
    this.canvas.width = config.canvasWidth;
    this.canvas.height = config.canvasHeight;
    
    // Set canvas style
    this.canvas.style.backgroundColor = config.backgroundColor;
    this.canvas.style.border = '2px solid #ffffff';
    this.canvas.style.display = 'block';
    this.canvas.style.margin = '0 auto';
    
    // Set up context
    this.context.imageSmoothingEnabled = false; // Pixel art style
    this.context.lineCap = 'round';
    this.context.lineJoin = 'round';
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Window resize
    window.addEventListener('resize', () => {
      this.handleResize();
    });

    // Page visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pause();
      } else {
        this.resume();
      }
    });

    // Prevent context menu on canvas
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // Focus canvas for keyboard input
    this.canvas.addEventListener('click', () => {
      this.canvas.focus();
    });

    // Make canvas focusable
    this.canvas.tabIndex = 0;

    // AI Control toggle
    this.aiControlToggle = document.getElementById('ai-control-toggle');
    if (this.aiControlToggle) {
      this.aiControlToggle.addEventListener('click', () => {
        this.toggleAIControl();
      });
    }
  }

  /**
   * Set up UI elements
   */
  setupUI() {
    const startButton = document.getElementById('start-game-button');
    if (startButton) {
      startButton.addEventListener('click', () => {
        // Always start/restart game, even if already running
        // The start() method will handle stopping the current game if needed
        this.start();
      });
    }

    const resetScoreButton = document.getElementById('reset-score-button');
    if (resetScoreButton) {
      resetScoreButton.addEventListener('click', () => {
        this.resetScores();
      });
    }
  }

  /**
   * Show start screen
   */
  showStartScreen() {
    this.context.fillStyle = GameConfig.rendering.backgroundColor;
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    this.context.fillStyle = '#ffffff';
    this.context.font = '32px Arial';
    this.context.textAlign = 'center';
    this.context.fillText('SabeRL Arena', this.canvas.width / 2, this.canvas.height / 2 - 50);
    
    this.context.font = '14px Arial';
    this.context.fillText('Use WASD to move', this.canvas.width / 2, this.canvas.height / 2 + 20);
    
    // Show start button
    const startButton = document.getElementById('start-game-button');
    if (startButton) {
      startButton.style.display = 'block';
    }
  }

  /**
   * Start the game (or restart if already running)
   */
  start() {
    if (!this.isInitialized) {
      console.error('Game not initialized');
      return;
    }

    try {
      // Stop current game loop if running (allows restarting during gameplay)
      if (this.gameLoop && this.gameLoop.isRunning()) {
        console.log('Game loop is running, stopping to start a new game...');
        this.gameLoop.stop();
      }

      // Reset core state and start loop
      const initialState = this.core.reset();
      // Sample and set opponent controller for this game
      this.applyOpponentSelection();
      // Set opponent controller in game loop (always set, even if it's RandomController)
      if (this.gameLoop && this.opponentController) {
        this.gameLoop.opponentController = this.opponentController;
        // Reset opponent decision timer to allow immediate first decision
        this.gameLoop.opponentDecisionTimer = this.gameLoop.playerActionInterval;
        this.gameLoop._lastOpponentAction = null;
        if (typeof this.gameLoop.setInitialObservation === 'function') {
          // Legacy method - pass first observation for backward compatibility
          this.gameLoop.setInitialObservation(initialState.observations[0]);
        }
      }
      this.gameLoop.start();
    } catch (error) {
      console.error('Error starting game:', error);
      // Show start button again on error
      const startButton = document.getElementById('start-game-button');
      if (startButton) {
        startButton.style.display = 'block';
      }
    }
    
    // Update UI
    const statusElement = document.getElementById('game-status');
    if (statusElement) {
      statusElement.textContent = 'Game Running';
    }
  }

  /**
   * Sample opponent option and apply controller to game loop
   * Note: In new design, opponent is handled through controllers array in GameLoop
   */
  applyOpponentSelection() {
    try {
      if (!this.core || !this.gameLoop) return;
      if (this.opponentManager && typeof this.opponentManager.load === 'function') {
        // Refresh options from storage in case UI changed them
        this.opponentManager.load();
      }
      const selection = this.opponentManager ? this.opponentManager.sample() : { type: 'random' };
      
      // Store opponent controller for use in GameLoop
      if (selection.type === 'policy' && selection.agent) {
        this.opponentController = new PolicyController(selection.agent);
        console.log(`Opponent set to policy: ${selection.label}`);
      } else {
        // Use RandomController as default (GameLoop already has it set)
        this.opponentController = new RandomController(this.core.getActionSpaces());
        console.log('Opponent set to random');
      }
    } catch (e) {
      console.warn('Failed to apply opponent selection, falling back to random', e);
      // Fallback to RandomController on error
      this.opponentController = new RandomController(this.core?.getActionSpaces?.() || null);
    }
  }

  /**
   * Pause the game
   */
  pause() {
    if (this.gameLoop && this.gameLoop.isRunning()) {
      this.gameLoop.stop();
      console.log('Game paused');
    }
  }

  /**
   * Resume the game
   */
  resume() {
    if (this.core && !this.gameLoop.isRunning()) {
      this.gameLoop.start();
      console.log('Game resumed');
    }
  }

  /**
   * Stop the game
   */
  stop() {
    if (this.gameLoop) {
      this.gameLoop.stop();
    }
    console.log('Game stopped');
  }

  /**
   * Handle window resize
   */
  handleResize() {
    // For now, just log the resize event
    // In the future, we could implement responsive scaling
    console.log('Window resized');
  }

  /**
   * Show compatibility error
   */
  showCompatibilityError() {
    const errorMsg = 'Your browser is not compatible with this game. Please use a modern browser with Canvas and ES6 support.';
    this.showError(errorMsg);
  }

  /**
   * Show error message
   * @param {string} message - Error message to display
   */
  showError(message) {
    console.error(message);
    
    // Update status element if available
    const statusElement = document.getElementById('game-status');
    if (statusElement) {
      statusElement.textContent = 'Error: ' + message;
      statusElement.style.color = '#ff0000';
    }
    
    // Draw error on canvas
    if (this.context) {
      this.context.fillStyle = '#ff0000';
      this.context.font = '16px Arial';
      this.context.textAlign = 'center';
      this.context.fillText('Error: ' + message, this.canvas.width / 2, this.canvas.height / 2);
    }
  }

  /**
   * Handle game end
   */
  onGameEnd(winner) {
    console.log('Game ended, stopping GameLoop immediately...');
    if (this.gameLoop && this.gameLoop.isRunning()) {
      this.gameLoop.stop();
    }
    
    // Update scores
    this.updateScores(winner);
    
    // Update scoreboard
    this.updateScoreboard();
    
    // Show start button when game ends
    const startButton = document.getElementById('start-game-button');
    if (startButton) {
      startButton.style.display = 'block';
    }
  }

  /**
   * Update the scoreboard display
   */
  updateScoreboard() {
    const playerScoreElement = document.getElementById('player-score');
    const aiScoreElement = document.getElementById('ai-score');
    
    if (playerScoreElement) {
      playerScoreElement.textContent = this.scores.player;
    }
    if (aiScoreElement) {
      aiScoreElement.textContent = this.scores.ai;
    }
  }

  /**
   * Update scores when a game ends
   */
  updateScores(winner) {
    if (winner && winner.id === 'player-1') {
      this.scores.player++;
    } else if (winner && winner.id === 'ai-1') {
      this.scores.ai++;
    }
    // Tie games don't update scores
  }

  /**
   * Reset scores and update the scoreboard
   */
  resetScores() {
    this.scores.player = 0;
    this.scores.ai = 0;
    this.updateScoreboard();
  }

  /**
   * Handle game restart
   */
  onGameRestart() {
    console.log('Game restarted, stopping GameLoop...');
    if (this.gameLoop && this.gameLoop.isRunning()) {
      this.gameLoop.stop();
    }
    
    // Show start button when game is waiting
    const startButton = document.getElementById('start-game-button');
    if (startButton) {
      startButton.style.display = 'block';
    }
  }

  /**
   * Initialize AI control system
   */
  initializeAIControl() {
    try {
      // Get control status element
      this.controlStatusElement = document.getElementById('control-status');
      
      // Create policy agent (game-agnostic, uses GameCore interface)
      if (this.core) {
        const observationSize = this.core.getObservationSize();
        const actionSize = this.core.getActionSize();
        const actionSpaces = this.core.getActionSpaces();
        
        this.policyAgent = new PolicyAgent({
          observationSize: observationSize,
          actionSize: actionSize,
          actionSpaces: actionSpaces,
          networkArchitecture: {
            policyHiddenLayers: GameConfig.rl.hiddenLayers || [64, 32],
            valueHiddenLayers: GameConfig.rl.hiddenLayers || [64, 32],
            activation: 'relu'
          }
        });
      }
      
      // Initialize AI control UI state
      this.updateControlStatus('Human Control', false);
      this.updateControlButton('Enable AI Control', false);
      
      console.log('AI control system initialized');
    } catch (error) {
      console.error('Failed to initialize AI control:', error);
    }
  }

  /**
   * Initialize training system
   */
  async initializeTraining() {
    try {
      // Wait for Chart.js to load before initializing TrainingUI
      await this.waitForChartJS();

      // Create controllers array (for training)
      const controllers = [
        new HumanController(),  // Player 0
        new RandomController(this.core.getActionSpaces())  // Player 1 (default to random)
      ];
      
      // Create training session with GameCore and controllers
      this.trainingSession = new TrainingSession(this.core, controllers, {
        trainablePlayers: [0],  // Train player 0
        maxGames: GameConfig.rl.maxGames,
        autoSaveInterval: GameConfig.rl.autoSaveInterval,
        algorithm: {
          type: 'PPO',
          hyperparameters: {}
        },
        networkArchitecture: {
          policyHiddenLayers: GameConfig.rl.hiddenLayers || [64, 32],
          valueHiddenLayers: GameConfig.rl.hiddenLayers || [64, 32],
          activation: 'relu'
        }
      });

      // Initialize training session
      await this.trainingSession.initialize();

      // Create training UI
      this.trainingUI = new TrainingUI('training-ui');
      this.trainingUI.initialize();
      this.trainingUI.setTrainingSession(this.trainingSession);

      // Auto-update AI control to use trained agent if already enabled
      this.updateAIControlToTrainedAgent();

      console.log('Training system initialized');
    } catch (error) {
      console.error('Failed to initialize training system:', error);
    }
  }

  /**
   * Wait for Chart.js to load
   */
  async waitForChartJS() {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 20; // 10 seconds max
      
      const checkChartJS = () => {
        attempts++;
        console.log(`Waiting for Chart.js (attempt ${attempts}/${maxAttempts})...`);
        
        if (typeof window.Chart === 'function') {
          console.log('Chart.js loaded successfully!');
          resolve();
        } else if (attempts < maxAttempts) {
          setTimeout(checkChartJS, 500); // Check every 500ms
        } else {
          console.warn('Chart.js did not load, but continuing anyway...');
          resolve(); // Continue even if Chart.js fails to load
        }
      };
      
      checkChartJS();
    });
  }

  /**
   * Update AI control to use trained agent if available and AI control is already enabled
   * Called automatically when training session initializes
   */
  updateAIControlToTrainedAgent() {
    // Only update if AI control is already enabled
    if (!this.isAIControlEnabled) {
      return;
    }

    // Check if training session has a trained agent
    if (!this.trainingSession || !this.trainingSession.policyAgent) {
      return;
    }

    try {
      // Swap controller on the loop to a policy controller with trained agent
      this.gameLoop.controller = new PolicyController(this.trainingSession.policyAgent);
      this.updateControlStatus('AI Control', true);
    } catch (error) {
      console.error('Failed to auto-update AI control to trained agent:', error);
    }
  }

  /**
   * Toggle AI control mode
   */
  toggleAIControl() {
    if (!this.core || !this.gameLoop) {
      console.error('Core not available');
      return;
    }

    try {
      this.isAIControlEnabled = !this.isAIControlEnabled;
      
      if (this.isAIControlEnabled) {
        // Prefer trained agent if available
        let agentToUse = this.policyAgent;
        let isTrained = false;
        if (this.trainingSession && this.trainingSession.policyAgent) {
          agentToUse = this.trainingSession.policyAgent;
          isTrained = true;
          console.log('Using trained agent from training session');
        } else {
          console.log('Using untrained agent (training session not initialized or no trained agent)');
        }
        this.gameLoop.controller = new PolicyController(agentToUse);
        const statusText = isTrained ? 'AI Control' : 'AI Control';
        this.updateControlStatus(statusText, true);
        this.updateControlButton('Disable AI Control', true);
        console.log('AI control enabled');
      } else {
        // Disable AI control
        this.gameLoop.controller = new HumanController();
        this.updateControlStatus('Human Control', false);
        this.updateControlButton('Enable AI Control', false);
        console.log('AI control disabled');
      }
    } catch (error) {
      console.error('Failed to toggle AI control:', error);
    }
  }

  /**
   * Update control status display
   * @param {string} status - Status text
   * @param {boolean} isAI - Whether AI is active
   */
  updateControlStatus(status, isAI) {
    if (this.controlStatusElement) {
      this.controlStatusElement.textContent = status;
      this.controlStatusElement.className = isAI ? 'ai-active' : '';
    }
  }

  /**
   * Update control button
   * @param {string} text - Button text
   * @param {boolean} isActive - Whether button is active
   */
  updateControlButton(text, isActive) {
    if (this.aiControlToggle) {
      this.aiControlToggle.textContent = text;
      this.aiControlToggle.className = isActive ? 'control-button active' : 'control-button';
    }
  }

  /**
   * Get AI decision display
   * @returns {string} HTML for AI decision display
   */
  getAIDecisionDisplay() {
    if (!this.isAIControlEnabled) {
      return '';
    }
    const decision = null;
    if (!decision) {
      return '';
    }

    return `
      <div class="ai-decision">
        Action: <span class="action">${decision.action}</span> | 
        Confidence: <span class="confidence">${(decision.confidence * 100).toFixed(1)}%</span>
        <div class="probabilities">
          W: ${(decision.probabilities[0] * 100).toFixed(1)}% | 
          A: ${(decision.probabilities[1] * 100).toFixed(1)}% | 
          S: ${(decision.probabilities[2] * 100).toFixed(1)}% | 
          D: ${(decision.probabilities[3] * 100).toFixed(1)}%
        </div>
      </div>
    `;
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.gameLoop) {
      this.gameLoop.stop();
    }
    
    if (this.policyAgent) {
      this.policyAgent.dispose();
    }
    
    if (this.trainingSession) {
      this.trainingSession.dispose();
    }
    
    if (this.trainingUI) {
      this.trainingUI.dispose();
    }
    
    this.isInitialized = false;
  }
}

// Global game instance
let gameInstance = null;

/**
 * Initialize the game when the page loads
 */
document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM loaded, initializing game...');
  
  gameInstance = new SabeRLArena();
  const success = await gameInstance.init();
  
  if (success) {
    // Set up keyboard controls
    document.addEventListener('keydown', (event) => {
      if (event.code === 'Space') {
        event.preventDefault();
        // Always start/restart game, even if already running
        // The start() method will handle stopping the current game if needed
        gameInstance.start();
      }
    });
    
    console.log('Game ready! Click Start Game button or press SPACE to start.');
  }
});

// Handle page unload
window.addEventListener('beforeunload', () => {
  if (gameInstance) {
    gameInstance.destroy();
  }
});

// Export for potential external use
export { SabeRLArena };
