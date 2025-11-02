/**
 * CollisionSystem - Handles collision detection and resolution
 * Manages saber-to-player collisions, boundary collisions, and game outcomes
 */

import { GameConfig } from '../../config/config.js';
import { Vector2 } from '../../utils/Vector2.js';

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
    const intersects = this.lineCircleIntersection(
      saberEndpoints.base.x, saberEndpoints.base.y,
      saberEndpoints.tip.x, saberEndpoints.tip.y,
      victimPos.x, victimPos.y,
      victimRadius + this.saberCollisionTolerance
    );
    
    if (intersects) {
      // Calculate collision point (closest point on line to circle center)
      const collisionPoint = this.calculateLineCircleCollisionPoint(
        saberEndpoints.base, saberEndpoints.tip, victimPos
      );
      
      // Calculate distance
      const distanceValue = collisionPoint.distance(victimPos);
      
      return {
        point: collisionPoint,
        distance: distanceValue
      };
    }
    
    return null;
  }

  /**
   * Calculate the collision point between a line and a circle
   * @param {Vector2} lineStart - Line start point
   * @param {Vector2} lineEnd - Line end point
   * @param {Vector2} circleCenter - Circle center
   * @returns {Vector2} Collision point
   */
  calculateLineCircleCollisionPoint(lineStart, lineEnd, circleCenter) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    
    // Vector from line start to circle center
    const fx = circleCenter.x - lineStart.x;
    const fy = circleCenter.y - lineStart.y;
    
    // Project circle center onto line
    const lineLengthSquared = dx * dx + dy * dy;
    if (lineLengthSquared === 0) {
      return lineStart.clone();
    }
    
    const t = Math.max(0, Math.min(1, (fx * dx + fy * dy) / lineLengthSquared));
    
    // Find closest point on line to circle center
    return new Vector2(lineStart.x + t * dx, lineStart.y + t * dy);
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
      if (!this.arena.isPositionValidVector(position, radius)) {
        results.boundaryCollisions.push({
          entity: entity,
          position: position.clone(),
          timestamp: Date.now()
        });
        
        // Constrain entity to bounds
        const constrainedPos = this.arena.constrainPositionVector(position, radius);
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
   * @param {Vector2} pos1 - First circle position
   * @param {number} radius1 - First circle radius
   * @param {Vector2} pos2 - Second circle position
   * @param {number} radius2 - Second circle radius
   * @returns {boolean} True if circles are colliding
   */
  areCirclesColliding(pos1, radius1, pos2, radius2) {
    const dist = pos1.distance(pos2);
    return dist <= (radius1 + radius2);
  }

  /**
   * Check if a point is inside a circle
   * @param {Vector2} point - Point to check
   * @param {Vector2} circleCenter - Circle center
   * @param {number} radius - Circle radius
   * @returns {boolean} True if point is inside circle
   */
  isPointInCircle(point, circleCenter, radius) {
    return point.distance(circleCenter) <= radius;
  }

  /**
   * Check if a line segment intersects with a circle
   * @param {Vector2} lineStart - Line start point
   * @param {Vector2} lineEnd - Line end point
   * @param {Vector2} circleCenter - Circle center
   * @param {number} radius - Circle radius
   * @returns {boolean} True if line intersects circle
   */
  doesLineIntersectCircle(lineStart, lineEnd, circleCenter, radius) {
    const dx = circleCenter.x - lineStart.x;
    const dy = circleCenter.y - lineStart.y;
    const lx = lineEnd.x - lineStart.x;
    const ly = lineEnd.y - lineStart.y;
    
    const lineLengthSquared = lx * lx + ly * ly;
    if (lineLengthSquared === 0) {
      return Math.sqrt(dx * dx + dy * dy) <= radius;
    }
    
    const t = Math.max(0, Math.min(1, (dx * lx + dy * ly) / lineLengthSquared));
    const closestX = lineStart.x + t * lx;
    const closestY = lineStart.y + t * ly;
    
    const dist = Math.sqrt((closestX - circleCenter.x) ** 2 + (closestY - circleCenter.y) ** 2);
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
