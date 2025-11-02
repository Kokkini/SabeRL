/**
 * PPOTrainer - Proximal Policy Optimization trainer for reinforcement learning
 * Implements PPO algorithm for training neural network policies
 */

// TensorFlow.js is loaded from CDN as a global 'tf' object
import { GameConfig } from '../../config/config.js';
import { GameStateProcessor } from '../utils/GameStateProcessor.js';

export class PPOTrainer {
  constructor(options = {}) {
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
      clipRatio: options.clipRatio || 0.2,
      valueLossCoeff: options.valueLossCoeff || 0.5,
      entropyCoeff: options.entropyCoeff || 0.01,
      maxGradNorm: options.maxGradNorm || 0.5,
      epochs: options.epochs || 4,
      miniBatchSize: options.miniBatchSize || GameConfig.rl.miniBatchSize,
      ...options
    };

    // Optimizers
    this.policyOptimizer = tf.train.adam(this.options.learningRate);
    this.valueOptimizer = tf.train.adam(this.options.learningRate);
    
    // Game state processor for converting raw game states to feature arrays
    this.stateProcessor = new GameStateProcessor({
      normalizePositions: true,
      normalizeAngles: true,
      includeVelocity: true,
      includeDistance: true
    });

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
   * @param {Array} experiences - Array of experience objects
   * @param {Object} policyModel - Policy neural network model
   * @param {Object} valueModel - Value function model (optional)
   * @param {Array} lastValues - Optional last values for bootstrapping (deprecated, using nextValue in experiences instead)
   */
  async train(experiences, policyModel, valueModel = null, lastValues = null) {
    if (experiences.length === 0) {
      return;
    }

    console.log('experiences', experiences);

    try {
      console.log(`PPO Training with ${experiences.length} experiences`);
      
      // Prepare training data
      const trainingData = this.prepareTrainingData(experiences);
      
      console.log('trainingData', trainingData);
      // Train for multiple epochs
      for (let epoch = 0; epoch < this.options.epochs; epoch++) {
        await this.trainEpoch(trainingData, policyModel, valueModel);
        
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
   * - Visible: setTimeout(0) allows UI updates
   * - Hidden: MessageChannel.postMessage is not throttled
   */
  async yieldToEventLoop() {
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
   * @param {Array} experiences - Raw experiences
   * @returns {Object} Prepared training data
   */
  prepareTrainingData(experiences) {
    const states = [];
    const actions = [];
    const rewards = [];
    const oldLogProbs = [];
    const values = [];
    const nextValues = []; // For bootstrapping in GAE
    const dones = [];

    console.log(`PPO: Preparing training data from ${experiences.length} experiences`);

    for (const exp of experiences) {
      // Handle both 'observation' (rollouts) and 'state' (legacy) field names
      const state = exp.observation || exp.state;
      if (state && exp.action !== undefined) {
        states.push(state);
        actions.push(exp.action);
        rewards.push(exp.reward || 0);
        oldLogProbs.push(exp.logProb || 0);
        values.push(exp.value || 0);
        nextValues.push(exp.nextValue !== null && exp.nextValue !== undefined ? exp.nextValue : (exp.done ? 0 : (exp.value || 0)));
        dones.push(exp.done || exp.isTerminal ? 1 : 0);
      }
    }

    console.log(`PPO: Processed ${states.length} valid experiences`);
    console.log('PPO: Sample state:', states[0]);
    console.log('PPO: Sample action:', actions[0]);

    // Handle empty states array
    if (states.length === 0) {
      console.warn('PPO: No valid states found, returning empty tensors');
      return {
        states: tf.tensor2d([], [0, 9]), // Empty tensor with correct shape
        actions: tf.tensor1d([], 'int32'),
        rewards: tf.tensor1d([]),
        oldLogProbs: tf.tensor1d([]),
        values: tf.tensor1d([]),
        nextValues: tf.tensor1d([]),
        dones: tf.tensor1d([])
      };
    }

    // Ensure states is a 2D array
    const statesArray = states.map(state => {
      if (Array.isArray(state)) {
        return state;
      } else if (state && typeof state === 'object' && state.data) {
        // If it's a TensorFlow tensor, convert to array
        return Array.from(state.dataSync());
      } else if (state && typeof state === 'object' && state.playerPosition) {
        // If it's a raw game state object, process it
        try {
          // Vector2 objects don't need cloning or disposal - they're plain JS objects
          // Just pass the state directly to the processor
          const result = this.stateProcessor.processState(state);
          return result;
        } catch (error) {
          console.warn('PPO: Error processing game state:', error);
          return new Array(9).fill(0); // Default state
        }
      } else {
        console.warn('PPO: Unexpected state format:', state);
        return new Array(9).fill(0); // Default state
      }
    });

    return {
      states: tf.tensor2d(statesArray, [statesArray.length, statesArray[0]?.length || 9]),
      actions: tf.tensor1d(actions, 'int32'),
      rewards: tf.tensor1d(rewards),
      oldLogProbs: tf.tensor1d(oldLogProbs),
      values: tf.tensor1d(values),
      nextValues: tf.tensor1d(nextValues),
      dones: tf.tensor1d(dones)
    };
  }

  /**
   * Train for one epoch
   * @param {Object} data - Training data
   * @param {Object} policyModel - Policy model
   * @param {Object} valueModel - Value model
   */
  async trainEpoch(data, policyModel, valueModel) {
    const miniBatchSize = this.options.miniBatchSize;
    const totalSamples = data.states.shape[0];
    const numMiniBatches = Math.ceil(totalSamples / miniBatchSize);
    
    console.log(`PPO Epoch: ${totalSamples} samples, ${numMiniBatches} mini-batches of size ${miniBatchSize}`);

    for (let i = 0; i < numMiniBatches; i++) {
      const start = i * miniBatchSize;
      const end = Math.min(start + miniBatchSize, totalSamples);

      const batch = {
        states: data.states.slice([start, 0], [end - start, -1]),
        actions: data.actions.slice([start], [end - start]),
        rewards: data.rewards.slice([start], [end - start]),
        oldLogProbs: data.oldLogProbs.slice([start], [end - start]),
        values: data.values.slice([start], [end - start]),
        nextValues: data.nextValues ? data.nextValues.slice([start], [end - start]) : null,
        dones: data.dones.slice([start], [end - start])
      };

      await this.trainBatch(batch, policyModel, valueModel);
      
      // Yield to event loop after each mini-batch to keep UI responsive
      await this.yieldToEventLoop();
    }
  }

  /**
   * Train on a single batch
   * @param {Object} batch - Batch data
   * @param {Object} policyModel - Policy model
   * @param {Object} valueModel - Value model
   */
  async trainBatch(batch, policyModel, valueModel) {
    return tf.tidy(() => {
      // Compute value predictions for GAE (bootstrap with 0 at terminal)
      const valuesPred = valueModel
        ? valueModel.predict(batch.states).squeeze()
        : tf.zerosLike(batch.rewards);
      // Compute advantages and returns using predicted values
      const { advantages, returns } = this.computeAdvantages(batch, valuesPred);

      // Normalize advantages per batch for stability
      const advMean = advantages.mean();
      const advStd = advantages.sub(advMean).square().mean().sqrt();
      const normAdvantages = advantages.sub(advMean).div(advStd.add(1e-8));

      // console.log("batch.states", batch.states);
      // Get current policy predictions. batch.states is a tensor with shape [batchSize, 9]
      const policyOutput = policyModel.predict(batch.states);
      
      // Ensure policy output is float32
      const policyOutputFloat = policyOutput.cast('float32');
      const actionProbs = tf.softmax(policyOutputFloat);
      const logProbs = tf.log(actionProbs.add(1e-8));

      // Update policy model using minimize
      this.policyOptimizer.minimize(() => {
        // Recompute policy predictions inside gradient function
        const policyOutput = policyModel.predict(batch.states);
        const policyOutputFloat = policyOutput.cast('float32');
        const actionProbs = tf.softmax(policyOutputFloat);
        const logProbs = tf.log(actionProbs.add(1e-8));

        // Compute policy loss (PPO clipped objective)
        const policyLoss = this.computePolicyLoss(
          logProbs,
          batch.oldLogProbs,
          batch.actions,
          normAdvantages
        );

        // Compute entropy bonus
        const entropy = this.computeEntropy(actionProbs);

        // Total loss (only policy loss for policy model)
        return policyLoss.sub(entropy.mul(this.options.entropyCoeff));
      });

      // Train value model if provided
      let valueLoss = tf.scalar(0);
      if (valueModel) {
        this.valueOptimizer.minimize(() => {
          const valueOutput = valueModel.predict(batch.states);
          const valueOutputSqueezed = valueOutput.squeeze();
          const returnsSqueezed = returns.squeeze();
          return this.computeValueLoss(valueOutputSqueezed, returnsSqueezed)
            .mul(this.options.valueLossCoeff);
        });
        
        // Get value loss for statistics
        const valueOutput = valueModel.predict(batch.states);
        const valueOutputSqueezed = valueOutput.squeeze();
        const returnsSqueezed = returns.squeeze();
        valueLoss = this.computeValueLoss(valueOutputSqueezed, returnsSqueezed)
          .mul(this.options.valueLossCoeff);
      }

      // Update statistics (compute values for stats)
      const finalPolicyOutput = policyModel.predict(batch.states);
      const finalPolicyOutputFloat = finalPolicyOutput.cast('float32');
      const finalActionProbs = tf.softmax(finalPolicyOutputFloat);
      const finalLogProbs = tf.log(finalActionProbs.add(1e-8));
      const finalEntropy = this.computeEntropy(finalActionProbs);
      
      // Compute policy loss for statistics
      const finalPolicyLoss = this.computePolicyLoss(
        finalLogProbs,
        batch.oldLogProbs,
        batch.actions,
        normAdvantages
      );
      
      this.updateStats(finalPolicyLoss, valueLoss, finalEntropy, normAdvantages, finalLogProbs, batch.oldLogProbs, batch.actions);
    });
  }

  /**
   * Compute advantages using GAE (Generalized Advantage Estimation)
   * @param {Object} batch - Batch data with nextValues for bootstrapping
   * @param {tf.Tensor} valuesTensor - Current value predictions
   * @returns {Object} Advantages and returns
   */
  computeAdvantages(batch, valuesTensor) {
    const gamma = GameConfig.rl.discountFactor;
    const lambda = 0.95; // GAE parameter

    const rewards = batch.rewards.dataSync();
    const dones = batch.dones.dataSync();
    const valuesArr = valuesTensor.dataSync();
    // Use nextValues from batch for proper bootstrapping
    const nextValuesArr = batch.nextValues ? batch.nextValues.dataSync() : null;

    const advantages = [];
    const returns = [];

    let advantage = 0;
    for (let t = rewards.length - 1; t >= 0; t--) {
      const v = valuesArr[t] || 0;
      // Use nextValue from experience if available, otherwise fall back to next value in array
      let nextV = 0;
      if (nextValuesArr) {
        nextV = dones[t] ? 0 : (nextValuesArr[t] || 0); // Use bootstrapped nextValue
      } else {
        // Fallback to old behavior
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
   * Compute PPO policy loss
   * @param {tf.Tensor} logProbs - Current log probabilities
   * @param {tf.Tensor} oldLogProbs - Old log probabilities
   * @param {tf.Tensor} actions - Actions taken
   * @param {tf.Tensor} advantages - Computed advantages
   * @returns {tf.Tensor} Policy loss
   */
  computePolicyLoss(logProbs, oldLogProbs, actions, advantages) {
    // Get log probability of taken actions
    // logProbs shape: [batchSize, 4], actions shape: [batchSize]
    // Use oneHot to create mask and mul to select action log probabilities
    const actionMask = tf.oneHot(actions.cast('int32'), 4);
    const actionLogProbs = tf.sum(logProbs.mul(actionMask), 1);
    
    // Ensure oldLogProbs has the same shape as actionLogProbs
    const oldActionLogProbs = oldLogProbs.squeeze();

    // Compute probability ratio
    const ratio = tf.exp(actionLogProbs.sub(oldActionLogProbs));

    // Compute clipped objective
    const clippedRatio = tf.clipByValue(
      ratio,
      1 - this.options.clipRatio,
      1 + this.options.clipRatio
    );

    const clippedAdvantages = tf.minimum(
      ratio.mul(advantages),
      clippedRatio.mul(advantages)
    );

    return clippedAdvantages.neg().mean();
  }

  /**
   * Compute value function loss
   * @param {tf.Tensor} values - Predicted values
   * @param {tf.Tensor} returns - Target returns
   * @returns {tf.Tensor} Value loss
   */
  computeValueLoss(values, returns) {
    return tf.losses.meanSquaredError(returns, values);
  }

  /**
   * Compute entropy bonus
   * @param {tf.Tensor} probs - Action probabilities
   * @returns {tf.Tensor} Entropy
   */
  computeEntropy(probs) {
    // Ensure probs is float32
    const probsFloat = probs.cast('float32');
    const logProbs = tf.log(probsFloat.add(1e-8));
    return probsFloat.mul(logProbs).sum(1).neg().mean();
  }

  /**
   * Clip gradients to prevent exploding gradients
   * @param {Array} gradients - Gradients array
   * @returns {Array} Clipped gradients
   */
  clipGradients(gradients) {
    const totalNorm = tf.norm(tf.stack(gradients.map(g => tf.norm(g))));
    const clipNorm = tf.minimum(totalNorm, this.options.maxGradNorm);
    
    return gradients.map(gradient => 
      gradient.mul(clipNorm.div(totalNorm.add(1e-8)))
    );
  }

  /**
   * Update training statistics
   * @param {tf.Tensor} policyLoss - Policy loss
   * @param {tf.Tensor} valueLoss - Value loss
   * @param {tf.Tensor} entropy - Entropy
   * @param {tf.Tensor} advantages - Advantages
   * @param {tf.Tensor} logProbs - Log probabilities
   * @param {tf.Tensor} oldLogProbs - Old log probabilities
   */
  updateStats(policyLoss, valueLoss, entropy, advantages, logProbs, oldLogProbs, actions) {
    this.trainingStats.policyLoss = policyLoss.dataSync()[0];
    this.trainingStats.valueLoss = valueLoss.dataSync()[0];
    this.trainingStats.entropy = entropy.dataSync()[0];
    
    // Compute KL divergence using per-action log-probs
    const actionMask = tf.oneHot(actions.cast('int32'), 4);
    const curActionLogProbs = tf.sum(logProbs.mul(actionMask), 1);
    const oldActionLogProbs = oldLogProbs.squeeze();
    const klDiv = curActionLogProbs.sub(oldActionLogProbs).mean();
    this.trainingStats.klDivergence = klDiv.dataSync()[0];
    
    // Compute clip fraction using per-action ratios
    const ratio = tf.exp(curActionLogProbs.sub(oldActionLogProbs));
    const clipped = tf.clipByValue(ratio, 1 - this.options.clipRatio, 1 + this.options.clipRatio);
    const clipFraction = tf.notEqual(ratio, clipped).cast('float32').mean();
    this.trainingStats.clipFraction = clipFraction.dataSync()[0];
  }

  /**
   * Get training statistics
   * @returns {Object} Training statistics
   */
  getStats() {
    return { ...this.trainingStats };
  }

  /**
   * Reset training statistics
   */
  resetStats() {
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
  dispose() {
    if (this.policyOptimizer) {
      this.policyOptimizer.dispose();
    }
    if (this.valueOptimizer) {
      this.valueOptimizer.dispose();
    }
  }
}
