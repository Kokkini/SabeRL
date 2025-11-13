/**
 * HumanController - Controller for human player input via keyboard
 * Implements PlayerController interface from RL library
 * 
 * @implements {PlayerController} - Implements the PlayerController interface from src/MimicRL/controllers/PlayerController.ts
 */
export class HumanController {
  constructor(id = 'human', bindings = { up: 'KeyW', left: 'KeyA', down: 'KeyS', right: 'KeyD' }) {
    this.id = id;
    this.bindings = bindings;
    this.keyState = new Map();

    // Bind keyboard listeners (no-ops in headless)
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        this.keyState.set(e.code, true);
      });
      window.addEventListener('keyup', (e) => {
        this.keyState.set(e.code, false);
      });
    }
  }

  /**
   * Decide on an action given a normalized observation vector
   * @param {number[]} observation - Normalized observation vector
   * @returns {Action} Action (number array)
   */
  decide(observation) {
    // Convert boolean mask to number array (Action type)
    const action = [
      this.keyState.get(this.bindings.up) ? 1 : 0,
      this.keyState.get(this.bindings.left) ? 1 : 0,
      this.keyState.get(this.bindings.down) ? 1 : 0,
      this.keyState.get(this.bindings.right) ? 1 : 0
    ];
    this.lastActionMask = action; // Keep for backward compatibility
    return action;
  }

  /**
   * Clear all key states (useful when game resets)
   */
  clearKeyStates() {
    this.keyState.clear();
  }
}


