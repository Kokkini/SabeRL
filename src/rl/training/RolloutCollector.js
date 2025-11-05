/**
 * RolloutCollector - Collects rollout experiences from headless games
 * Implements the rollout collection loop as specified
 */

export class RolloutCollector {
  constructor(core, agent, valueModel, config = {}, hooks = {}) {
    this.core = core;
    this.agent = agent;
    this.valueModel = valueModel;
    this.hooks = hooks || {};
    // Ensure agent is active for rollouts so it does not return random actions
    if (this.agent && typeof this.agent.activate === 'function') {
      this.agent.activate();
    }
    
    // Rollout configuration
    this.rolloutMaxLength = config.rolloutMaxLength || 2048;
    this.deltaTime = config.deltaTime || 0.05;
    this.actionIntervalSeconds = config.actionIntervalSeconds || 0.2;
    this.yieldInterval = config.yieldInterval || 50;
    
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
   * Collect a single rollout
   * @returns {Object} {rolloutBuffer: Array, lastValue: number}
   */
  async collectRollout() {
    const rolloutBuffer = [];
    let observation = this.core.reset();
    // Sample opponent for this episode, if hook provided
    if (typeof this.hooks.sampleOpponent === 'function') {
      const controller = this.hooks.sampleOpponent();
      try { this.core.setOpponentController(controller || null); } catch (_) {}
    }
    let action = null;
    let value = null;
    let logProb = null;
    let done = false;
    let lastOutcome = null;
    let timeTillAction = 0;
    
    // Yield to event loop every N experiences to keep UI responsive
    let experienceCount = 0;
    
    while (rolloutBuffer.length < this.rolloutMaxLength) {
      // Get action from agent
      const agentResult = this.agent.act(observation, this.valueModel);
      action = agentResult.action; // now an action mask [W,A,S,D]
      value = agentResult.value;
      logProb = agentResult.logProb;
      timeTillAction = this.actionIntervalSeconds;
      
      let rewardDuringSkip = 0;
      let newObservation = observation;
      
      // Apply action repeatedly until action interval expires or game ends
      while (timeTillAction > 0 && !done) {
        const result = this.core.step(action, this.deltaTime);
        newObservation = result.observation;
        done = result.done;
        rewardDuringSkip += result.reward;
        if (result.done && result.outcome) {
          lastOutcome = result.outcome;
        }
        timeTillAction -= this.deltaTime;
        
        if (done) break;
      }
      
      // Store experience (will add nextValue later)
      const experience = {
        observation: observation,
        action: action, // store mask
        reward: rewardDuringSkip,
        done: done,
        value: value,
        logProb: logProb,
        nextValue: null, // Will be set later
        outcome: done ? lastOutcome : null
      };
      rolloutBuffer.push(experience);
      experienceCount++;
      
      // Update observation for next iteration
      observation = newObservation;
      
      // If game ended, restart
      if (done) {
        observation = this.core.reset();
        // New episode: re-sample opponent
        if (typeof this.hooks.sampleOpponent === 'function') {
          const controller = this.hooks.sampleOpponent();
          try { this.core.setOpponentController(controller || null); } catch (_) {}
        }
        done = false;
      }
      
      // Yield to event loop periodically to keep UI responsive
      // Uses smart yielding based on tab visibility
      if (experienceCount % this.yieldInterval === 0) {
        await this.yieldToEventLoop();
      }
    }
    
    // Compute last value for bootstrapping
    let lastValue = 0.0;
    if (!done) {
      // Episode is still ongoing, bootstrap from current state
      lastValue = this.agent.getValue(observation, this.valueModel);
    }
    // If done is true, lastValue stays 0.0 (episode ended naturally)
    
    // Set nextValue for all experiences (for GAE computation)
    for (let i = 0; i < rolloutBuffer.length; i++) {
      const exp = rolloutBuffer[i];
      if (exp.done) {
        exp.nextValue = 0; // Terminal state, no bootstrap
      } else if (i === rolloutBuffer.length - 1) {
        // Last experience in rollout - use lastValue for bootstrapping
        exp.nextValue = lastValue;
      } else {
        // Use next experience's value for bootstrapping
        exp.nextValue = rolloutBuffer[i + 1].value;
      }
    }
    
    return {
      rolloutBuffer: rolloutBuffer,
      lastValue: lastValue
    };
  }
}

