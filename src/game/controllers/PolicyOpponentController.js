import { PlayerController } from './PlayerController.js';

/**
 * PolicyOpponentController wraps a PolicyAgent but feeds it a swapped observation
 * (opponent-as-player view) so the agent can act as the opponent.
 */
export class PolicyOpponentController extends PlayerController {
  constructor(policyAgent, id = 'policy-opponent') {
    super(id);
    this.policy = policyAgent;
    this._activated = false;
  }

  decide(observation, deltaTime) {
    if (!this.policy) {
      return this.lastActionMask;
    }
    if (!this._activated && typeof this.policy.activate === 'function') {
      try { this.policy.activate(); } catch (_) {}
      this._activated = true;
    }
    const swapped = this.#swapObservation(observation);
    // Use agent's decision interval logic; returns a MovementDecision when interval elapses
    if (typeof this.policy.makeDecision === 'function') {
      const decision = this.policy.makeDecision(swapped, deltaTime);
      if (decision && Array.isArray(decision.actionMask)) {
        this.lastActionMask = decision.actionMask;
      }
      return this.lastActionMask;
    }
    // Fallback to stateless act() if makeDecision is not available
    if (typeof this.policy.act === 'function') {
      const result = this.policy.act(swapped);
      if (Array.isArray(result?.action)) {
        this.lastActionMask = result.action;
      } else if (typeof result?.action === 'number') {
        const idx = result.action;
        const m = [false, false, false, false];
        if (idx >= 0 && idx < 4) m[idx] = true;
        this.lastActionMask = m;
      }
      return this.lastActionMask;
    }
    return this.lastActionMask;
  }

  #swapObservation(obs) {
    if (!obs) return obs;
    return {
      stepCount: obs.stepCount,
      playerPosition: obs.opponentPosition,
      opponentPosition: obs.playerPosition,
      playerSaberAngle: obs.opponentSaberAngle,
      playerSaberAngularVelocity: obs.opponentSaberAngularVelocity,
      opponentSaberAngle: obs.playerSaberAngle,
      opponentSaberAngularVelocity: obs.playerSaberAngularVelocity
    };
  }
}


