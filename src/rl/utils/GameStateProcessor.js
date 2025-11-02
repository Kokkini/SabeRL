/**
 * GameStateProcessor - Processes and normalizes game state for AI perception
 * Handles state normalization, feature engineering, and data preprocessing
 */

import { GameConfig } from '../../config/config.js';
import { Vector2 } from '../../utils/Vector2.js';

export class GameStateProcessor {
  constructor(options = {}) {
    this.options = {
      normalizePositions: options.normalizePositions !== false,
      normalizeAngles: options.normalizeAngles !== false,
      includeVelocity: options.includeVelocity !== false,
      includeDistance: options.includeDistance !== false,
      ...options
    };

    // Normalization parameters
    this.arenaSize = GameConfig.arena.width; // Use width as the arena size (assuming square arena)
    this.playerRadius = GameConfig.player.radius;
    this.maxDistance = Math.sqrt(2) * this.arenaSize; // Diagonal distance
  }

  /**
   * Process raw game state into normalized features
   * @param {Object} gameState - Raw game state object
   * @returns {Array} Normalized feature array
   */
  processState(gameState) {
    if (!gameState) {
      return this.getDefaultState();
    }

    const features = [];

    // Position features (normalized to [-1, 1])
    // Extract position data from Vector2
    const playerPos = gameState.playerPosition instanceof Vector2 
      ? gameState.playerPosition 
      : (Array.isArray(gameState.playerPosition) ? new Vector2(gameState.playerPosition[0], gameState.playerPosition[1]) : new Vector2(0, 0));
    const opponentPos = gameState.opponentPosition instanceof Vector2
      ? gameState.opponentPosition
      : (Array.isArray(gameState.opponentPosition) ? new Vector2(gameState.opponentPosition[0], gameState.opponentPosition[1]) : new Vector2(0, 0));
    
    if (this.options.normalizePositions) {
      features.push(
        this.normalizePosition(playerPos.x, 'x'),
        this.normalizePosition(playerPos.y, 'y'),
        this.normalizePosition(opponentPos.x, 'x'),
        this.normalizePosition(opponentPos.y, 'y')
      );
    } else {
      features.push(
        playerPos.x,
        playerPos.y,
        opponentPos.x,
        opponentPos.y
      );
    }

    // Angle features (normalized to [-1, 1])
    if (this.options.normalizeAngles) {
      features.push(
        this.normalizeAngle(gameState.playerSaberAngle),
        this.normalizeAngle(gameState.opponentSaberAngle)
      );
    } else {
      features.push(
        gameState.playerSaberAngle,
        gameState.opponentSaberAngle
      );
    }

    // Angular velocity features
    if (this.options.includeVelocity) {
      features.push(
        this.normalizeAngularVelocity(gameState.playerSaberAngularVelocity),
        this.normalizeAngularVelocity(gameState.opponentSaberAngularVelocity)
      );
    }

    // Distance features
    if (this.options.includeDistance) {
      const distance = playerPos.distance(opponentPos);
      features.push(this.normalizeDistance(distance));
    }

    // Vector2 doesn't need disposal

    return features;
  }

  /**
   * Normalize position to [-1, 1] range
   * @param {number} position - Position value
   * @param {string} axis - 'x' or 'y' axis
   * @returns {number} Normalized position
   */
  normalizePosition(position, axis) {
    const halfArena = this.arenaSize / 2;
    return (position - halfArena) / halfArena;
  }

  /**
   * Normalize angle to [-1, 1] range
   * @param {number} angle - Angle in radians
   * @returns {number} Normalized angle
   */
  normalizeAngle(angle) {
    // Normalize to [0, 2π] first
    const normalizedAngle = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    // Convert to [-1, 1]
    return (normalizedAngle / Math.PI) - 1;
  }

  /**
   * Normalize angular velocity
   * @param {number} angularVelocity - Angular velocity
   * @returns {number} Normalized angular velocity
   */
  normalizeAngularVelocity(angularVelocity) {
    // Assume max angular velocity is 2π rad/s (1 rotation per second)
    const maxAngularVelocity = 2 * Math.PI;
    return Math.tanh(angularVelocity / maxAngularVelocity);
  }

  /**
   * Calculate distance between two positions
   * @param {Array} pos1 - First position [x, y]
   * @param {Array} pos2 - Second position [x, y]
   * @returns {number} Distance
   */
  calculateDistance(pos1, pos2) {
    const dx = pos1[0] - pos2[0];
    const dy = pos1[1] - pos2[1];
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Normalize distance to [0, 1] range
   * @param {number} distance - Distance value
   * @returns {number} Normalized distance
   */
  normalizeDistance(distance) {
    return Math.min(distance / this.maxDistance, 1.0);
  }

  /**
   * Get default state when no game state is available
   * @returns {Array} Default feature array
   */
  getDefaultState() {
    const featureCount = this.getFeatureCount();
    return new Array(featureCount).fill(0);
  }

  /**
   * Get the number of features this processor outputs
   * @returns {number} Feature count
   */
  getFeatureCount() {
    let count = 0;
    
    if (this.options.normalizePositions) {
      count += 4; // player x,y, opponent x,y
    } else {
      count += 4;
    }
    
    if (this.options.normalizeAngles) {
      count += 2; // player angle, opponent angle
    } else {
      count += 2;
    }
    
    if (this.options.includeVelocity) {
      count += 2; // player angular velocity, opponent angular velocity
    }
    
    if (this.options.includeDistance) {
      count += 1; // distance between players
    }
    
    return count;
  }

  /**
   * Process batch of states
   * @param {Array} gameStates - Array of game state objects
   * @returns {tf.Tensor} Batch of processed states
   */
  processBatch(gameStates) {
    const processedStates = gameStates.map(state => this.processState(state));
    return tf.tensor2d(processedStates);
  }

  /**
   * Create state from game entities
   * @param {Object} player - Player entity
   * @param {Object} opponent - Opponent entity
   * @returns {Object} Game state object
   */
  createStateFromEntities(player, opponent) {
    if (!player || !opponent) {
      return null;
    }

    return {
      playerPosition: player.getPosition(), // Returns Vector2
      opponentPosition: opponent.getPosition(), // Returns Vector2
      playerSaberAngle: player.getSaber().getAngle(),
      playerSaberAngularVelocity: player.getSaber().getRotationSpeed(), // Use rotationSpeed
      opponentSaberAngle: opponent.getSaber().getAngle(),
      opponentSaberAngularVelocity: opponent.getSaber().getRotationSpeed(),
      timestamp: Date.now()
    };
  }

  /**
   * Add engineered features to state
   * @param {Array} baseFeatures - Base processed features
   * @param {Object} gameState - Original game state
   * @returns {Array} Enhanced features
   */
  addEngineeredFeatures(baseFeatures, gameState) {
    const enhanced = [...baseFeatures];

    if (gameState) {
      // Extract positions as Vector2
      const playerPos = gameState.playerPosition instanceof Vector2 
        ? gameState.playerPosition 
        : new Vector2(gameState.playerPosition[0] || 0, gameState.playerPosition[1] || 0);
      const opponentPos = gameState.opponentPosition instanceof Vector2
        ? gameState.opponentPosition
        : new Vector2(gameState.opponentPosition[0] || 0, gameState.opponentPosition[1] || 0);
      
      // Relative position features
      const relativeX = opponentPos.x - playerPos.x;
      const relativeY = opponentPos.y - playerPos.y;
      
      enhanced.push(
        this.normalizePosition(relativeX, 'x'),
        this.normalizePosition(relativeY, 'y')
      );

      // Angle difference
      const angleDiff = gameState.opponentSaberAngle - gameState.playerSaberAngle;
      enhanced.push(this.normalizeAngle(angleDiff));

      // Saber tip positions (for collision prediction)
      const playerSaberTip = this.calculateSaberTip(
        playerPos,
        gameState.playerSaberAngle
      );
      const opponentSaberTip = this.calculateSaberTip(
        opponentPos,
        gameState.opponentSaberAngle
      );

      const saberTipDistance = playerSaberTip.distance(opponentSaberTip);
      enhanced.push(this.normalizeDistance(saberTipDistance));
    }

    return enhanced;
  }

  /**
   * Calculate saber tip position
   * @param {Vector2|Array} position - Player position (Vector2 or [x, y])
   * @param {number} angle - Saber angle
   * @returns {Vector2} Saber tip position
   */
  calculateSaberTip(position, angle) {
    const saberLength = GameConfig.saber.length;
    const pos = position instanceof Vector2 
      ? position 
      : new Vector2(position[0] || 0, position[1] || 0);
    return new Vector2(
      pos.x + Math.cos(angle) * saberLength,
      pos.y + Math.sin(angle) * saberLength
    );
  }

  /**
   * Get state statistics for monitoring
   * @param {Array} states - Array of processed states
   * @returns {Object} State statistics
   */
  getStateStatistics(states) {
    if (states.length === 0) {
      return { mean: 0, std: 0, min: 0, max: 0 };
    }

    const flatStates = states.flat();
    const mean = flatStates.reduce((sum, val) => sum + val, 0) / flatStates.length;
    const variance = flatStates.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / flatStates.length;
    const std = Math.sqrt(variance);
    const min = Math.min(...flatStates);
    const max = Math.max(...flatStates);

    return { mean, std, min, max };
  }

  /**
   * Dispose of processor resources
   */
  dispose() {
    // No resources to dispose
  }
}
