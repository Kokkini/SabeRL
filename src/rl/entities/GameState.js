/**
 * GameState - Represents the current perception data provided to the AI
 * Contains all information the AI needs to make decisions
 */

import { Vector2 } from '../../utils/Vector2.js';

export class GameState {
  constructor(data = {}) {
    // Convert Vector2 or array to Vector2
    if (data.playerPosition instanceof Vector2) {
      this.playerPosition = data.playerPosition;
    } else if (Array.isArray(data.playerPosition)) {
      this.playerPosition = new Vector2(data.playerPosition[0] || 0, data.playerPosition[1] || 0);
    } else {
      this.playerPosition = new Vector2(0, 0);
    }
    
    if (data.opponentPosition instanceof Vector2) {
      this.opponentPosition = data.opponentPosition;
    } else if (Array.isArray(data.opponentPosition)) {
      this.opponentPosition = new Vector2(data.opponentPosition[0] || 0, data.opponentPosition[1] || 0);
    } else {
      this.opponentPosition = new Vector2(0, 0);
    }
    this.playerSaberAngle = data.playerSaberAngle || 0;
    this.playerSaberAngularVelocity = data.playerSaberAngularVelocity || 0;
    this.opponentSaberAngle = data.opponentSaberAngle || 0;
    this.opponentSaberAngularVelocity = data.opponentSaberAngularVelocity || 0;
    this.timestamp = data.timestamp || Date.now();
    
    // Validate the state
    this.validate();
  }

  /**
   * Validate the game state data
   * @throws {Error} If validation fails
   */
  validate() {
    // Validate positions are within arena bounds (assuming 20x20 arena)
    const arenaSize = 20;
    
    if (!(this.playerPosition instanceof Vector2)) {
      throw new Error('Player position must be Vector2');
    }
    
    if (!(this.opponentPosition instanceof Vector2)) {
      throw new Error('Opponent position must be Vector2');
    }
    
    // Check if positions are within bounds
    if (this.playerPosition.x < 0 || this.playerPosition.x > arenaSize || 
        this.playerPosition.y < 0 || this.playerPosition.y > arenaSize) {
      throw new Error('Player position out of bounds');
    }
    
    if (this.opponentPosition.x < 0 || this.opponentPosition.x > arenaSize || 
        this.opponentPosition.y < 0 || this.opponentPosition.y > arenaSize) {
      throw new Error('Opponent position out of bounds');
    }
    
    // Validate angles are normalized
    if (this.playerSaberAngle < 0 || this.playerSaberAngle > 2 * Math.PI) {
      throw new Error('Player saber angle must be in [0, 2π]');
    }
    
    if (this.opponentSaberAngle < 0 || this.opponentSaberAngle > 2 * Math.PI) {
      throw new Error('Opponent saber angle must be in [0, 2π]');
    }
    
    // Validate timestamp
    if (this.timestamp <= 0) {
      throw new Error('Timestamp must be positive');
    }
  }

  /**
   * Get normalized state vector for neural network input
   * @returns {tf.Tensor} Normalized state tensor [6 elements]
   */
  getNormalizedState() {
    try {
      // Normalize positions to [0, 1] range (assuming 20x20 arena)
      const arenaSize = 20;
      
      const normalizedPlayerX = this.playerPosition.x / arenaSize;
      const normalizedPlayerY = this.playerPosition.y / arenaSize;
      const normalizedOpponentX = this.opponentPosition.x / arenaSize;
      const normalizedOpponentY = this.opponentPosition.y / arenaSize;
      
      // Normalize angles to [0, 1] range
      const normalizedPlayerAngle = this.playerSaberAngle / (2 * Math.PI);
      const normalizedOpponentAngle = this.opponentSaberAngle / (2 * Math.PI);
      
      // Create normalized state vector
      const stateArray = [
        normalizedPlayerX,
        normalizedPlayerY,
        normalizedOpponentX,
        normalizedOpponentY,
        normalizedPlayerAngle,
        normalizedOpponentAngle
      ];
      
      return tf.tensor(stateArray);
    } catch (error) {
      console.error('Failed to normalize game state:', error);
      // Return zero state as fallback
      return tf.zeros([6]);
    }
  }

  /**
   * Get relative state (player-relative coordinates)
   * @returns {tf.Tensor} Relative state tensor
   */
  getRelativeState() {
    try {
      // Calculate relative position
      const relativeX = this.opponentPosition.x - this.playerPosition.x;
      const relativeY = this.opponentPosition.y - this.playerPosition.y;
      
      // Calculate distance and angle to opponent
      const distance = Math.sqrt(relativeX * relativeX + relativeY * relativeY);
      const angleToOpponent = Math.atan2(relativeY, relativeX);
      
      // Normalize angle to [0, 2π]
      const normalizedAngleToOpponent = (angleToOpponent + 2 * Math.PI) % (2 * Math.PI);
      
      // Create relative state vector
      const stateArray = [
        relativeX / 20, // Normalize by arena size
        relativeY / 20,
        distance / 20,
        normalizedAngleToOpponent / (2 * Math.PI),
        this.playerSaberAngle / (2 * Math.PI),
        this.opponentSaberAngle / (2 * Math.PI)
      ];
      
      return tf.tensor(stateArray);
    } catch (error) {
      console.error('Failed to calculate relative state:', error);
      return tf.zeros([6]);
    }
  }

  /**
   * Get distance to opponent
   * @returns {number} Distance to opponent
   */
  getDistanceToOpponent() {
    try {
      return this.playerPosition.distance(this.opponentPosition);
    } catch (error) {
      console.error('Failed to calculate distance:', error);
      return 0;
    }
  }

  /**
   * Get angle to opponent
   * @returns {number} Angle to opponent in radians
   */
  getAngleToOpponent() {
    try {
      const dx = this.opponentPosition.x - this.playerPosition.x;
      const dy = this.opponentPosition.y - this.playerPosition.y;
      
      return Math.atan2(dy, dx);
    } catch (error) {
      console.error('Failed to calculate angle to opponent:', error);
      return 0;
    }
  }

  /**
   * Check if opponent is in saber range
   * @param {number} saberLength - Length of the saber
   * @returns {boolean} True if opponent is in range
   */
  isOpponentInSaberRange(saberLength = 2) {
    const distance = this.getDistanceToOpponent();
    return distance <= saberLength;
  }

  /**
   * Get state as plain object (for serialization)
   * @returns {Object} Plain object representation
   */
  toObject() {
    return {
      playerPosition: [this.playerPosition.x, this.playerPosition.y],
      opponentPosition: [this.opponentPosition.x, this.opponentPosition.y],
      playerSaberAngle: this.playerSaberAngle,
      playerSaberAngularVelocity: this.playerSaberAngularVelocity,
      opponentSaberAngle: this.opponentSaberAngle,
      opponentSaberAngularVelocity: this.opponentSaberAngularVelocity,
      timestamp: this.timestamp
    };
  }

  /**
   * Create GameState from plain object
   * @param {Object} data - Plain object data
   * @returns {GameState} New GameState instance
   */
  static fromObject(data) {
    return new GameState({
      playerPosition: Array.isArray(data.playerPosition) ? data.playerPosition : [0, 0],
      opponentPosition: Array.isArray(data.opponentPosition) ? data.opponentPosition : [0, 0],
      playerSaberAngle: data.playerSaberAngle,
      playerSaberAngularVelocity: data.playerSaberAngularVelocity,
      opponentSaberAngle: data.opponentSaberAngle,
      opponentSaberAngularVelocity: data.opponentSaberAngularVelocity,
      timestamp: data.timestamp
    });
  }

  /**
   * Create GameState from game entities
   * @param {Object} player - Player entity
   * @param {Object} opponent - Opponent entity
   * @param {Object} playerSaber - Player saber entity
   * @param {Object} opponentSaber - Opponent saber entity
   * @returns {GameState} New GameState instance
   */
  static fromGameEntities(player, opponent, playerSaber, opponentSaber) {
    return new GameState({
      playerPosition: player.getPosition(),
      opponentPosition: opponent.getPosition(),
      playerSaberAngle: playerSaber.getAngle(),
      playerSaberAngularVelocity: playerSaber.getRotationSpeed(), // Use rotationSpeed as angular velocity
      opponentSaberAngle: opponentSaber.getAngle(),
      opponentSaberAngularVelocity: opponentSaber.getRotationSpeed(),
      timestamp: Date.now()
    });
  }

  /**
   * Dispose of resources (Vector2 doesn't need disposal)
   */
  dispose() {
    // Vector2 doesn't need disposal
  }

  /**
   * Clone the game state
   * @returns {GameState} Cloned state
   */
  clone() {
    return new GameState({
      playerPosition: this.playerPosition.clone(),
      opponentPosition: this.opponentPosition.clone(),
      playerSaberAngle: this.playerSaberAngle,
      playerSaberAngularVelocity: this.playerSaberAngularVelocity,
      opponentSaberAngle: this.opponentSaberAngle,
      opponentSaberAngularVelocity: this.opponentSaberAngularVelocity,
      timestamp: this.timestamp
    });
  }
}
