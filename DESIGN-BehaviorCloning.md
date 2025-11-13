# Behavior Cloning Design for MimicRL

## Overview

This document describes the design for adding Behavior Cloning (BC) capabilities to MimicRL. Behavior Cloning is a form of imitation learning where a policy is trained to mimic expert demonstrations through supervised learning. This feature allows users to record their gameplay and train the agent to imitate their behavior.

## Goals

1. **Game-Agnostic Design**: BC components work exclusively with normalized observations and actions, following the same principles as the existing RL library
2. **User-Friendly**: Allow users to mark episodes for training after gameplay
3. **Flexible**: Support both single-episode and batch training from multiple episodes
4. **Integrated**: Work seamlessly with existing PolicyAgent and training infrastructure
5. **Efficient**: Store demonstrations efficiently and support incremental training

## Core Concepts

### Behavior Cloning Overview

Behavior Cloning trains a policy network using supervised learning on expert demonstrations:
- **Input**: Expert state-action pairs `(observation, action)` from human gameplay
- **Output**: Trained policy network that mimics the expert's behavior
- **Method**: Supervised learning (typically mean squared error or cross-entropy loss)

### Key Differences from RL

| Aspect | Reinforcement Learning (PPO) | Behavior Cloning |
|--------|------------------------------|------------------|
| **Training Signal** | Rewards from environment | Expert demonstrations |
| **Loss Function** | Policy gradient + value loss | Supervised learning loss |
| **Data Collection** | Agent explores and collects rollouts | Human plays and records actions |
| **Exploration** | Agent explores via entropy bonus | No exploration needed |
| **Value Network** | Required for bootstrapping | Not needed (optional for evaluation) |

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Game Implementation                    │
│  ┌───────────────────────────────────────────────────┐  │
│  │              GameCore (Game-Specific)              │  │
│  │  - Returns normalized observations                 │  │
│  │  - Accepts actions from controllers                │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ▲
                          │
┌─────────────────────────────────────────────────────────┐
│              MimicRL Library (Game-Agnostic)             │
│  ┌───────────────────────────────────────────────────┐  │
│  │         DemonstrationCollector                    │  │
│  │  - Records (observation, action) pairs           │  │
│  │  - Stores in game-agnostic format                │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │         BehaviorCloningTrainer                    │  │
│  │  - Trains policy network via supervised learning │  │
│  │  - Uses PolicyAgent.policyNetwork                 │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │         DemonstrationStorage                     │  │
│  │  - Persists demonstrations to disk               │  │
│  │  - Loads demonstrations for training             │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Core Interfaces and Classes

### 1. Demonstration Structure

**Location:** `src/MimicRL/bc/Demonstration.ts` (library code)

```typescript
/**
 * A single demonstration step (state-action pair)
 * Game-agnostic: uses normalized observations and actions
 */
interface DemonstrationStep {
  /**
   * Normalized observation array (from GameCore)
   */
  observation: number[];

  /**
   * Action taken by expert (number array)
   * Matches Action type from GameCore interface
   */
  action: Action;

  /**
   * Optional metadata
   */
  metadata?: {
    timestamp?: number;
    episodeId?: string;
    stepIndex?: number;
    [key: string]: any;
  };
}

/**
 * A complete episode demonstration
 */
interface DemonstrationEpisode {
  /**
   * Unique identifier for this episode
   */
  id: string;

  /**
   * Array of demonstration steps
   */
  steps: DemonstrationStep[];

  /**
   * Episode metadata
   */
  metadata: {
    timestamp: number;
    duration?: number;
    outcome?: ('win' | 'loss' | 'tie')[] | null;
    playerIndex?: number;  // Which player this demonstration is for
    [key: string]: any;
  };
}

/**
 * Collection of demonstration episodes
 */
interface DemonstrationDataset {
  /**
   * Array of demonstration episodes
   */
  episodes: DemonstrationEpisode[];

  /**
   * Dataset metadata
   */
  metadata: {
    totalSteps: number;
    createdAt: number;
    updatedAt: number;
    gameCoreInfo?: {
      observationSize: number;
      actionSize: number;
      actionSpaces: ActionSpace[];
    };
  };
}
```

### 2. DemonstrationCollector

**Location:** `src/MimicRL/bc/DemonstrationCollector.ts` (library code)

**Purpose:** Collects expert demonstrations during gameplay in a game-agnostic format.

```typescript
/**
 * DemonstrationCollector - Collects expert demonstrations during gameplay
 * Game-agnostic: works with normalized observations and actions from GameCore
 */
class DemonstrationCollector {
  constructor(config?: {
    /**
     * Whether to automatically record all steps (default: false)
     * If false, only records when explicitly enabled
     */
    autoRecord?: boolean;

    /**
     * Maximum number of steps to keep in memory before flushing
     */
    maxBufferSize?: number;
  }) {
    this.autoRecord = config?.autoRecord ?? false;
    this.maxBufferSize = config?.maxBufferSize ?? 10000;
    this.currentEpisode = null;
    this.episodeBuffer = [];
    this.isRecording = false;
  }

  /**
   * Start recording a new episode
   * @param {string} episodeId - Unique identifier for this episode
   * @param {Object} metadata - Optional episode metadata
   */
  startEpisode(episodeId: string, metadata?: Record<string, any>): void {
    if (this.isRecording) {
      this.endEpisode();
    }
    
    this.currentEpisode = {
      id: episodeId,
      steps: [],
      metadata: {
        timestamp: Date.now(),
        ...metadata
      }
    };
    this.isRecording = true;
  }

  /**
   * Record a single step (observation-action pair)
   * @param {number[]} observation - Normalized observation from GameCore
   * @param {Action} action - Action taken by expert
   * @param {Object} stepMetadata - Optional step metadata
   */
  recordStep(
    observation: number[],
    action: Action,
    stepMetadata?: Record<string, any>
  ): void {
    if (!this.isRecording || !this.currentEpisode) {
      return; // Not recording, ignore
    }

    const step: DemonstrationStep = {
      observation,
      action,
      metadata: {
        stepIndex: this.currentEpisode.steps.length,
        ...stepMetadata
      }
    };

    this.currentEpisode.steps.push(step);

    // Flush to buffer if needed
    if (this.currentEpisode.steps.length >= this.maxBufferSize) {
      this.flushCurrentEpisode();
    }
  }

  /**
   * End the current episode and return the demonstration
   * @param {Object} episodeMetadata - Final episode metadata (e.g., outcome)
   * @returns {DemonstrationEpisode | null} The completed episode, or null if not recording
   */
  endEpisode(episodeMetadata?: Record<string, any>): DemonstrationEpisode | null {
    if (!this.isRecording || !this.currentEpisode) {
      return null;
    }

    // Merge final metadata
    this.currentEpisode.metadata = {
      ...this.currentEpisode.metadata,
      ...episodeMetadata,
      duration: Date.now() - this.currentEpisode.metadata.timestamp
    };

    const episode = this.currentEpisode;
    this.episodeBuffer.push(episode);
    this.currentEpisode = null;
    this.isRecording = false;

    return episode;
  }

  /**
   * Discard the current episode without saving
   */
  discardEpisode(): void {
    this.currentEpisode = null;
    this.isRecording = false;
  }

  /**
   * Get all buffered episodes
   * @returns {DemonstrationEpisode[]} Array of completed episodes
   */
  getEpisodes(): DemonstrationEpisode[] {
    return [...this.episodeBuffer];
  }

  /**
   * Clear all buffered episodes
   */
  clearEpisodes(): void {
    this.episodeBuffer = [];
  }

  /**
   * Flush current episode to buffer (for memory management)
   */
  private flushCurrentEpisode(): void {
    if (this.currentEpisode && this.currentEpisode.steps.length > 0) {
      this.episodeBuffer.push(this.currentEpisode);
      // Start new episode with same ID
      const id = this.currentEpisode.id;
      const metadata = this.currentEpisode.metadata;
      this.currentEpisode = {
        id: id,
        steps: [],
        metadata: { ...metadata }
      };
    }
  }
}
```

**Key Design Points:**
- Works with normalized `number[]` observations and `Action` arrays (game-agnostic)
- Can record selectively (user marks episodes for training)
- Manages memory by buffering episodes
- Returns episodes in a structured format for training

### 3. DemonstrationStorage

**Location:** `src/MimicRL/bc/DemonstrationStorage.ts` (library code)

**Purpose:** Persists demonstrations to disk and loads them for training.

```typescript
/**
 * DemonstrationStorage - Handles persistence of demonstrations
 * Game-agnostic: stores normalized observations and actions
 */
class DemonstrationStorage {
  constructor(config?: {
    /**
     * Base directory for storing demonstrations
     */
    storageDir?: string;

    /**
     * Storage format ('json' | 'binary')
     */
    format?: 'json' | 'binary';
  }) {
    this.storageDir = config?.storageDir || './demonstrations';
    this.format = config?.format || 'json';
  }

  /**
   * Save a demonstration dataset to disk
   * @param {DemonstrationDataset} dataset - Dataset to save
   * @param {string} filename - Optional filename (default: auto-generated)
   * @returns {Promise<string>} Path to saved file
   */
  async saveDataset(
    dataset: DemonstrationDataset,
    filename?: string
  ): Promise<string> {
    // Generate filename if not provided
    if (!filename) {
      const timestamp = Date.now();
      filename = `demonstrations_${timestamp}.${this.format === 'json' ? 'json' : 'bin'}`;
    }

    const filepath = `${this.storageDir}/${filename}`;

    if (this.format === 'json') {
      // Save as JSON
      const json = JSON.stringify(dataset, null, 2);
      await fs.writeFile(filepath, json, 'utf-8');
    } else {
      // Save as binary (more efficient for large datasets)
      const buffer = this.serializeDataset(dataset);
      await fs.writeFile(filepath, buffer);
    }

    return filepath;
  }

  /**
   * Load a demonstration dataset from disk
   * @param {string} filepath - Path to dataset file
   * @returns {Promise<DemonstrationDataset>} Loaded dataset
   */
  async loadDataset(filepath: string): Promise<DemonstrationDataset> {
    if (this.format === 'json') {
      const json = await fs.readFile(filepath, 'utf-8');
      return JSON.parse(json);
    } else {
      const buffer = await fs.readFile(filepath);
      return this.deserializeDataset(buffer);
    }
  }

  /**
   * List all available datasets
   * @returns {Promise<string[]>} Array of dataset file paths
   */
  async listDatasets(): Promise<string[]> {
    const files = await fs.readdir(this.storageDir);
    return files
      .filter(f => f.endsWith('.json') || f.endsWith('.bin'))
      .map(f => `${this.storageDir}/${f}`);
  }

  /**
   * Delete a dataset file
   * @param {string} filepath - Path to dataset file
   */
  async deleteDataset(filepath: string): Promise<void> {
    await fs.unlink(filepath);
  }

  /**
   * Create a dataset from episodes
   * @param {DemonstrationEpisode[]} episodes - Episodes to include
   * @param {Object} gameCoreInfo - GameCore metadata (observationSize, actionSize, actionSpaces)
   * @returns {DemonstrationDataset} Created dataset
   */
  createDataset(
    episodes: DemonstrationEpisode[],
    gameCoreInfo?: {
      observationSize: number;
      actionSize: number;
      actionSpaces: ActionSpace[];
    }
  ): DemonstrationDataset {
    const totalSteps = episodes.reduce((sum, ep) => sum + ep.steps.length, 0);
    
    return {
      episodes,
      metadata: {
        totalSteps,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        gameCoreInfo
      }
    };
  }

  /**
   * Serialize dataset to binary format
   */
  private serializeDataset(dataset: DemonstrationDataset): Buffer {
    // Implementation: convert to binary format (e.g., using MessagePack or custom format)
    // For now, can use JSON as fallback
    const json = JSON.stringify(dataset);
    return Buffer.from(json, 'utf-8');
  }

  /**
   * Deserialize dataset from binary format
   */
  private deserializeDataset(buffer: Buffer): DemonstrationDataset {
    const json = buffer.toString('utf-8');
    return JSON.parse(json);
  }
}
```

**Key Design Points:**
- Stores demonstrations in game-agnostic format (normalized arrays)
- Supports both JSON (human-readable) and binary (efficient) formats
- Includes GameCore metadata for validation
- Can list, load, and delete datasets

### 4. BehaviorCloningTrainer

**Location:** `src/MimicRL/bc/BehaviorCloningTrainer.ts` (library code)

**Purpose:** Trains a policy network using supervised learning on expert demonstrations.

```typescript
/**
 * BehaviorCloningTrainer - Trains policy network via supervised learning
 * Game-agnostic: works with normalized observations and actions
 */
class BehaviorCloningTrainer {
  constructor(config?: {
    /**
     * Learning rate for optimizer
     */
    learningRate?: number;

    /**
     * Batch size for training
     */
    batchSize?: number;

    /**
     * Number of epochs to train
     */
    epochs?: number;

    /**
     * Loss function type
     * - 'mse': Mean squared error (for continuous actions)
     * - 'crossentropy': Cross-entropy (for discrete actions)
     * - 'mixed': Automatically choose based on action spaces
     */
    lossType?: 'mse' | 'crossentropy' | 'mixed';

    /**
     * Weight decay (L2 regularization)
     */
    weightDecay?: number;

    /**
     * Validation split (0-1, fraction of data to use for validation)
     */
    validationSplit?: number;
  }) {
    this.config = {
      learningRate: config?.learningRate ?? 0.001,
      batchSize: config?.batchSize ?? 32,
      epochs: config?.epochs ?? 10,
      lossType: config?.lossType ?? 'mixed',
      weightDecay: config?.weightDecay ?? 0.0001,
      validationSplit: config?.validationSplit ?? 0.2,
      ...config
    };

    // Create optimizer
    this.optimizer = tf.train.adam(this.config.learningRate);

    // Training statistics
    this.trainingStats = {
      trainLoss: 0,
      valLoss: 0,
      epoch: 0,
      step: 0
    };
  }

  /**
   * Train policy network on demonstration dataset
   * @param {DemonstrationDataset} dataset - Dataset of expert demonstrations
   * @param {PolicyAgent} policyAgent - Policy agent to train (updates policyNetwork)
   * @param {Function} onProgress - Optional progress callback (epoch, loss, valLoss) => void
   * @returns {Promise<TrainingStats>} Final training statistics
   */
  async train(
    dataset: DemonstrationDataset,
    policyAgent: PolicyAgent,
    onProgress?: (epoch: number, loss: number, valLoss?: number) => void
  ): Promise<TrainingStats> {
    // Validate dataset matches policy agent
    this.validateDataset(dataset, policyAgent);

    // Prepare training data
    const { trainData, valData } = this.prepareTrainingData(dataset, policyAgent);

    // Train for specified epochs
    for (let epoch = 0; epoch < this.config.epochs; epoch++) {
      const epochStats = await this.trainEpoch(
        trainData,
        policyAgent,
        epoch
      );

      // Validate if validation split > 0
      let valLoss = 0;
      if (valData && valData.observations.shape[0] > 0) {
        valLoss = this.computeValidationLoss(valData, policyAgent);
      }

      this.trainingStats = {
        trainLoss: epochStats.loss,
        valLoss: valLoss,
        epoch: epoch + 1,
        step: (epoch + 1) * this.config.batchSize
      };

      // Call progress callback
      if (onProgress) {
        onProgress(epoch + 1, epochStats.loss, valLoss);
      }

      // Yield to event loop periodically
      await this.yieldToEventLoop();
    }

    // Clean up tensors
    trainData.observations.dispose();
    trainData.actions.dispose();
    if (valData) {
      valData.observations.dispose();
      valData.actions.dispose();
    }

    return this.trainingStats;
  }

  /**
   * Prepare training data from dataset
   * @param {DemonstrationDataset} dataset - Dataset to prepare
   * @param {PolicyAgent} policyAgent - Policy agent for validation
   * @returns {Object} Prepared training data with train/val split
   */
  private prepareTrainingData(
    dataset: DemonstrationDataset,
    policyAgent: PolicyAgent
  ): {
    trainData: { observations: tf.Tensor, actions: tf.Tensor };
    valData?: { observations: tf.Tensor, actions: tf.Tensor };
  } {
    // Flatten all episodes into single arrays
    const observations: number[][] = [];
    const actions: number[][] = [];

    for (const episode of dataset.episodes) {
      for (const step of episode.steps) {
        observations.push(step.observation);
        actions.push(step.action);
      }
    }

    // Convert to tensors
    const obsTensor = tf.tensor2d(observations, [observations.length, policyAgent.observationSize]);
    const actTensor = tf.tensor2d(actions, [actions.length, policyAgent.actionSize]);

    // Split into train/validation
    if (this.config.validationSplit > 0) {
      const totalSamples = observations.length;
      const valSize = Math.floor(totalSamples * this.config.validationSplit);
      const trainSize = totalSamples - valSize;

      const trainObs = obsTensor.slice([0, 0], [trainSize, -1]);
      const trainAct = actTensor.slice([0, 0], [trainSize, -1]);
      const valObs = obsTensor.slice([trainSize, 0], [valSize, -1]);
      const valAct = actTensor.slice([trainSize, 0], [valSize, -1]);

      return {
        trainData: { observations: trainObs, actions: trainAct },
        valData: { observations: valObs, actions: valAct }
      };
    } else {
      return {
        trainData: { observations: obsTensor, actions: actTensor }
      };
    }
  }

  /**
   * Train for one epoch
   */
  private async trainEpoch(
    data: { observations: tf.Tensor, actions: tf.Tensor },
    policyAgent: PolicyAgent,
    epoch: number
  ): Promise<{ loss: number }> {
    const batchSize = this.config.batchSize;
    const totalSamples = data.observations.shape[0];
    const numBatches = Math.ceil(totalSamples / batchSize);

    let totalLoss = 0;

    // Shuffle data (create indices and shuffle)
    const indices = Array.from({ length: totalSamples }, (_, i) => i);
    this.shuffleArray(indices);

    for (let i = 0; i < numBatches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, totalSamples);

      // Get batch indices
      const batchIndices = indices.slice(start, end);

      // Create batch tensors
      const batchObs = tf.gather(data.observations, batchIndices);
      const batchAct = tf.gather(data.actions, batchIndices);

      // Train on batch
      const loss = await this.trainBatch(batchObs, batchAct, policyAgent);
      totalLoss += loss;

      // Clean up
      batchObs.dispose();
      batchAct.dispose();

      // Yield periodically
      if (i % 10 === 0) {
        await this.yieldToEventLoop();
      }
    }

    return { loss: totalLoss / numBatches };
  }

  /**
   * Train on a single batch
   */
  private async trainBatch(
    observations: tf.Tensor,
    actions: tf.Tensor,
    policyAgent: PolicyAgent
  ): Promise<number> {
    return tf.tidy(() => {
      // Forward pass
      const predictions = policyAgent.policyNetwork.predict(observations) as tf.Tensor;

      // Compute loss based on action spaces
      const loss = this.computeLoss(predictions, actions, policyAgent);

      // Backward pass
      this.optimizer.minimize(() => {
        const pred = policyAgent.policyNetwork.predict(observations) as tf.Tensor;
        return this.computeLoss(pred, actions, policyAgent);
      });

      const lossValue = loss.dataSync()[0];
      predictions.dispose();
      return lossValue;
    });
  }

  /**
   * Compute loss based on action spaces
   */
  private computeLoss(
    predictions: tf.Tensor,
    targets: tf.Tensor,
    policyAgent: PolicyAgent
  ): tf.Scalar {
    if (this.config.lossType === 'mixed') {
      // Compute loss per action index based on action space type
      const losses: tf.Tensor[] = [];

      for (let i = 0; i < policyAgent.actionSize; i++) {
        const actionSpace = policyAgent.actionSpaces[i];
        const predSlice = predictions.slice([0, i], [-1, 1]).squeeze();
        const targetSlice = targets.slice([0, i], [-1, 1]).squeeze();

        if (actionSpace.type === 'discrete') {
          // For discrete: use sigmoid + binary cross-entropy
          const probs = tf.sigmoid(predSlice);
          const loss = tf.losses.sigmoidCrossEntropy(
            targetSlice,
            probs
          );
          losses.push(loss);
        } else {
          // For continuous: use MSE
          const loss = tf.losses.meanSquaredError(targetSlice, predSlice);
          losses.push(loss);
        }

        predSlice.dispose();
        targetSlice.dispose();
      }

      // Average losses
      const totalLoss = losses.reduce((sum, l) => sum.add(l), tf.scalar(0));
      losses.forEach(l => l.dispose());
      return totalLoss.div(tf.scalar(losses.length));
    } else if (this.config.lossType === 'mse') {
      return tf.losses.meanSquaredError(targets, predictions);
    } else {
      // crossentropy: apply sigmoid to predictions first
      const probs = tf.sigmoid(predictions);
      return tf.losses.sigmoidCrossEntropy(targets, probs);
    }
  }

  /**
   * Compute validation loss
   */
  private computeValidationLoss(
    valData: { observations: tf.Tensor, actions: tf.Tensor },
    policyAgent: PolicyAgent
  ): number {
    return tf.tidy(() => {
      const predictions = policyAgent.policyNetwork.predict(valData.observations) as tf.Tensor;
      const loss = this.computeLoss(predictions, valData.actions, policyAgent);
      const lossValue = loss.dataSync()[0];
      predictions.dispose();
      return lossValue;
    });
  }

  /**
   * Validate dataset matches policy agent
   */
  private validateDataset(
    dataset: DemonstrationDataset,
    policyAgent: PolicyAgent
  ): void {
    if (dataset.metadata.gameCoreInfo) {
      const info = dataset.metadata.gameCoreInfo;
      if (info.observationSize !== policyAgent.observationSize) {
        throw new Error(
          `Observation size mismatch: dataset has ${info.observationSize}, ` +
          `policy agent expects ${policyAgent.observationSize}`
        );
      }
      if (info.actionSize !== policyAgent.actionSize) {
        throw new Error(
          `Action size mismatch: dataset has ${info.actionSize}, ` +
          `policy agent expects ${policyAgent.actionSize}`
        );
      }
    }

    // Validate first step if available
    if (dataset.episodes.length > 0 && dataset.episodes[0].steps.length > 0) {
      const firstStep = dataset.episodes[0].steps[0];
      if (firstStep.observation.length !== policyAgent.observationSize) {
        throw new Error('Observation size mismatch in dataset');
      }
      if (firstStep.action.length !== policyAgent.actionSize) {
        throw new Error('Action size mismatch in dataset');
      }
    }
  }

  /**
   * Shuffle array in place
   */
  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  /**
   * Yield to event loop
   */
  private async yieldToEventLoop(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
  }
}
```

**Key Design Points:**
- Works with `PolicyAgent.policyNetwork` (game-agnostic)
- Supports mixed action spaces (discrete/continuous)
- Uses supervised learning (no value network needed)
- Includes validation split for monitoring overfitting
- Handles batching and shuffling for stable training

## Integration with Existing System

### 1. Integration with GameLoop

**Location:** `src/game/GameLoop.js` (game-specific, but uses library components)

The GameLoop needs to:
1. Create a `DemonstrationCollector` instance
2. Start recording when user enables it
3. Record steps during gameplay
4. End episode and prompt user to save

```typescript
// Pseudo-code for GameLoop integration
class GameLoop {
  constructor(core, controller, renderer) {
    // ... existing code ...
    
    // BC components
    this.demonstrationCollector = new DemonstrationCollector({
      autoRecord: false  // User must explicitly enable
    });
    this.isRecordingDemonstration = false;
  }

  /**
   * Enable demonstration recording for current episode
   */
  startDemonstrationRecording(episodeId: string): void {
    this.isRecordingDemonstration = true;
    this.demonstrationCollector.startEpisode(episodeId, {
      playerIndex: 0  // Assuming player 0 is the human
    });
  }

  /**
   * Disable demonstration recording
   */
  stopDemonstrationRecording(): void {
    this.isRecordingDemonstration = false;
  }

  update(deltaTime: number): void {
    // ... existing update logic ...
    
    // Record demonstration step if recording
    if (this.isRecordingDemonstration && this.lastState) {
      const observation = this.lastState.observations[0];  // Player 0's observation
      const action = actions[0];  // Player 0's action
      this.demonstrationCollector.recordStep(observation, action);
    }

    // ... rest of update logic ...
  }

  /**
   * Called when episode ends
   */
  onEpisodeEnd(outcome: any): void {
    // ... existing logic ...
    
    // End demonstration recording if active
    if (this.isRecordingDemonstration) {
      const episode = this.demonstrationCollector.endEpisode({
        outcome: outcome
      });
      
      // Trigger UI callback to ask user if they want to save
      if (this.onDemonstrationComplete) {
        this.onDemonstrationComplete(episode);
      }
      
      this.isRecordingDemonstration = false;
    }
  }
}
```

### 2. Integration with TrainingSession

**Location:** `src/MimicRL/training/TrainingSession.ts` (library code)

The TrainingSession should support BC training alongside RL training:

```typescript
// Pseudo-code for TrainingSession integration
class TrainingSession {
  constructor(gameCore, controllers, config) {
    // ... existing code ...
    
    // BC components
    this.behaviorCloningTrainer = null;
    this.demonstrationStorage = new DemonstrationStorage({
      storageDir: config.demonstrationStorageDir || './demonstrations'
    });
    
    // Initialize BC trainer if BC is enabled
    if (config.enableBehaviorCloning) {
      this.behaviorCloningTrainer = new BehaviorCloningTrainer(
        config.behaviorCloningConfig
      );
    }
  }

  /**
   * Train using behavior cloning on saved demonstrations
   * @param {string[]} datasetPaths - Paths to demonstration datasets
   * @param {Function} onProgress - Progress callback
   */
  async trainBehaviorCloning(
    datasetPaths: string[],
    onProgress?: (epoch: number, loss: number, valLoss?: number) => void
  ): Promise<TrainingStats> {
    if (!this.behaviorCloningTrainer) {
      throw new Error('Behavior cloning not enabled');
    }

    // Load all datasets
    const datasets: DemonstrationDataset[] = [];
    for (const path of datasetPaths) {
      const dataset = await this.demonstrationStorage.loadDataset(path);
      datasets.push(dataset);
    }

    // Merge datasets
    const mergedDataset = this.mergeDatasets(datasets);

    // Get policy agent for the trainable player
    const policyAgent = this.policyAgents[this.trainablePlayers[0]];

    // Train
    const stats = await this.behaviorCloningTrainer.train(
      mergedDataset,
      policyAgent,
      onProgress
    );

    return stats;
  }

  /**
   * Save demonstration episode to disk
   */
  async saveDemonstrationEpisode(
    episode: DemonstrationEpisode,
    gameCoreInfo: {
      observationSize: number;
      actionSize: number;
      actionSpaces: ActionSpace[];
    }
  ): Promise<string> {
    // Create dataset from single episode
    const dataset = this.demonstrationStorage.createDataset(
      [episode],
      gameCoreInfo
    );

    // Save to disk
    const filepath = await this.demonstrationStorage.saveDataset(dataset);
    return filepath;
  }

  /**
   * Merge multiple datasets into one
   */
  private mergeDatasets(datasets: DemonstrationDataset[]): DemonstrationDataset {
    const allEpisodes: DemonstrationEpisode[] = [];
    let totalSteps = 0;

    for (const dataset of datasets) {
      allEpisodes.push(...dataset.episodes);
      totalSteps += dataset.metadata.totalSteps;
    }

    return {
      episodes: allEpisodes,
      metadata: {
        totalSteps,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        gameCoreInfo: datasets[0]?.metadata.gameCoreInfo
      }
    };
  }
}
```

### 3. UI Integration Points

**Location:** `src/rl/visualization/TrainingUI.js` (game-specific UI)

The UI needs to:
1. Show a button to enable/disable demonstration recording
2. Prompt user after each episode to save demonstration
3. Show a "Clone Behavior" button that triggers BC training
4. Display BC training progress

```typescript
// Pseudo-code for UI integration
class TrainingUI {
  constructor(trainingSession, gameLoop) {
    // ... existing code ...
    
    this.trainingSession = trainingSession;
    this.gameLoop = gameLoop;
    this.savedDemonstrationPaths = [];
  }

  /**
   * Setup BC UI elements
   */
  setupBehaviorCloningUI(): void {
    // Button to toggle demonstration recording
    const recordButton = document.getElementById('record-demonstration-button');
    recordButton.addEventListener('click', () => {
      this.toggleDemonstrationRecording();
    });

    // Button to train with behavior cloning
    const cloneButton = document.getElementById('clone-behavior-button');
    cloneButton.addEventListener('click', () => {
      this.startBehaviorCloning();
    });

    // Setup callback for when episode ends
    this.gameLoop.onDemonstrationComplete = (episode) => {
      this.promptSaveDemonstration(episode);
    };
  }

  /**
   * Toggle demonstration recording
   */
  toggleDemonstrationRecording(): void {
    if (this.gameLoop.isRecordingDemonstration) {
      this.gameLoop.stopDemonstrationRecording();
      this.updateRecordButton(false);
    } else {
      const episodeId = `episode_${Date.now()}`;
      this.gameLoop.startDemonstrationRecording(episodeId);
      this.updateRecordButton(true);
    }
  }

  /**
   * Prompt user to save demonstration after episode
   */
  promptSaveDemonstration(episode: DemonstrationEpisode): void {
    const shouldSave = confirm(
      `Episode completed with ${episode.steps.length} steps. ` +
      `Save this episode for behavior cloning training?`
    );

    if (shouldSave) {
      this.saveDemonstration(episode);
    }
  }

  /**
   * Save demonstration to disk
   */
  async saveDemonstration(episode: DemonstrationEpisode): Promise<void> {
    try {
      const gameCore = this.trainingSession.gameCore;
      const filepath = await this.trainingSession.saveDemonstrationEpisode(
        episode,
        {
          observationSize: gameCore.getObservationSize(),
          actionSize: gameCore.getActionSize(),
          actionSpaces: gameCore.getActionSpaces()
        }
      );

      this.savedDemonstrationPaths.push(filepath);
      this.updateDemonstrationList();
      
      console.log(`Demonstration saved to: ${filepath}`);
    } catch (error) {
      console.error('Failed to save demonstration:', error);
      alert('Failed to save demonstration. See console for details.');
    }
  }

  /**
   * Start behavior cloning training
   */
  async startBehaviorCloning(): void {
    if (this.savedDemonstrationPaths.length === 0) {
      alert('No demonstrations saved. Please record and save some episodes first.');
      return;
    }

    // Disable button during training
    const cloneButton = document.getElementById('clone-behavior-button');
    cloneButton.disabled = true;
    cloneButton.textContent = 'Training...';

    try {
      // Show progress UI
      const progressDiv = document.getElementById('bc-training-progress');
      progressDiv.style.display = 'block';

      // Train
      await this.trainingSession.trainBehaviorCloning(
        this.savedDemonstrationPaths,
        (epoch, loss, valLoss) => {
          // Update progress UI
          this.updateBCTrainingProgress(epoch, loss, valLoss);
        }
      );

      alert('Behavior cloning training completed!');
    } catch (error) {
      console.error('Behavior cloning training failed:', error);
      alert('Training failed. See console for details.');
    } finally {
      cloneButton.disabled = false;
      cloneButton.textContent = 'Clone Behavior';
      progressDiv.style.display = 'none';
    }
  }

  /**
   * Update BC training progress display
   */
  updateBCTrainingProgress(epoch: number, loss: number, valLoss?: number): void {
    const progressDiv = document.getElementById('bc-training-progress');
    progressDiv.innerHTML = `
      <div>Epoch: ${epoch}</div>
      <div>Train Loss: ${loss.toFixed(4)}</div>
      ${valLoss !== undefined ? `<div>Val Loss: ${valLoss.toFixed(4)}</div>` : ''}
    `;
  }
}
```

## Migration Steps

### Step 1: Create BC Library Files

1. **Create directory structure:**
   ```
   src/MimicRL/bc/
     - Demonstration.ts          (interfaces)
     - DemonstrationCollector.ts (collector class)
     - DemonstrationStorage.ts   (storage class)
     - BehaviorCloningTrainer.ts (trainer class)
   ```

2. **Implement each class** following the design above

### Step 2: Integrate with GameLoop

1. **Add DemonstrationCollector to GameLoop:**
   - Import `DemonstrationCollector` from `MimicRL/bc`
   - Create instance in constructor
   - Add methods: `startDemonstrationRecording()`, `stopDemonstrationRecording()`
   - Record steps in `update()` method
   - End episode in `onEpisodeEnd()` callback

2. **Add callbacks:**
   - `onDemonstrationComplete(episode)` - called when episode ends and recording is active

### Step 3: Integrate with TrainingSession

1. **Add BC components to TrainingSession:**
   - Import `BehaviorCloningTrainer` and `DemonstrationStorage`
   - Create instances in constructor (if BC enabled)
   - Add `trainBehaviorCloning()` method
   - Add `saveDemonstrationEpisode()` method

2. **Update constructor config:**
   ```typescript
   {
     // ... existing config ...
     enableBehaviorCloning?: boolean;
     demonstrationStorageDir?: string;
     behaviorCloningConfig?: {
       learningRate?: number;
       batchSize?: number;
       epochs?: number;
       // ... other BC config ...
     };
   }
   ```

### Step 4: Update UI

1. **Add UI elements:**
   - "Record Demonstration" toggle button
   - "Clone Behavior" button
   - Progress display for BC training
   - List of saved demonstrations

2. **Wire up callbacks:**
   - Connect record button to `GameLoop.startDemonstrationRecording()`
   - Connect clone button to `TrainingSession.trainBehaviorCloning()`
   - Show save prompt after episodes
   - Display training progress

### Step 5: Update Main Application

1. **Initialize BC in main.js:**
   ```javascript
   const trainingSession = new TrainingSession(gameCore, controllers, {
     // ... existing config ...
     enableBehaviorCloning: true,
     demonstrationStorageDir: './demonstrations',
     behaviorCloningConfig: {
       learningRate: 0.001,
       batchSize: 32,
       epochs: 10,
       lossType: 'mixed'
     }
   });
   ```

2. **Setup UI callbacks:**
   - Connect GameLoop demonstration callbacks to UI
   - Initialize BC UI elements

## Usage Flow

### Recording Demonstrations

1. User clicks "Record Demonstration" button
2. GameLoop starts recording episode
3. User plays game (actions are recorded)
4. Episode ends → UI prompts: "Save this episode?"
5. If yes → Episode saved to disk
6. If no → Episode discarded

### Training with Behavior Cloning

1. User has saved one or more demonstration episodes
2. User clicks "Clone Behavior" button
3. TrainingSession loads all saved demonstrations
4. BehaviorCloningTrainer trains policy network
5. Progress displayed in UI
6. Training completes → PolicyAgent updated with new weights

## Benefits

1. **Game-Agnostic**: All BC components work with normalized observations/actions
2. **User-Friendly**: Simple UI for recording and training
3. **Flexible**: Can train on single or multiple episodes
4. **Efficient**: Supports both JSON and binary storage formats
5. **Integrated**: Works seamlessly with existing PolicyAgent structure
6. **Validated**: Includes validation split to monitor overfitting

## Future Enhancements

1. **Data Augmentation**: Add noise to observations to improve generalization
2. **Active Learning**: Prompt user to label uncertain states
3. **Hybrid Training**: Combine BC with RL (pre-train with BC, fine-tune with RL)
4. **Demonstration Filtering**: Allow users to review and filter demonstration steps
5. **Multi-Player BC**: Support recording demonstrations for multiple players
6. **Online BC**: Update policy incrementally as new demonstrations arrive

