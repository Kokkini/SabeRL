# Game-Agnostic RL Library Design Proposal

## Goals
1. Make GameCore symmetrical - handle all players uniformly
2. Standardize input/output interface for any game
3. Create reusable RL library that works with any game implementation
4. Support multiplayer games (2+ players) easily
5. Keep game-specific logic isolated in GameCore

## Core Interfaces

### 1. Standardized GameCore Interface

```typescript
interface GameCore {
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
   * @returns {ActionSpace[]} Array of action spaces, index = action index
   */
  getActionSpaces(): ActionSpace[];
}

interface GameState {
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
 *   - Continuous action: any number in a range (e.g., mouse position, joystick)
 * Example: [1, 0, 0.5, -0.3] means action 0 is active (1), action 1 is inactive (0),
 *         action 2 is continuous (0.5), action 3 is continuous (-0.3)
 */
type Action = number[];

/**
 * Action space for a single action index
 * Defines how to sample and interpret the action value
 */
interface ActionSpace {
  /**
   * Type of action space
   * - 'discrete': Binary action (0 or 1)
   * - 'continuous': Continuous value in [low, high] range
   */
  type: 'discrete' | 'continuous';
  
  /**
   * For continuous actions: minimum value (inclusive)
   * For discrete actions: ignored
   */
  low?: number;
  
  /**
   * For continuous actions: maximum value (inclusive)
   * For discrete actions: ignored
   */
  high?: number;
}
```

### 2. Player Controller Interface

```typescript
/**
 * Game-agnostic controller interface
 * All controllers work with normalized observation vectors (number arrays)
 */
interface PlayerController {
  /**
   * Decide on an action given a normalized observation vector
   * @param {number[]} observation - Normalized observation vector (game-agnostic)
   * @returns {Action} Action (number array)
   */
  decide(observation: number[]): Action;
}

// Example implementations:

/**
 * Human controller - reads from input devices
 * Still receives normalized observation vector (for consistency)
 */
class HumanController implements PlayerController {
  decide(observation: number[]): Action {
    // Reads from keyboard/mouse, ignores observation
    return this.getInput();
  }
}

/**
 * Policy controller - uses trained neural network
 * Completely game-agnostic, only works with number arrays
 */
class PolicyController implements PlayerController {
  constructor(policyAgent: PolicyAgent) {
    this.agent = policyAgent;
  }

  decide(observation: number[]): Action {
    // PolicyAgent only sees normalized number array
    // act() returns {action, logProb, value}, we only need the action
    return this.agent.act(observation).action;
  }
}

/**
 * Policy agent - game-agnostic RL agent
 * Works exclusively with normalized feature vectors and actions
 */
class PolicyAgent {
  constructor(config: { 
    observationSize: number;  // Size of input feature vector
    actionSize: number;       // Size of action (number of actions)
    actionSpaces: ActionSpace[];  // Action space for each action index
    neuralNetwork?: NeuralNetwork;
  }) {
    this.observationSize = config.observationSize;
    this.actionSize = config.actionSize;
    this.actionSpaces = config.actionSpaces;
    if (this.actionSpaces.length !== this.actionSize) {
      throw new Error(`Action spaces length (${this.actionSpaces.length}) must match action size (${this.actionSize})`);
    }
    this.neuralNetwork = config.neuralNetwork || this.createDefaultNetwork();
  }

  /**
   * Act on normalized observation vector
   * @param {number[]} observation - Normalized feature vector (game-agnostic)
   * @param {tf.LayersModel} valueModel - Optional value model for value estimation
   * @returns {Object} {action: Action, logProb: number, value: number}
   *   - action: Action (number array)
   *   - logProb: Log probability of the sampled action
   *   - value: Value estimate (if valueModel provided, otherwise 0)
   */
  act(observation: number[], valueModel?: tf.LayersModel): { action: Action, logProb: number, value: number } {
    // Validate input is correct size
    if (observation.length !== this.observationSize) {
      throw new Error(`Observation size mismatch: expected ${this.observationSize}, got ${observation.length}`);
    }
    
    // Convert to tensor
    const input = tf.tensor2d([observation], [1, this.observationSize]);
    
    // Get action outputs from neural network
    // Network outputs depend on action space types:
    // - For discrete: sigmoid output (probability)
    // - For continuous: tanh output (scaled to [-1, 1], then mapped to [low, high])
    const output = this.neuralNetwork.model.predict(input);
    const outputArray = Array.from(output.dataSync());
    
    // Sample action based on action spaces using reparameterization trick for continuous actions
    const action: number[] = [];
    const logProbs: number[] = [];
    
    // For continuous actions, we need to sample epsilon (noise) for reparameterization
    // We'll generate this once and use it for all continuous actions
    const epsilon = tf.randomNormal([this.actionSize], 0, 1);  // Standard normal noise
    const epsilonArray = Array.from(epsilon.dataSync());
    
    for (let i = 0; i < this.actionSize; i++) {
      const actionSpace = this.actionSpaces[i];
      
      if (actionSpace.type === 'discrete') {
        // Discrete: output is logit, apply sigmoid to get probability, sample 0 or 1
        const logit = outputArray[i];
        const prob = tf.sigmoid(tf.scalar(logit)).dataSync()[0];
        const sampled = Math.random() < prob ? 1 : 0;
        action[i] = sampled;
        
        // Log probability: log(prob) if sampled=1, log(1-prob) if sampled=0
        logProbs[i] = sampled === 1 
          ? Math.log(prob + 1e-8)
          : Math.log(1 - prob + 1e-8);
      } else if (actionSpace.type === 'continuous') {
        // Continuous: Use reparameterization trick
        // Network outputs mean (in [-1, 1] via tanh), we add noise and map to [low, high]
        const meanNormalized = Math.tanh(outputArray[i]);  // Mean in [-1, 1]
        const std = 0.1;  // Standard deviation for exploration
        
        // Reparameterization: action = mean + std * epsilon
        // where epsilon ~ N(0, 1) is sampled from standard normal
        const epsilon_i = epsilonArray[i];
        const actionNormalized = meanNormalized + std * epsilon_i;
        
        // Map from [-1, 1] to [low, high]
        const low = actionSpace.low ?? -1;
        const high = actionSpace.high ?? 1;
        const mapped = low + (actionNormalized + 1) / 2 * (high - low);
        action[i] = mapped;
        
        // Log probability using reparameterization trick
        // For Normal(mean, std), log_prob = -0.5 * log(2πσ²) - 0.5 * ((x - μ) / σ)²
        // Since we use actionNormalized (before mapping), we compute log prob in normalized space
        // The mapping is linear, so the log prob is the same (just in different scale)
        const mean = meanNormalized;
        const x = actionNormalized;
        logProbs[i] = -0.5 * Math.log(2 * Math.PI * std * std) - 0.5 * Math.pow((x - mean) / std, 2);
      }
    }
    
    // Clean up epsilon tensor
    epsilon.dispose();
    
    // Total log probability is sum of individual log probabilities
    const logProb = logProbs.reduce((sum, lp) => sum + lp, 0);
    
    // Get value estimate if value model provided
    let value = 0;
    if (valueModel) {
      const valueOutput = valueModel.predict(input);
      value = valueOutput.squeeze().dataSync()[0];
      valueOutput.dispose();
    }
    
    // Clean up tensors
    input.dispose();
    output.dispose();
    
    return { action, logProb, value };
  }

  createDefaultNetwork(): NeuralNetwork {
    // Create network based on observationSize and actionSize
    // Output layer size = actionSize
    // This is game-agnostic
  }
}

class RandomController implements PlayerController {
  constructor(actionSpaces: ActionSpace[]) {
    this.actionSpaces = actionSpaces;
  }

  decide(observation: number[]): Action {
    // Random action, ignores observation
    // Sample based on action spaces
    return this.actionSpaces.map(space => {
      if (space.type === 'discrete') {
        return Math.random() < 0.25 ? 1 : 0;
      } else {
        // Continuous: random value in [low, high]
        const low = space.low ?? -1;
        const high = space.high ?? 1;
        return low + Math.random() * (high - low);
      }
    });
  }
}

class ScriptedController implements PlayerController {
  constructor(actionSpaces: ActionSpace[]) {
    this.actionSpaces = actionSpaces;
  }

  decide(observation: number[]): Action {
    // Hard-coded strategy based on observation vector
    return this.computeAction(observation);
  }
}
```

### 3. GameCore Observation Normalization

**Key Design Decision**: `GameCore` is responsible for converting its internal game state to normalized number arrays. This normalization happens inside `GameCore`, not in a separate processor.

**Example Implementation in GameCore:**

```typescript
class SaberGameCore implements GameCore {
  // ... game-specific state (players, arena, etc.)

  #buildObservationFor(playerIndex: number): number[] {
    // GameCore knows its internal state
    // Converts to normalized number array
    const player = this.getPlayer(playerIndex);
    const opponent = this.getOpponent(playerIndex);
    
    // Normalize positions, angles, etc. to [0, 1] or [-1, 1] range
    return [
      player.position.x / this.arena.width,      // normalized x
      player.position.y / this.arena.height,       // normalized y
      opponent.position.x / this.arena.width,
      opponent.position.y / this.arena.height,
      player.saberAngle / (2 * Math.PI),          // normalized angle
      opponent.saberAngle / (2 * Math.PI),
      player.saberAngularVelocity / MAX_ANGULAR_VELOCITY,
      opponent.saberAngularVelocity / MAX_ANGULAR_VELOCITY,
      this.stepCount / MAX_STEPS                   // normalized time
    ];
  }

  reset(): GameState {
    // ... initialize game state
    return {
      observations: [
        this.#buildObservationFor(0),  // Player 0
        this.#buildObservationFor(1)   // Player 1
      ],
      rewards: [0, 0],
      done: false,
      outcome: null
    };
  }

  step(actions: Action[], deltaTime: number): GameState {
    // actions: Action[] where index = player index
    // ... apply actions, update game state
    return {
      observations: [
        this.#buildObservationFor(0),
        this.#buildObservationFor(1)
      ],
      rewards: [this.#calculateReward(0), this.#calculateReward(1)],
      done: this.isDone(),
      outcome: this.getOutcome()
    };
  }

  getNumPlayers(): number {
    return 2;
  }

  getObservationSize(): number {
    return 9;  // Size of the normalized array (same for all players)
  }

  getActionSize(): number {
    return 4;  // Size of action (e.g., [W, A, S, D]) (same for all players)
  }

  getActionSpaces(): ActionSpace[] {
    // Example: first 4 actions are discrete (W, A, S, D buttons)
    return [
      { type: 'discrete' },  // W
      { type: 'discrete' },  // A
      { type: 'discrete' },  // S
      { type: 'discrete' }   // D
    ];
  }
}
```

**Key Point**: `GameCore` handles all normalization internally. The RL library receives only normalized number arrays and is completely game-agnostic.

### 3. RL Training System Interface

```typescript
interface TrainingConfig {
  /**
   * Which player(s) to train (others use their controllers)
   * Array of player indices (0, 1, 2, ...)
   */
  trainablePlayers: number[];

  /**
   * RL algorithm configuration
   */
  algorithm: {
    type: 'PPO' | 'DQN' | 'A3C' | string;
    hyperparameters: Record<string, any>;
  };

  /**
   * Training parameters
   */
  training: {
    maxEpisodes?: number;
    maxStepsPerEpisode?: number;
    batchSize?: number;
    learningRate?: number;
    // ... other training params
  };

}

/**
 * Experience structure for training
 */
interface Experience {
  playerIndex: number;
  observation: number[];      // Normalized observation array
  action: Action;             // Number array (action - can be discrete 0/1 or continuous)
  reward: number;
  nextObservation: number[];   // Normalized observation array
  done: boolean;
  value?: number;              // Optional value estimate
  logProb?: number;            // Optional log probability
}

/**
 * Handles the actual neural network model updates (gradient descent, etc.)
 * Algorithm-specific (PPO, DQN, etc.)
 */
interface Trainer {
  /**
   * Train on a batch of experiences
   * @param {Experience[]} experiences - Training experiences with actions
   * @param {tf.LayersModel} policyModel - Policy network
   * @param {tf.LayersModel} valueModel - Value network (optional)
   * @param {ActionSpace[]} actionSpaces - Action spaces for each action index (required for mixed action types)
   * @returns {TrainingStats} Training statistics
   */
  train(
    experiences: Experience[],
    policyModel: tf.LayersModel,
    valueModel?: tf.LayersModel,
    actionSpaces?: ActionSpace[]
  ): Promise<TrainingStats>;
}

/**
 * Orchestrates the training loop, rollout collection, and model updates
 */
class RLTrainingSystem {
  constructor(
    gameCore: GameCore,
    controllers: PlayerController[],  // Array of controllers, index = player index
    config: TrainingConfig
  ) {
    // Initialize training system
    // Create trainers for each trainable player
    // GameCore already provides normalized observations
  }

  /**
   * Start training
   */
  start(): void;

  /**
   * Stop training
   */
  stop(): void;

  /**
   * Export trained agent weights
   */
  exportWeights(playerIndex: number): Promise<Weights>;

  /**
   * Import agent weights
   */
  importWeights(playerIndex: number, weights: Weights): void;
}
```

## Responsibility Breakdown

### Observation Normalization

**Class: `GameCore`** (Game-Specific)

**Responsibilities:**
- Converts internal game state to normalized `number[]` arrays
- Returns normalized observations directly in `GameState`
- Handles all game-specific normalization logic internally

**Flow:**
```
GameCore.step() 
  → internally converts game state to normalized arrays
  → returns GameState { observations: number[][] }
  → PolicyController.decide(number[])
    → PolicyAgent.act(number[])
      → tf.tensor2d([features]) 
        → NeuralNetwork.predict(tensor)
```

**Key Design Principle:**
- `GameCore` is responsible for normalization - it returns `number[]` directly
- `PolicyController` and `PolicyAgent` **never** see game-specific observations
- They only work with `number[]` arrays
- The RL library is completely game-agnostic - no observation processors needed
- The RL library's job is to produce a good `PolicyController` instance that works with number arrays

### Model Updates (Gradient Descent)

**Class: `Trainer`** (e.g., `PPOTrainer`, `DQNTrainer`)

**Responsibilities:**
- Takes batch of experiences (observations, actions, rewards, etc.)
- Computes advantages, returns, GAE (Generalized Advantage Estimation)
- Performs forward pass through policy/value networks
- Computes loss functions (policy loss, value loss, entropy)
- Performs gradient descent via optimizer
- Updates neural network weights

**Flow:**
```
TrainingSession.collectRollout()
  → collects experiences
  → Trainer.train(experiences, policyModel, valueModel)
    → prepareTrainingData() - convert experiences to tensors
    → computeAdvantages() - GAE calculation
    → trainBatch() - gradient updates
      → policyOptimizer.minimize() - update policy network
      → valueOptimizer.minimize() - update value network
```

**Location in Code:**
- `PPOTrainer.trainBatch()` - performs actual gradient updates
- `PPOTrainer.computePolicyLoss()` - computes PPO clipped objective
- `PPOTrainer.computeValueLoss()` - computes value function loss
- Optimizers (Adam, SGD, etc.) - perform weight updates

### Orchestration

**Class: `RLTrainingSystem` / `TrainingSession`**

**Responsibilities:**
- Manages training loop
- Coordinates rollout collection
- Calls `Trainer.train()` with collected experiences
- Manages policy agents for trainable players
- Handles episode lifecycle

**Flow:**
```
RLTrainingSystem.start()
  → loop:
    → collectRollout() - play games, collect experiences
    → Trainer.train() - update models
    → update metrics
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Game Implementation                    │
│  ┌───────────────────────────────────────────────────┐  │
│  │              GameCore (Game-Specific)              │  │
│  │  - Implements standardized GameCore interface     │  │
│  │  - Handles game logic, physics, collisions         │  │
│  │  - Returns observations/rewards for all players   │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ▲
                          │ step(actions, deltaTime)
                          │ returns GameState
                          │
┌─────────────────────────────────────────────────────────┐
│              RL Library (Game-Agnostic)                  │
│  ┌───────────────────────────────────────────────────┐  │
│  │         RLTrainingSystem                         │  │
│  │  - Manages training loop                         │  │
│  │  - Collects rollouts                             │  │
│  │  - Updates policies                              │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │         Player Controllers                        │  │
│  │  - PolicyController (RL agent)                   │  │
│  │  - HumanController                                │  │
│  │  - RandomController                               │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │         GameLoop / Environment                     │  │
│  │  - Orchestrates controllers and gameCore         │  │
│  │  - Handles action collection from all players     │  │
│  │  - Manages episode lifecycle                      │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Migration Path for Current Code

### Step 1: Refactor GameCore.step()

**Current:**
```javascript
step(action, deltaTime) {
  // Only takes action for player-1
  // Opponent handled internally or via opponentController
}
```

**New:**
```javascript
step(actions, deltaTime) {
  // actions: Action[] where index = player index
  // Apply actions to all players uniformly
  // Return GameState with observations/rewards for all
}
```

### Step 2: Standardize Observation Building

**Current:**
```javascript
#buildObservation() {
  // Returns single observation (player-centric)
}
```

**New:**
```javascript
#buildGameState() {
  return {
    observations: new Map([
      ['player-1', this.#buildObservationFor('player-1')],
      ['ai-1', this.#buildObservationFor('ai-1')]
    ]),
    rewards: new Map([
      ['player-1', this.#calculateReward('player-1')],
      ['ai-1', this.#calculateReward('ai-1')]
    ]),
    done: this.isDone(),
    outcome: this.#getOutcome(),
    info: { stepCount: this.stepCount, ... }
  };
}
```

### Step 3: Create GameLoop/Environment Wrapper

```javascript
/**
 * GameEnvironment orchestrates GameCore and controllers
 * GameCore already returns normalized number arrays, so no processing needed
 */
class GameEnvironment {
  constructor(
    gameCore, 
    controllers  // PlayerController[] where index = player index
  ) {
    this.gameCore = gameCore;
    this.controllers = controllers;
    this.lastState = null;
  }

  reset() {
    const state = this.gameCore.reset();
    this.lastState = state;
    return state;
  }

  step(deltaTime) {
    // Collect actions from all controllers
    const actions = [];
    for (let i = 0; i < this.controllers.length; i++) {
      // GameCore already returns normalized number arrays
      const normalizedObs = this.lastState.observations[i];
      
      // Controller receives number array directly (game-agnostic)
      actions[i] = this.controllers[i].decide(normalizedObs);
    }

    // Step game with all actions
    const newState = this.gameCore.step(actions, deltaTime);
    this.lastState = newState;
    return newState;
  }
}
```

**Key Points:**
- `GameCore` already returns normalized `number[]` arrays
- No observation processing needed - controllers receive arrays directly
- Completely game-agnostic environment

### Step 4: Update Training System

```javascript
class TrainingSession {
  constructor(gameCore, controllers, config) {
    this.gameCore = gameCore;
    this.controllers = controllers;  // PlayerController[]
    this.trainablePlayers = config.trainablePlayers;  // number[]
    
    // All players have the same observation and action sizes
    const observationSize = gameCore.getObservationSize();
    const actionSize = gameCore.getActionSize();
    const actionSpaces = gameCore.getActionSpaces();
    
    // Create policy agents only for trainable players
    this.policyAgents = [];
    for (const playerIndex of trainablePlayers) {
      // PolicyAgent is game-agnostic - needs observation size, action size, and action spaces
      const agent = new PolicyAgent({
        observationSize: observationSize,
        actionSize: actionSize,
        actionSpaces: actionSpaces
      });
      this.policyAgents[playerIndex] = agent;
      
      // Replace controller with PolicyController (game-agnostic)
      controllers[playerIndex] = new PolicyController(agent);
    }
  }

  collectRollout() {
    const state = this.gameCore.reset();
    const experiences = [];
    const deltaTime = 0.05;  // Fixed time step for game simulation
    const actionIntervalSeconds = 0.2;  // Time between agent decisions (frame-skip)

    while (experiences.length < this.rolloutMaxLength) {
      // Collect actions from all controllers (decision point)
      const actions = [];
      const logProbs = [];  // Store logProbs for trainable players
      const values = [];    // Store values for trainable players
      
      for (let i = 0; i < this.controllers.length; i++) {
        // GameCore already returns normalized number arrays
        const normalizedObs = state.observations[i];
        
        // For trainable players, get action, logProb, and value from PolicyAgent
        if (this.trainablePlayers.includes(i)) {
          const agent = this.policyAgents[i];
          const result = agent.act(normalizedObs, this.valueModel);
          actions[i] = result.action;
          logProbs[i] = result.logProb;
          values[i] = result.value;
        } else {
          // For non-trainable players, just get action from controller
          actions[i] = this.controllers[i].decide(normalizedObs);
        }
      }

      // Apply actions repeatedly for actionIntervalSeconds (frame-skip)
      // This accumulates rewards over multiple game steps
      let timeTillAction = actionIntervalSeconds;
      let rewardAccumulated = new Array(this.gameCore.getNumPlayers()).fill(0);
      let nextState = state;
      
      while (timeTillAction > 0 && !nextState.done) {
        nextState = this.gameCore.step(actions, deltaTime);
        
        // Accumulate rewards for each player
        for (let i = 0; i < nextState.rewards.length; i++) {
          rewardAccumulated[i] += nextState.rewards[i];
        }
        
        timeTillAction -= deltaTime;
        
        if (nextState.done) break;
      }

      // Store experiences for trainable players
      // Observations are already normalized number arrays from GameCore
      for (const playerIndex of this.trainablePlayers) {
        experiences.push({
          playerIndex,
          observation: state.observations[playerIndex],  // Observation at decision point
          action: actions[playerIndex],  // Number array (discrete 0/1 or continuous)
          reward: rewardAccumulated[playerIndex],  // Accumulated reward during frame-skip
          nextObservation: nextState.observations[playerIndex],  // Observation after frame-skip
          done: nextState.done,
          logProb: logProbs[playerIndex],  // From PolicyAgent.act()
          value: values[playerIndex]        // From PolicyAgent.act()
        });
      }

      // Update state for next iteration
      state = nextState;
      
      // Reset if episode ended
      if (nextState.done) {
        state = this.gameCore.reset();
      }
    }

    return experiences;
  }
}
```

**Key Points:**
- `PolicyAgent` is created with only `observationSize` (number) and `actionSize` - completely game-agnostic
- `GameCore` already returns normalized `number[]` arrays, so no processing needed
- **Frame-skip is handled by the rollout collection logic** (`collectRollout()` method): Actions are sampled at decision points (every `actionIntervalSeconds`), then applied repeatedly for multiple game steps (`deltaTime` each) until the next decision point. Rewards are accumulated during this frame-skip period.
- Experiences store the number arrays directly from `GameCore`
- The RL training system produces a `PolicyController` that works with number arrays
- The trained `PolicyController` can be used with any game that provides the same observation size

## Benefits

1. **Symmetry**: All players treated equally - no special cases
2. **Scalability**: Easy to add more players (just add to controllers map)
3. **Reusability**: RL library works with any game implementing GameCore interface
4. **Flexibility**: Mix different controller types (human, RL, random, scripted)
5. **Testability**: Easy to test with mock controllers
6. **Multiplayer Ready**: Architecture supports N players naturally
7. **Game-Agnostic RL**: PolicyController and PolicyAgent work exclusively with number arrays, making them reusable across games

## Key Design Principle: Game-Agnostic RL Components

**The RL library's purpose is to produce good `PolicyController` instances that work with normalized number arrays.**

### What is Game-Agnostic:
- ✅ `PolicyController` - only sees `number[]` observations
- ✅ `PolicyAgent` - only works with `number[]` and action spaces
- ✅ `Trainer` (PPOTrainer, etc.) - trains on `number[]` observations
- ✅ `NeuralNetwork` - takes `number[]` as input
- ✅ All training logic, loss functions, optimizers

### What is Game-Specific:
- ❌ `GameCore` - game logic, physics, and normalization to `number[]`
  - `GameCore` is responsible for converting its internal state to normalized arrays
  - This is the **ONLY** game-specific component
  - Each game implements its own `GameCore` with normalization logic

### Result:
A trained `PolicyController` can be:
- Exported and reused
- Used with different games that have the same observation size
- Completely independent of game-specific observation structure
- The RL training system produces a general-purpose controller that works with number arrays

## Example: Soccer Game

```javascript
// Soccer-specific GameCore
class SoccerGameCore {
  reset() {
    // Initialize field, players, ball
    return {
      observations: [
        this.getObservation(0),  // Player 0
        this.getObservation(1),  // Player 1
        // ... 22 players (indices 0-21)
      ],
      rewards: [0, 0, ...], // Goals, assists, etc.
      done: false,
      outcome: null
    };
  }

  step(actions, deltaTime) {
    // actions: Action[] where index = player index
    // Apply all player actions (movement, kick, etc.)
    // Update ball physics
    // Check for goals
    // Return new state
  }

  getNumPlayers(): number {
    return 22;
  }

  getObservationSize(): number {
    return 20;  // Size of observation array (same for all players)
  }

  getActionSize(): number {
    return 8;  // Size of action (e.g., [up, down, left, right, kick, pass, mouseX, mouseY]) (same for all players)
  }

  getActionSpaces(): ActionSpace[] {
    // Example: first 6 actions are discrete (movement/kick buttons), last 2 are continuous (mouse position)
    return [
      { type: 'discrete' },  // up
      { type: 'discrete' },  // down
      { type: 'discrete' },  // left
      { type: 'discrete' },  // right
      { type: 'discrete' },  // kick
      { type: 'discrete' },  // pass
      { type: 'continuous', low: -1, high: 1 },  // mouseX
      { type: 'continuous', low: -1, high: 1 }   // mouseY
    ];
  }
}

// Usage
const gameCore = new SoccerGameCore();
const controllers = [
  new PolicyController(agent1),  // Player 0
  new HumanController(),          // Player 1
  // ... other players
];

const training = new RLTrainingSystem(gameCore, controllers, {
  trainablePlayers: [0, 2, 4] // Train players 0, 2, 4
});
```

## Action/Observation Normalization

The framework supports:
1. **Actions**: Number arrays where each element can be:
   - Discrete (0 or 1) for button presses
   - Continuous (any value in [low, high]) for analog inputs (mouse, joystick)
2. **Action Spaces**: Each action index has an associated `ActionSpace` that defines how to sample it
3. **Observation Arrays**: Normalized number arrays (game-agnostic)
4. **Reward Shaping**: Handled by GameCore

This design makes the framework:
- Flexible (supports both discrete and continuous actions in the same array)
- Clear (action spaces explicitly define how each action is sampled)
- Game-agnostic (GameCore defines action spaces, PolicyAgent uses them for sampling)

## PPO Algorithm Adaptations for Mixed Action Types

The PPO algorithm needs to be adapted to handle mixed discrete/continuous actions:

### Key Changes Required:

1. **Log Probability Computation**:
   - **Current**: PPO assumes all actions are discrete (Bernoulli) and computes log probabilities using `log(prob)` for action=1 and `log(1-prob)` for action=0
   - **Required**: PPO must recompute log probabilities during training based on action spaces:
     - **Discrete actions**: Use Bernoulli distribution: `log(prob)` if action=1, `log(1-prob)` if action=0
     - **Continuous actions**: Use reparameterization trick with Normal distribution:
       - Sample `epsilon ~ N(0, 1)` (standard normal noise)
       - Transform: `action_normalized = mean + std * epsilon`
       - Map to [low, high]: `action = low + (action_normalized + 1) / 2 * (high - low)`
       - Log prob: `-0.5 * log(2πσ²) - 0.5 * ((action_normalized - mean) / σ)²`
     - The total log probability is the sum of individual action log probabilities
   - **Why reparameterization**: Allows gradients to flow through the sampling process, making training more stable

2. **Policy Loss Calculation**:
   - The importance sampling ratio `ratio = exp(new_log_prob - old_log_prob)` works the same way
   - The clipping mechanism remains unchanged
   - But the log probability computation must handle mixed types

3. **Entropy Calculation**:
   - **Discrete actions**: Entropy = `-prob * log(prob) - (1-prob) * log(1-prob)`
   - **Continuous actions**: Entropy = `0.5 * log(2πeσ²)` (for Normal distribution)
   - Total entropy is the sum of individual entropies

4. **Trainer Interface**:
   - The `Trainer.train()` method must accept `actionSpaces: ActionSpace[]` parameter
   - This allows the trainer to correctly recompute log probabilities during training

### Implementation Notes:

- **PolicyAgent.act()** uses reparameterization trick for continuous actions:
  - Samples `epsilon ~ N(0, 1)` (standard normal)
  - Transforms: `action = mean + std * epsilon`
  - This allows gradients to flow through sampling, making training stable
- **Stored experiences** have the correct `logProb` from the old policy
- **During training**, PPO must recompute log probabilities from the current policy to compute the importance sampling ratio
  - For continuous actions, PPO must use the same reparameterization trick with the same `epsilon` (or recompute using the stored action value)
  - The trainer needs access to `actionSpaces` to know how to interpret each action value
- **Gradient flow**: The reparameterization trick ensures that gradients can flow from the loss back through the sampling operation to the policy network parameters

## Implementation Priority

1. **Phase 1**: Refactor GameCore to accept actions for all players
2. **Phase 2**: Standardize GameState return format
3. **Phase 3**: Create GameEnvironment wrapper
4. **Phase 4**: Update TrainingSession to use new interface
5. **Phase 5**: Extract RL library into separate module
6. **Phase 6**: Add support for different action/observation spaces

