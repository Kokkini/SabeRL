/**
 * PPOTrainer - Proximal Policy Optimization trainer for reinforcement learning
 * Implements PPO algorithm for training neural network policies
 */

// TensorFlow.js is loaded from CDN as a global 'tf' object
declare const tf: any;

import { GameConfig } from '../../config/config.js';
import { PolicyAgent } from '../agents/PolicyAgent.js';
import { Experience } from './RolloutCollector.js';

export interface PPOTrainerOptions {
  learningRate?: number;
  clipRatio?: number;
  valueLossCoeff?: number;
  entropyCoeff?: number;
  maxGradNorm?: number;
  gaeLambda?: number;
  epochs?: number;
  miniBatchSize?: number;
}

export interface TrainingData {
  states: any; // tf.Tensor2D
  actions: any; // tf.Tensor2D
  rewards: any; // tf.Tensor1D
  oldLogProbs: any; // tf.Tensor1D
  values: any; // tf.Tensor1D
  nextValues: any; // tf.Tensor1D
  dones: any; // tf.Tensor1D
}

export interface TrainingStats {
  policyLoss: number;
  valueLoss: number;
  entropy: number;
  klDivergence: number;
  clipFraction: number;
}

export class PPOTrainer {
  private yieldChannel: MessageChannel;
  private yieldChannelResolve: (() => void) | null;
  public readonly options: Required<PPOTrainerOptions>;
  public readonly policyOptimizer: any; // tf.Optimizer
  public readonly valueOptimizer: any; // tf.Optimizer
  public trainingStats: TrainingStats;

  constructor(options: PPOTrainerOptions = {}) {
    // Create MessageChannel for non-throttled yielding (works in background tabs)
    this.yieldChannel = new MessageChannel();
    this.yieldChannelResolve = null;
    this.yieldChannel.port1.onmessage = () => {
      if (this.yieldChannelResolve) {
        this.yieldChannelResolve();
        this.yieldChannelResolve = null;
      }
    };
    this.yieldChannel.port2.onmessage = () => {}; // Empty handler
    
    this.options = {
      learningRate: options.learningRate || GameConfig.rl.learningRate,
      clipRatio: options.clipRatio || GameConfig.rl.clipRatio || 0.2,
      valueLossCoeff: options.valueLossCoeff || GameConfig.rl.valueLossCoeff || 0.5,
      entropyCoeff: options.entropyCoeff || GameConfig.rl.entropyCoeff || 0.01,
      maxGradNorm: options.maxGradNorm || GameConfig.rl.maxGradNorm || 0.5,
      gaeLambda: options.gaeLambda || GameConfig.rl.gaeLambda || 0.95,
      epochs: options.epochs || GameConfig.rl.epochs || 4,
      miniBatchSize: options.miniBatchSize || GameConfig.rl.miniBatchSize
    };

    // Optimizers
    this.policyOptimizer = tf.train.adam(this.options.learningRate);
    this.valueOptimizer = tf.train.adam(this.options.learningRate);

    // Training statistics
    this.trainingStats = {
      policyLoss: 0,
      valueLoss: 0,
      entropy: 0,
      klDivergence: 0,
      clipFraction: 0
    };
  }

  /**
   * Train the policy using PPO
   * @param {Experience[]} experiences - Array of experience objects
   * @param {PolicyAgent} policyAgent - Policy agent containing policy network, value network, learnable std, and action spaces
   */
  async train(experiences: Experience[], policyAgent: PolicyAgent): Promise<void> {
    if (experiences.length === 0) {
      return;
    }

    try {
      console.log(`PPO Training with ${experiences.length} experiences`);
      
      // Prepare training data
      const trainingData = this.prepareTrainingData(experiences, policyAgent);
      
      // Train for multiple epochs
      for (let epoch = 0; epoch < this.options.epochs; epoch++) {
        await this.trainEpoch(trainingData, policyAgent);
        
        // Yield to event loop after each epoch to keep UI responsive
        await this.yieldToEventLoop();
      }

      console.log('PPO Training completed');
    } catch (error) {
      console.error('PPO Training error:', error);
    }
  }
  
  /**
   * Yield to event loop with smart strategy based on tab visibility
   */
  private async yieldToEventLoop(): Promise<void> {
    // Check if tab is hidden using Page Visibility API
    const isHidden = typeof document !== 'undefined' && 
                     (document.hidden || document.visibilityState === 'hidden');
    
    if (isHidden) {
      // Tab is hidden: use MessageChannel (not throttled)
      return new Promise(resolve => {
        this.yieldChannelResolve = resolve;
        this.yieldChannel.port2.postMessage(null);
      });
    } else {
      // Tab is visible: use setTimeout(0) to allow UI updates
      return new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  /**
   * Prepare training data from experiences
   */
  prepareTrainingData(experiences: Experience[], policyAgent: PolicyAgent): TrainingData {
    const states: number[][] = [];
    const actions: number[][] = [];
    const rewards: number[] = [];
    const oldLogProbs: number[] = [];
    const values: number[] = [];
    const nextValues: number[] = [];
    const dones: number[] = [];

    for (const exp of experiences) {
      // Handle both 'observation' (rollouts) and 'state' (legacy) field names
      const state = exp.observation || (exp as any).state;
      if (state && exp.action !== undefined) {
        states.push(state);
        // Actions are already number arrays (Action type)
        actions.push(Array.isArray(exp.action) ? exp.action : [exp.action]);
        rewards.push(exp.reward || 0);
        oldLogProbs.push(exp.logProb || 0);
        values.push(exp.value || 0);
        nextValues.push(exp.nextValue !== null && exp.nextValue !== undefined ? exp.nextValue : (exp.done ? 0 : (exp.value || 0)));
        dones.push(exp.done ? 1 : 0);
      }
    }

    // Handle empty states array
    if (states.length === 0) {
      console.warn('PPO: No valid states found, returning empty tensors');
      return {
        states: tf.tensor2d([], [0, policyAgent.observationSize]),
        actions: tf.tensor2d([], [0, policyAgent.actionSize]),
        rewards: tf.tensor1d([]),
        oldLogProbs: tf.tensor1d([]),
        values: tf.tensor1d([]),
        nextValues: tf.tensor1d([]),
        dones: tf.tensor1d([])
      };
    }

    // Ensure states is a 2D array (observations are already normalized number arrays)
    const statesArray = states.map(state => {
      if (Array.isArray(state)) {
        return state;
      } else if (state && typeof state === 'object' && (state as any).data) {
        // If it's a TensorFlow tensor, convert to array
        return Array.from((state as any).dataSync());
      } else {
        console.warn('PPO: Unexpected state format:', state);
        return new Array(policyAgent.observationSize).fill(0);
      }
    });

    return {
      states: tf.tensor2d(statesArray, [statesArray.length, policyAgent.observationSize]),
      actions: tf.tensor2d(actions, [actions.length, policyAgent.actionSize], 'float32'),
      rewards: tf.tensor1d(rewards),
      oldLogProbs: tf.tensor1d(oldLogProbs),
      values: tf.tensor1d(values),
      nextValues: tf.tensor1d(nextValues),
      dones: tf.tensor1d(dones)
    };
  }

  /**
   * Train for one epoch
   */
  async trainEpoch(data: TrainingData, policyAgent: PolicyAgent): Promise<void> {
    const miniBatchSize = this.options.miniBatchSize;
    const totalSamples = data.states.shape[0];
    const numMiniBatches = Math.ceil(totalSamples / miniBatchSize);
    
    for (let i = 0; i < numMiniBatches; i++) {
      const start = i * miniBatchSize;
      const end = Math.min(start + miniBatchSize, totalSamples);

      const batch = {
        states: data.states.slice([start, 0], [end - start, -1]),
        actions: data.actions.slice([start, 0], [end - start, -1]),
        rewards: data.rewards.slice([start], [end - start]),
        oldLogProbs: data.oldLogProbs.slice([start], [end - start]),
        values: data.values.slice([start], [end - start]),
        nextValues: data.nextValues ? data.nextValues.slice([start], [end - start]) : null,
        dones: data.dones.slice([start], [end - start])
      };

      await this.trainBatch(batch, policyAgent);
      
      // Yield to event loop after each mini-batch to keep UI responsive
      await this.yieldToEventLoop();
    }
  }

  /**
   * Train on a single batch
   */
  async trainBatch(batch: any, policyAgent: PolicyAgent): Promise<void> {
    return tf.tidy(() => {
      // Use stored values from rollout for GAE computation
      const valuesForGAE = batch.values && batch.values.shape[0] > 0
        ? batch.values
        : policyAgent.valueNetwork.predict(batch.states).squeeze();
      
      // Compute advantages and returns using stored values from rollout
      const { advantages, returns } = this.computeAdvantages(batch, valuesForGAE);

      // Normalize advantages per batch for stability
      const advMean = advantages.mean();
      const advStd = advantages.sub(advMean).square().mean().sqrt();
      const normAdvantages = advantages.sub(advMean).div(advStd.add(1e-8));

      // Update policy model and learnableStd using minimize
      this.policyOptimizer.minimize(() => {
        // Recompute log probabilities inside gradient function
        const currentLogProbs = this.recomputeLogProbs(batch.states, batch.actions, policyAgent);
        
        // Compute policy loss (PPO clipped objective)
        const policyLoss = this.computePolicyLoss(
          currentLogProbs,
          batch.oldLogProbs,
          normAdvantages
        );

        // Compute entropy bonus
        const entropy = this.computeEntropy(batch.states, batch.actions, policyAgent);

        // Total loss
        return policyLoss.sub(entropy.mul(this.options.entropyCoeff));
      });

      // Train value model
      this.valueOptimizer.minimize(() => {
        const valueOutput = policyAgent.valueNetwork.predict(batch.states);
        const valueOutputSqueezed = valueOutput.squeeze();
        const returnsSqueezed = returns.squeeze();
        return this.computeValueLoss(valueOutputSqueezed, returnsSqueezed)
          .mul(this.options.valueLossCoeff);
      });
      
      // Get value loss for statistics
      const valueOutput = policyAgent.valueNetwork.predict(batch.states);
      const valueOutputSqueezed = valueOutput.squeeze();
      const returnsSqueezed = returns.squeeze();
      const valueLoss = this.computeValueLoss(valueOutputSqueezed, returnsSqueezed);

      // Update statistics
      const finalLogProbs = this.recomputeLogProbs(batch.states, batch.actions, policyAgent);
      const finalEntropy = this.computeEntropy(batch.states, batch.actions, policyAgent);
      const finalPolicyLoss = this.computePolicyLoss(
        finalLogProbs,
        batch.oldLogProbs,
        normAdvantages
      );
      
      this.updateStats(finalPolicyLoss, valueLoss, finalEntropy, normAdvantages, finalLogProbs, batch.oldLogProbs);
    });
  }

  /**
   * Recompute log probabilities under current policy
   */
  recomputeLogProbs(states: any, actions: any, policyAgent: PolicyAgent): any {
    const policyOutput = policyAgent.policyNetwork.predict(states);
    const batchSize = states.shape[0];
    
    // Split action spaces into discrete and continuous indices
    const discreteIndices: number[] = [];
    const continuousIndices: number[] = [];
    for (let i = 0; i < policyAgent.actionSize; i++) {
      if (policyAgent.actionSpaces[i].type === 'discrete') {
        discreteIndices.push(i);
      } else {
        continuousIndices.push(i);
      }
    }
    
    let totalLogProb = tf.zeros([batchSize]);
    
    // Handle discrete actions
    if (discreteIndices.length > 0) {
      const discreteOutputs = tf.gather(policyOutput, discreteIndices, 1);
      const discreteActions = tf.gather(actions, discreteIndices, 1);
      
      const probs = tf.sigmoid(discreteOutputs);
      const eps = tf.scalar(1e-8);
      
      const logProbs = discreteActions.mul(tf.log(probs.add(eps)))
        .add(tf.scalar(1).sub(discreteActions).mul(tf.log(tf.scalar(1).sub(probs).add(eps))));
      
      totalLogProb = totalLogProb.add(logProbs.sum(1));
    }
    
    // Handle continuous actions
    if (continuousIndices.length > 0) {
      const continuousOutputs = tf.gather(policyOutput, continuousIndices, 1);
      const continuousActions = tf.gather(actions, continuousIndices, 1);
      
      const stdValues = tf.gather(policyAgent.learnableStd, continuousIndices, 0);
      const stdExpanded = stdValues.expandDims(0).tile([batchSize, 1]);
      
      const diff = continuousActions.sub(continuousOutputs);
      const normalized = diff.div(stdExpanded);
      const logProbContinuous = tf.scalar(-0.5).mul(tf.log(tf.scalar(2 * Math.PI).mul(stdExpanded.square()).add(1e-8)))
        .sub(tf.scalar(0.5).mul(normalized.square()));
      
      totalLogProb = totalLogProb.add(logProbContinuous.sum(1));
    }
    
    return totalLogProb;
  }

  /**
   * Compute entropy for mixed action spaces
   */
  computeEntropy(states: any, actions: any, policyAgent: PolicyAgent): any {
    const policyOutput = policyAgent.policyNetwork.predict(states);
    const batchSize = states.shape[0];
    
    const discreteIndices: number[] = [];
    const continuousIndices: number[] = [];
    for (let i = 0; i < policyAgent.actionSize; i++) {
      if (policyAgent.actionSpaces[i].type === 'discrete') {
        discreteIndices.push(i);
      } else {
        continuousIndices.push(i);
      }
    }
    
    let totalEntropy = tf.scalar(0);
    
    // Handle discrete actions
    if (discreteIndices.length > 0) {
      const discreteOutputs = tf.gather(policyOutput, discreteIndices, 1);
      const probs = tf.sigmoid(discreteOutputs);
      const eps = tf.scalar(1e-8);
      
      const entropyDiscrete = probs.mul(tf.log(probs.add(eps))).neg()
        .sub(tf.scalar(1).sub(probs).mul(tf.log(tf.scalar(1).sub(probs).add(eps))));
      
      totalEntropy = totalEntropy.add(entropyDiscrete.sum());
    }
    
    // Handle continuous actions
    if (continuousIndices.length > 0) {
      const stdValues = tf.gather(policyAgent.learnableStd, continuousIndices, 0);
      const stdExpanded = stdValues.expandDims(0).tile([batchSize, 1]);
      
      const entropyContinuous = tf.scalar(0.5).mul(tf.log(tf.scalar(2 * Math.PI * Math.E).mul(stdExpanded.square()).add(1e-8)));
      
      totalEntropy = totalEntropy.add(entropyContinuous.sum());
    }
    
    return totalEntropy.div(batchSize);
  }

  /**
   * Compute policy loss (PPO clipped objective)
   */
  computePolicyLoss(newLogProbs: any, oldLogProbs: any, advantages: any): any {
    const ratio = tf.exp(newLogProbs.sub(oldLogProbs));
    const clippedRatio = tf.clipByValue(ratio, 1 - this.options.clipRatio, 1 + this.options.clipRatio);
    const policyLoss = tf.minimum(
      ratio.mul(advantages),
      clippedRatio.mul(advantages)
    ).neg().mean();
    return policyLoss;
  }

  /**
   * Compute value function loss
   */
  computeValueLoss(values: any, returns: any): any {
    return tf.losses.meanSquaredError(returns, values);
  }

  /**
   * Update training statistics
   */
  updateStats(policyLoss: any, valueLoss: any, entropy: any, advantages: any, newLogProbs: any, oldLogProbs: any): void {
    this.trainingStats.policyLoss = policyLoss.dataSync()[0];
    this.trainingStats.valueLoss = valueLoss.dataSync()[0];
    this.trainingStats.entropy = entropy.dataSync()[0];
    
    const kl = oldLogProbs.sub(newLogProbs).mean();
    this.trainingStats.klDivergence = Math.abs(kl.dataSync()[0]);
    
    const ratio = tf.exp(newLogProbs.sub(oldLogProbs));
    const clipped = tf.lessEqual(ratio, 1 - this.options.clipRatio)
      .logicalOr(tf.greaterEqual(ratio, 1 + this.options.clipRatio));
    this.trainingStats.clipFraction = clipped.cast('float32').mean().dataSync()[0];
  }

  /**
   * Compute advantages using GAE (Generalized Advantage Estimation)
   */
  computeAdvantages(batch: any, valuesTensor: any): { advantages: any; returns: any } {
    const gamma = GameConfig.rl.discountFactor;
    const lambda = this.options.gaeLambda;

    const rewards = batch.rewards.dataSync();
    const dones = batch.dones.dataSync();
    const valuesArr = valuesTensor.dataSync();
    const nextValuesArr = batch.nextValues ? batch.nextValues.dataSync() : null;

    const advantages: number[] = [];
    const returns: number[] = [];

    let advantage = 0;
    for (let t = rewards.length - 1; t >= 0; t--) {
      const v = valuesArr[t] || 0;
      let nextV = 0;
      if (nextValuesArr) {
        nextV = dones[t] ? 0 : (nextValuesArr[t] || 0);
      } else {
        nextV = (t === rewards.length - 1 || dones[t]) ? 0 : (valuesArr[t + 1] || 0);
      }
      
      const delta = rewards[t] + gamma * nextV - v;
      advantage = delta + gamma * lambda * (1 - dones[t]) * advantage;
      advantages.unshift(advantage);
      returns.unshift(advantage + v);
    }

    return {
      advantages: tf.tensor1d(advantages),
      returns: tf.tensor1d(returns)
    };
  }

  /**
   * Get training statistics
   */
  getStats(): TrainingStats {
    return { ...this.trainingStats };
  }

  /**
   * Reset training statistics
   */
  resetStats(): void {
    this.trainingStats = {
      policyLoss: 0,
      valueLoss: 0,
      entropy: 0,
      klDivergence: 0,
      clipFraction: 0
    };
  }

  /**
   * Dispose of trainer resources
   */
  dispose(): void {
    if (this.policyOptimizer) {
      this.policyOptimizer.dispose();
    }
    if (this.valueOptimizer) {
      this.valueOptimizer.dispose();
    }
  }
}

