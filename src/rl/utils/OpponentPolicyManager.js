import { NeuralNetwork } from '../agents/NeuralNetwork.js';
import { PolicyAgent } from '../agents/PolicyAgent.js';

/**
 * OpponentPolicyManager maintains a weighted list of opponent options.
 * Options can be 'random' or 'policy' (backed by a PolicyAgent).
 * It persists configuration and caches constructed agents.
 */
export class OpponentPolicyManager {
  constructor(storageKey = 'saber_rl_opponent_config') {
    this.storageKey = storageKey;
    this.options = [];
    this.agentCache = new Map(); // id -> PolicyAgent
    this.load();
    if (this.options.length === 0) {
      this.resetToDefault();
    }
  }

  resetToDefault() {
    this.options = [
      { id: 'random', label: 'Random', type: 'random', weight: 1 }
    ];
    this.persist();
  }

  getOptions() { return [...this.options]; }

  setOptions(opts) {
    this.options = Array.isArray(opts) ? opts.filter(Boolean) : [];
    this.persist();
  }

  updateWeight(id, weight) {
    const opt = this.options.find(o => o.id === id);
    if (opt) {
      opt.weight = Math.max(0, Number(weight) || 0);
      this.persist();
    }
  }

  removeOption(id) {
    this.options = this.options.filter(o => o.id !== id);
    const cached = this.agentCache.get(id);
    if (cached && cached.dispose) try { cached.dispose(); } catch(_) {}
    this.agentCache.delete(id);
    if (this.options.length === 0) this.resetToDefault();
    this.persist();
  }

  /**
   * Add a policy option from a serialized bundle produced by TrainingSession.exportAgentWeights.
   */
  addPolicy(label, bundle) {
    if (!bundle || !bundle.policy) {
      throw new Error('Invalid bundle: missing policy');
    }
    const id = `opp_${Date.now()}_${Math.random().toString(36).substr(2,9)}`;
    const option = {
      id,
      label: label || `Policy ${this.options.length}`,
      type: 'policy',
      weight: 1,
      // Store the serialized policy network for later reconstruction
      policyData: bundle.policy
    };
    this.options.push(option);
    this.persist();
    return id;
  }

  /**
   * Sample one option by weights. Returns { type, id, label, agent? }
   */
  sample() {
    const total = this.options.reduce((s, o) => s + Math.max(0, Number(o.weight) || 0), 0);
    if (total <= 0) {
      return { id: 'random', label: 'Random', type: 'random' };
    }
    let r = Math.random() * total;
    for (const o of this.options) {
      const w = Math.max(0, Number(o.weight) || 0);
      if (r < w) {
        if (o.type === 'policy') {
          const agent = this.#getOrCreateAgent(o);
          if (!agent) {
            return { id: 'random', label: 'Random', type: 'random' };
          }
          return { ...o, agent };
        }
        return { ...o };
      }
      r -= w;
    }
    return { id: 'random', label: 'Random', type: 'random' };
  }

  #getOrCreateAgent(option) {
    try {
      if (this.agentCache.has(option.id)) return this.agentCache.get(option.id);
      const nn = NeuralNetwork.fromSerialized(option.policyData);
      const agent = new PolicyAgent({ neuralNetwork: nn });
      this.agentCache.set(option.id, agent);
      return agent;
    } catch (e) {
      return null;
    }
  }

  persist() {
    try {
      const shallow = this.options.map(o => ({
        id: o.id,
        label: o.label,
        type: o.type,
        weight: o.weight,
        policyData: o.type === 'policy' ? o.policyData : undefined
      }));
      localStorage.setItem(this.storageKey, JSON.stringify({ options: shallow, savedAt: Date.now() }));
    } catch (e) {
      // ignore
    }
  }

  load() {
    try {
      const s = localStorage.getItem(this.storageKey);
      if (!s) return;
      const parsed = JSON.parse(s);
      const options = Array.isArray(parsed?.options) ? parsed.options : [];
      this.options = options;
    } catch (e) {
      this.options = [];
    }
  }

  dispose() {
    for (const [,agent] of this.agentCache) {
      try { agent.dispose(); } catch(_) {}
    }
    this.agentCache.clear();
  }
}


