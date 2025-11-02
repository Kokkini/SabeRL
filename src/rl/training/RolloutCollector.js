/**
 * RolloutCollector - Collects rollout experiences from headless games
 * Implements the rollout collection loop as specified
 */

export class RolloutCollector {
  constructor(game, agent, valueModel, config = {}) {
    this.game = game;
    this.agent = agent;
    this.valueModel = valueModel;
    
    // Rollout configuration
    this.rolloutMaxLength = config.rolloutMaxLength || 2048;
    this.deltaTime = config.deltaTime || 0.05;
    this.actionIntervalSeconds = config.actionIntervalSeconds || 0.2;
    this.yieldInterval = config.yieldInterval || 50;
  }

  /**
   * Collect a single rollout
   * @returns {Object} {rolloutBuffer: Array, lastValue: number}
   */
  async collectRollout() {
    const rolloutBuffer = [];
    let observation = this.game.startRollout();
    let action = null;
    let value = null;
    let logProb = null;
    let done = false;
    let timeTillAction = 0;
    
    // Yield to event loop every N experiences to keep UI responsive
    let experienceCount = 0;
    
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
      
      // Store experience (will add nextValue later)
      const experience = {
        observation: observation,
        action: action,
        reward: rewardDuringSkip,
        done: done,
        value: value,
        logProb: logProb,
        nextValue: null // Will be set later
      };
      rolloutBuffer.push(experience);
      experienceCount++;
      
      // Update observation for next iteration
      observation = newObservation;
      
      // If game ended, restart
      if (done) {
        observation = this.game.startRollout();
        done = false;
      }
      
      // Yield to event loop periodically to keep UI responsive
      if (experienceCount % this.yieldInterval === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
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

