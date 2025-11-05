import { PlayerController } from './PlayerController.js';

/**
 * PolicyController wraps a policy that returns a multi-binary action mask.
 * The policy should implement act(observation) -> { action: boolean[4], value?, logProb? }
 */
export class PolicyController extends PlayerController {
  constructor(policy, id = 'policy') {
    super(id);
    this.policy = policy; // e.g., PolicyAgent or similar with act(observation)
    this.lastProbs = null;
    this.lastLogProb = null;
    this._activated = false;
  }

  decide(observation, deltaTime) {
    if (!this.policy || typeof this.policy.act !== 'function') {
      // Fallback: keep last mask
      return this.lastActionMask;
    }
    if (!this._activated && typeof this.policy.activate === 'function') {
      try { this.policy.activate(); } catch (_) {}
      this._activated = true;
    }
    const result = this.policy.act(observation);
    let mask = this.lastActionMask;
    if (Array.isArray(result?.action)) {
      mask = result.action;
    } else if (typeof result?.action === 'number') {
      // Map discrete 0..3 to [W,A,S,D]
      const idx = result.action;
      const m = [false, false, false, false];
      if (idx >= 0 && idx < 4) m[idx] = true;
      mask = m;
    }
    this.lastActionMask = mask;
    this.lastProbs = result?.probabilities || null;
    this.lastLogProb = result?.logProb || null;
    return mask;
  }
}


