/**
 * PolicyOpponentController - Controller for opponent using a PolicyAgent
 * Note: In the new design, observations are already normalized number arrays,
 * so we use the observation directly (no swapping needed since GameCore provides
 * player-specific observations)
 */

import { PolicyAgent } from '../../rl/agents/PolicyAgent.js';
import { Action } from '../../rl/core/GameCore.js';

export class PolicyOpponentController {
  private agent: PolicyAgent;
  private _activated: boolean;

  constructor(policyAgent: PolicyAgent) {
    this.agent = policyAgent;
    this._activated = false;
  }

  /**
   * Decide on an action given a normalized observation vector
   * @param {number[]} observation - Normalized observation vector (already from opponent's perspective)
   * @returns {Action} Action (number array)
   */
  decide(observation: number[]): Action {
    if (!this.agent || typeof this.agent.act !== 'function') {
      // Fallback: return zero action
      return new Array(this.agent?.actionSize || 4).fill(0);
    }
    
    if (!this._activated && typeof this.agent.activate === 'function') {
      this.agent.activate();
      this._activated = true;
    }
    
    // Observation is already from opponent's perspective (GameCore handles this)
    const result = this.agent.act(observation);
    return result.action;  // Already a number array (Action)
  }
}

