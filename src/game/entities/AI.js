/**
 * AI Entity - Computer-controlled opponent
 * Represents the AI opponent in the arena combat game
 */

// TensorFlow.js is loaded from CDN as a global 'tf' object
import { Saber } from './Saber.js';
import { GameConfig } from '../../config/config.js';

export class AI {
  /**
   * Create a new AI
   * @param {string} id - Unique identifier
   * @param {tf.Tensor} position - Initial position
   */
  constructor(id, position) {
    this.id = id;
    this.position = position || tf.tensor2d([[0, 0]]);
    this.velocity = tf.tensor2d([[0, 0]]);
    this.radius = GameConfig.ai.radius;
    this.color = GameConfig.ai.color;
    this.isAlive = true;
    
    // AI-specific properties
    this.direction = tf.tensor2d([[1, 0]]); // Initial direction
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
    this.velocity = movementVector.mul(this.movementSpeed);
    
    // Update position
    this.position = this.position.add(this.velocity.mul(deltaTime));
    
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
    this.direction.dispose();
    this.direction = tf.tensor2d([[Math.cos(angle), Math.sin(angle)]]);
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
   * @returns {tf.Tensor} Current position
   */
  getPosition() {
    return this.position.clone();
  }

  /**
   * Set position
   * @param {tf.Tensor} position - New position
   */
  setPosition(position) {
    this.position.dispose();
    this.position = position.clone();
  }

  /**
   * Get current velocity
   * @returns {tf.Tensor} Current velocity
   */
  getVelocity() {
    return this.velocity.clone();
  }

  /**
   * Set velocity
   * @param {tf.Tensor} velocity - New velocity
   */
  setVelocity(velocity) {
    this.velocity.dispose();
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
    this.velocity.dispose();
    this.velocity = tf.tensor2d([[0, 0]]);
    this.saber.setActive(false);
  }

  /**
   * Resurrect the AI
   * @param {tf.Tensor} position - New position
   */
  resurrect(position) {
    this.isAlive = true;
    this.position.dispose();
    this.position = position.clone();
    this.velocity.dispose();
    this.velocity = tf.tensor2d([[0, 0]]);
    this.saber.setActive(true);
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
    const magnitude = tf.norm(this.velocity);
    const result = magnitude.dataSync()[0] > 0;
    magnitude.dispose();
    return result;
  }

  /**
   * Get movement direction
   * @returns {tf.Tensor} Normalized movement direction
   */
  getMovementDirection() {
    return this.direction.clone();
  }

  /**
   * Get saber tip position
   * @returns {tf.Tensor} Saber tip position
   */
  getSaberTipPosition() {
    return this.saber.getTipPosition(this.position);
  }

  /**
   * Get bounding box for collision detection
   * @returns {Object} Bounding box {minX, maxX, minY, maxY}
   */
  getBounds() {
    const pos = this.position.dataSync();
    return {
      minX: pos[0] - this.radius,
      maxX: pos[0] + this.radius,
      minY: pos[1] - this.radius,
      maxY: pos[1] + this.radius
    };
  }

  /**
   * Check if position is valid (within arena bounds)
   * @param {tf.Tensor} position - Position to check
   * @param {Object} arena - Arena object with bounds
   * @returns {boolean} True if position is valid
   */
  isValidPosition(position, arena) {
    if (!arena || !arena.bounds) return true;
    
    const pos = position.dataSync();
    const bounds = arena.bounds;
    return pos[0] >= bounds.minX + this.radius &&
           pos[0] <= bounds.maxX - this.radius &&
           pos[1] >= bounds.minY + this.radius &&
           pos[1] <= bounds.maxY - this.radius;
  }

  /**
   * Constrain position to arena bounds
   * @param {Object} arena - Arena object with bounds
   */
  constrainToBounds(arena) {
    if (!arena || !arena.bounds) return;
    
    const pos = this.position.dataSync();
    const bounds = arena.bounds;
    const newX = Math.max(bounds.minX + this.radius, 
                 Math.min(bounds.maxX - this.radius, pos[0]));
    const newY = Math.max(bounds.minY + this.radius, 
                 Math.min(bounds.maxY - this.radius, pos[1]));
    
    this.position.dispose();
    this.position = tf.tensor2d([[newX, newY]]);
  }

  /**
   * Get AI state for serialization
   * @returns {Object} AI state
   */
  getState() {
    const pos = this.position.dataSync();
    const vel = this.velocity.dataSync();
    const dir = this.direction.dataSync();
    return {
      id: this.id,
      position: { x: pos[0], y: pos[1] },
      velocity: { x: vel[0], y: vel[1] },
      isAlive: this.isAlive,
      saber: this.saber.getState(),
      direction: { x: dir[0], y: dir[1] },
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
    this.position.dispose();
    this.position = tf.tensor2d([[state.position.x, state.position.y]]);
    this.velocity.dispose();
    this.velocity = tf.tensor2d([[state.velocity.x, state.velocity.y]]);
    this.isAlive = state.isAlive;
    this.saber.setState(state.saber);
    this.direction.dispose();
    this.direction = tf.tensor2d([[state.direction.x, state.direction.y]]);
    this.lastDirectionChange = state.lastDirectionChange;
    this.directionChangeInterval = state.directionChangeInterval;
  }

  /**
   * Get string representation
   * @returns {string} String representation
   */
  toString() {
    const pos = this.position.dataSync();
    return `AI(${this.id}, pos: (${pos[0].toFixed(2)}, ${pos[1].toFixed(2)}), alive: ${this.isAlive})`;
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this.position.dispose();
    this.velocity.dispose();
    this.direction.dispose();
  }
}
