/**
 * PolicyAgent - Game-agnostic RL agent
 * Works exclusively with normalized feature vectors and actions
 * Uses TensorFlow.js for neural networks
 */

import { Action, ActionSpace } from '../core/GameCore.js';

// TensorFlow.js is loaded from CDN as a global 'tf' object
// We declare it here for TypeScript
declare const tf: any;

export interface PolicyAgentConfig {
  id?: string;
  observationSize: number;
  actionSize: number;
  actionSpaces: ActionSpace[];
  policyNetwork?: any; // tf.LayersModel
  valueNetwork?: any; // tf.LayersModel
  initialStd?: number | number[];
  networkArchitecture?: {
    policyHiddenLayers?: number[];
    valueHiddenLayers?: number[];
    activation?: string;
  };
}

export interface PolicyAgentActResult {
  action: Action;
  logProb: number;
  value: number;
}

/**
 * PolicyAgent - Game-agnostic RL agent
 */
export class PolicyAgent {
  public readonly id: string;
  public readonly observationSize: number;
  public readonly actionSize: number;
  public readonly actionSpaces: ActionSpace[];
  public readonly networkArchitecture: {
    policyHiddenLayers: number[];
    valueHiddenLayers: number[];
    activation: string;
  };
  public readonly policyNetwork: any; // tf.LayersModel
  public readonly valueNetwork: any; // tf.LayersModel
  public readonly learnableStd: any; // tf.Variable
  public isActive: boolean;

  constructor(config: PolicyAgentConfig) {
    this.id = config.id || this.generateId();
    this.observationSize = config.observationSize;
    this.actionSize = config.actionSize;
    this.actionSpaces = config.actionSpaces;
    
    if (!this.observationSize || !this.actionSize || !this.actionSpaces) {
      throw new Error('observationSize, actionSize, and actionSpaces are required');
    }
    
    // Validate actionSpaces length matches actionSize
    if (this.actionSpaces.length !== this.actionSize) {
      throw new Error(`Action spaces length (${this.actionSpaces.length}) must match action size (${this.actionSize})`);
    }
    
    // Network architecture configuration (with defaults)
    this.networkArchitecture = {
      policyHiddenLayers: config.networkArchitecture?.policyHiddenLayers || [64, 32],
      valueHiddenLayers: config.networkArchitecture?.valueHiddenLayers || [64, 32],
      activation: config.networkArchitecture?.activation || 'relu'
    };
    
    // Create or use provided networks
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
    
    this.isActive = false;
  }

  /**
   * Act on normalized observation vector (game-agnostic)
   * @param {number[]} observation - Normalized feature vector
   * @returns {PolicyAgentActResult} Action, log probability, and value estimate
   */
  act(observation: number[]): PolicyAgentActResult {
    // Validate input size
    if (observation.length !== this.observationSize) {
      throw new Error(`Observation size mismatch: expected ${this.observationSize}, got ${observation.length}`);
    }
    
    // Convert to tensor
    const input = tf.tensor2d([observation], [1, this.observationSize]);
    
    // Get action outputs from policy network
    const output = this.policyNetwork.predict(input);
    const outputArray = Array.from(output.dataSync());
    
    // Sample action based on action spaces using reparameterization trick for continuous actions
    const action: Action = [];
    const logProbs: number[] = [];
    
    // For continuous actions, we need to sample epsilon (noise) for reparameterization
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
        const mean: number = outputArray[i] as number;  // Mean in original units
        const stdArray: number[] = Array.from(this.learnableStd.dataSync() as Float32Array | Int32Array);
        const std: number = stdArray[i] as number; // std for action index i
        const epsilon_i: number = epsilonArray[i] as number; // epsilon ~ N(0, 1)
        const sampled: number = mean + std * epsilon_i;
        action[i] = sampled;
        
        // Log probability under Normal(mean, std) in original units
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

  /**
   * Create default policy network
   * @returns {tf.LayersModel} Policy network
   */
  createDefaultPolicyNetwork(): any {
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

  /**
   * Create default value network
   * @returns {tf.LayersModel} Value network
   */
  createDefaultValueNetwork(): any {
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

  /**
   * Activate the agent
   */
  activate(): void {
    this.isActive = true;
  }

  /**
   * Deactivate the agent
   */
  deactivate(): void {
    this.isActive = false;
  }

  /**
   * Generate unique agent ID
   * @returns {string} Unique ID
   */
  generateId(): string {
    return `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Dispose of agent resources
   */
  dispose(): void {
    if (this.policyNetwork) {
      this.policyNetwork.dispose();
    }
    if (this.valueNetwork) {
      this.valueNetwork.dispose();
    }
    if (this.learnableStd) {
      this.learnableStd.dispose();
    }
    this.isActive = false;
  }

  /**
   * Get string representation
   * @returns {string} String representation
   */
  toString(): string {
    return `PolicyAgent(id=${this.id}, active=${this.isActive})`;
  }
}

