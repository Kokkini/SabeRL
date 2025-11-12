/**
 * RolloutCollector - Collects rollout experiences from headless games
 * Uses GameCore interface for game-agnostic rollout collection
 */

import { GameCore, GameState, Action } from '../core/GameCore.js';
import { PolicyAgent } from '../agents/PolicyAgent.js';
import { RandomController } from '../../game/controllers/RandomController.js';

export interface RolloutCollectorConfig {
  rolloutMaxLength?: number;
  deltaTime?: number;
  actionIntervalSeconds?: number;
  yieldInterval?: number;
}

export interface RolloutCollectorHooks {
  sampleOpponent?: () => any; // PlayerController
  getActionForPlayer?: (playerIndex: number, observation: number[]) => Action;
  onEpisodeEnd?: (outcome: ('win' | 'loss' | 'tie')[] | null) => void;
}

export interface Experience {
  observation: number[];
  action: Action;
  reward: number;
  done: boolean;
  value: number;
  logProb: number;
  nextValue: number | null;
  outcome: ('win' | 'loss' | 'tie')[] | null;
}

export interface RolloutResult {
  rolloutBuffer: Experience[];
  lastValue: number;
}

export class RolloutCollector {
  private core: GameCore;
  private agent: PolicyAgent;
  private hooks: RolloutCollectorHooks;
  private defaultOpponentController: RandomController;
  
  private rolloutMaxLength: number;
  private deltaTime: number;
  private actionIntervalSeconds: number;
  private yieldInterval: number;
  
  private yieldChannel: MessageChannel;
  private yieldChannelResolve: (() => void) | null;

  constructor(core: GameCore, agent: PolicyAgent, config: RolloutCollectorConfig = {}, hooks: RolloutCollectorHooks = {}) {
    this.core = core;  // GameCore interface
    this.agent = agent;  // PolicyAgent (no valueModel needed)
    this.hooks = hooks;
    
    // Default random controller for player 1
    const actionSpaces = core?.getActionSpaces?.() || null;
    this.defaultOpponentController = new RandomController(actionSpaces as any);
    
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
   * Collect a single rollout
   * @returns {RolloutResult} Rollout buffer and last value
   */
  async collectRollout(): Promise<RolloutResult> {
    const rolloutBuffer: Experience[] = [];
    let state: GameState = this.core.reset();
    
    // Sample opponent controller if hook provided (for player 1)
    let opponentController: any = null;
    if (typeof this.hooks.sampleOpponent === 'function') {
      opponentController = this.hooks.sampleOpponent();
    }
    
    let experienceCount = 0;
    
    while (rolloutBuffer.length < this.rolloutMaxLength) {
      // Get action from agent (for player 0, the trainable player)
      const normalizedObs = state.observations[0];
      const agentResult = this.agent.act(normalizedObs);
      const action = agentResult.action;
      const value = agentResult.value;
      const logProb = agentResult.logProb;
      
      // For other players, use controllers or default actions
      const actions: Action[] = [action];
      for (let i = 1; i < this.core.getNumPlayers(); i++) {
        // Get action from controller or use default
        if (i === 1 && opponentController) {
          actions[i] = opponentController.decide(state.observations[i]);
        } else {
          actions[i] = this.hooks.getActionForPlayer?.(i, state.observations[i]) || new Array(this.core.getActionSize()).fill(0);
        }
      }
      
      // Frame-skip: apply actions repeatedly
      let timeTillAction = this.actionIntervalSeconds;
      let rewardAccumulated = 0;
      let nextState: GameState = state;
      
      while (timeTillAction > 0 && !nextState.done) {
        nextState = this.core.step(actions, this.deltaTime);
        rewardAccumulated += nextState.rewards[0]; // Reward for player 0
        timeTillAction -= this.deltaTime;
        if (nextState.done) break;
      }
      
      // Store experience
      rolloutBuffer.push({
        observation: state.observations[0],
        action: action,
        reward: rewardAccumulated,
        done: nextState.done,
        value: value,
        logProb: logProb,
        nextValue: null, // Set later for GAE
        outcome: nextState.done ? nextState.outcome : null
      });
      experienceCount++;
      
      state = nextState;
      if (nextState.done) {
        if (typeof this.hooks.onEpisodeEnd === 'function') {
          try { this.hooks.onEpisodeEnd(nextState.outcome || null); } catch (_) {}
        }
        state = this.core.reset();
        // New episode: re-sample opponent
        if (typeof this.hooks.sampleOpponent === 'function') {
          opponentController = this.hooks.sampleOpponent();
        }
      }
      
      // Yield periodically
      if (experienceCount % this.yieldInterval === 0) {
        await this.yieldToEventLoop();
      }
    }
    
    // Compute last value and set nextValue for GAE
    let lastValue = 0;
    if (!state.done) {
      lastValue = this.agent.act(state.observations[0]).value;
    }
    
    for (let i = 0; i < rolloutBuffer.length; i++) {
      const exp = rolloutBuffer[i];
      if (exp.done) {
        exp.nextValue = 0;
      } else if (i === rolloutBuffer.length - 1) {
        exp.nextValue = lastValue;
      } else {
        exp.nextValue = rolloutBuffer[i + 1].value;
      }
    }
    
    return { rolloutBuffer, lastValue };
  }
}

