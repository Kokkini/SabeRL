/**
 * GameCore Interface - Game-agnostic interface for RL library
 * 
 * This interface defines the contract that any game must implement
 * to work with the RL library. All game-specific implementations
 * should implement this interface.
 * 
 * Location: src/MimicRL/core/GameCore.ts (library code)
 */

/**
 * GameState structure returned by GameCore methods
 */
export interface GameState {
  /**
   * Observations for each player (from their perspective)
   * Array index = player index (0, 1, 2, ...)
   * Each element is a normalized number array (game-agnostic)
   * GameCore is responsible for converting its internal state to normalized arrays
   */
  observations: number[][];

  /**
   * Rewards for each player (scalar values)
   * Array index = player index (0, 1, 2, ...)
   */
  rewards: number[];

  /**
   * Whether the episode is done
   */
  done: boolean;

  /**
   * Episode outcome (only set when done=true)
   * null if episode is ongoing
   * Array index = player index (0, 1, 2, ...)
   * Each element indicates the outcome for that player: 'win', 'loss', 'tie', etc.
   * Supports multiple winners: ['win', 'win', 'loss'] means players 0 and 1 both win
   */
  outcome: ('win' | 'loss' | 'tie')[] | null;

  /**
   * Optional metadata (step count, time, etc.)
   */
  info?: {
    stepCount?: number;
    elapsedTime?: number;
    [key: string]: any;
  };
}

/**
 * Action is an array of numbers
 * Each element can represent:
 *   - Discrete action: 0 or 1 (button press)
 *   - Continuous action: any real-valued number (original units; no normalization)
 */
export type Action = number[];

/**
 * ActionSpace defines the type of action for each action index
 */
export interface ActionSpace {
  /**
   * Type of action space
   * - 'discrete': action value is 0 or 1 (binary)
   * - 'continuous': action value is any real number (unbounded)
   */
  type: 'discrete' | 'continuous';
}

/**
 * GameCore Interface
 * 
 * Any class implementing GameCore must provide all these methods.
 * This interface is enforced at compile-time in TypeScript.
 */
export interface GameCore {
  /**
   * Reset the game to initial state
   * @returns {GameState} Initial game state with observations and rewards for all players
   * Observations are normalized number arrays (game-agnostic format)
   */
  reset(): GameState;

  /**
   * Advance game by one step with actions from all players
   * @param {Action[]} actions - Array of actions, index = player index (0, 1, 2, ...)
   * @param {number} deltaTime - Time step in seconds
   * @returns {GameState} New game state after step
   * Observations are normalized number arrays (game-agnostic format)
   */
  step(actions: Action[], deltaTime: number): GameState;

  /**
   * Get number of players in the game
   * @returns {number} Number of players
   */
  getNumPlayers(): number;

  /**
   * Get observation size (same for all players)
   * @returns {number} Size of the observation array
   */
  getObservationSize(): number;

  /**
   * Get action size (same for all players)
   * @returns {number} Size of the action array
   */
  getActionSize(): number;

  /**
   * Get action space for each action index (same for all players)
   * @returns {ActionSpace[]} Array of action spaces, where actionSpaces[i] corresponds to action[i]
   *   There is a one-to-one correspondence: actionSpaces.length must equal actionSize
   */
  getActionSpaces(): ActionSpace[];

  /**
   * Get episode outcome (optional, but recommended)
   * @returns {('win'|'loss'|'tie')[]|null} Outcome array or null if not done
   */
  getOutcome?(): ('win' | 'loss' | 'tie')[] | null;
}

