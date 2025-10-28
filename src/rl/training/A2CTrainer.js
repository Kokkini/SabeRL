/**
 * A2CTrainer - Advantage Actor-Critic trainer for reinforcement learning
 * Implements A2C algorithm for training neural network policies
 */

// TensorFlow.js is loaded from CDN as a global 'tf' object
import { GameConfig } from '../../config/config.js';
import { GameStateProcessor } from '../utils/GameStateProcessor.js';

export class A2CTrainer {
  constructor(options = {}) {
    this.options = {
      learningRate: options.learningRate || GameConfig.rl.learningRate,
      valueLossCoeff: options.valueLossCoeff || 0.5,
      entropyCoeff: options.entropyCoeff || 0.01,
      maxGradNorm: options.maxGradNorm || 0.5,
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
      
      // Split into mini-batches and train
      const miniBatchSize = this.options.miniBatchSize;
      const totalSamples = trainingData.states.shape[0];
      const numMiniBatches = Math.ceil(totalSamples / miniBatchSize);
      
      console.log(`A2C: ${totalSamples} samples, ${numMiniBatches} mini-batches of size ${miniBatchSize}`);
      
      for (let i = 0; i < numMiniBatches; i++) {
        const start = i * miniBatchSize;
        const end = Math.min(start + miniBatchSize, totalSamples);
        
        const batch = {
          states: trainingData.states.slice([start, 0], [end - start, -1]),
          actions: trainingData.actions.slice([start], [end - start]),
          rewards: trainingData.rewards.slice([start], [end - start]),
          values: trainingData.values.slice([start], [end - start]),
          dones: trainingData.dones.slice([start], [end - start])
        };
        
        await this.trainBatch(batch, policyModel, valueModel);
      }

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

    // Handle empty states array
    if (states.length === 0) {
      console.warn('A2C: No valid states found, returning empty tensors');
      return {
        states: tf.tensor2d([], [0, 9]), // Empty tensor with correct shape
        actions: tf.tensor1d([], 'int32'),
        rewards: tf.tensor1d([]),
        values: tf.tensor1d([]),
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
          // Create a safe copy of the state to avoid tensor disposal issues
          let playerPos, opponentPos;
          
          try {
            // Try to clone tensors if they exist and aren't disposed
            if (state.playerPosition && !state.playerPosition.isDisposed) {
              playerPos = state.playerPosition.clone();
            } else {
              // Fallback to default position
              playerPos = tf.tensor2d([[8, 8]]);
            }
          } catch (e) {
            playerPos = tf.tensor2d([[8, 8]]);
          }
          
          try {
            if (state.opponentPosition && !state.opponentPosition.isDisposed) {
              opponentPos = state.opponentPosition.clone();
            } else {
              opponentPos = tf.tensor2d([[12, 12]]);
            }
          } catch (e) {
            opponentPos = tf.tensor2d([[12, 12]]);
          }
          
          const stateCopy = {
            playerPosition: playerPos,
            opponentPosition: opponentPos,
            playerSaberAngle: state.playerSaberAngle || 0,
            playerSaberAngularVelocity: state.playerSaberAngularVelocity || 0,
            opponentSaberAngle: state.opponentSaberAngle || 0,
            opponentSaberAngularVelocity: state.opponentSaberAngularVelocity || 0,
            timestamp: state.timestamp || Date.now()
          };
          
          const result = this.stateProcessor.processState(stateCopy);
          
          // Clean up cloned tensors
          playerPos.dispose();
          opponentPos.dispose();
          
          return result;
        } catch (error) {
          console.warn('A2C: Error processing game state:', error);
          return new Array(9).fill(0); // Default state
        }
      } else {
        console.warn('A2C: Unexpected state format:', state);
        return new Array(9).fill(0); // Default state
      }
    });

    return {
      states: tf.tensor2d(statesArray, [statesArray.length, statesArray[0]?.length || 9]),
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
      // Ensure shapes match for meanSquaredError
      const valueOutputSqueezed = valueOutput.squeeze();
      const returnsSqueezed = returns.squeeze();
      const valueLoss = this.computeValueLoss(valueOutputSqueezed, returnsSqueezed);

      // Compute entropy bonus
      const entropy = this.computeEntropy(actionProbs);

      // Total loss for policy
      const totalPolicyLoss = policyLoss.sub(entropy.mul(this.options.entropyCoeff));

      // Update models using minimize
      this.policyOptimizer.minimize(() => {
        // Recompute policy predictions inside gradient function
        const policyOutput = policyModel.predict(data.states);
        const actionProbs = tf.softmax(policyOutput);
        const logProbs = tf.log(actionProbs.add(1e-8));
        
        // Compute policy loss
        const policyLoss = this.computePolicyLoss(
          logProbs,
          data.actions,
          advantages
        );
        
        // Compute entropy bonus
        const entropy = this.computeEntropy(actionProbs);
        
        // Total loss for policy
        return policyLoss.sub(entropy.mul(this.options.entropyCoeff));
      });

      this.valueOptimizer.minimize(() => {
        // Recompute value predictions inside gradient function
        const valueOutput = valueModel.predict(data.states);
        const valueOutputSqueezed = valueOutput.squeeze();
        const returnsSqueezed = returns.squeeze();
        return this.computeValueLoss(valueOutputSqueezed, returnsSqueezed);
      });

      // Update statistics (compute values for stats)
      const finalPolicyOutput = policyModel.predict(data.states);
      const finalActionProbs = tf.softmax(finalPolicyOutput);
      const finalLogProbs = tf.log(finalActionProbs.add(1e-8));
      const finalEntropy = this.computeEntropy(finalActionProbs);
      
      // Compute policy loss for statistics
      const finalPolicyLoss = this.computePolicyLoss(
        finalLogProbs,
        data.actions,
        advantages
      );
      
      this.updateStats(finalPolicyLoss, valueLoss, finalEntropy);
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
    // logProbs shape: [batchSize, 4], actions shape: [batchSize]
    // Use oneHot to create mask and mul to select action log probabilities
    const actionMask = tf.oneHot(actions.cast('int32'), 4);
    const actionLogProbs = tf.sum(logProbs.mul(actionMask), 1);

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
