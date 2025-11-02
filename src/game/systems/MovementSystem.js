/**
 * MovementSystem - Handles player and AI movement
 * Manages position updates, velocity calculations, and boundary constraints
 */

import { GameConfig } from '../../config/config.js';
import { Vector2 } from '../../utils/Vector2.js';

export class MovementSystem {
  /**
   * Create a new MovementSystem
   * @param {Object} arena - Arena object for boundary checking
   */
  constructor(arena) {
    this.arena = arena;
    this.movementSpeed = GameConfig.player.movementSpeed;
    this.lastUpdateTime = 0;
  }

  /**
   * Update player movement
   * @param {Object} player - Player object to update
   * @param {Object} inputSystem - Input system for getting movement input
   * @param {number} deltaTime - Time since last update in seconds
   */
  updatePlayer(player, inputSystem, deltaTime) {
    if (!player || !player.isAlive) return;

    // Get movement vector from input
    const movementVector = inputSystem.getMovementVector();
    
    // Calculate velocity
    const velocity = movementVector.clone().multiplyScalar(this.movementSpeed);
    
    // Update player velocity
    player.setVelocity(velocity);
    
    // Calculate new position
    const newPosition = player.getPosition().clone().add(velocity.clone().multiplyScalar(deltaTime));
    
    // Check arena boundaries
    if (this.arena && this.arena.isPositionValidVector(newPosition, player.getRadius())) {
      player.setPosition(newPosition);
    } else if (this.arena) {
      // Constrain to arena bounds
      const constrainedPos = this.arena.constrainPositionVector(newPosition, player.getRadius());
      player.setPosition(constrainedPos);
    } else {
      // No arena constraints
      player.setPosition(newPosition);
    }
    
    this.lastUpdateTime = Date.now();
  }

  /**
   * Update AI movement
   * @param {Object} ai - AI object to update
   * @param {number} deltaTime - Time since last update in seconds
   */
  updateAI(ai, deltaTime) {
    if (!ai || !ai.isAlive) return;

    // Update AI direction if needed
    this.updateAIDirection(ai, deltaTime);
    
    // Calculate velocity based on current direction
    const velocity = ai.direction.clone().multiplyScalar(this.movementSpeed);
    
    // Update AI velocity
    ai.setVelocity(velocity);
    
    // Calculate new position
    const newPosition = ai.getPosition().clone().add(velocity.clone().multiplyScalar(deltaTime));
    
    // Check arena boundaries
    if (this.arena && this.arena.isPositionValidVector(newPosition, ai.getRadius())) {
      ai.setPosition(newPosition);
    } else if (this.arena) {
      // Constrain to arena bounds and change direction
      const constrainedPos = this.arena.constrainPositionVector(newPosition, ai.getRadius());
      ai.setPosition(constrainedPos);
      
      // Change direction when hitting boundary
      this.changeAIDirection(ai);
    } else {
      // No arena constraints
      ai.setPosition(newPosition);
    }
    
    this.lastUpdateTime = Date.now();
  }

  /**
   * Update AI direction based on timing
   * @param {Object} ai - AI object
   * @param {number} deltaTime - Time since last update in seconds
   */
  updateAIDirection(ai, deltaTime) {
    const currentTime = Date.now();
    const timeSinceLastChange = (currentTime - ai.lastDirectionChange) / 1000;
    
    // Check if it's time to change direction
    if (timeSinceLastChange >= ai.directionChangeInterval) {
      this.changeAIDirection(ai);
      ai.lastDirectionChange = currentTime;
      ai.directionChangeInterval = this.getRandomDirectionChangeInterval();
    }
  }

  /**
   * Change AI direction to a random direction
   * @param {Object} ai - AI object
   */
  changeAIDirection(ai) {
    // Generate random direction
    const angle = Math.random() * 2 * Math.PI;
    ai.direction = new Vector2(Math.cos(angle), Math.sin(angle));
  }

  /**
   * Get random direction change interval
   * @returns {number} Random interval in seconds
   */
  getRandomDirectionChangeInterval() {
    const min = GameConfig.ai.directionChangeMin;
    const max = GameConfig.ai.directionChangeMax;
    return Math.random() * (max - min) + min;
  }

  /**
   * Set arena for boundary checking
   * @param {Object} arena - Arena object
   */
  setArena(arena) {
    this.arena = arena;
  }

  /**
   * Get movement speed
   * @returns {number} Movement speed in units per second
   */
  getMovementSpeed() {
    return this.movementSpeed;
  }

  /**
   * Set movement speed
   * @param {number} speed - New movement speed in units per second
   */
  setMovementSpeed(speed) {
    if (speed < 0) {
      throw new Error('Movement speed cannot be negative');
    }
    this.movementSpeed = speed;
  }

  /**
   * Check if a position is valid for movement
   * @param {Vector2} position - Position to check
   * @param {number} radius - Object radius
   * @returns {boolean} True if position is valid
   */
  isValidPosition(position, radius = 0) {
    if (!this.arena) return true;
    return this.arena.isPositionValidVector(position, radius);
  }

  /**
   * Constrain position to valid bounds
   * @param {Vector2} position - Position to constrain
   * @param {number} radius - Object radius
   * @returns {Vector2} Constrained position
   */
  constrainPosition(position, radius = 0) {
    if (!this.arena) return position.clone();
    
    return this.arena.constrainPositionVector(position, radius);
  }

  /**
   * Calculate distance between two positions
   * @param {Vector2} pos1 - First position
   * @param {Vector2} pos2 - Second position
   * @returns {number} Distance between positions
   */
  calculateDistance(pos1, pos2) {
    return pos1.distance(pos2);
  }

  /**
   * Calculate direction from one position to another
   * @param {Vector2} from - Starting position
   * @param {Vector2} to - Target position
   * @returns {Vector2} Normalized direction vector
   */
  calculateDirection(from, to) {
    const direction = to.clone().subtract(from);
    if (direction.length() > 0) {
      return direction.normalize();
    }
    return direction;
  }

  /**
   * Check if two objects are within a certain distance
   * @param {Vector2} pos1 - First position
   * @param {Vector2} pos2 - Second position
   * @param {number} distance - Maximum distance
   * @returns {boolean} True if within distance
   */
  areWithinDistance(pos1, pos2, distance) {
    return this.calculateDistance(pos1, pos2) <= distance;
  }

  /**
   * Get movement system state for serialization
   * @returns {Object} Movement system state
   */
  getState() {
    return {
      movementSpeed: this.movementSpeed,
      lastUpdateTime: this.lastUpdateTime,
      arenaId: this.arena ? this.arena.id : null
    };
  }

  /**
   * Set movement system state from serialization
   * @param {Object} state - Movement system state
   */
  setState(state) {
    this.movementSpeed = state.movementSpeed;
    this.lastUpdateTime = state.lastUpdateTime;
    // Note: Arena reference would need to be restored separately
  }

  /**
   * Update movement system (called each frame)
   * @param {number} deltaTime - Time since last update
   */
  update(deltaTime) {
    // Update any system-level state if needed
    this.lastUpdateTime = Date.now();
  }

  /**
   * Get string representation
   * @returns {string} String representation
   */
  toString() {
    return `MovementSystem(speed: ${this.movementSpeed}, arena: ${this.arena ? this.arena.id : 'none'})`;
  }
}
