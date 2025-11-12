/**
 * RandomController - Controller that samples random actions
 * Game-agnostic controller that implements PlayerController interface
 */
export class RandomController {
  constructor(actionSpaces = null) {
    this.actionSpaces = actionSpaces;
  }

  /**
   * Decide on a random action given a normalized observation vector
   * @param {number[]} observation - Normalized observation vector (unused, but kept for interface compatibility)
   * @returns {Action} Action (number array)
   */
  decide(observation) {
    // Ensure we have actionSpaces - if not provided, use default 4 discrete actions
    const actionSpaces = this.actionSpaces;
    const actionSize = actionSpaces ? actionSpaces.length : 4;
    
    if (!actionSpaces || actionSpaces.length === 0) {
      // Fallback: assume 4 discrete actions if actionSpaces not provided
      return [
        Math.random() < 0.5 ? 1 : 0,
        Math.random() < 0.5 ? 1 : 0,
        Math.random() < 0.5 ? 1 : 0,
        Math.random() < 0.5 ? 1 : 0
      ];
    }

    const action = [];
    for (let i = 0; i < actionSpaces.length; i++) {
      const actionSpace = actionSpaces[i];
      
      if (actionSpace.type === 'discrete') {
        // Discrete: sample 0 or 1 with 50% probability
        action[i] = Math.random() < 0.5 ? 1 : 0;
      } else if (actionSpace.type === 'continuous') {
        // Continuous: sample from standard normal distribution (unbounded)
        // Using Box-Muller transform for better distribution
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        action[i] = z; // Standard normal (mean=0, std=1)
      } else {
        // Unknown type, default to 0
        action[i] = 0;
      }
    }
    
    return action;
  }
}

