/**
 * Arena Entity - Playable game area
 * Represents the arena with boundaries and collision detection
 */

// TensorFlow.js is loaded from CDN as a global 'tf' object
import { GameConfig } from '../../config/config.js';

export class Arena {
  /**
   * Create a new Arena
   * @param {string} id - Unique identifier
   * @param {number} width - Arena width in units
   * @param {number} height - Arena height in units
   */
  constructor(id, width, height) {
    this.id = id;
    this.width = width || GameConfig.arena.width;
    this.height = height || GameConfig.arena.height;
    this.backgroundColor = GameConfig.arena.backgroundColor;
    this.borderColor = GameConfig.arena.borderColor;
    this.borderWidth = GameConfig.arena.borderWidth;
    
    // Calculate bounds
    this.bounds = {
      minX: 0,
      maxX: this.width,
      minY: 0,
      maxY: this.height
    };
    
    // Arena center
    this.center = {
      x: this.width / 2,
      y: this.height / 2
    };
  }

  /**
   * Get arena width
   * @returns {number} Arena width in units
   */
  getWidth() {
    return this.width;
  }

  /**
   * Get arena height
   * @returns {number} Arena height in units
   */
  getHeight() {
    return this.height;
  }

  /**
   * Get arena bounds
   * @returns {Object} Bounds object {minX, maxX, minY, maxY}
   */
  getBounds() {
    return { ...this.bounds };
  }

  /**
   * Get arena center
   * @returns {Object} Center coordinates {x, y}
   */
  getCenter() {
    return { ...this.center };
  }

  /**
   * Check if a position is within arena bounds
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} radius - Optional radius for boundary checking
   * @returns {boolean} True if position is within bounds
   */
  isPositionValid(x, y, radius = 0) {
    return x >= this.bounds.minX + radius &&
           x <= this.bounds.maxX - radius &&
           y >= this.bounds.minY + radius &&
           y <= this.bounds.maxY - radius;
  }

  /**
   * Check if a position is within arena bounds (Tensor version)
   * @param {tf.Tensor} position - Position tensor
   * @param {number} radius - Optional radius for boundary checking
   * @returns {boolean} True if position is within bounds
   */
  isPositionValidTensor(position, radius = 0) {
    const pos = position.dataSync();
    return this.isPositionValid(pos[0], pos[1], radius);
  }

  /**
   * Constrain a position to arena bounds
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} radius - Optional radius for boundary checking
   * @returns {Object} Constrained position {x, y}
   */
  constrainPosition(x, y, radius = 0) {
    return {
      x: Math.max(this.bounds.minX + radius, 
          Math.min(this.bounds.maxX - radius, x)),
      y: Math.max(this.bounds.minY + radius, 
          Math.min(this.bounds.maxY - radius, y))
    };
  }

  /**
   * Constrain a position to arena bounds (Tensor version)
   * @param {tf.Tensor} position - Position tensor
   * @param {number} radius - Optional radius for boundary checking
   * @returns {tf.Tensor} Constrained position tensor
   */
  constrainPositionTensor(position, radius = 0) {
    const pos = position.dataSync();
    const constrained = this.constrainPosition(pos[0], pos[1], radius);
    return tf.tensor2d([[constrained.x, constrained.y]]);
  }

  /**
   * Get distance to nearest boundary
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {number} Distance to nearest boundary
   */
  getDistanceToBoundary(x, y) {
    const distances = [
      x - this.bounds.minX,           // Distance to left boundary
      this.bounds.maxX - x,           // Distance to right boundary
      y - this.bounds.minY,           // Distance to top boundary
      this.bounds.maxY - y            // Distance to bottom boundary
    ];
    
    return Math.min(...distances);
  }

  /**
   * Get distance to nearest boundary (Tensor version)
   * @param {tf.Tensor} position - Position tensor
   * @returns {number} Distance to nearest boundary
   */
  getDistanceToBoundaryTensor(position) {
    const pos = position.dataSync();
    return this.getDistanceToBoundary(pos[0], pos[1]);
  }

  /**
   * Check if a circle is completely within arena bounds
   * @param {number} x - Circle center X coordinate
   * @param {number} y - Circle center Y coordinate
   * @param {number} radius - Circle radius
   * @returns {boolean} True if circle is completely within bounds
   */
  isCircleWithinBounds(x, y, radius) {
    return this.isPositionValid(x, y, radius);
  }

  /**
   * Check if a circle is completely within arena bounds (Tensor version)
   * @param {tf.Tensor} position - Circle center position
   * @param {number} radius - Circle radius
   * @returns {boolean} True if circle is completely within bounds
   */
  isCircleWithinBoundsTensor(position, radius) {
    const pos = position.dataSync();
    return this.isCircleWithinBounds(pos[0], pos[1], radius);
  }

  /**
   * Get random position within arena bounds
   * @param {number} radius - Optional radius to keep away from boundaries
   * @returns {tf.Tensor} Random position tensor
   */
  getRandomPosition(radius = 0) {
    const x = Math.random() * (this.bounds.maxX - this.bounds.minX - 2 * radius) + 
              this.bounds.minX + radius;
    const y = Math.random() * (this.bounds.maxY - this.bounds.minY - 2 * radius) + 
              this.bounds.minY + radius;
    return tf.tensor2d([[x, y]]);
  }

  /**
   * Get spawn positions for players
   * @param {number} playerCount - Number of players
   * @param {number} playerRadius - Player radius for spacing
   * @returns {Array} Array of spawn position tensors
   */
  getSpawnPositions(playerCount, playerRadius) {
    const positions = [];
    const margin = playerRadius + 1; // Keep players away from boundaries
    
    if (playerCount === 1) {
      // Single player spawns in center
      positions.push(tf.tensor2d([[this.center.x, this.center.y]]));
    } else if (playerCount === 2) {
      // Two players spawn on opposite sides
      positions.push(tf.tensor2d([[margin, this.center.y]]));
      positions.push(tf.tensor2d([[this.bounds.maxX - margin, this.center.y]]));
    } else {
      // Multiple players spawn in a circle pattern
      const angleStep = (2 * Math.PI) / playerCount;
      const spawnRadius = Math.min(this.width, this.height) / 3;
      
      for (let i = 0; i < playerCount; i++) {
        const angle = i * angleStep;
        const x = this.center.x + Math.cos(angle) * spawnRadius;
        const y = this.center.y + Math.sin(angle) * spawnRadius;
        
        // Constrain to bounds
        const constrainedPos = this.constrainPosition(x, y, playerRadius);
        positions.push(tf.tensor2d([[constrainedPos.x, constrainedPos.y]]));
      }
    }
    
    return positions;
  }

  /**
   * Check if two positions are within a certain distance
   * @param {Object} pos1 - First position {x, y}
   * @param {Object} pos2 - Second position {x, y}
   * @param {number} distance - Maximum distance
   * @returns {boolean} True if positions are within distance
   */
  arePositionsWithinDistance(pos1, pos2, distance) {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    return Math.sqrt(dx * dx + dy * dy) <= distance;
  }

  /**
   * Get arena area
   * @returns {number} Arena area in square units
   */
  getArea() {
    return this.width * this.height;
  }

  /**
   * Get arena perimeter
   * @returns {number} Arena perimeter in units
   */
  getPerimeter() {
    return 2 * (this.width + this.height);
  }

  /**
   * Check if arena is large enough for given requirements
   * @param {number} minWidth - Minimum required width
   * @param {number} minHeight - Minimum required height
   * @returns {boolean} True if arena meets requirements
   */
  meetsRequirements(minWidth, minHeight) {
    return this.width >= minWidth && this.height >= minHeight;
  }

  /**
   * Get arena state for serialization
   * @returns {Object} Arena state
   */
  getState() {
    return {
      id: this.id,
      width: this.width,
      height: this.height,
      backgroundColor: this.backgroundColor,
      borderColor: this.borderColor,
      borderWidth: this.borderWidth,
      bounds: { ...this.bounds },
      center: { ...this.center }
    };
  }

  /**
   * Set arena state from serialization
   * @param {Object} state - Arena state
   */
  setState(state) {
    this.id = state.id;
    this.width = state.width;
    this.height = state.height;
    this.backgroundColor = state.backgroundColor;
    this.borderColor = state.borderColor;
    this.borderWidth = state.borderWidth;
    this.bounds = { ...state.bounds };
    this.center = { ...state.center };
  }

  /**
   * Get string representation
   * @returns {string} String representation
   */
  toString() {
    return `Arena(${this.id}, ${this.width}x${this.height})`;
  }
}
