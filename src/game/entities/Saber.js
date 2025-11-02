/**
 * Saber Entity - Rotating weapon attached to players
 * Represents the rotating saber that can cause victory on contact
 */

import { GameConfig } from '../../config/config.js';
import { Vector2 } from '../../utils/Vector2.js';

export class Saber {
  /**
   * Create a new Saber
   * @param {string} id - Unique identifier
   * @param {string} owner - ID of player who owns this saber
   * @param {number} length - Saber length in units
   */
  constructor(id, owner, length) {
    this.id = id;
    this.owner = owner;
    this.length = length || GameConfig.saber.length;
    this.angle = 0; // Current rotation angle in radians
    this.rotationSpeed = GameConfig.saber.rotationSpeed; // Radians per second
    this._isActive = true;
    this.color = GameConfig.saber.color;
    this.width = GameConfig.saber.width;
    
    // Animation state
    this.lastUpdateTime = 0;
  }

  /**
   * Update saber state
   * @param {number} deltaTime - Time since last update in seconds
   */
  update(deltaTime) {
    if (!this._isActive) return;
    
    // Update rotation angle
    this.angle += this.rotationSpeed * deltaTime;
    
    // Normalize angle to 0-2π range
    this.angle = this.normalizeAngle(this.angle);
    
    this.lastUpdateTime = Date.now();
  }

  /**
   * Get current angle
   * @returns {number} Current angle in radians
   */
  getAngle() {
    return this.angle;
  }

  /**
   * Set angle
   * @param {number} angle - New angle in radians
   */
  setAngle(angle) {
    this.angle = this.normalizeAngle(angle);
  }

  /**
   * Normalize an angle to be between 0 and 2π
   * @param {number} angle - Angle in radians
   * @returns {number} Normalized angle
   */
  normalizeAngle(angle) {
    while (angle < 0) angle += 2 * Math.PI;
    while (angle >= 2 * Math.PI) angle -= 2 * Math.PI;
    return angle;
  }

  /**
   * Get saber tip position relative to owner position
   * @param {Vector2} ownerPosition - Position of the saber owner
   * @returns {Vector2} Saber tip position
   */
  getTipPosition(ownerPosition) {
    if (!ownerPosition) {
      throw new Error('Owner position is required to calculate saber tip position');
    }
    
    // Calculate tip position based on current angle
    const tipOffset = new Vector2(
      Math.cos(this.angle) * this.length,
      Math.sin(this.angle) * this.length
    );
    return ownerPosition.clone().add(tipOffset);
  }

  /**
   * Get saber base position (same as owner position)
   * @param {Vector2} ownerPosition - Position of the saber owner
   * @returns {Vector2} Saber base position
   */
  getBasePosition(ownerPosition) {
    return ownerPosition.clone();
  }

  /**
   * Get saber endpoints for rendering
   * @param {Vector2} ownerPosition - Position of the saber owner
   * @returns {Object} Saber endpoints {base, tip}
   */
  getEndpoints(ownerPosition) {
    return {
      base: this.getBasePosition(ownerPosition),
      tip: this.getTipPosition(ownerPosition)
    };
  }

  /**
   * Check if saber is active
   * @returns {boolean} True if active
   */
  isActive() {
    return this._isActive;
  }

  /**
   * Set active state
   * @param {boolean} active - Active state
   */
  setActive(active) {
    this._isActive = active;
  }

  /**
   * Get saber length
   * @returns {number} Saber length in units
   */
  getLength() {
    return this.length;
  }

  /**
   * Set saber length
   * @param {number} length - New length in units
   */
  setLength(length) {
    if (length <= 0) {
      throw new Error('Saber length must be positive');
    }
    this.length = length;
  }

  /**
   * Get rotation speed
   * @returns {number} Rotation speed in radians per second
   */
  getRotationSpeed() {
    return this.rotationSpeed;
  }

  /**
   * Set rotation speed
   * @param {number} speed - New rotation speed in radians per second
   */
  setRotationSpeed(speed) {
    if (speed < 0) {
      throw new Error('Rotation speed cannot be negative');
    }
    this.rotationSpeed = speed;
  }

  /**
   * Get owner ID
   * @returns {string} Owner ID
   */
  getOwner() {
    return this.owner;
  }

  /**
   * Set owner ID
   * @param {string} owner - New owner ID
   */
  setOwner(owner) {
    this.owner = owner;
  }

  /**
   * Get color
   * @returns {string} Saber color
   */
  getColor() {
    return this.color;
  }

  /**
   * Set color
   * @param {string} color - New color
   */
  setColor(color) {
    this.color = color;
  }

  /**
   * Get width
   * @returns {number} Saber width in pixels
   */
  getWidth() {
    return this.width;
  }

  /**
   * Set width
   * @param {number} width - New width in pixels
   */
  setWidth(width) {
    if (width <= 0) {
      throw new Error('Saber width must be positive');
    }
    this.width = width;
  }

  /**
   * Check if saber tip is colliding with a point
   * @param {Vector2} ownerPosition - Position of the saber owner
   * @param {Vector2} point - Point to check collision with
   * @param {number} tolerance - Collision tolerance (default 0.1)
   * @returns {boolean} True if colliding
   */
  isTipCollidingWithPoint(ownerPosition, point, tolerance = 0.1) {
    const tipPosition = this.getTipPosition(ownerPosition);
    const distance = tipPosition.distance(point);
    return distance <= tolerance;
  }

  /**
   * Check if saber line segment is colliding with a circle
   * @param {Vector2} ownerPosition - Position of the saber owner
   * @param {Vector2} circleCenter - Circle center position
   * @param {number} circleRadius - Circle radius
   * @returns {boolean} True if colliding
   */
  isCollidingWithCircle(ownerPosition, circleCenter, circleRadius) {
    const endpoints = this.getEndpoints(ownerPosition);
    
    // Check if line segment intersects with circle
    const dx = endpoints.tip.x - endpoints.base.x;
    const dy = endpoints.tip.y - endpoints.base.y;
    
    // Vector from line start to circle center
    const fx = circleCenter.x - endpoints.base.x;
    const fy = circleCenter.y - endpoints.base.y;
    
    // Project circle center onto line
    const lineLengthSquared = dx * dx + dy * dy;
    if (lineLengthSquared === 0) {
      // Line is a point (base and tip are the same)
      const distance = endpoints.base.distance(circleCenter);
      return distance <= circleRadius;
    }
    
    const t = Math.max(0, Math.min(1, (fx * dx + fy * dy) / lineLengthSquared));
    
    // Find closest point on line to circle center
    const closestPoint = new Vector2(
      endpoints.base.x + t * dx,
      endpoints.base.y + t * dy
    );
    
    // Check if closest point is within circle radius
    const distance = closestPoint.distance(circleCenter);
    return distance <= circleRadius;
  }

  /**
   * Get saber direction vector
   * @returns {Vector2} Normalized direction vector
   */
  getDirection() {
    return new Vector2(Math.cos(this.angle), Math.sin(this.angle));
  }

  /**
   * Get saber state for serialization
   * @returns {Object} Saber state
   */
  getState() {
    return {
      id: this.id,
      owner: this.owner,
      length: this.length,
      angle: this.angle,
      rotationSpeed: this.rotationSpeed,
      isActive: this._isActive,
      color: this.color,
      width: this.width
    };
  }

  /**
   * Set saber state from serialization
   * @param {Object} state - Saber state
   */
  setState(state) {
    this.id = state.id;
    this.owner = state.owner;
    this.length = state.length;
    this.angle = this.normalizeAngle(state.angle);
    this.rotationSpeed = state.rotationSpeed;
    this._isActive = state.isActive;
    this.color = state.color;
    this.width = state.width;
  }

  /**
   * Reset saber to initial state
   */
  reset() {
    this.angle = 0;
    this._isActive = true;
    this.lastUpdateTime = 0;
  }

  /**
   * Get string representation
   * @returns {string} String representation
   */
  toString() {
    return `Saber(${this.id}, owner: ${this.owner}, angle: ${this.angle.toFixed(2)}, active: ${this._isActive})`;
  }

  /**
   * Normalize angle to 0-2π range
   * @param {number} angle - Angle in radians
   * @returns {number} Normalized angle
   */
  normalizeAngle(angle) {
    while (angle < 0) {
      angle += 2 * Math.PI;
    }
    while (angle >= 2 * Math.PI) {
      angle -= 2 * Math.PI;
    }
    return angle;
  }

  /**
   * Dispose of resources
   */
  dispose() {
    // No tensors to dispose in this class
  }
}
