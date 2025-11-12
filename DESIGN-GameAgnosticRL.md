# Game-Agnostic RL Library Design Proposal

## Goals
1. Make GameCore symmetrical - handle all players uniformly
2. Standardize input/output interface for any game
3. Create reusable RL library that works with any game implementation
4. Support multiplayer games (2+ players) easily
5. Keep game-specific logic isolated in GameCore

## Core Interfaces

### 1. Standardized GameCore Interface

**Location:** `src/rl/core/GameCore.js` (library code)

The `GameCore` interface is defined in the RL library and serves as the contract that any game implementation must follow. This interface is game-agnostic and allows the RL library to work with any game.

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
   * @returns {ActionSpace[]} Array of action spaces, where actionSpaces[i] corresponds to action[i]
   *   There is a one-to-one correspondence: actionSpaces.length must equal actionSize
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
 *   - Continuous action: any real-valued number (original units; no normalization)
 * Example: [1, 0, 0.5, -0.3] means action 0 is active (1), action 1 is inactive (0),
 *         action 2 is continuous (0.5), action 3 is continuous (-0.3)
 */
type Action = number[];

/**
 * Action space for a single action index
 * Defines how to sample and interpret the action value
 * 
 * IMPORTANT: There is a one-to-one correspondence between action indices and ActionSpaces.
 * - actionSpaces[i] corresponds to action[i] (the i-th element of the action array)
 * - actionSpaces.length must equal actionSize
 */
interface ActionSpace {
  /**
   * Type of action space
   * - 'discrete': Binary action (0 or 1)
   * - 'continuous': Continuous action in original units; no normalization is applied
   */
  type: 'discrete' | 'continuous';
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
 * 
 * The Trainer accesses the following properties:
 * - policyNetwork: Policy network (tf.LayersModel) - takes observation array, returns action logits/means
 * - valueNetwork: Value network (tf.LayersModel) - takes observation array, returns value estimate (always created, default if not provided)
 * - learnableStd: Learnable std array (tf.Variable, size = actionSize)
 * - actionSpaces: Action space definitions (ActionSpace[])
 */
class PolicyAgent {
  constructor(config: { 
    observationSize: number;  // Size of input feature vector
    actionSize: number;       // Size of action (number of actions)
    actionSpaces: ActionSpace[];  // Action space for each action index (one-to-one: actionSpaces[i] for action[i])
    policyNetwork?: tf.LayersModel; // Policy network: takes observation array, returns action logits/means (size = actionSize)
    valueNetwork?: tf.LayersModel; // Value network: takes observation array, returns value estimate (scalar). If not provided, a default will be created.
    initialStd?: number | number[]; // Initial std for continuous actions: single value (applied to all) or array (one per action index)
    networkArchitecture?: {
      policyHiddenLayers?: number[]; // Hidden layer sizes for policy network (default: [64, 32])
      valueHiddenLayers?: number[];  // Hidden layer sizes for value network (default: [64, 32])
      activation?: string;           // Activation function for hidden layers (default: 'relu')
    };
  }) {
    this.observationSize = config.observationSize;
    this.actionSize = config.actionSize;
    this.actionSpaces = config.actionSpaces;
    if (this.actionSpaces.length !== this.actionSize) {
      throw new Error(`Action spaces length (${this.actionSpaces.length}) must match action size (${this.actionSize})`);
    }
    // Network architecture configuration (with defaults)
    this.networkArchitecture = {
      policyHiddenLayers: config.networkArchitecture?.policyHiddenLayers || [64, 32],
      valueHiddenLayers: config.networkArchitecture?.valueHiddenLayers || [64, 32],
      activation: config.networkArchitecture?.activation || 'relu'
    };
    
    this.policyNetwork = config.policyNetwork || this.createDefaultPolicyNetwork();
    this.valueNetwork = config.valueNetwork || this.createDefaultValueNetwork();
    // Learnable std parameters: one per action index (array of size actionSize)
    // For discrete actions, the std is unused but still stored for consistency
    const initStd = config.initialStd ?? 0.1;
    const initStdArray = Array.isArray(initStd) 
      ? initStd 
      : new Array(this.actionSize).fill(initStd);
    if (initStdArray.length !== this.actionSize) {
      throw new Error(`Initial std array length (${initStdArray.length}) must match action size (${this.actionSize})`);
    }
    this.learnableStd = tf.variable(tf.tensor1d(initStdArray), true); // trainable array
  }

  /**
   * Act on normalized observation vector
   * @param {number[]} observation - Normalized feature vector (game-agnostic)
   * @returns {Object} {action: Action, logProb: number, value: number}
   *   - action: Action (number array)
   *   - logProb: Log probability of the sampled action
   *   - value: Value estimate from value network
   */
  act(observation: number[]): { action: Action, logProb: number, value: number } {
    // Validate input is correct size
    if (observation.length !== this.observationSize) {
      throw new Error(`Observation size mismatch: expected ${this.observationSize}, got ${observation.length}`);
    }
    
    // Convert to tensor
    const input = tf.tensor2d([observation], [1, this.observationSize]);
    
    // Get action outputs from policy network
    // Network outputs depend on action space types:
    // - For discrete: sigmoid output (probability)
    // - For continuous: direct mean in original action units (no normalization)
    const output = this.policyNetwork.predict(input);
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
        // Continuous: Use reparameterization trick in original action units
        // Network outputs mean directly; std is a learnable parameter per action index
        const mean = outputArray[i];  // Mean in original units
        const stdArray = this.learnableStd.dataSync();
        const std = stdArray[i]; // std for action index i
        const epsilon_i = epsilonArray[i]; // epsilon ~ N(0, 1)
        const sampled = mean + std * epsilon_i;
        action[i] = sampled;
        
        // Log probability under Normal(mean, std) in original units
        // log_prob = -0.5 * log(2πσ²) - 0.5 * ((x - μ) / σ)²
        const x = sampled;
        logProbs[i] = -0.5 * Math.log(2 * Math.PI * std * std) - 0.5 * Math.pow((x - mean) / std, 2);
      }
    }
    
    // Clean up epsilon tensor
    epsilon.dispose();
    
    // Total log probability is sum of individual log probabilities
    const logProb = logProbs.reduce((sum, lp) => sum + lp, 0);
    
    // Get value estimate from value network
    const valueOutput = this.valueNetwork.predict(input);
    const value = valueOutput.squeeze().dataSync()[0];
    valueOutput.dispose();
    
    // Clean up tensors
    input.dispose();
    output.dispose();
    
    return { action, logProb, value };
  }

  createDefaultPolicyNetwork(): tf.LayersModel {
    // Create policy network based on observationSize and actionSize
    // Input: observation array (size = observationSize)
    // Output: action logits/means (size = actionSize)
    // Architecture: Input -> hiddenLayers -> Output (linear activation for output)
    // This is game-agnostic
    
    const model = tf.sequential();
    
    // Input layer (first hidden layer with input shape)
    model.add(tf.layers.dense({
      units: this.networkArchitecture.policyHiddenLayers[0],
      inputShape: [this.observationSize],
      activation: this.networkArchitecture.activation,
      name: 'policy_input_layer'
    }));
    
    // Additional hidden layers
    for (let i = 1; i < this.networkArchitecture.policyHiddenLayers.length; i++) {
      model.add(tf.layers.dense({
        units: this.networkArchitecture.policyHiddenLayers[i],
        activation: this.networkArchitecture.activation,
        name: `policy_hidden_layer_${i}`
      }));
    }
    
    // Output layer (linear activation - logits/means)
    model.add(tf.layers.dense({
      units: this.actionSize,
      activation: 'linear',
      name: 'policy_output_layer'
    }));
    
    return model;
  }

  createDefaultValueNetwork(): tf.LayersModel {
    // Create value network based on observationSize
    // Input: observation array (size = observationSize)
    // Output: value estimate (scalar)
    // Architecture: Input -> hiddenLayers -> Output (linear activation for output)
    // This is game-agnostic
    
    const model = tf.sequential();
    
    // Input layer (first hidden layer with input shape)
    model.add(tf.layers.dense({
      units: this.networkArchitecture.valueHiddenLayers[0],
      inputShape: [this.observationSize],
      activation: this.networkArchitecture.activation,
      name: 'value_input_layer'
    }));
    
    // Additional hidden layers
    for (let i = 1; i < this.networkArchitecture.valueHiddenLayers.length; i++) {
      model.add(tf.layers.dense({
        units: this.networkArchitecture.valueHiddenLayers[i],
        activation: this.networkArchitecture.activation,
        name: `value_hidden_layer_${i}`
      }));
    }
    
    // Output layer (linear activation - scalar value)
    model.add(tf.layers.dense({
      units: 1,
      activation: 'linear',
      name: 'value_output_layer'
    }));
    
    return model;
  }
}

/**
 * Utility functions for network serialization/deserialization
 */
class NetworkUtils {
  /**
   * Load a tf.LayersModel from serialized weights
   * @param {Object} serializedData - Serialized network data
   * @param {Object} serializedData.architecture - Network architecture config
   *   - inputSize: number - Input layer size
   *   - hiddenLayers: number[] - Hidden layer sizes
   *   - outputSize: number - Output layer size
   *   - activation: string - Activation function for hidden layers
   * @param {Array} serializedData.weights - Serialized weights array
   *   Each element: { data: number[], shape: number[], dtype: string }
   * @returns {tf.LayersModel} Loaded model with weights restored
   */
  static loadNetworkFromSerialized(serializedData: {
    architecture: {
      inputSize: number;
      hiddenLayers: number[];
      outputSize: number;
      activation: string;
    };
    weights: Array<{
      data: number[];
      shape: number[];
      dtype: string;
    }>;
  }): tf.LayersModel {
    const { architecture, weights } = serializedData;
    
    // Create model with same architecture
    const model = tf.sequential();
    
    // Input layer (first hidden layer with input shape)
    model.add(tf.layers.dense({
      units: architecture.hiddenLayers[0],
      inputShape: [architecture.inputSize],
      activation: architecture.activation,
      name: 'input_layer'
    }));
    
    // Additional hidden layers
    for (let i = 1; i < architecture.hiddenLayers.length; i++) {
      model.add(tf.layers.dense({
        units: architecture.hiddenLayers[i],
        activation: architecture.activation,
        name: `hidden_layer_${i}`
      }));
    }
    
    // Output layer (linear activation)
    model.add(tf.layers.dense({
      units: architecture.outputSize,
      activation: 'linear',
      name: 'output_layer'
    }));
    
    // Load weights if provided
    if (weights && weights.length > 0) {
      // Convert serialized weights back to tensors
      const weightTensors = weights.map(w => 
        tf.tensor(w.data, w.shape, w.dtype)
      );
      model.setWeights(weightTensors);
    }
    
    return model;
  }
  
  /**
   * Serialize a tf.LayersModel to a storable format
   * @param {tf.LayersModel} model - Model to serialize
   * @param {Object} architecture - Architecture config (inputSize, hiddenLayers, outputSize, activation)
   * @returns {Object} Serialized model data
   */
  static serializeNetwork(
    model: tf.LayersModel,
    architecture: {
      inputSize: number;
      hiddenLayers: number[];
      outputSize: number;
      activation: string;
    }
  ): {
    architecture: typeof architecture;
    weights: Array<{
      data: number[];
      shape: number[];
      dtype: string;
    }>;
  } {
    const weights = model.getWeights();
    const serializedWeights = weights.map(w => ({
      data: Array.from(w.dataSync()),
      shape: w.shape,
      dtype: w.dtype
    }));
    
    return {
      architecture,
      weights: serializedWeights
    };
  }
}

/**
 * Example usage of NetworkUtils with PolicyAgent:
 * 
 * // Save a trained policy network
 * const serializedPolicy = NetworkUtils.serializeNetwork(
 *   policyAgent.policyNetwork,
 *   {
 *     inputSize: policyAgent.observationSize,
 *     hiddenLayers: [64, 32],
 *     outputSize: policyAgent.actionSize,
 *     activation: 'relu'
 *   }
 * );
 * 
 * // Save a trained value network
 * const serializedValue = NetworkUtils.serializeNetwork(
 *   policyAgent.valueNetwork,
 *   {
 *     inputSize: policyAgent.observationSize,
 *     hiddenLayers: [64, 32],
 *     outputSize: 1,
 *     activation: 'relu'
 *   }
 * );
 * 
 * // Load networks later
 * const loadedPolicyNetwork = NetworkUtils.loadNetworkFromSerialized(serializedPolicy);
 * const loadedValueNetwork = NetworkUtils.loadNetworkFromSerialized(serializedValue);
 * 
 * // Create PolicyAgent with loaded networks
 * const agent = new PolicyAgent({
 *   observationSize: 9,
 *   actionSize: 4,
 *   actionSpaces: [...],
 *   policyNetwork: loadedPolicyNetwork,
 *   valueNetwork: loadedValueNetwork
 * });
 */

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
        // Continuous: sample from standard normal in original units
        return tf.randomNormal([1]).dataSync()[0];
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
   * @param {PolicyAgent} policyAgent - Policy agent containing policy network, value network, learnable std, and action spaces
   * @returns {TrainingStats} Training statistics
   */
  train(
    experiences: Experience[],
    policyAgent: PolicyAgent  // Contains: policyNetwork (tf.LayersModel), valueNetwork (tf.LayersModel), learnableStd, actionSpaces
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
        → policyNetwork.predict(tensor)
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
- Accesses policy network, value network, learnable std, and action spaces from PolicyAgent
- Computes advantages, returns, GAE (Generalized Advantage Estimation)
- Performs forward pass through policy/value networks
- Computes loss functions (policy loss, value loss, entropy)
- Performs gradient descent via optimizer
- Updates neural network weights and learnable std parameters

**Flow:**
```
TrainingSession.collectRollout()
  → collects experiences
  → Trainer.train(experiences, policyAgent)
    → prepareTrainingData() - convert experiences to tensors
    → computeAdvantages() - GAE calculation
    → trainBatch() - gradient updates
      → policyOptimizer.minimize() - update policy network and learnableStd
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

This migration path transforms the current codebase to align with the game-agnostic RL library design. The goal is to make the RL code (`src/rl/`) a reusable library that works with any game by implementing the `GameCore` interface.

### Overview of Changes

1. **Refactor `GameCore`** to implement the standardized interface
2. **Remove game-specific dependencies** from `PolicyAgent` (GameStateProcessor, ActionMapper, etc.)
3. **Update `TrainingSession`** to work with `GameCore` interface instead of game object
4. **Update `RolloutCollector`** to use new `GameCore` interface
5. **Update controllers** to match `PlayerController` interface
6. **Organize RL library code** - ensure all library code is in `src/rl/` folder
7. **Remove/refactor game-specific utilities** - GameStateProcessor, ActionMapper become game-specific

### Step 1: Create GameCore Interface and Implement SaberGameCore

**Current Implementation (`src/game/GameCore.js`):**
- `reset()` returns a single observation object
- `step(actionMask, deltaTime)` takes action for player-1 only, opponent handled separately
- Returns `{observation, reward, done, outcome}` for single player
- Uses `#buildObservation()` that returns game-specific object
- Opponent controlled via `setOpponentController()` or built-in AI

**New Implementation:**

1. **Create GameCore Interface** (library code):
```javascript
// src/rl/core/GameCore.js
// Interface documentation - see Core Interfaces section above
// This file documents the GameCore interface contract
```

2. **Implement SaberGameCore** (game-specific code):
```javascript
// src/game/SaberGameCore.js
/**
 * SaberGameCore - Game-specific implementation of the GameCore interface
 * @implements {GameCore} - Implements the GameCore interface from src/rl/core/GameCore.js
 */
export class SaberGameCore {
  // ... existing constructor and internal state ...

  /**
   * Reset the game to initial state
   * @returns {GameState} Initial game state with observations and rewards for all players
   */
  reset() {
    // ... existing initialization code ...
    
    // Build normalized observations for all players
    return {
      observations: [
        this.#buildObservationFor(0),  // Player 0 (player-1)
        this.#buildObservationFor(1)   // Player 1 (ai-1)
      ],
      rewards: [0, 0],
      done: false,
      outcome: null
    };
  }

  /**
   * Advance game by one step with actions from all players
   * @param {Action[]} actions - Array of actions, index = player index
   * @param {number} deltaTime - Time step in seconds
   * @returns {GameState} New game state after step
   */
step(actions, deltaTime) {
    if (this.isDone() || this.episodeState !== 'playing') {
      const obs = this.#buildObservationFor(0);
      return {
        observations: [obs, obs], // Return current state
        rewards: [0, 0],
        done: true,
        outcome: this.getOutcome()
      };
    }

    this.stepCount++;

    // Apply actions to all players uniformly
    // actions[0] is for player-1, actions[1] is for ai-1
    if (this.players[0] && actions[0]) {
      this.#applyActionToPlayer(this.players[0], actions[0], deltaTime);
    }
    if (this.ais[0] && actions[1]) {
      this.#applyActionToPlayer(this.ais[0], actions[1], deltaTime);
    }

    // Update physics, collisions, etc. (existing code)
    // ... collision detection, saber updates, etc. ...

    // Calculate rewards for each player
    const rewards = [
      this.#calculateReward(0),
      this.#calculateReward(1)
    ];

    // Check terminal conditions
    const done = this.isDone();
    const outcome = done ? this.getOutcome() : null;

  return {
      observations: [
        this.#buildObservationFor(0),
        this.#buildObservationFor(1)
      ],
      rewards: rewards,
      done: done,
      outcome: outcome
    };
  }

  /**
   * Get number of players in the game
   */
  getNumPlayers() {
    return 2;
  }

  /**
   * Get observation size (same for all players)
   */
  getObservationSize() {
    return 9; // Size of normalized observation array
  }

  /**
   * Get action size (same for all players)
   */
  getActionSize() {
    return 4; // [W, A, S, D] - discrete actions
  }

  /**
   * Get action space for each action index
   */
  getActionSpaces() {
    return [
      { type: 'discrete' },  // W
      { type: 'discrete' },  // A
      { type: 'discrete' },  // S
      { type: 'discrete' }   // D
    ];
  }

  /**
   * Build normalized observation for a specific player
   * This replaces the old #buildObservation() method
   * Returns normalized number array (game-agnostic)
   */
  #buildObservationFor(playerIndex) {
    const p = playerIndex === 0 ? this.players[0] : this.ais[0];
    const o = playerIndex === 0 ? this.ais[0] : this.players[0];
    
    const playerPos = p?.position || { x: 0, y: 0 };
    const opponentPos = o?.position || { x: 0, y: 0 };
    const playerSaber = p?.saber || null;
    const opponentSaber = o?.saber || null;
    
    // Normalize to [0, 1] or [-1, 1] range
    return [
      playerPos.x / this.arena.width,      // normalized x
      playerPos.y / this.arena.height,     // normalized y
      opponentPos.x / this.arena.width,
      opponentPos.y / this.arena.height,
      (playerSaber?.getAngle() || 0) / (2 * Math.PI),  // normalized angle
      (opponentSaber?.getAngle() || 0) / (2 * Math.PI),
      (playerSaber?.getRotationSpeed() || 0) / MAX_ANGULAR_VELOCITY,
      (opponentSaber?.getRotationSpeed() || 0) / MAX_ANGULAR_VELOCITY,
      this.stepCount / MAX_STEPS  // normalized time
    ];
  }

  /**
   * Apply action to a player entity
   * Converts Action (number array) to player movement
   */
  #applyActionToPlayer(player, action, deltaTime) {
    // action is number[]: [W, A, S, D] where each is 0 or 1
    // Convert to movement direction
    const up = action[0] ? -1 : 0;
    const left = action[1] ? -1 : 0;
    const down = action[2] ? 1 : 0;
    const right = action[3] ? 1 : 0;
    
    let dx = left + right;
    let dy = up + down;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    
    const speed = player.movementSpeed || 50;
    const vx = dx * speed;
    const vy = dy * speed;
    player.velocity.x = vx;
    player.velocity.y = vy;
    
    const newX = player.position.x + vx * deltaTime;
    const newY = player.position.y + vy * deltaTime;
    const constrained = this.arena.constrainPosition(newX, newY, player.radius);
    player.position.x = constrained.x;
    player.position.y = constrained.y;
  }

  /**
   * Calculate reward for a specific player
   */
  #calculateReward(playerIndex) {
    // Existing reward calculation logic, but per-player
    // ... adapt existing #computeStepReward and #computeTerminalReward ...
  }

  /**
   * Get episode outcome
   */
  getOutcome() {
    // Return outcome array: ['win', 'loss'] or ['loss', 'win'] or ['tie', 'tie']
    // ... adapt existing outcome detection logic ...
  }

  // Remove: setOpponentController() - no longer needed, actions come from step()
}
```

**Key Changes:**
- GameCore is now an **interface** defined in `src/rl/core/GameCore.js` (library code)
- `SaberGameCore` implements the `GameCore` interface (game-specific code in `src/game/SaberGameCore.js`)
- `reset()` returns `GameState` with observations/rewards for all players
- `step(actions[], deltaTime)` takes actions array, applies to all players uniformly
- `#buildObservationFor(playerIndex)` returns normalized `number[]` array
- Implements `getNumPlayers()`, `getObservationSize()`, `getActionSize()`, `getActionSpaces()`
- Removed `setOpponentController()` - opponent actions come through `step()` now

### Step 2: Refactor PolicyAgent to Remove Game-Specific Dependencies

**Current Implementation (`src/rl/agents/PolicyAgent.js`):**
- Uses `GameStateProcessor` to normalize observations (game-specific)
- Uses `ActionMapper` to map actions (game-specific)
- Uses `GameState` and `MovementDecision` entities (game-specific)
- `act(observation, valueModel)` takes game-specific observation object
- `makeDecision(gameState)` takes game-specific GameState object

**New Implementation:**
```javascript
// src/rl/agents/PolicyAgent.js
export class PolicyAgent {
  constructor(config) {
    this.observationSize = config.observationSize;
    this.actionSize = config.actionSize;
    this.actionSpaces = config.actionSpaces;
    
    // Validate actionSpaces length matches actionSize
    if (this.actionSpaces.length !== this.actionSize) {
      throw new Error(`Action spaces length must match action size`);
    }
    
    // Network architecture configuration
    this.networkArchitecture = {
      policyHiddenLayers: config.networkArchitecture?.policyHiddenLayers || [64, 32],
      valueHiddenLayers: config.networkArchitecture?.valueHiddenLayers || [64, 32],
      activation: config.networkArchitecture?.activation || 'relu'
    };
    
    // Create or use provided networks
    this.policyNetwork = config.policyNetwork || this.createDefaultPolicyNetwork();
    this.valueNetwork = config.valueNetwork || this.createDefaultValueNetwork();
    
    // Learnable std array (one per action index)
    const initStd = config.initialStd ?? 0.1;
    const initStdArray = Array.isArray(initStd) 
      ? initStd 
      : new Array(this.actionSize).fill(initStd);
    this.learnableStd = tf.variable(tf.tensor1d(initStdArray), true);
  }

  /**
   * Act on normalized observation vector (game-agnostic)
   * @param {number[]} observation - Normalized feature vector
   * @returns {Object} {action: Action, logProb: number, value: number}
   */
  act(observation) {
    // Validate input size
    if (observation.length !== this.observationSize) {
      throw new Error(`Observation size mismatch`);
    }
    
    // Convert to tensor and get policy output
    const input = tf.tensor2d([observation], [1, this.observationSize]);
    const output = this.policyNetwork.predict(input);
    const outputArray = Array.from(output.dataSync());
    
    // Sample action based on action spaces
    const action = [];
    const logProbs = [];
    const epsilon = tf.randomNormal([this.actionSize], 0, 1);
    const epsilonArray = Array.from(epsilon.dataSync());
    
    for (let i = 0; i < this.actionSize; i++) {
      const actionSpace = this.actionSpaces[i];
      
      if (actionSpace.type === 'discrete') {
        const logit = outputArray[i];
        const prob = tf.sigmoid(tf.scalar(logit)).dataSync()[0];
        const sampled = Math.random() < prob ? 1 : 0;
        action[i] = sampled;
        logProbs[i] = sampled === 1 
          ? Math.log(prob + 1e-8)
          : Math.log(1 - prob + 1e-8);
      } else if (actionSpace.type === 'continuous') {
        const mean = outputArray[i];
        const stdArray = this.learnableStd.dataSync();
        const std = stdArray[i];
        const epsilon_i = epsilonArray[i];
        const sampled = mean + std * epsilon_i;
        action[i] = sampled;
        logProbs[i] = -0.5 * Math.log(2 * Math.PI * std * std) 
          - 0.5 * Math.pow((sampled - mean) / std, 2);
      }
    }
    
    epsilon.dispose();
    const logProb = logProbs.reduce((sum, lp) => sum + lp, 0);
    
    // Get value estimate
    const valueOutput = this.valueNetwork.predict(input);
    const value = valueOutput.squeeze().dataSync()[0];
    
    // Clean up tensors
    input.dispose();
    output.dispose();
    valueOutput.dispose();
    
    return { action, logProb, value };
  }

  // ... createDefaultPolicyNetwork(), createDefaultValueNetwork() as per design ...
  
  // Remove: makeDecision(), processGameState(), GameStateProcessor, ActionMapper dependencies
}
```

**Key Changes:**
- Remove imports: `GameStateProcessor`, `ActionMapper`, `GameState`, `MovementDecision`
- `act(observation)` now takes `number[]` directly (normalized observation)
- Remove `makeDecision()` and `processGameState()` methods
- Remove `stateProcessor` and `actionMapper` properties
- PolicyAgent is now completely game-agnostic

### Step 3: Update TrainingSession to Use GameCore Interface

**Current Implementation (`src/rl/training/TrainingSession.js`):**
- Constructor takes `game` object (not GameCore interface)
- Uses game-specific methods and properties
- Creates PolicyAgent with NeuralNetwork wrapper

**New Implementation:**
```javascript
// src/rl/training/TrainingSession.js
export class TrainingSession {
  constructor(gameCore, controllers, config) {
    this.gameCore = gameCore;  // GameCore interface
    this.controllers = controllers;  // PlayerController[] where index = player index
    this.trainablePlayers = config.trainablePlayers;  // number[]
    
    // Get observation/action info from GameCore
    const observationSize = gameCore.getObservationSize();
    const actionSize = gameCore.getActionSize();
    const actionSpaces = gameCore.getActionSpaces();
    
    // Create policy agents for trainable players
    this.policyAgents = [];
    for (const playerIndex of this.trainablePlayers) {
      const agent = new PolicyAgent({
        observationSize: observationSize,
        actionSize: actionSize,
        actionSpaces: actionSpaces,
        networkArchitecture: config.networkArchitecture
      });
      this.policyAgents[playerIndex] = agent;
      
      // Replace controller with PolicyController
      this.controllers[playerIndex] = new PolicyController(agent);
    }
    
    // Initialize trainer
    this.trainer = new PPOTrainer(config.algorithm.hyperparameters);
    
    // ... rest of initialization ...
  }

  async collectRollout() {
    let state = this.gameCore.reset();
    const experiences = [];
    const deltaTime = 0.05;
    const actionIntervalSeconds = 0.2;

    while (experiences.length < this.rolloutMaxLength) {
      // Collect actions from all controllers
      const actions = [];
      const logProbs = [];
      const values = [];
      
      for (let i = 0; i < this.controllers.length; i++) {
        const normalizedObs = state.observations[i];
        
        if (this.trainablePlayers.includes(i)) {
          const agent = this.policyAgents[i];
          const result = agent.act(normalizedObs);
          actions[i] = result.action;
          logProbs[i] = result.logProb;
          values[i] = result.value;
        } else {
          actions[i] = this.controllers[i].decide(normalizedObs);
        }
      }

      // Frame-skip: apply actions repeatedly
      let timeTillAction = actionIntervalSeconds;
      let rewardAccumulated = new Array(this.gameCore.getNumPlayers()).fill(0);
      let nextState = state;
      
      while (timeTillAction > 0 && !nextState.done) {
        nextState = this.gameCore.step(actions, deltaTime);
        
        for (let i = 0; i < nextState.rewards.length; i++) {
          rewardAccumulated[i] += nextState.rewards[i];
        }
        
        timeTillAction -= deltaTime;
        if (nextState.done) break;
      }

      // Store experiences for trainable players
      for (const playerIndex of this.trainablePlayers) {
        experiences.push({
          playerIndex,
          observation: state.observations[playerIndex],
          action: actions[playerIndex],
          reward: rewardAccumulated[playerIndex],
          nextObservation: nextState.observations[playerIndex],
          done: nextState.done,
          logProb: logProbs[playerIndex],
          value: values[playerIndex]
        });
      }

      state = nextState;
      if (nextState.done) {
        state = this.gameCore.reset();
      }
    }

    return experiences;
  }

  // ... rest of training loop ...
}
```

**Key Changes:**
- Constructor takes `gameCore` (GameCore interface) and `controllers` array
- Remove dependency on game-specific `game` object
- Use `gameCore.getObservationSize()`, `getActionSize()`, `getActionSpaces()`
- `collectRollout()` uses new GameState format with `observations[]` and `rewards[]`

### Step 4: Update RolloutCollector

**Current Implementation (`src/rl/training/RolloutCollector.js`):**
- Uses `core.step(action, deltaTime)` (old interface)
- Uses `core.reset()` returning single observation
- Uses `agent.act(observation, valueModel)` with valueModel parameter

**New Implementation:**
```javascript
// src/rl/training/RolloutCollector.js
export class RolloutCollector {
  constructor(core, agent, config = {}, hooks = {}) {
    this.core = core;  // GameCore interface
    this.agent = agent;  // PolicyAgent (no valueModel needed)
    this.hooks = hooks;
    
    if (this.agent && typeof this.agent.activate === 'function') {
      this.agent.activate();
    }
    
    this.rolloutMaxLength = config.rolloutMaxLength || 2048;
    this.deltaTime = config.deltaTime || 0.05;
    this.actionIntervalSeconds = config.actionIntervalSeconds || 0.2;
    this.yieldInterval = config.yieldInterval || 50;
  }

  async collectRollout() {
    const rolloutBuffer = [];
    let state = this.core.reset();
    
    // Sample opponent controller if hook provided
    if (typeof this.hooks.sampleOpponent === 'function') {
      const controller = this.hooks.sampleOpponent();
      // Note: In new design, opponent actions come through step(), 
      // so we'd need to update controllers array instead
    }
    
    while (rolloutBuffer.length < this.rolloutMaxLength) {
      // Get action from agent (for player 0, the trainable player)
      const normalizedObs = state.observations[0];
      const agentResult = this.agent.act(normalizedObs);
      const action = agentResult.action;
      const value = agentResult.value;
      const logProb = agentResult.logProb;
      
      // For other players, use controllers or default actions
      const actions = [action];
      for (let i = 1; i < this.core.getNumPlayers(); i++) {
        // Get action from controller or use default
        actions[i] = this.hooks.getActionForPlayer?.(i, state.observations[i]) || [0, 0, 0, 0];
      }
      
      // Frame-skip: apply actions repeatedly
      let timeTillAction = this.actionIntervalSeconds;
      let rewardAccumulated = 0;
      let nextState = state;
      
      while (timeTillAction > 0 && !nextState.done) {
        nextState = this.core.step(actions, this.deltaTime);
        rewardAccumulated += nextState.rewards[0]; // Reward for player 0
        timeTillAction -= this.deltaTime;
        if (nextState.done) break;
      }
      
      // Store experience
      rolloutBuffer.push({
        observation: state.observations[0],
        action: action,
        reward: rewardAccumulated,
        done: nextState.done,
        value: value,
        logProb: logProb,
        nextValue: null, // Set later for GAE
        outcome: nextState.done ? nextState.outcome : null
      });
      
      state = nextState;
      if (nextState.done) {
        state = this.core.reset();
      }
      
      // Yield periodically
      if (rolloutBuffer.length % this.yieldInterval === 0) {
        await this.yieldToEventLoop();
      }
    }
    
    // Compute last value and set nextValue for GAE
    let lastValue = 0;
    if (!state.done) {
      lastValue = this.agent.act(state.observations[0]).value;
    }
    
    for (let i = 0; i < rolloutBuffer.length; i++) {
      const exp = rolloutBuffer[i];
      if (exp.done) {
        exp.nextValue = 0;
      } else if (i === rolloutBuffer.length - 1) {
        exp.nextValue = lastValue;
      } else {
        exp.nextValue = rolloutBuffer[i + 1].value;
      }
    }
    
    return { rolloutBuffer, lastValue };
  }
}
```

**Key Changes:**
- Use `core.step(actions[], deltaTime)` with actions array
- Use `state.observations[playerIndex]` instead of single observation
- Remove `valueModel` parameter - value network is inside PolicyAgent
- Handle multiple players in actions array

### Step 5: Update Controllers to Match PlayerController Interface

**Current Implementation (`src/game/controllers/PolicyController.js`):**
- `decide(observation, deltaTime)` takes optional deltaTime
- Returns action mask `[boolean, boolean, boolean, boolean]`
- Handles activation of policy agent

**New Implementation:**
```javascript
// src/game/controllers/PolicyController.js
export class PolicyController {
  constructor(policyAgent) {
    this.agent = policyAgent;
    this._activated = false;
  }

  /**
   * Decide on an action given a normalized observation vector
   * @param {number[]} observation - Normalized observation vector
   * @returns {Action} Action (number array)
   */
  decide(observation) {
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
```

**Key Changes:**
- `decide(observation)` - remove `deltaTime` parameter (not in interface)
- Return `Action` (number array) directly, not boolean mask
- Simplify - no need to convert between formats

### Step 6: Organize RL Library Code Structure

**Current Structure:**
```
src/rl/
  - agents/ (PolicyAgent, NeuralNetwork)
  - entities/ (GameState, MovementDecision, TrainingMetrics)
  - training/ (TrainingSession, PPOTrainer, RolloutCollector, ExperienceBuffer)
  - utils/ (GameStateProcessor, ActionMapper, ModelManager, ...)
  - visualization/ (TrainingUI, ProgressChart)
  - workers/ (TrainingWorker)
  - environments/ (ParallelRunner)
```

**New Structure (All RL Library Code in `src/rl/`):**
```
src/rl/
  - agents/
    - PolicyAgent.js (game-agnostic, no game-specific deps)
    - NeuralNetwork.js (can be removed, use tf.LayersModel directly)
  - training/
    - TrainingSession.js (uses GameCore interface)
    - PPOTrainer.js (game-agnostic)
    - RolloutCollector.js (uses GameCore interface)
    - ExperienceBuffer.js
  - utils/
    - NetworkUtils.js (NEW - serialization utilities from design)
    - ModelManager.js
    - CheckpointManager.js
    - Logger.js
    - MetricsTracker.js
    - PerformanceMonitor.js
    - ErrorHandler.js
  - visualization/
    - TrainingUI.js
    - ProgressChart.js
  - entities/
    - TrainingMetrics.js (keep - game-agnostic)
    - (Remove: GameState.js, MovementDecision.js - these are game-specific)
```

**Files to Remove/Refactor:**
- `src/rl/utils/GameStateProcessor.js` - Move to `src/game/utils/` (game-specific)
- `src/rl/utils/ActionMapper.js` - Move to `src/game/utils/` (game-specific)
- `src/rl/entities/GameState.js` - Remove (use GameState from design interface)
- `src/rl/entities/MovementDecision.js` - Remove (not needed in library)
- `src/rl/agents/NeuralNetwork.js` - Can be removed (use tf.LayersModel directly in PolicyAgent)

### Step 7: Update PPOTrainer to Work with New PolicyAgent

**Current Implementation:**
- Uses `GameStateProcessor` to process observations
- Takes separate `policyModel`, `valueModel`, `learnableStd` parameters

**New Implementation:**
```javascript
// src/rl/training/PPOTrainer.js
export class PPOTrainer {
  async train(experiences, policyAgent) {
    // policyAgent contains: policyNetwork, valueNetwork, learnableStd, actionSpaces
    
    // Prepare training data
    const observations = experiences.map(e => e.observation);
    const actions = experiences.map(e => e.action);
    const oldLogProbs = experiences.map(e => e.logProb);
    // ... compute advantages, returns, etc. ...
    
    // Recompute log probabilities under current policy
    const newLogProbs = [];
    for (let i = 0; i < experiences.length; i++) {
      const obs = observations[i];
      const action = actions[i];
      
      // Forward pass through policy network
      const input = tf.tensor2d([obs], [1, policyAgent.observationSize]);
      const output = policyAgent.policyNetwork.predict(input);
      const outputArray = Array.from(output.dataSync());
      
      let logProb = 0;
      for (let j = 0; j < policyAgent.actionSize; j++) {
        const actionSpace = policyAgent.actionSpaces[j];
        if (actionSpace.type === 'discrete') {
          const logit = outputArray[j];
          const prob = tf.sigmoid(tf.scalar(logit)).dataSync()[0];
          logProb += action[j] === 1 
            ? Math.log(prob + 1e-8)
            : Math.log(1 - prob + 1e-8);
        } else if (actionSpace.type === 'continuous') {
          const mean = outputArray[j];
          const stdArray = policyAgent.learnableStd.dataSync();
          const std = stdArray[j];
          logProb += -0.5 * Math.log(2 * Math.PI * std * std)
            - 0.5 * Math.pow((action[j] - mean) / std, 2);
        }
      }
      newLogProbs.push(logProb);
      
      input.dispose();
      output.dispose();
    }
    
    // Compute policy loss, value loss, entropy
    // ... PPO algorithm implementation ...
    
    // Update networks and learnableStd via optimizers
    // ...
  }
}
```

**Key Changes:**
- `train(experiences, policyAgent)` - takes PolicyAgent object
- Access `policyAgent.policyNetwork`, `valueNetwork`, `learnableStd`, `actionSpaces`
- Remove `GameStateProcessor` dependency
- Recompute log probabilities using action spaces from PolicyAgent

### Step 8: Update Main Application Code

**Current (`src/main.js`):**
- Creates PolicyAgent with NeuralNetwork wrapper
- Uses game-specific initialization

**New:**
```javascript
// src/main.js
import { GameCore } from './game/GameCore.js';
import { PolicyAgent } from './rl/agents/PolicyAgent.js';
import { PolicyController } from './game/controllers/PolicyController.js';
import { TrainingSession } from './rl/training/TrainingSession.js';

// Initialize GameCore (implements standardized interface)
const gameCore = new GameCore();

// Create controllers array
const controllers = [
  new HumanController(),  // Player 0
  new RandomController(gameCore.getActionSpaces())  // Player 1
];

// Initialize training session
const trainingSession = new TrainingSession(gameCore, controllers, {
  trainablePlayers: [0],  // Train player 0
  algorithm: {
    type: 'PPO',
    hyperparameters: { ... }
  },
  networkArchitecture: {
    policyHiddenLayers: [64, 32],
    valueHiddenLayers: [64, 32],
    activation: 'relu'
  }
});

// Start training
await trainingSession.start();
```

### Summary of Migration Steps

1. ✅ **Refactor GameCore** - Implement standardized interface (reset, step, getNumPlayers, etc.)
2. ✅ **Refactor PolicyAgent** - Remove game-specific dependencies, work with number arrays
3. ✅ **Update TrainingSession** - Use GameCore interface, controllers array
4. ✅ **Update RolloutCollector** - Use new GameCore interface
5. ✅ **Update Controllers** - Match PlayerController interface
6. ✅ **Organize RL Library** - Keep all library code in `src/rl/`, remove game-specific code
7. ✅ **Update PPOTrainer** - Take PolicyAgent object, remove game-specific deps
8. ✅ **Update Main App** - Use new interfaces

**Result:** The RL code in `src/rl/` becomes a reusable library. To use it with a new game:
1. Implement the `GameCore` interface (defined in `src/rl/core/GameCore.js`) for the new game
2. Create `PolicyAgent` with observation/action sizes from your GameCore implementation
3. Create `TrainingSession` with your GameCore implementation and controllers
4. Start training - the library handles everything else

**Library Structure:**
- `src/rl/core/GameCore.js` - GameCore interface definition (library code)
- `src/rl/agents/` - PolicyAgent and other agents (library code)
- `src/rl/training/` - TrainingSession, PPOTrainer, etc. (library code)
- `src/rl/utils/` - NetworkUtils and other utilities (library code)
- `src/game/SaberGameCore.js` - Saber game implementation of GameCore interface (game-specific code)

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
- ✅ `policyNetwork` and `valueNetwork` (tf.LayersModel) - take `number[]` as input, return arrays
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
      { type: 'continuous' },  // mouseX
      { type: 'continuous' }   // mouseY
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
   - Continuous real-valued actions in original units (no normalization/mapping)
2. **Action Spaces**: Each action index has an associated `ActionSpace` that defines how to sample it
3. **Observation Arrays**: Normalized number arrays (game-agnostic)
4. **Reward Shaping**: Handled by GameCore

This design makes the framework:
- Flexible (supports both discrete and continuous actions in the same array)
- Clear (action spaces explicitly define how each action is sampled: one ActionSpace per action index)
- Game-agnostic (GameCore defines action spaces; PolicyAgent samples continuous actions using mean from the network and learnable std array, one std per action index)

## PPO Algorithm Adaptations for Mixed Action Types

The PPO algorithm needs to be adapted to handle mixed discrete/continuous actions:

### Key Changes Required:

1. **Log Probability Computation**:
   - **Current**: PPO assumes all actions are discrete (Bernoulli) and computes log probabilities using `log(prob)` for action=1 and `log(1-prob)` for action=0
   - **Required**: PPO must recompute log probabilities during training based on action spaces:
     - **Discrete actions**: Use Bernoulli distribution: `log(prob)` if action=1, `log(1-prob)` if action=0
     - **Continuous actions**: Use Normal distribution in original units:
       - Policy outputs mean directly; std is a learnable parameter array (one std per action index)
       - Sampling: `action[i] = mean[i] + std[i] * epsilon[i]`, with `epsilon[i] ~ N(0, 1)`
       - Log prob: `-0.5 * log(2πσ²) - 0.5 * ((action[i] - mean[i]) / σ[i])²` where `σ[i]` is the std for action index i
     - The total log probability is the sum of individual action log probabilities
   - **Why reparameterization**: Allows gradients to flow through the sampling process, making training more stable

2. **Policy Loss Calculation**:
   - The importance sampling ratio `ratio = exp(new_log_prob - old_log_prob)` works the same way
   - The clipping mechanism remains unchanged
   - But the log probability computation must handle mixed types

3. **Entropy Calculation**:
   - **Discrete actions**: Entropy = `-prob * log(prob) - (1-prob) * log(1-prob)`
   - **Continuous actions**: Entropy = `0.5 * log(2πeσ²[i])` (for Normal distribution, where σ[i] is the std for action index i)
   - Total entropy is the sum of individual entropies across all action indices

4. **Trainer Interface**:
   - The `Trainer.train()` method accepts a `PolicyAgent` parameter
   - The PolicyAgent contains all necessary components: policy network (`policyNetwork` - tf.LayersModel), value network (`valueNetwork` - tf.LayersModel), learnable std array (`learnableStd`), and action spaces (`actionSpaces`)
   - This allows the trainer to access all policy-related parameters and correctly recompute log probabilities during training

### Implementation Notes:

- **PolicyAgent.act()** uses reparameterization trick for continuous actions:
  - Samples `epsilon[i] ~ N(0, 1)` (standard normal) for each action index i
  - Transforms: `action[i] = mean[i] + std[i] * epsilon[i]` where `std[i]` is the learnable std for action index i
  - This allows gradients to flow through sampling, making training stable
- **Stored experiences** have the correct `logProb` from the old policy
- **During training**, PPO recomputes log probabilities under the current policy to compute the importance sampling ratio
  - For discrete actions: forward pass to get logits → sigmoid to get `prob` → compute `log(prob)` if action=1 or `log(1-prob)` if action=0
  - For continuous actions: forward pass to get the current mean[i] (original units); use the PolicyAgent's learnable `std[i]` for action index i; compute
    `log_prob[i] = -0.5 * log(2πσ²[i]) - 0.5 * ((action[i] - mean[i]) / σ[i])²` directly on the stored action value; do not reuse the old `epsilon`
  - The trainer accesses `policyAgent.actionSpaces` to know which action indices are discrete vs continuous
  - The trainer accesses `policyAgent.learnableStd` (the learnable std array) to:
    - Recompute log probabilities for continuous actions during training
    - Update the std parameters via gradient descent (the std array is trainable and should be included in the optimizer)
- **Gradient flow**: The reparameterization trick ensures that gradients can flow from the loss back through the sampling operation to the policy network parameters


