/**
 * RolloutWorker - Web Worker for collecting rollout experiences
 * Runs headless games in parallel to collect training experiences
 * 
 * Note: This worker file needs to be loaded as a Web Worker script.
 * It should be imported or loaded via importScripts in the worker context.
 */

// Import TensorFlow.js
importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.15.0/dist/tf.min.js');

const tf = self.tf;

// This will be populated with game classes via message
let Game = null;
let PolicyAgent = null;
let NeuralNetwork = null;

class RolloutWorker {
  constructor() {
    this.game = null;
    this.agent = null;
    this.valueModel = null;
    
    // Rollout configuration (can be overridden via init message)
    this.rolloutMaxLength = 2048;
    this.deltaTime = 0.05; // Fixed timestep
    this.actionIntervalSeconds = 0.2; // Time between agent actions
    
    // Setup message handler
    self.onmessage = (e) => this.handleMessage(e);
  }

  /**
   * Handle messages from main thread
   * @param {MessageEvent} event - Message event
   */
  async handleMessage(event) {
    const { type, data } = event.data;

    try {
      switch (type) {
        case 'init':
          await this.initialize(data);
          self.postMessage({ type: 'ready' });
          break;
          
        case 'collectRollout':
          const result = await this.collectRollout();
          self.postMessage({ type: 'rolloutComplete', data: result });
          break;
          
        case 'updateWeights':
          this.updateWeights(data);
          self.postMessage({ type: 'weightsUpdated' });
          break;
          
        default:
          console.warn(`Unknown message type: ${type}`);
      }
    } catch (error) {
      self.postMessage({ 
        type: 'error', 
        error: error.message, 
        stack: error.stack 
      });
    }
  }

  /**
   * Initialize worker with game and agent
   * @param {Object} data - Initialization data
   */
  async initialize(data) {
    // Wait for TensorFlow.js to be ready
    await tf.ready();
    
    // Load classes dynamically via import
    // Note: This requires the worker to support ES modules
    // For now, we'll receive serialized network data and reconstruct
    if (data.rolloutMaxLength) this.rolloutMaxLength = data.rolloutMaxLength;
    if (data.deltaTime) this.deltaTime = data.deltaTime;
    if (data.actionIntervalSeconds) this.actionIntervalSeconds = data.actionIntervalSeconds;
    
    // Store initialization data - actual game/agent creation will happen
    // when classes are available via dynamic import or passed code
    this.initData = data;
    
    // For now, we'll need to receive the game and agent setup differently
    // This is a placeholder - actual implementation depends on module loading strategy
    console.log('RolloutWorker initialized with config:', {
      rolloutMaxLength: this.rolloutMaxLength,
      deltaTime: this.deltaTime,
      actionIntervalSeconds: this.actionIntervalSeconds
    });
  }

  /**
   * Collect a single rollout
   * @returns {Object} Rollout data with experiences and lastValue
   */
  async collectRollout() {
    if (!this.game || !this.agent) {
      throw new Error('Worker not properly initialized - game or agent missing');
    }
    
    const rolloutBuffer = [];
    let observation = this.game.startRollout();
    let action = null;
    let value = null;
    let logProb = null;
    let done = false;
    let timeTillAction = 0;
    
    while (rolloutBuffer.length < this.rolloutMaxLength) {
      // Get action from agent
      const agentResult = this.agent.act(observation, this.valueModel);
      action = agentResult.action;
      value = agentResult.value;
      logProb = agentResult.logProb;
      timeTillAction = this.actionIntervalSeconds;
      
      let rewardDuringSkip = 0;
      let newObservation = observation;
      
      // Apply action repeatedly until action interval expires or game ends
      while (timeTillAction > 0 && !done) {
        const result = this.game.updateRollout(action, this.deltaTime);
        newObservation = result.observation;
        done = result.done;
        rewardDuringSkip += result.reward;
        timeTillAction -= this.deltaTime;
        
        if (done) break;
      }
      
      // Store experience
      const experience = {
        observation: observation,
        action: action,
        reward: rewardDuringSkip,
        done: done,
        value: value,
        logProb: logProb
      };
      rolloutBuffer.push(experience);
      
      // Update observation for next iteration
      observation = newObservation;
      
      // If game ended, restart
      if (done) {
        observation = this.game.startRollout();
        done = false;
      }
    }
    
    // Compute last value for bootstrapping
    let lastValue = 0.0;
    if (!done) {
      // Episode is still ongoing, bootstrap from current state
      lastValue = this.agent.getValue(observation, this.valueModel);
    }
    // If done is true, lastValue stays 0.0 (episode ended naturally)
    
    return {
      rolloutBuffer: rolloutBuffer,
      lastValue: lastValue
    };
  }

  /**
   * Update agent weights after training
   * @param {Object} data - Updated network weights
   */
  updateWeights(data) {
    // Update policy network
    if (data.policyNetwork && this.agent) {
      this.agent.neuralNetwork.dispose();
      this.agent.neuralNetwork = NeuralNetwork.fromSerialized(data.policyNetwork);
    }
    
    // Update value network
    if (data.valueNetwork && this.valueModel) {
      this.valueModel.dispose();
      const valueNetwork = NeuralNetwork.fromSerialized(data.valueNetwork);
      this.valueModel = valueNetwork.model;
    }
  }
}

// Auto-instantiate worker when loaded
const worker = new RolloutWorker();

