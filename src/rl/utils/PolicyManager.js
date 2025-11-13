import { PolicyAgent } from '../agents/PolicyAgent.js';
import { NetworkUtils } from './NetworkUtils.js';

/**
 * PolicyManager maintains a weighted list of policy options.
 * Options can be 'random' or 'policy' (backed by a PolicyAgent).
 * This is a general manager for any player - all players are treated equally.
 * It persists configuration and caches constructed agents.
 */
export class PolicyManager {
  constructor(gameCore = null, storageKey = 'saber_rl_policy_config') {
    this.gameCore = gameCore; // GameCore interface - needed to get observation/action sizes
    this.storageKey = storageKey;
    this.options = [];
    this.agentCache = new Map(); // id -> PolicyAgent
    this.load();
    if (this.options.length === 0) {
      this.resetToDefault();
    }
  }

  /**
   * Set the GameCore (needed for creating PolicyAgents)
   * @param {GameCore} gameCore - GameCore interface
   */
  setGameCore(gameCore) {
    this.gameCore = gameCore;
    // Clear cache when GameCore changes (agents need correct observation/action sizes)
    this.dispose();
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
   * Add a policy option from a serialized bundle.
   * Bundle should contain:
   * - policy OR policyNetwork: SerializedNetworkData for policy network
   * - value OR valueNetwork: SerializedNetworkData for value network (optional, will create default if missing)
   * - learnableStd: number[] or object with {data, shape, dtype} for learnable standard deviations (optional, will use default if missing)
   * - observationSize: number (optional, will use GameCore if available)
   * - actionSize: number (optional, will use GameCore if available)
   * - actionSpaces: ActionSpace[] (optional, will use GameCore if available)
   */
  addPolicy(label, bundle) {
    // Handle both formats: {policy, value} and {policyNetwork, valueNetwork}
    const policyData = bundle.policy || bundle.policyNetwork;
    const valueData = bundle.value || bundle.valueNetwork;
    
    if (!bundle || !policyData) {
      throw new Error('Invalid bundle: missing policy (expected "policy" or "policyNetwork" property)');
    }
    
    // Handle learnableStd format: can be array or object with {data, shape, dtype}
    let learnableStd = bundle.learnableStd;
    if (learnableStd && typeof learnableStd === 'object' && learnableStd.data) {
      // Convert from {data, shape, dtype} format to array
      learnableStd = learnableStd.data;
    }
    
    const id = `policy_${Date.now()}_${Math.random().toString(36).substr(2,9)}`;
    const option = {
      id,
      label: label || `Policy ${this.options.length}`,
      type: 'policy',
      weight: 1,
      // Store the full bundle for later reconstruction
      policyData: policyData,
      valueData: valueData, // Optional
      learnableStd: learnableStd, // Optional
      observationSize: bundle.observationSize, // Optional
      actionSize: bundle.actionSize, // Optional
      actionSpaces: bundle.actionSpaces // Optional
    };
    this.options.push(option);
    this.persist();
    return id;
  }

  /**
   * Sample one option by weights. Returns { type, id, label, agent? }
   * This can be used for any player - the caller decides which player to assign it to.
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
      
      // Get observation/action info from bundle or GameCore
      const observationSize = option.observationSize || (this.gameCore?.getObservationSize?.() || 9);
      const actionSize = option.actionSize || (this.gameCore?.getActionSize?.() || 4);
      const actionSpaces = option.actionSpaces || (this.gameCore?.getActionSpaces?.() || 
        new Array(actionSize).fill(null).map(() => ({ type: 'discrete' })));
      
      // Load policy network from serialized data
      // Handle both old format (NeuralNetwork.serialize) and new format (NetworkUtils.serializeNetwork)
      let policyNetwork;
      if (option.policyData.architecture && option.policyData.weights) {
        // New format: NetworkUtils serialized format
        policyNetwork = NetworkUtils.loadNetworkFromSerialized(option.policyData);
      } else if (option.policyData.architecture) {
        // Old format: NeuralNetwork.serialize format (has architecture, weights, id, etc.)
        policyNetwork = NetworkUtils.loadNetworkFromSerialized({
          architecture: {
            inputSize: option.policyData.architecture.inputSize || observationSize,
            hiddenLayers: option.policyData.architecture.hiddenLayers || [64, 32],
            outputSize: option.policyData.architecture.outputSize || actionSize,
            activation: option.policyData.architecture.activation || 'relu'
          },
          weights: option.policyData.weights || []
        });
      } else {
        throw new Error('Invalid policy data format');
      }
      
      // Load value network if available, otherwise create default
      let valueNetwork = null;
      if (option.valueData && option.valueData.architecture && option.valueData.weights) {
        valueNetwork = NetworkUtils.loadNetworkFromSerialized(option.valueData);
      }
      
      // Create PolicyAgent with loaded networks
      const agent = new PolicyAgent({
        observationSize: observationSize,
        actionSize: actionSize,
        actionSpaces: actionSpaces,
        policyNetwork: policyNetwork,
        valueNetwork: valueNetwork, // Will create default if null
        initialStd: option.learnableStd || 0.1
      });
      
      this.agentCache.set(option.id, agent);
      return agent;
    } catch (e) {
      console.error('Failed to create agent from policy data:', e);
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
        // Store all policy-related data for reconstruction
        policyData: o.type === 'policy' ? o.policyData : undefined,
        valueData: o.type === 'policy' ? o.valueData : undefined,
        learnableStd: o.type === 'policy' ? o.learnableStd : undefined,
        observationSize: o.type === 'policy' ? o.observationSize : undefined,
        actionSize: o.type === 'policy' ? o.actionSize : undefined,
        actionSpaces: o.type === 'policy' ? o.actionSpaces : undefined
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

