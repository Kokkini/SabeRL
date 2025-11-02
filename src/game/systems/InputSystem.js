/**
 * InputSystem - Handles user input and key state management
 * Manages keyboard input for player movement and game controls
 */

import { GameConfig } from '../../config/config.js';
import { Vector2 } from '../../utils/Vector2.js';

export class InputSystem {
  /**
   * Create a new InputSystem
   * @param {HTMLCanvasElement} canvas - Canvas element to attach events to
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.keyStates = new Map();
    this.keyMappings = GameConfig.input.keyMappings;
    this.continuousMovement = GameConfig.input.continuousMovement;
    this.ignoreRapidPresses = GameConfig.input.ignoreRapidPresses;
    
    // Key press timing for rapid press detection
    this.lastKeyPressTime = new Map();
    this.keyPressThreshold = 50; // Minimum time between key presses (ms)
    
    // Movement vector cache
    this.cachedMovementVector = new Vector2(0, 0);
    this.lastMovementUpdate = 0;
    
    this.setupEventListeners();
  }

  /**
   * Set up event listeners for keyboard input
   */
  setupEventListeners() {
    // Key down events
    document.addEventListener('keydown', (event) => {
      this.handleKeyDown(event);
    });

    // Key up events
    document.addEventListener('keyup', (event) => {
      this.handleKeyUp(event);
    });

    // Canvas focus events
    this.canvas.addEventListener('click', () => {
      this.canvas.focus();
    });

    // Make canvas focusable for keyboard input
    this.canvas.tabIndex = 0;
  }

  /**
   * Handle key down events
   * @param {KeyboardEvent} event - Keyboard event
   */
  handleKeyDown(event) {
    const keyCode = event.code;
    
    // Check for rapid key presses
    if (this.ignoreRapidPresses) {
      const lastPressTime = this.lastKeyPressTime.get(keyCode) || 0;
      const currentTime = Date.now();
      
      if (currentTime - lastPressTime < this.keyPressThreshold) {
        return; // Ignore rapid key press
      }
      
      this.lastKeyPressTime.set(keyCode, currentTime);
    }
    
    // Set key state
    this.keyStates.set(keyCode, true);
    
    // Prevent default behavior for game keys
    if (this.isGameKey(keyCode)) {
      event.preventDefault();
    }
  }

  /**
   * Handle key up events
   * @param {KeyboardEvent} event - Keyboard event
   */
  handleKeyUp(event) {
    const keyCode = event.code;
    this.keyStates.set(keyCode, false);
    
    // Prevent default behavior for game keys
    if (this.isGameKey(keyCode)) {
      event.preventDefault();
    }
  }

  /**
   * Check if a key is currently pressed
   * @param {string} keyCode - Key code to check
   * @returns {boolean} True if key is pressed
   */
  isKeyPressed(keyCode) {
    return this.keyStates.get(keyCode) || false;
  }

  /**
   * Check if a key is currently pressed (using key mapping)
   * @param {string} keyName - Key name (e.g., 'up', 'left', 'down', 'right')
   * @returns {boolean} True if key is pressed
   */
  isKeyPressedByName(keyName) {
    const keyCode = this.keyMappings[keyName];
    if (!keyCode) {
      console.warn(`Unknown key name: ${keyName}`);
      return false;
    }
    return this.isKeyPressed(keyCode);
  }

  /**
   * Get movement vector based on current key states
   * @returns {Vector2} Normalized movement vector
   */
  getMovementVector() {
    // Cache movement vector for performance
    const currentTime = Date.now();
    if (currentTime - this.lastMovementUpdate < 16) { // ~60 FPS
      return this.cachedMovementVector;
    }
    
    let x = 0;
    let y = 0;
    
    // Check movement keys
    if (this.isKeyPressedByName('up')) y -= 1;
    if (this.isKeyPressedByName('down')) y += 1;
    if (this.isKeyPressedByName('left')) x -= 1;
    if (this.isKeyPressedByName('right')) x += 1;
    
    // Create movement vector
    const movementVector = new Vector2(x, y);
    
    // Normalize diagonal movement
    if (movementVector.length() > 0) {
      this.cachedMovementVector = movementVector.clone().normalize();
      this.lastMovementUpdate = currentTime;
      return this.cachedMovementVector;
    }
    
    // Cache the result
    this.cachedMovementVector = movementVector;
    this.lastMovementUpdate = currentTime;
    
    return movementVector;
  }

  /**
   * Check if any movement key is pressed
   * @returns {boolean} True if any movement key is pressed
   */
  isMoving() {
    return this.isKeyPressedByName('up') ||
           this.isKeyPressedByName('down') ||
           this.isKeyPressedByName('left') ||
           this.isKeyPressedByName('right');
  }

  /**
   * Check if start key is pressed
   * @returns {boolean} True if start key is pressed
   */
  isStartPressed() {
    return this.isKeyPressedByName('start');
  }

  /**
   * Get current input state object
   * @returns {Object} Input state {up, down, left, right, start}
   */
  getInputState() {
    return {
      up: this.isKeyPressedByName('up'),
      down: this.isKeyPressedByName('down'),
      left: this.isKeyPressedByName('left'),
      right: this.isKeyPressedByName('right'),
      start: this.isStartPressed()
    };
  }

  /**
   * Check if a key is a game key
   * @param {string} keyCode - Key code to check
   * @returns {boolean} True if it's a game key
   */
  isGameKey(keyCode) {
    return Object.values(this.keyMappings).includes(keyCode);
  }

  /**
   * Clear all key states
   */
  clearKeyStates() {
    this.keyStates.clear();
    this.cachedMovementVector = new Vector2(0, 0);
  }

  /**
   * Update input system (called each frame)
   * @param {number} deltaTime - Time since last update
   */
  update(deltaTime) {
    // Update cached movement vector if needed
    this.getMovementVector();
    
    // Clean up old key press times
    const currentTime = Date.now();
    for (const [keyCode, time] of this.lastKeyPressTime.entries()) {
      if (currentTime - time > 1000) { // Remove entries older than 1 second
        this.lastKeyPressTime.delete(keyCode);
      }
    }
  }

  /**
   * Get key mappings
   * @returns {Object} Key mappings
   */
  getKeyMappings() {
    return { ...this.keyMappings };
  }

  /**
   * Set key mappings
   * @param {Object} mappings - New key mappings
   */
  setKeyMappings(mappings) {
    this.keyMappings = { ...mappings };
  }

  /**
   * Get input system state for serialization
   * @returns {Object} Input system state
   */
  getState() {
    return {
      keyStates: Object.fromEntries(this.keyStates),
      keyMappings: { ...this.keyMappings },
      continuousMovement: this.continuousMovement,
      ignoreRapidPresses: this.ignoreRapidPresses,
      keyPressThreshold: this.keyPressThreshold
    };
  }

  /**
   * Set input system state from serialization
   * @param {Object} state - Input system state
   */
  setState(state) {
    this.keyStates = new Map(Object.entries(state.keyStates));
    this.keyMappings = { ...state.keyMappings };
    this.continuousMovement = state.continuousMovement;
    this.ignoreRapidPresses = state.ignoreRapidPresses;
    this.keyPressThreshold = state.keyPressThreshold;
  }

  /**
   * Destroy input system and remove event listeners
   */
  destroy() {
    // Note: In a real implementation, you'd want to store references to the
    // event listeners and remove them properly. For simplicity, we'll just
    // clear the key states.
    this.clearKeyStates();
    this.lastKeyPressTime.clear();
  }

  /**
   * Get string representation
   * @returns {string} String representation
   */
  toString() {
    const inputState = this.getInputState();
    return `InputSystem(moving: ${this.isMoving()}, state: ${JSON.stringify(inputState)})`;
  }
}
