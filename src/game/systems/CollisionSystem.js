/**
 * CollisionSystem - Handles collision detection and resolution
 * Manages saber-to-player collisions, boundary collisions, and game outcomes
 */

// TensorFlow.js is loaded from CDN as a global 'tf' object
import { GameConfig } from '../../config/config.js';

export class CollisionSystem {
  /**
   * Create a new CollisionSystem
   * @param {Object} arena - Arena object for boundary checking
   */
  constructor(arena) {
    this.arena = arena;
    this.collisionAccuracy = GameConfig.performance.collisionAccuracy;
    this.lastUpdateTime = 0;
    
    // Collision detection settings
    this.saberCollisionTolerance = 0.1; // Tolerance for saber collisions
    this.boundaryCollisionTolerance = 0.05; // Tolerance for boundary collisions
  }

  /**
   * Check for collisions between all game objects
   * @param {Array} players - Array of player objects
   * @param {Array} ais - Array of AI objects
   * @param {number} deltaTime - Time since last update
   * @returns {Object} Collision results
   */
  checkCollisions(players, ais, deltaTime) {
    const results = {
      saberCollisions: [],
      boundaryCollisions: [],
      gameOver: false,
      winner: null,
      tie: false
    };

    // Check saber-to-player collisions
    this.checkSaberCollisions(players, ais, results);
    
    // Check boundary collisions
    this.checkBoundaryCollisions(players, ais, results);
    
    // Determine game outcome
    this.determineGameOutcome(results);
    
    this.lastUpdateTime = Date.now();
    return results;
  }

  /**
   * Check for saber-to-player collisions
   * @param {Array} players - Array of player objects
   * @param {Array} ais - Array of AI objects
   * @param {Object} results - Collision results object to update
   */
  checkSaberCollisions(players, ais, results) {
    const allEntities = [...players, ...ais];
    
    for (let i = 0; i < allEntities.length; i++) {
      for (let j = 0; j < allEntities.length; j++) {
        if (i === j) continue; // Skip self-collision
        
        const entity1 = allEntities[i];
        const entity2 = allEntities[j];
        
        if (!entity1.isAlive || !entity2.isAlive) continue;
        
        // Check if entity1's saber is colliding with entity2
        const collision = this.checkSaberToEntityCollision(entity1, entity2);
        if (collision) {
          results.saberCollisions.push({
            attacker: entity1,
            victim: entity2,
            collisionPoint: collision.point,
            timestamp: Date.now()
          });
        }
      }
    }
  }

  /**
   * Check if a saber is colliding with an entity
   * @param {Object} attacker - Entity with the saber
   * @param {Object} victim - Entity being attacked
   * @returns {Object|null} Collision info or null if no collision
   */
  checkSaberToEntityCollision(attacker, victim) {
    if (!attacker.saber || !attacker.saber.isActive()) return null;
    
    const attackerPos = attacker.getPosition();
    const victimPos = victim.getPosition();
    const victimRadius = victim.getRadius();
    
    // Get saber endpoints
    const saberEndpoints = attacker.saber.getEndpoints(attackerPos);
    
    // Check if saber line segment intersects with victim circle
    const basePos = saberEndpoints.base.dataSync();
    const tipPos = saberEndpoints.tip.dataSync();
    const victimPosData = victimPos.dataSync();
    
    const intersects = this.lineCircleIntersection(
      basePos[0], basePos[1],
      tipPos[0], tipPos[1],
      victimPosData[0], victimPosData[1],
      victimRadius + this.saberCollisionTolerance
    );
    
    if (intersects) {
      // Calculate collision point (closest point on line to circle center)
      const collisionPoint = this.calculateLineCircleCollisionPoint(
        saberEndpoints.base, saberEndpoints.tip, victimPos
      );
      
      // Calculate distance using TensorFlow.js
      const distance = tf.norm(collisionPoint.sub(victimPos));
      const distanceValue = distance.dataSync()[0];
      distance.dispose();
      
      return {
        point: collisionPoint,
        distance: distanceValue
      };
    }
    
    return null;
  }

  /**
   * Calculate the collision point between a line and a circle
   * @param {tf.Tensor} lineStart - Line start point
   * @param {tf.Tensor} lineEnd - Line end point
   * @param {tf.Tensor} circleCenter - Circle center
   * @returns {tf.Tensor} Collision point
   */
  calculateLineCircleCollisionPoint(lineStart, lineEnd, circleCenter) {
    const start = lineStart.dataSync();
    const end = lineEnd.dataSync();
    const center = circleCenter.dataSync();
    
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    
    // Vector from line start to circle center
    const fx = center[0] - start[0];
    const fy = center[1] - start[1];
    
    // Project circle center onto line
    const lineLengthSquared = dx * dx + dy * dy;
    if (lineLengthSquared === 0) {
      return lineStart.clone();
    }
    
    const t = Math.max(0, Math.min(1, (fx * dx + fy * dy) / lineLengthSquared));
    
    // Find closest point on line to circle center
    return tf.tensor2d([[start[0] + t * dx, start[1] + t * dy]]);
  }

  /**
   * Check for boundary collisions
   * @param {Array} players - Array of player objects
   * @param {Array} ais - Array of AI objects
   * @param {Object} results - Collision results object to update
   */
  checkBoundaryCollisions(players, ais, results) {
    if (!this.arena) return;
    
    const allEntities = [...players, ...ais];
    
    for (const entity of allEntities) {
      if (!entity.isAlive) continue;
      
      const position = entity.getPosition();
      const radius = entity.getRadius();
      
      // Check if entity is outside arena bounds
      if (!this.arena.isPositionValidTensor(position, radius)) {
        results.boundaryCollisions.push({
          entity: entity,
          position: position.clone(),
          timestamp: Date.now()
        });
        
        // Constrain entity to bounds
        const constrainedPos = this.arena.constrainPositionTensor(position, radius);
        entity.setPosition(constrainedPos);
      }
    }
  }

  /**
   * Determine game outcome based on collisions
   * @param {Object} results - Collision results object to update
   */
  determineGameOutcome(results) {
    const saberCollisions = results.saberCollisions;
    
    if (saberCollisions.length === 0) {
      return; // No collisions, game continues
    }
    
    // Check for simultaneous collisions (tie game)
    if (saberCollisions.length > 1) {
      // Check if collisions happened at nearly the same time
      const timeThreshold = 100; // 100ms tolerance for simultaneous collisions
      const firstCollisionTime = saberCollisions[0].timestamp;
      
      const simultaneousCollisions = saberCollisions.filter(
        collision => Math.abs(collision.timestamp - firstCollisionTime) <= timeThreshold
      );
      
      if (simultaneousCollisions.length > 1) {
        results.tie = true;
        results.gameOver = true;
        return;
      }
    }
    
    // Single collision - determine winner
    const collision = saberCollisions[0];
    results.winner = collision.attacker;
    results.gameOver = true;
  }

  /**
   * Check if two circles are colliding
   * @param {tf.Tensor} pos1 - First circle position
   * @param {number} radius1 - First circle radius
   * @param {tf.Tensor} pos2 - Second circle position
   * @param {number} radius2 - Second circle radius
   * @returns {boolean} True if circles are colliding
   */
  areCirclesColliding(pos1, radius1, pos2, radius2) {
    const p1 = pos1.dataSync();
    const p2 = pos2.dataSync();
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist <= (radius1 + radius2);
  }

  /**
   * Check if a point is inside a circle
   * @param {tf.Tensor} point - Point to check
   * @param {tf.Tensor} circleCenter - Circle center
   * @param {number} radius - Circle radius
   * @returns {boolean} True if point is inside circle
   */
  isPointInCircle(point, circleCenter, radius) {
    const distance = tf.norm(point.sub(circleCenter));
    const result = distance.dataSync()[0] <= radius;
    distance.dispose();
    return result;
  }

  /**
   * Check if a line segment intersects with a circle
   * @param {tf.Tensor} lineStart - Line start point
   * @param {tf.Tensor} lineEnd - Line end point
   * @param {tf.Tensor} circleCenter - Circle center
   * @param {number} radius - Circle radius
   * @returns {boolean} True if line intersects circle
   */
  doesLineIntersectCircle(lineStart, lineEnd, circleCenter, radius) {
    const start = lineStart.dataSync();
    const end = lineEnd.dataSync();
    const center = circleCenter.dataSync();
    
    const dx = center[0] - start[0];
    const dy = center[1] - start[1];
    const lx = end[0] - start[0];
    const ly = end[1] - start[1];
    
    const lineLengthSquared = lx * lx + ly * ly;
    if (lineLengthSquared === 0) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      return dist <= radius;
    }
    
    const t = Math.max(0, Math.min(1, (dx * lx + dy * ly) / lineLengthSquared));
    const closestX = start[0] + t * lx;
    const closestY = start[1] + t * ly;
    
    const dist = Math.sqrt((closestX - center[0]) ** 2 + (closestY - center[1]) ** 2);
    return dist <= radius;
  }

  /**
   * Set arena for boundary checking
   * @param {Object} arena - Arena object
   */
  setArena(arena) {
    this.arena = arena;
  }

  /**
   * Get collision accuracy
   * @returns {number} Collision accuracy (0-1)
   */
  getCollisionAccuracy() {
    return this.collisionAccuracy;
  }

  /**
   * Set collision accuracy
   * @param {number} accuracy - Collision accuracy (0-1)
   */
  setCollisionAccuracy(accuracy) {
    if (accuracy < 0 || accuracy > 1) {
      throw new Error('Collision accuracy must be between 0 and 1');
    }
    this.collisionAccuracy = accuracy;
  }

  /**
   * Get saber collision tolerance
   * @returns {number} Saber collision tolerance
   */
  getSaberCollisionTolerance() {
    return this.saberCollisionTolerance;
  }

  /**
   * Set saber collision tolerance
   * @param {number} tolerance - New tolerance value
   */
  setSaberCollisionTolerance(tolerance) {
    if (tolerance < 0) {
      throw new Error('Collision tolerance cannot be negative');
    }
    this.saberCollisionTolerance = tolerance;
  }

  /**
   * Get boundary collision tolerance
   * @returns {number} Boundary collision tolerance
   */
  getBoundaryCollisionTolerance() {
    return this.boundaryCollisionTolerance;
  }

  /**
   * Set boundary collision tolerance
   * @param {number} tolerance - New tolerance value
   */
  setBoundaryCollisionTolerance(tolerance) {
    if (tolerance < 0) {
      throw new Error('Collision tolerance cannot be negative');
    }
    this.boundaryCollisionTolerance = tolerance;
  }

  /**
   * Get collision system state for serialization
   * @returns {Object} Collision system state
   */
  getState() {
    return {
      collisionAccuracy: this.collisionAccuracy,
      saberCollisionTolerance: this.saberCollisionTolerance,
      boundaryCollisionTolerance: this.boundaryCollisionTolerance,
      lastUpdateTime: this.lastUpdateTime,
      arenaId: this.arena ? this.arena.id : null
    };
  }

  /**
   * Set collision system state from serialization
   * @param {Object} state - Collision system state
   */
  setState(state) {
    this.collisionAccuracy = state.collisionAccuracy;
    this.saberCollisionTolerance = state.saberCollisionTolerance;
    this.boundaryCollisionTolerance = state.boundaryCollisionTolerance;
    this.lastUpdateTime = state.lastUpdateTime;
    // Note: Arena reference would need to be restored separately
  }

  /**
   * Update collision system (called each frame)
   * @param {number} deltaTime - Time since last update
   */
  update(deltaTime) {
    // Update any system-level state if needed
    this.lastUpdateTime = Date.now();
  }

  /**
   * Check if a line segment intersects with a circle
   * @param {number} x1 - Line start X
   * @param {number} y1 - Line start Y
   * @param {number} x2 - Line end X
   * @param {number} y2 - Line end Y
   * @param {number} cx - Circle center X
   * @param {number} cy - Circle center Y
   * @param {number} r - Circle radius
   * @returns {boolean} True if line intersects circle
   */
  lineCircleIntersection(x1, y1, x2, y2, cx, cy, r) {
    // Vector from line start to end
    const dx = x2 - x1;
    const dy = y2 - y1;
    
    // Vector from line start to circle center
    const fx = cx - x1;
    const fy = cy - y1;
    
    // Project circle center onto line
    const lineLengthSquared = dx * dx + dy * dy;
    if (lineLengthSquared === 0) {
      // Line is a point, check if it's inside circle
      return fx * fx + fy * fy <= r * r;
    }
    
    const t = Math.max(0, Math.min(1, (fx * dx + fy * dy) / lineLengthSquared));
    
    // Closest point on line to circle center
    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;
    
    // Distance from closest point to circle center
    const distanceSquared = (closestX - cx) * (closestX - cx) + (closestY - cy) * (closestY - cy);
    
    return distanceSquared <= r * r;
  }

  /**
   * Get string representation
   * @returns {string} String representation
   */
  toString() {
    return `CollisionSystem(accuracy: ${this.collisionAccuracy}, arena: ${this.arena ? this.arena.id : 'none'})`;
  }
}
