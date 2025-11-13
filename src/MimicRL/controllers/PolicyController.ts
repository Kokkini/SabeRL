/**
 * PolicyController - Game-agnostic controller that uses a PolicyAgent
 * 
 * This controller wraps a PolicyAgent and provides a simple interface for
 * deciding actions based on normalized observations. It is part of the RL library
 * and works with any game that implements the GameCore interface.
 * 
 * Location: src/MimicRL/controllers/PolicyController.ts (library code)
 * 
 * @implements {PlayerController} - Implements the PlayerController interface
 */

import { PolicyAgent } from '../agents/PolicyAgent.js';
import { Action } from '../core/GameCore.js';
import { PlayerController } from './PlayerController.js';

export class PolicyController implements PlayerController {
  private agent: PolicyAgent;
  private _activated: boolean;

  constructor(policyAgent: PolicyAgent) {
    this.agent = policyAgent;
    this._activated = false;
  }

  /**
   * Decide on an action given a normalized observation vector
   * @param observation - Normalized observation vector
   * @returns Action (number array)
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

