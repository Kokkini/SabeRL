/**
 * Player Entity - Human-controlled game character
 * Represents the human player in the arena combat game
 * Now supports both human and AI control modes
 */

import { Saber } from './Saber.js';
import { GameConfig } from '../../config/config.js';
import { PolicyAgent } from '../../rl/agents/PolicyAgent.js';
import { GameState } from '../../rl/entities/GameState.js';
import { Vector2 } from '../../utils/Vector2.js';

export class Player {
  /**
   * Create a new Player
   * @param {string} id - Unique identifier
   * @param {Vector2} position - Initial position
   */
  constructor(id, position) {
    this.id = id;
    this.position = position || new Vector2(0, 0);
    this.velocity = new Vector2(0, 0);
    this.radius = GameConfig.player.radius;
    this.color = GameConfig.player.color;
    this.isAlive = true;
    this.inputState = {
      up: false,
      left: false,
      down: false,
      right: false
    };
    
    // Control mode
    this.controlMode = 'human'; // 'human' or 'ai'
    this.policyAgent = null;
    this.currentDecision = null;
    this.decisionFrameCount = 0;
    
    // Create saber for this player
    this.saber = new Saber(`${id}-saber`, id, GameConfig.saber.length);
    
    // Movement state
    this.movementSpeed = GameConfig.player.movementSpeed;
    this.lastUpdateTime = 0;
    this.desiredActionMask = [false, false, false, false];
  }

  /**
   * Update player state
   * @param {Object} inputSystem - Input system to get key states
   * @param {number} deltaTime - Time since last update in seconds
   * @param {Object} gameState - Game state for AI decisions
   */
  update(inputSystem, deltaTime, gameState = null) {
    if (!this.isAlive) return;

    if (this.controlMode === 'ai' && this.policyAgent) {
      this.updateAI(inputSystem, deltaTime, gameState);
    } else {
      this.updateHuman(inputSystem, deltaTime);
    }
    
    // Update saber
    this.saber.update(deltaTime);
    
    this.lastUpdateTime = Date.now();
  }

  setDesiredActionMask(mask) {
    if (Array.isArray(mask) && mask.length === 4) {
      this.desiredActionMask = mask.map(v => !!v);
      // Optionally sync inputState so existing systems using inputState still work
      this.inputState.up = !!this.desiredActionMask[0];
      this.inputState.left = !!this.desiredActionMask[1];
      this.inputState.down = !!this.desiredActionMask[2];
      this.inputState.right = !!this.desiredActionMask[3];
    }
  }

  toObservation() {
    return {
      id: this.id,
      x: this.position?.x ?? 0,
      y: this.position?.y ?? 0,
      vx: this.velocity?.x ?? 0,
      vy: this.velocity?.y ?? 0,
      isAlive: !!this.isAlive
    };
  }

  /**
   * Update human control mode
   * @param {Object} inputSystem - Input system to get key states
   * @param {number} deltaTime - Time since last update in seconds
   */
  updateHuman(inputSystem, deltaTime) {
    // Update input state
    this.updateInputState(inputSystem);
    
    // Calculate movement vector
    const movementVector = this.calculateMovementVector();
    
    // Update velocity
    this.velocity = movementVector.clone().multiplyScalar(this.movementSpeed);
    
    // Update position
    this.position.add(this.velocity.clone().multiplyScalar(deltaTime));
  }

  /**
   * Update AI control mode
   * @param {Object} inputSystem - Input system to get key states
   * @param {number} deltaTime - Time since last update in seconds
   * @param {Object} gameState - Game state for AI decisions
   */
  updateAI(inputSystem, deltaTime, gameState) {
    if (!this.policyAgent || !gameState) return;

    // Make AI decision
    const decision = this.policyAgent.makeDecision(gameState);
    this.currentDecision = decision;
    
    // Convert decision to input state
    this.convertDecisionToInputState(decision);
    
    // Calculate movement vector
    const movementVector = this.calculateMovementVector();
    
    // Update velocity
    this.velocity = movementVector.clone().multiplyScalar(this.movementSpeed);
    
    // Update position
    this.position.add(this.velocity.clone().multiplyScalar(deltaTime));
  }

  /**
   * Update input state from input system
   * @param {Object} inputSystem - Input system
   */
  updateInputState(inputSystem) {
    if (!inputSystem) return;
    
    this.inputState.up = inputSystem.isKeyPressed('KeyW');
    this.inputState.left = inputSystem.isKeyPressed('KeyA');
    this.inputState.down = inputSystem.isKeyPressed('KeyS');
    this.inputState.right = inputSystem.isKeyPressed('KeyD');
  }

  /**
   * Convert AI decision to input state
   * @param {Object} decision - AI movement decision
   */
  convertDecisionToInputState(decision) {
    // Reset input state
    this.inputState.up = false;
    this.inputState.left = false;
    this.inputState.down = false;
    this.inputState.right = false;
    
    // Use multi-binary action mask (expected)
    if (decision && decision.actionMask && decision.actionMask.length === 4) {
      this.inputState.up = !!decision.actionMask[0];
      this.inputState.left = !!decision.actionMask[1];
      this.inputState.down = !!decision.actionMask[2];
      this.inputState.right = !!decision.actionMask[3];
      return;
    }
  }

  /**
   * Apply action by index (for rollout-based training)
   * @param {number} actionIndex - Action index (0=W, 1=A, 2=S, 3=D)
   */
  applyActionByIndex(actionIndex) {
    // Reset input state
    this.inputState.up = false;
    this.inputState.left = false;
    this.inputState.down = false;
    this.inputState.right = false;
    
    // Set input based on action index
    switch (actionIndex) {
      case 0: // W
        this.inputState.up = true;
        break;
      case 1: // A
        this.inputState.left = true;
        break;
      case 2: // S
        this.inputState.down = true;
        break;
      case 3: // D
        this.inputState.right = true;
        break;
      default:
        // No action (stay still)
        break;
    }
    
    // Calculate movement vector and update velocity
    const movementVector = this.calculateMovementVector();
    this.velocity = movementVector.clone().multiplyScalar(this.movementSpeed);
  }

  /**
   * Apply action by mask (for multi-binary actions)
   * @param {Array<boolean|number>} actionMask - [W,A,S,D] booleans/0-1
   */
  applyActionMask(actionMask) {
    // Reset input state
    this.inputState.up = false;
    this.inputState.left = false;
    this.inputState.down = false;
    this.inputState.right = false;
    
    if (Array.isArray(actionMask) && actionMask.length === 4) {
      this.inputState.up = !!actionMask[0];
      this.inputState.left = !!actionMask[1];
      this.inputState.down = !!actionMask[2];
      this.inputState.right = !!actionMask[3];
    }
    
    // Calculate movement vector and update velocity
    const movementVector = this.calculateMovementVector();
    this.velocity = movementVector.clone().multiplyScalar(this.movementSpeed);
  }

  /**
   * Calculate movement vector from input state
   * @returns {Vector2} Normalized movement vector
   */
  calculateMovementVector() {
    let x = 0;
    let y = 0;
    
    if (this.inputState.up) y -= 1;
    if (this.inputState.down) y += 1;
    if (this.inputState.left) x -= 1;
    if (this.inputState.right) x += 1;
    
    const movementVector = new Vector2(x, y);
    
    // Normalize diagonal movement
    if (movementVector.length() > 0) {
      return movementVector.clone().normalize();
    }
    
    return new Vector2(0, 0);
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
   * @returns {Saber} Player's saber
   */
  getSaber() {
    return this.saber;
  }

  /**
   * Check if player is alive
   * @returns {boolean} True if alive
   */
  isAlive() {
    return this.isAlive;
  }

  /**
   * Kill the player
   */
  kill() {
    this.isAlive = false;
    this.velocity = new Vector2(0, 0);
    this.saber.setActive(false);
  }

  /**
   * Resurrect the player
   * @param {Vector2} position - New position
   */
  resurrect(position) {
    this.isAlive = true;
    this.position = position.clone();
    this.velocity = new Vector2(0, 0);
    this.saber.setActive(true);
    this.saber.setAngle(0); // Reset saber angle
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
   * @returns {string} Player color
   */
  getColor() {
    return this.color;
  }

  /**
   * Check if player is moving
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
    if (this.velocity.length() > 0) {
      return this.velocity.clone().normalize();
    }
    return new Vector2(0, 0);
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
   * Get player state for serialization
   * @returns {Object} Player state
   */
  getState() {
    return {
      id: this.id,
      position: { x: this.position.x, y: this.position.y },
      velocity: { x: this.velocity.x, y: this.velocity.y },
      isAlive: this.isAlive,
      saber: this.saber.getState(),
      inputState: { ...this.inputState }
    };
  }

  /**
   * Set player state from serialization
   * @param {Object} state - Player state
   */
  setState(state) {
    this.id = state.id;
    this.position = new Vector2(state.position.x, state.position.y);
    this.velocity = new Vector2(state.velocity.x, state.velocity.y);
    this.isAlive = state.isAlive;
    this.saber.setState(state.saber);
    this.inputState = { ...state.inputState };
  }

  /**
   * Set control mode
   * @param {string} mode - Control mode ('human' or 'ai')
   * @param {PolicyAgent} policyAgent - Policy agent for AI mode
   * @param {boolean} isSharedAgent - Whether this is a shared agent (don't dispose)
   */
  setControlMode(mode, policyAgent = null, isSharedAgent = false) {
    if (mode !== 'human' && mode !== 'ai') {
      throw new Error(`Invalid control mode: ${mode}. Must be 'human' or 'ai'`);
    }
    
    this.controlMode = mode;
    this.isSharedAgent = isSharedAgent;
    
    if (mode === 'ai') {
      if (!policyAgent) {
        throw new Error('Policy agent is required for AI control mode');
      }
      this.policyAgent = policyAgent;
      this.policyAgent.activate();
    } else {
      if (this.policyAgent) {
        this.policyAgent.deactivate();
      }
      this.policyAgent = null;
      this.currentDecision = null;
      this.decisionFrameCount = 0;
    }
    
    console.log(`Player ${this.id} control mode set to: ${mode}`);
  }

  /**
   * Get control mode
   * @returns {string} Current control mode
   */
  getControlMode() {
    return this.controlMode;
  }

  /**
   * Check if player is AI controlled
   * @returns {boolean} True if AI controlled
   */
  isAIControlled() {
    return this.controlMode === 'ai';
  }

  /**
   * Get current AI decision
   * @returns {Object} Current AI decision
   */
  getCurrentDecision() {
    return this.currentDecision;
  }

  /**
   * Set policy agent
   * @param {PolicyAgent} policyAgent - Policy agent
   */
  setPolicyAgent(policyAgent) {
    if (this.controlMode === 'ai' && this.policyAgent) {
      this.policyAgent.deactivate();
    }
    
    this.policyAgent = policyAgent;
    
    if (this.controlMode === 'ai' && policyAgent) {
      policyAgent.activate();
    }
  }

  /**
   * Get policy agent
   * @returns {PolicyAgent} Policy agent
   */
  getPolicyAgent() {
    return this.policyAgent;
  }

  /**
   * Get string representation
   * @returns {string} String representation
   */
  toString() {
    return `Player(${this.id}, pos: (${this.position.x.toFixed(2)}, ${this.position.y.toFixed(2)}), alive: ${this.isAlive}, mode: ${this.controlMode})`;
  }

  /**
   * Dispose of resources
   */
  dispose() {
    // Vector2 doesn't need disposal, but policy agent might
    // Only dispose of policy agent if it's not shared
    if (this.policyAgent && !this.isSharedAgent) {
      this.policyAgent.dispose();
    }
  }
}
