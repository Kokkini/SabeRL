/**
 * RenderSystem - Handles all rendering operations
 * Manages canvas drawing, entity rendering, and visual effects
 */

// TensorFlow.js is loaded from CDN as a global 'tf' object
import { GameConfig } from '../../config/config.js';

export class RenderSystem {
  /**
   * Create a new RenderSystem
   * @param {HTMLCanvasElement} canvas - Canvas element to render to
   * @param {CanvasRenderingContext2D} context - 2D rendering context
   */
  constructor(canvas, context) {
    this.canvas = canvas;
    this.context = context;
    this.arena = null;
    this.scale = 1;
    this.offset = tf.tensor2d([[0, 0]]);
    this.showFPS = GameConfig.rendering.showFPS;
    this.showDebugInfo = GameConfig.rendering.showDebugInfo;
    
    // Performance tracking
    this.frameCount = 0;
    this.lastFPSTime = 0;
    this.currentFPS = 0;
    
    // Rendering settings
    this.backgroundColor = GameConfig.rendering.backgroundColor;
    this.arenaColor = GameConfig.arena.backgroundColor;
    this.borderColor = GameConfig.arena.borderColor;
    this.borderWidth = GameConfig.arena.borderWidth;
    
    this.setupCanvas();
  }

  /**
   * Set up canvas for rendering
   */
  setupCanvas() {
    // Set canvas size
    this.canvas.width = GameConfig.rendering.canvasWidth;
    this.canvas.height = GameConfig.rendering.canvasHeight;
    
    // Set up context
    this.context.imageSmoothingEnabled = false; // Pixel art style
    this.context.lineCap = 'round';
    this.context.lineJoin = 'round';
    
    // Calculate scale and offset for coordinate system conversion
    this.calculateScaleAndOffset();
  }

  /**
   * Calculate scale and offset for coordinate system conversion
   */
  calculateScaleAndOffset() {
    if (!this.arena) return;
    
    const arenaWidth = this.arena.getWidth();
    const arenaHeight = this.arena.getHeight();
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
    
    // Calculate scale to fit arena in canvas with some padding
    const padding = 50;
    const scaleX = (canvasWidth - padding * 2) / arenaWidth;
    const scaleY = (canvasHeight - padding * 2) / arenaHeight;
    
    // Use the smaller scale to maintain aspect ratio
    this.scale = Math.min(scaleX, scaleY);
    
    // Calculate offset to center the arena
    this.offset.dispose();
    this.offset = tf.tensor2d([[
      (canvasWidth - arenaWidth * this.scale) / 2,
      (canvasHeight - arenaHeight * this.scale) / 2
    ]]);
  }

  /**
   * Convert game coordinates to canvas coordinates
   * @param {tf.Tensor} gamePos - Position in game coordinates
   * @returns {tf.Tensor} Position in canvas coordinates
   */
  gameToCanvas(gamePos) {
    const pos = gamePos.dataSync();
    const offset = this.offset.dataSync();
    return tf.tensor2d([[
      pos[0] * this.scale + offset[0],
      pos[1] * this.scale + offset[1]
    ]]);
  }

  /**
   * Convert canvas coordinates to game coordinates
   * @param {tf.Tensor} canvasPos - Position in canvas coordinates
   * @returns {tf.Tensor} Position in game coordinates
   */
  canvasToGame(canvasPos) {
    const pos = canvasPos.dataSync();
    const offset = this.offset.dataSync();
    return tf.tensor2d([[
      (pos[0] - offset[0]) / this.scale,
      (pos[1] - offset[1]) / this.scale
    ]]);
  }

  /**
   * Clear the canvas
   */
  clear() {
    this.context.fillStyle = this.backgroundColor;
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Render the arena
   */
  renderArena() {
    if (!this.arena) return;
    
    const bounds = this.arena.getBounds();
    const topLeft = this.gameToCanvas(tf.tensor2d([[bounds.minX, bounds.minY]]));
    const bottomRight = this.gameToCanvas(tf.tensor2d([[bounds.maxX, bounds.maxY]]));
    
    const tl = topLeft.dataSync();
    const br = bottomRight.dataSync();
    
    // Draw arena background
    this.context.fillStyle = this.arenaColor;
    this.context.fillRect(
      tl[0], tl[1],
      br[0] - tl[0], br[1] - tl[1]
    );
    
    // Draw arena border
    this.context.strokeStyle = this.borderColor;
    this.context.lineWidth = this.borderWidth;
    this.context.strokeRect(
      tl[0], tl[1],
      br[0] - tl[0], br[1] - tl[1]
    );
    
    topLeft.dispose();
    bottomRight.dispose();
  }

  /**
   * Render a player
   * @param {Object} player - Player object to render
   */
  renderPlayer(player) {
    if (!player || !player.isAlive) return;
    
    const position = this.gameToCanvas(player.getPosition());
    const radius = player.getRadius() * this.scale;
    const pos = position.dataSync();
    
    // Draw player circle
    this.context.fillStyle = player.getColor();
    this.context.beginPath();
    this.context.arc(pos[0], pos[1], radius, 0, 2 * Math.PI);
    this.context.fill();
    
    // Draw player border
    this.context.strokeStyle = '#ffffff';
    this.context.lineWidth = 2;
    this.context.stroke();
    
    // Draw player's saber
    this.renderSaber(player.saber, player.getPosition());
    
    position.dispose();
  }

  /**
   * Render an AI
   * @param {Object} ai - AI object to render
   */
  renderAI(ai) {
    if (!ai || !ai.isAlive) return;
    
    const position = this.gameToCanvas(ai.getPosition());
    const radius = ai.getRadius() * this.scale;
    const pos = position.dataSync();
    
    // Draw AI circle
    this.context.fillStyle = ai.getColor();
    this.context.beginPath();
    this.context.arc(pos[0], pos[1], radius, 0, 2 * Math.PI);
    this.context.fill();
    
    // Draw AI border
    this.context.strokeStyle = '#ffffff';
    this.context.lineWidth = 2;
    this.context.stroke();
    
    // Draw AI's saber
    this.renderSaber(ai.saber, ai.getPosition());
    
    position.dispose();
  }

  /**
   * Render a saber
   * @param {Object} saber - Saber object to render
   * @param {tf.Tensor} ownerPosition - Position of the saber owner
   */
  renderSaber(saber, ownerPosition) {
    if (!saber || !saber.isActive()) return;
    
    const basePos = this.gameToCanvas(ownerPosition);
    const tipPos = this.gameToCanvas(saber.getTipPosition(ownerPosition));
    
    const base = basePos.dataSync();
    const tip = tipPos.dataSync();
    
    // Draw saber line
    this.context.strokeStyle = saber.getColor();
    this.context.lineWidth = saber.getWidth();
    this.context.beginPath();
    this.context.moveTo(base[0], base[1]);
    this.context.lineTo(tip[0], tip[1]);
    this.context.stroke();
    
    // Draw saber tip
    this.context.fillStyle = saber.getColor();
    this.context.beginPath();
    this.context.arc(tip[0], tip[1], saber.getWidth() / 2, 0, 2 * Math.PI);
    this.context.fill();
    
    basePos.dispose();
    tipPos.dispose();
  }

  /**
   * Render all game entities
   * @param {Array} players - Array of player objects
   * @param {Array} ais - Array of AI objects
   */
  renderEntities(players, ais) {
    // Render all players
    if (players) {
      for (const player of players) {
        this.renderPlayer(player);
      }
    }
    
    // Render all AIs
    if (ais) {
      for (const ai of ais) {
        this.renderAI(ai);
      }
    }
  }

  /**
   * Render UI elements
   * @param {Object} gameState - Current game state
   */
  renderUI(gameState) {
    // Render FPS counter
    if (this.showFPS) {
      this.renderFPS();
    }
    
    // Render debug info
    if (this.showDebugInfo) {
      this.renderDebugInfo(gameState);
    }
    
    // Render game status
    this.renderGameStatus(gameState);
  }

  /**
   * Render FPS counter
   */
  renderFPS() {
    this.context.fillStyle = '#ffffff';
    this.context.font = '16px Arial';
    this.context.textAlign = 'left';
    this.context.fillText(`FPS: ${this.currentFPS}`, 10, 25);
  }

  /**
   * Render debug information
   * @param {Object} gameState - Current game state
   */
  renderDebugInfo(gameState) {
    this.context.fillStyle = '#ffffff';
    this.context.font = '12px Arial';
    this.context.textAlign = 'left';
    
    let y = 50;
    const lineHeight = 15;
    
    // Game state
    this.context.fillText(`State: ${gameState.state}`, 10, y);
    y += lineHeight;
    
    // Player count
    this.context.fillText(`Players: ${gameState.players ? gameState.players.length : 0}`, 10, y);
    y += lineHeight;
    
    // AI count
    this.context.fillText(`AIs: ${gameState.ais ? gameState.ais.length : 0}`, 10, y);
    y += lineHeight;
    
    // Scale
    this.context.fillText(`Scale: ${this.scale.toFixed(2)}`, 10, y);
    y += lineHeight;
    
    // Offset
    const offsetData = this.offset.dataSync();
    this.context.fillText(`Offset: (${offsetData[0].toFixed(1)}, ${offsetData[1].toFixed(1)})`, 10, y);
  }

  /**
   * Render game status
   * @param {Object} gameState - Current game state
   */
  renderGameStatus(gameState) {
    this.context.fillStyle = '#ffffff';
    this.context.font = '24px Arial';
    this.context.textAlign = 'center';
    
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    
    switch (gameState.state) {
      case 'waiting':
        this.context.fillText('Press SPACE to start', centerX, centerY);
        break;
      case 'playing':
        // Game is running, no status text needed
        break;
      case 'gameOver':
        if (gameState.winner) {
          this.context.fillText(`Winner: ${gameState.winner.id}`, centerX, centerY);
          this.context.fillText('Press SPACE to start', centerX, centerY + 30);
        }
        break;
      case 'tie':
        this.context.fillText('Tie Game!', centerX, centerY);
        this.context.fillText('Press SPACE to start', centerX, centerY + 30);
        break;
      case 'paused':
        this.context.fillText('Game Paused', centerX, centerY);
        break;
    }
  }

  /**
   * Update FPS counter
   * @param {number} currentTime - Current time in milliseconds
   */
  updateFPS(currentTime) {
    this.frameCount++;
    
    if (currentTime - this.lastFPSTime >= 1000) {
      this.currentFPS = this.frameCount;
      this.frameCount = 0;
      this.lastFPSTime = currentTime;
    }
  }

  /**
   * Set arena for rendering
   * @param {Object} arena - Arena object
   */
  setArena(arena) {
    this.arena = arena;
    this.calculateScaleAndOffset();
  }

  /**
   * Set show FPS flag
   * @param {boolean} show - Whether to show FPS
   */
  setShowFPS(show) {
    this.showFPS = show;
  }

  /**
   * Set show debug info flag
   * @param {boolean} show - Whether to show debug info
   */
  setShowDebugInfo(show) {
    this.showDebugInfo = show;
  }

  /**
   * Get current FPS
   * @returns {number} Current FPS
   */
  getFPS() {
    return this.currentFPS;
  }

  /**
   * Get render system state for serialization
   * @returns {Object} Render system state
   */
  getState() {
    const offset = this.offset.dataSync();
    return {
      showFPS: this.showFPS,
      showDebugInfo: this.showDebugInfo,
      backgroundColor: this.backgroundColor,
      arenaColor: this.arenaColor,
      borderColor: this.borderColor,
      borderWidth: this.borderWidth,
      scale: this.scale,
      offset: { x: offset[0], y: offset[1] },
      currentFPS: this.currentFPS,
      arenaId: this.arena ? this.arena.id : null
    };
  }

  /**
   * Set render system state from serialization
   * @param {Object} state - Render system state
   */
  setState(state) {
    this.showFPS = state.showFPS;
    this.showDebugInfo = state.showDebugInfo;
    this.backgroundColor = state.backgroundColor;
    this.arenaColor = state.arenaColor;
    this.borderColor = state.borderColor;
    this.borderWidth = state.borderWidth;
    this.scale = state.scale;
    this.offset.dispose();
    this.offset = tf.tensor2d([[state.offset.x, state.offset.y]]);
    this.currentFPS = state.currentFPS;
    // Note: Arena reference would need to be restored separately
  }

  /**
   * Update render system (called each frame)
   * @param {number} deltaTime - Time since last update
   */
  update(deltaTime) {
    // Update FPS counter
    this.updateFPS(Date.now());
  }

  /**
   * Get string representation
   * @returns {string} String representation
   */
  toString() {
    return `RenderSystem(fps: ${this.currentFPS}, scale: ${this.scale.toFixed(2)}, arena: ${this.arena ? this.arena.id : 'none'})`;
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this.offset.dispose();
  }
}
