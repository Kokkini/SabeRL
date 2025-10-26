/**
 * Main entry point for SabeRL Arena game
 * Initializes the game and handles browser compatibility
 */

// TensorFlow.js is loaded from CDN as a global 'tf' object
import { GameConfig, validateConfig } from './config/config.js';
import { Game } from './game/Game.js';
import { GameLoop } from './game/GameLoop.js';

/**
 * Main game class that manages the entire application
 */
class SabeRLArena {
  constructor() {
    this.game = null;
    this.gameLoop = null;
    this.canvas = null;
    this.context = null;
    this.isInitialized = false;
    this.scores = {
      player: 0,
      ai: 0
    };
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

      // Initialize game
      this.game = new Game(this.canvas, this.context);
      
      // Set up callbacks
      this.game.onRestart = () => this.onGameRestart();
      this.game.onGameEnd = (winner) => this.onGameEnd(winner);
      
      await this.game.init();

      // Initialize game loop
      this.gameLoop = new GameLoop(this.game);
      
      // Set up event listeners
      this.setupEventListeners();

      // Set up UI
      this.setupUI();

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
  }

  /**
   * Set up UI elements
   */
  setupUI() {
    const statusElement = document.getElementById('game-status');
    if (statusElement) {
      statusElement.textContent = 'Press SPACE to start';
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
    
    this.context.font = '16px Arial';
    this.context.fillText('Press SPACE to start', this.canvas.width / 2, this.canvas.height / 2 + 20);
    
    this.context.font = '14px Arial';
    this.context.fillText('Use WASD to move', this.canvas.width / 2, this.canvas.height / 2 + 50);
  }

  /**
   * Start the game
   */
  start() {
    if (!this.isInitialized) {
      console.error('Game not initialized');
      return;
    }

    if (this.gameLoop && this.gameLoop.isRunning()) {
      console.log('Game already running');
      return;
    }

    try {
      this.game.start();
      this.gameLoop.start();
    } catch (error) {
      console.error('Error starting game:', error);
    }
    
    // Update UI
    const statusElement = document.getElementById('game-status');
    if (statusElement) {
      statusElement.textContent = 'Game Running';
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
    if (this.game && !this.gameLoop.isRunning()) {
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
    if (this.game) {
      this.game.stop();
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
   * Handle game restart
   */
  onGameRestart() {
    console.log('Game restarted, stopping GameLoop...');
    if (this.gameLoop && this.gameLoop.isRunning()) {
      this.gameLoop.stop();
    }
    
    // Update UI to show waiting state
    const statusElement = document.getElementById('game-status');
    if (statusElement) {
      statusElement.textContent = 'Press SPACE to start';
      statusElement.style.color = '#ffffff'; // Reset color
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.gameLoop) {
      this.gameLoop.stop();
    }
    
    if (this.game) {
      this.game.stop();
      this.game.dispose();
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
        if (!gameInstance.gameLoop || !gameInstance.gameLoop.isRunning()) {
          // If game is in gameOver or tie state, restart it first
          if (gameInstance.game.state === GameConfig.game.states.GAME_OVER || gameInstance.game.state === GameConfig.game.states.TIE) {
            gameInstance.game.restart();
          }
          gameInstance.start();
        }
      }
    });
    
    console.log('Game ready! Press SPACE to start.');
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
