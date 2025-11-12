/**
 * PolicyController - Game-agnostic controller that uses a PolicyAgent
 * Implements PlayerController interface
 */

import { PolicyAgent } from '../../rl/agents/PolicyAgent.js';
import { Action } from '../../rl/core/GameCore.js';

export class PolicyController {
  private agent: PolicyAgent;
  private _activated: boolean;

  constructor(policyAgent: PolicyAgent) {
    this.agent = policyAgent;
    this._activated = false;
  }

  /**
   * Decide on an action given a normalized observation vector
   * @param {number[]} observation - Normalized observation vector
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
    
    const result = this.agent.act(observation);
    return result.action;  // Already a number array (Action)
  }
}

