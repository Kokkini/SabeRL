/**
 * PlayerController Interface - Game-agnostic interface for RL library
 * 
 * This interface defines the contract that any controller must implement
 * to work with the RL library. Controllers decide actions based on
 * normalized observations.
 * 
 * Location: src/MimicRL/controllers/PlayerController.ts (library code)
 */

import { Action } from '../core/GameCore.js';

/**
 * PlayerController Interface
 * 
 * Any class implementing PlayerController must provide the decide() method.
 * This interface is enforced at compile-time in TypeScript.
 */
export interface PlayerController {
  /**
   * Decide on an action given a normalized observation vector
   * @param observation - Normalized observation vector (game-agnostic)
   * @returns Action (number array)
   */
  decide(observation: number[]): Action;
}

