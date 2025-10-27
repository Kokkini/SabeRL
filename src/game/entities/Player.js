/**
 * Player Entity - Human-controlled game character
 * Represents the human player in the arena combat game
 * Now supports both human and AI control modes
 */

// TensorFlow.js is loaded from CDN as a global 'tf' object
import { Saber } from './Saber.js';
import { GameConfig } from '../../config/config.js';
import { PolicyAgent } from '../../rl/agents/PolicyAgent.js';
import { GameState } from '../../rl/entities/GameState.js';

export class Player {
  /**
   * Create a new Player
   * @param {string} id - Unique identifier
   * @param {tf.Tensor} position - Initial position
   */
  constructor(id, position) {
    this.id = id;
    this.position = position || tf.tensor2d([[0, 0]]);
    this.velocity = tf.tensor2d([[0, 0]]);
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
    this.velocity = movementVector.mul(this.movementSpeed);
    
    // Update position
    this.position = this.position.add(this.velocity.mul(deltaTime));
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
    this.velocity = movementVector.mul(this.movementSpeed);
    
    // Update position
    this.position = this.position.add(this.velocity.mul(deltaTime));
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
    
    // Set input based on decision
    switch (decision.action) {
      case 'W':
        this.inputState.up = true;
        break;
      case 'A':
        this.inputState.left = true;
        break;
      case 'S':
        this.inputState.down = true;
        break;
      case 'D':
        this.inputState.right = true;
        break;
    }
  }

  /**
   * Calculate movement vector from input state
   * @returns {tf.Tensor} Normalized movement vector
   */
  calculateMovementVector() {
    let x = 0;
    let y = 0;
    
    if (this.inputState.up) y -= 1;
    if (this.inputState.down) y += 1;
    if (this.inputState.left) x -= 1;
    if (this.inputState.right) x += 1;
    
    const movementVector = tf.tensor2d([[x, y]]);
    
    // Normalize diagonal movement
    const magnitude = tf.norm(movementVector);
    if (magnitude.dataSync()[0] > 0) {
      return movementVector.div(magnitude);
    }
    
    return tf.tensor2d([[0, 0]]);
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
    this.velocity.dispose();
    this.velocity = tf.tensor2d([[0, 0]]);
    this.saber.setActive(false);
  }

  /**
   * Resurrect the player
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
    const magnitude = tf.norm(this.velocity);
    if (magnitude.dataSync()[0] > 0) {
      const normalized = this.velocity.div(magnitude);
      magnitude.dispose();
      return normalized;
    }
    magnitude.dispose();
    return tf.tensor2d([[0, 0]]);
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
   * Get player state for serialization
   * @returns {Object} Player state
   */
  getState() {
    const pos = this.position.dataSync();
    const vel = this.velocity.dataSync();
    return {
      id: this.id,
      position: { x: pos[0], y: pos[1] },
      velocity: { x: vel[0], y: vel[1] },
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
    this.position.dispose();
    this.position = tf.tensor2d([[state.position.x, state.position.y]]);
    this.velocity.dispose();
    this.velocity = tf.tensor2d([[state.velocity.x, state.velocity.y]]);
    this.isAlive = state.isAlive;
    this.saber.setState(state.saber);
    this.inputState = { ...state.inputState };
  }

  /**
   * Set control mode
   * @param {string} mode - Control mode ('human' or 'ai')
   * @param {PolicyAgent} policyAgent - Policy agent for AI mode
   */
  setControlMode(mode, policyAgent = null) {
    if (mode !== 'human' && mode !== 'ai') {
      throw new Error(`Invalid control mode: ${mode}. Must be 'human' or 'ai'`);
    }
    
    this.controlMode = mode;
    
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
    const pos = this.position.dataSync();
    return `Player(${this.id}, pos: (${pos[0].toFixed(2)}, ${pos[1].toFixed(2)}), alive: ${this.isAlive}, mode: ${this.controlMode})`;
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this.position.dispose();
    this.velocity.dispose();
    
    if (this.policyAgent) {
      this.policyAgent.dispose();
    }
  }
}
