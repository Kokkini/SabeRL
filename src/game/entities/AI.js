/**
 * AI Entity - Computer-controlled opponent
 * Represents the AI opponent in the arena combat game
 */

import { Saber } from './Saber.js';
import { GameConfig } from '../../config/config.js';
import { Vector2 } from '../../utils/Vector2.js';

export class AI {
  /**
   * Create a new AI
   * @param {string} id - Unique identifier
   * @param {Vector2} position - Initial position
   */
  constructor(id, position) {
    this.id = id;
    this.position = position || new Vector2(0, 0);
    this.velocity = new Vector2(0, 0);
    this.radius = GameConfig.ai.radius;
    this.color = GameConfig.ai.color;
    this.isAlive = true;
    
    // AI-specific properties
    this.direction = new Vector2(1, 0); // Initial direction
    this.lastDirectionChange = Date.now();
    this.directionChangeInterval = this.getRandomDirectionChangeInterval();
    
    // Create saber for this AI
    this.saber = new Saber(`${id}-saber`, id, GameConfig.saber.length);
    
    // Movement state
    this.movementSpeed = GameConfig.ai.movementSpeed;
    this.lastUpdateTime = 0;
  }

  /**
   * Update AI state
   * @param {number} deltaTime - Time since last update in seconds
   */
  update(deltaTime) {
    if (!this.isAlive) return;

    // Update direction if needed
    this.updateDirection(deltaTime);
    
    // Calculate movement vector
    const movementVector = this.direction.clone();
    
    // Update velocity
    this.velocity = movementVector.clone().multiplyScalar(this.movementSpeed);
    
    // Update position
    this.position.add(this.velocity.clone().multiplyScalar(deltaTime));
    
    // Update saber
    this.saber.update(deltaTime);
    
    this.lastUpdateTime = Date.now();
  }

  /**
   * Update AI direction based on timing
   * @param {number} deltaTime - Time since last update in seconds
   */
  updateDirection(deltaTime) {
    const currentTime = Date.now();
    const timeSinceLastChange = (currentTime - this.lastDirectionChange) / 1000;
    
    // Check if it's time to change direction
    if (timeSinceLastChange >= this.directionChangeInterval) {
      this.changeDirection();
      this.lastDirectionChange = currentTime;
      this.directionChangeInterval = this.getRandomDirectionChangeInterval();
    }
  }

  /**
   * Change AI direction to a random direction
   */
  changeDirection() {
    // Generate random direction
    const angle = Math.random() * 2 * Math.PI;
    this.direction = new Vector2(Math.cos(angle), Math.sin(angle));
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
   * Get current position
   * @returns {Vector2} Current position
   */
  getPosition() {
    return this.position.clone();
  }

  /**
   * Set position
   * @param {Vector2} position - New position
   */
  setPosition(position) {
    this.position = position.clone();
  }

  /**
   * Get current velocity
   * @returns {Vector2} Current velocity
   */
  getVelocity() {
    return this.velocity.clone();
  }

  /**
   * Set velocity
   * @param {Vector2} velocity - New velocity
   */
  setVelocity(velocity) {
    this.velocity = velocity.clone();
  }

  /**
   * Get saber
   * @returns {Saber} AI's saber
   */
  getSaber() {
    return this.saber;
  }

  /**
   * Check if AI is alive
   * @returns {boolean} True if alive
   */
  isAlive() {
    return this.isAlive;
  }

  /**
   * Kill the AI
   */
  kill() {
    this.isAlive = false;
    this.velocity = new Vector2(0, 0);
    // this.saber.setActive(false);
  }

  /**
   * Resurrect the AI
   * @param {Vector2} position - New position
   */
  resurrect(position) {
    this.isAlive = true;
    this.position = position.clone();
    this.velocity = new Vector2(0, 0);
    // this.saber.setActive(true);
    this.saber.setAngle(0); // Reset saber angle
    
    // Reset direction change timing
    this.lastDirectionChange = Date.now();
    this.directionChangeInterval = this.getRandomDirectionChangeInterval();
  }

  /**
   * Get collision radius
   * @returns {number} Collision radius
   */
  getRadius() {
    return this.radius;
  }

  /**
   * Get color
   * @returns {string} AI color
   */
  getColor() {
    return this.color;
  }

  /**
   * Check if AI is moving
   * @returns {boolean} True if moving
   */
  isMoving() {
    return this.velocity.length() > 0;
  }

  /**
   * Get movement direction
   * @returns {Vector2} Normalized movement direction
   */
  getMovementDirection() {
    return this.direction.clone();
  }

  /**
   * Get saber tip position
   * @returns {Vector2} Saber tip position
   */
  getSaberTipPosition() {
    return this.saber.getTipPosition(this.position);
  }

  /**
   * Get bounding box for collision detection
   * @returns {Object} Bounding box {minX, maxX, minY, maxY}
   */
  getBounds() {
    return {
      minX: this.position.x - this.radius,
      maxX: this.position.x + this.radius,
      minY: this.position.y - this.radius,
      maxY: this.position.y + this.radius
    };
  }

  /**
   * Check if position is valid (within arena bounds)
   * @param {Vector2} position - Position to check
   * @param {Object} arena - Arena object with bounds
   * @returns {boolean} True if position is valid
   */
  isValidPosition(position, arena) {
    if (!arena || !arena.bounds) return true;
    
    const bounds = arena.bounds;
    return position.x >= bounds.minX + this.radius &&
           position.x <= bounds.maxX - this.radius &&
           position.y >= bounds.minY + this.radius &&
           position.y <= bounds.maxY - this.radius;
  }

  /**
   * Constrain position to arena bounds
   * @param {Object} arena - Arena object with bounds
   */
  constrainToBounds(arena) {
    if (!arena || !arena.bounds) return;
    
    const bounds = arena.bounds;
    const newX = Math.max(bounds.minX + this.radius, 
                 Math.min(bounds.maxX - this.radius, this.position.x));
    const newY = Math.max(bounds.minY + this.radius, 
                 Math.min(bounds.maxY - this.radius, this.position.y));
    
    this.position = new Vector2(newX, newY);
  }

  /**
   * Get AI state for serialization
   * @returns {Object} AI state
   */
  getState() {
    return {
      id: this.id,
      position: { x: this.position.x, y: this.position.y },
      velocity: { x: this.velocity.x, y: this.velocity.y },
      isAlive: this.isAlive,
      saber: this.saber.getState(),
      direction: { x: this.direction.x, y: this.direction.y },
      lastDirectionChange: this.lastDirectionChange,
      directionChangeInterval: this.directionChangeInterval
    };
  }

  /**
   * Set AI state from serialization
   * @param {Object} state - AI state
   */
  setState(state) {
    this.id = state.id;
    this.position = new Vector2(state.position.x, state.position.y);
    this.velocity = new Vector2(state.velocity.x, state.velocity.y);
    this.isAlive = state.isAlive;
    this.saber.setState(state.saber);
    this.direction = new Vector2(state.direction.x, state.direction.y);
    this.lastDirectionChange = state.lastDirectionChange;
    this.directionChangeInterval = state.directionChangeInterval;
  }

  /**
   * Get string representation
   * @returns {string} String representation
   */
  toString() {
    return `AI(${this.id}, pos: (${this.position.x.toFixed(2)}, ${this.position.y.toFixed(2)}), alive: ${this.isAlive})`;
  }

  /**
   * Dispose of resources
   */
  dispose() {
    // Vector2 doesn't need disposal
  }
}
