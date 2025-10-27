/**
 * A2CTrainer - Advantage Actor-Critic trainer for reinforcement learning
 * Implements A2C algorithm for training neural network policies
 */

// TensorFlow.js is loaded from CDN as a global 'tf' object
import { GameConfig } from '../../config/config.js';

export class A2CTrainer {
  constructor(options = {}) {
    this.options = {
      learningRate: options.learningRate || GameConfig.rl.learningRate,
      valueLossCoeff: options.valueLossCoeff || 0.5,
      entropyCoeff: options.entropyCoeff || 0.01,
      maxGradNorm: options.maxGradNorm || 0.5,
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
      totalLoss: 0
    };
  }

  /**
   * Train the policy using A2C
   * @param {Array} experiences - Array of experience objects
   * @param {Object} policyModel - Policy neural network model
   * @param {Object} valueModel - Value function model
   */
  async train(experiences, policyModel, valueModel) {
    if (experiences.length === 0) {
      return;
    }

    try {
      console.log(`A2C Training with ${experiences.length} experiences`);
      
      // Prepare training data
      const trainingData = this.prepareTrainingData(experiences);
      
      // Train on the batch
      await this.trainBatch(trainingData, policyModel, valueModel);

      console.log('A2C Training completed');
    } catch (error) {
      console.error('A2C Training error:', error);
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
    const values = [];
    const dones = [];

    for (const exp of experiences) {
      if (exp.state && exp.action !== undefined) {
        states.push(exp.state);
        actions.push(exp.action);
        rewards.push(exp.reward || 0);
        values.push(exp.value || 0);
        dones.push(exp.isTerminal ? 1 : 0);
      }
    }

    return {
      states: tf.tensor2d(states),
      actions: tf.tensor1d(actions, 'int32'),
      rewards: tf.tensor1d(rewards),
      values: tf.tensor1d(values),
      dones: tf.tensor1d(dones)
    };
  }

  /**
   * Train on a batch of experiences
   * @param {Object} data - Training data
   * @param {Object} policyModel - Policy model
   * @param {Object} valueModel - Value model
   */
  async trainBatch(data, policyModel, valueModel) {
    return tf.tidy(() => {
      // Compute advantages and returns
      const { advantages, returns } = this.computeAdvantages(data);

      // Get current policy predictions
      const policyOutput = policyModel.predict(data.states);
      const actionProbs = tf.softmax(policyOutput);
      const logProbs = tf.log(actionProbs + 1e-8);

      // Get current value predictions
      const valueOutput = valueModel.predict(data.states);

      // Compute policy loss (actor loss)
      const policyLoss = this.computePolicyLoss(
        logProbs,
        data.actions,
        advantages
      );

      // Compute value loss (critic loss)
      const valueLoss = this.computeValueLoss(valueOutput, returns);

      // Compute entropy bonus
      const entropy = this.computeEntropy(actionProbs);

      // Total loss for policy
      const totalPolicyLoss = policyLoss.sub(entropy.mul(this.options.entropyCoeff));

      // Compute gradients
      const policyGradients = this.policyOptimizer.computeGradients(
        () => totalPolicyLoss,
        policyModel.trainableVariables
      );

      const valueGradients = this.valueOptimizer.computeGradients(
        () => valueLoss,
        valueModel.trainableVariables
      );

      // Clip gradients
      const clippedPolicyGradients = this.clipGradients(policyGradients);
      const clippedValueGradients = this.clipGradients(valueGradients);

      // Apply gradients
      this.policyOptimizer.applyGradients(clippedPolicyGradients);
      this.valueOptimizer.applyGradients(clippedValueGradients);

      // Update statistics
      this.updateStats(policyLoss, valueLoss, entropy);
    });
  }

  /**
   * Compute advantages using n-step returns
   * @param {Object} data - Training data
   * @returns {Object} Advantages and returns
   */
  computeAdvantages(data) {
    const gamma = GameConfig.rl.discountFactor;
    const n = 5; // n-step returns

    const rewards = data.rewards.dataSync();
    const values = data.values.dataSync();
    const dones = data.dones.dataSync();

    const advantages = [];
    const returns = [];

    for (let t = 0; t < rewards.length; t++) {
      let advantage = 0;
      let returnValue = 0;

      // Compute n-step return
      for (let k = 0; k < n && t + k < rewards.length; k++) {
        const stepReturn = Math.pow(gamma, k) * rewards[t + k];
        returnValue += stepReturn;
        
        if (dones[t + k]) {
          break;
        }
      }

      // Add bootstrap value if not terminal
      if (t + n < values.length && !dones[t + n - 1]) {
        returnValue += Math.pow(gamma, n) * values[t + n];
      }

      // Compute advantage
      advantage = returnValue - values[t];
      
      advantages.push(advantage);
      returns.push(returnValue);
    }

    return {
      advantages: tf.tensor1d(advantages),
      returns: tf.tensor1d(returns)
    };
  }

  /**
   * Compute A2C policy loss
   * @param {tf.Tensor} logProbs - Log probabilities
   * @param {tf.Tensor} actions - Actions taken
   * @param {tf.Tensor} advantages - Computed advantages
   * @returns {tf.Tensor} Policy loss
   */
  computePolicyLoss(logProbs, actions, advantages) {
    // Get log probability of taken actions
    const actionLogProbs = tf.gather(logProbs, actions, 1).squeeze();

    // Policy loss is negative log probability weighted by advantages
    const policyLoss = actionLogProbs.mul(advantages).neg().mean();

    return policyLoss;
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
   */
  updateStats(policyLoss, valueLoss, entropy) {
    this.trainingStats.policyLoss = policyLoss.dataSync()[0];
    this.trainingStats.valueLoss = valueLoss.dataSync()[0];
    this.trainingStats.entropy = entropy.dataSync()[0];
    this.trainingStats.totalLoss = this.trainingStats.policyLoss + this.trainingStats.valueLoss;
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
      totalLoss: 0
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
