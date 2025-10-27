/**
 * PPOTrainer - Proximal Policy Optimization trainer for reinforcement learning
 * Implements PPO algorithm for training neural network policies
 */

// TensorFlow.js is loaded from CDN as a global 'tf' object
import { GameConfig } from '../../config/config.js';

export class PPOTrainer {
  constructor(options = {}) {
    this.options = {
      learningRate: options.learningRate || GameConfig.rl.learningRate,
      clipRatio: options.clipRatio || 0.2,
      valueLossCoeff: options.valueLossCoeff || 0.5,
      entropyCoeff: options.entropyCoeff || 0.01,
      maxGradNorm: options.maxGradNorm || 0.5,
      epochs: options.epochs || 4,
      batchSize: options.batchSize || GameConfig.rl.batchSize,
      ...options
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
   * @param {Array} experiences - Array of experience objects
   * @param {Object} policyModel - Policy neural network model
   * @param {Object} valueModel - Value function model (optional)
   */
  async train(experiences, policyModel, valueModel = null) {
    if (experiences.length === 0) {
      return;
    }

    try {
      console.log(`PPO Training with ${experiences.length} experiences`);
      
      // Prepare training data
      const trainingData = this.prepareTrainingData(experiences);
      
      // Train for multiple epochs
      for (let epoch = 0; epoch < this.options.epochs; epoch++) {
        await this.trainEpoch(trainingData, policyModel, valueModel);
      }

      console.log('PPO Training completed');
    } catch (error) {
      console.error('PPO Training error:', error);
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
    const dones = [];

    for (const exp of experiences) {
      if (exp.state && exp.action !== undefined) {
        states.push(exp.state);
        actions.push(exp.action);
        rewards.push(exp.reward || 0);
        oldLogProbs.push(exp.logProb || 0);
        values.push(exp.value || 0);
        dones.push(exp.isTerminal ? 1 : 0);
      }
    }

    return {
      states: tf.tensor2d(states),
      actions: tf.tensor1d(actions, 'int32'),
      rewards: tf.tensor1d(rewards),
      oldLogProbs: tf.tensor1d(oldLogProbs),
      values: tf.tensor1d(values),
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
    const batchSize = this.options.batchSize;
    const numBatches = Math.ceil(data.states.shape[0] / batchSize);

    for (let i = 0; i < numBatches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, data.states.shape[0]);

      const batch = {
        states: data.states.slice([start, 0], [end - start, -1]),
        actions: data.actions.slice([start], [end - start]),
        rewards: data.rewards.slice([start], [end - start]),
        oldLogProbs: data.oldLogProbs.slice([start], [end - start]),
        values: data.values.slice([start], [end - start]),
        dones: data.dones.slice([start], [end - start])
      };

      await this.trainBatch(batch, policyModel, valueModel);
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
      // Compute advantages and returns
      const { advantages, returns } = this.computeAdvantages(batch);

      // Get current policy predictions
      const policyOutput = policyModel.predict(batch.states);
      const actionProbs = tf.softmax(policyOutput);
      const logProbs = tf.log(actionProbs + 1e-8);

      // Compute policy loss (PPO clipped objective)
      const policyLoss = this.computePolicyLoss(
        logProbs,
        batch.oldLogProbs,
        batch.actions,
        advantages
      );

      // Compute value loss if value model provided
      let valueLoss = tf.scalar(0);
      if (valueModel) {
        const valueOutput = valueModel.predict(batch.states);
        valueLoss = this.computeValueLoss(valueOutput, returns);
      }

      // Compute entropy bonus
      const entropy = this.computeEntropy(actionProbs);

      // Total loss
      const totalLoss = policyLoss.add(valueLoss.mul(this.options.valueLossCoeff))
                                .sub(entropy.mul(this.options.entropyCoeff));

      // Compute gradients and update
      const policyGradients = this.policyOptimizer.computeGradients(
        () => totalLoss,
        policyModel.trainableVariables
      );

      // Clip gradients
      const clippedGradients = this.clipGradients(policyGradients);

      // Apply gradients
      this.policyOptimizer.applyGradients(clippedGradients);

      // Update statistics
      this.updateStats(policyLoss, valueLoss, entropy, advantages, logProbs, batch.oldLogProbs);
    });
  }

  /**
   * Compute advantages using GAE (Generalized Advantage Estimation)
   * @param {Object} batch - Batch data
   * @returns {Object} Advantages and returns
   */
  computeAdvantages(batch) {
    const gamma = GameConfig.rl.discountFactor;
    const lambda = 0.95; // GAE parameter

    const rewards = batch.rewards.dataSync();
    const values = batch.values.dataSync();
    const dones = batch.dones.dataSync();

    const advantages = [];
    const returns = [];

    let advantage = 0;
    for (let t = rewards.length - 1; t >= 0; t--) {
      const delta = rewards[t] + gamma * values[t + 1] * (1 - dones[t]) - values[t];
      advantage = delta + gamma * lambda * (1 - dones[t]) * advantage;
      advantages.unshift(advantage);
      returns.unshift(advantage + values[t]);
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
    const actionLogProbs = tf.gather(logProbs, actions, 1).squeeze();
    const oldActionLogProbs = oldLogProbs;

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
    const logProbs = tf.log(probs + 1e-8);
    return probs.mul(logProbs).sum(1).mean();
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
  updateStats(policyLoss, valueLoss, entropy, advantages, logProbs, oldLogProbs) {
    this.trainingStats.policyLoss = policyLoss.dataSync()[0];
    this.trainingStats.valueLoss = valueLoss.dataSync()[0];
    this.trainingStats.entropy = entropy.dataSync()[0];
    
    // Compute KL divergence
    const klDiv = logProbs.sub(oldLogProbs).mean();
    this.trainingStats.klDivergence = klDiv.dataSync()[0];
    
    // Compute clip fraction
    const ratio = tf.exp(logProbs.sub(oldLogProbs));
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
