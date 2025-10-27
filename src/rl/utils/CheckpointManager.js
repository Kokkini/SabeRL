/**
 * CheckpointManager - Manages model checkpoints and training state persistence
 * Handles saving, loading, and managing training checkpoints with metadata
 */

import { ModelManager } from './ModelManager.js';

export class CheckpointManager {
  constructor(options = {}) {
    this.options = {
      autoSaveInterval: options.autoSaveInterval || 50, // games
      maxCheckpoints: options.maxCheckpoints || 10,
      checkpointPrefix: options.checkpointPrefix || 'checkpoint_',
      ...options
    };

    this.modelManager = new ModelManager();
    this.checkpoints = new Map();
    this.currentCheckpoint = null;
    this.lastSaveTime = 0;

    // Load existing checkpoints
    this.loadCheckpointList();
  }

  /**
   * Save checkpoint
   * @param {Object} trainingState - Current training state
   * @param {Object} model - Neural network model
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<string>} Checkpoint ID
   */
  async saveCheckpoint(trainingState, model, metadata = {}) {
    try {
      const checkpointId = this.generateCheckpointId();
      const timestamp = Date.now();

      const checkpointData = {
        id: checkpointId,
        timestamp,
        trainingState: {
          gamesCompleted: trainingState.gamesCompleted || 0,
          trainingTime: trainingState.trainingTime || 0,
          metrics: trainingState.metrics || {},
          config: trainingState.config || {}
        },
        model: model,
        metadata: {
          version: '1.0.0',
          algorithm: metadata.algorithm || 'PPO',
          performance: metadata.performance || {},
          ...metadata
        }
      };

      // Save model
      const modelSaved = await this.modelManager.saveModel(
        model,
        checkpointId,
        checkpointData.metadata
      );

      if (!modelSaved) {
        throw new Error('Failed to save model');
      }

      // Save checkpoint metadata
      const checkpointKey = `${this.options.checkpointPrefix}${checkpointId}`;
      localStorage.setItem(checkpointKey, JSON.stringify(checkpointData));

      // Update checkpoint list
      this.checkpoints.set(checkpointId, checkpointData);
      this.currentCheckpoint = checkpointId;
      this.lastSaveTime = timestamp;

      // Cleanup old checkpoints
      await this.cleanupOldCheckpoints();

      console.log(`Checkpoint saved: ${checkpointId}`);
      return checkpointId;
    } catch (error) {
      console.error('Failed to save checkpoint:', error);
      throw error;
    }
  }

  /**
   * Load checkpoint
   * @param {string} checkpointId - Checkpoint ID
   * @returns {Promise<Object>} Checkpoint data
   */
  async loadCheckpoint(checkpointId) {
    try {
      const checkpointKey = `${this.options.checkpointPrefix}${checkpointId}`;
      const checkpointData = localStorage.getItem(checkpointKey);

      if (!checkpointData) {
        throw new Error(`Checkpoint not found: ${checkpointId}`);
      }

      const parsed = JSON.parse(checkpointData);
      
      // Load model
      const modelResult = await this.modelManager.loadModel(checkpointId);
      if (!modelResult) {
        throw new Error(`Failed to load model for checkpoint: ${checkpointId}`);
      }

      parsed.model = modelResult.model;
      this.currentCheckpoint = checkpointId;

      console.log(`Checkpoint loaded: ${checkpointId}`);
      return parsed;
    } catch (error) {
      console.error('Failed to load checkpoint:', error);
      throw error;
    }
  }

  /**
   * Load latest checkpoint
   * @returns {Promise<Object>} Latest checkpoint data
   */
  async loadLatestCheckpoint() {
    const checkpoints = this.getCheckpointList();
    if (checkpoints.length === 0) {
      throw new Error('No checkpoints available');
    }

    // Sort by timestamp and get latest
    const latest = checkpoints.sort((a, b) => b.timestamp - a.timestamp)[0];
    return await this.loadCheckpoint(latest.id);
  }

  /**
   * Delete checkpoint
   * @param {string} checkpointId - Checkpoint ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteCheckpoint(checkpointId) {
    try {
      // Delete model
      await this.modelManager.deleteModel(checkpointId);

      // Delete checkpoint metadata
      const checkpointKey = `${this.options.checkpointPrefix}${checkpointId}`;
      localStorage.removeItem(checkpointKey);

      // Remove from checkpoints map
      this.checkpoints.delete(checkpointId);

      console.log(`Checkpoint deleted: ${checkpointId}`);
      return true;
    } catch (error) {
      console.error('Failed to delete checkpoint:', error);
      return false;
    }
  }

  /**
   * Get checkpoint list
   * @returns {Array} List of checkpoints
   */
  getCheckpointList() {
    return Array.from(this.checkpoints.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get checkpoint by ID
   * @param {string} checkpointId - Checkpoint ID
   * @returns {Object} Checkpoint data
   */
  getCheckpoint(checkpointId) {
    return this.checkpoints.get(checkpointId);
  }

  /**
   * Check if checkpoint exists
   * @param {string} checkpointId - Checkpoint ID
   * @returns {boolean} Exists status
   */
  hasCheckpoint(checkpointId) {
    return this.checkpoints.has(checkpointId);
  }

  /**
   * Get current checkpoint
   * @returns {string} Current checkpoint ID
   */
  getCurrentCheckpoint() {
    return this.currentCheckpoint;
  }

  /**
   * Set current checkpoint
   * @param {string} checkpointId - Checkpoint ID
   */
  setCurrentCheckpoint(checkpointId) {
    if (this.checkpoints.has(checkpointId)) {
      this.currentCheckpoint = checkpointId;
    } else {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }
  }

  /**
   * Load checkpoint list from localStorage
   */
  loadCheckpointList() {
    this.checkpoints.clear();

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(this.options.checkpointPrefix)) {
        try {
          const checkpointData = JSON.parse(localStorage.getItem(key));
          this.checkpoints.set(checkpointData.id, checkpointData);
        } catch (error) {
          console.warn(`Failed to load checkpoint from key ${key}:`, error);
        }
      }
    }
  }

  /**
   * Generate checkpoint ID
   * @returns {string} Checkpoint ID
   */
  generateCheckpointId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `${timestamp}_${random}`;
  }

  /**
   * Cleanup old checkpoints
   */
  async cleanupOldCheckpoints() {
    const checkpoints = this.getCheckpointList();
    
    if (checkpoints.length <= this.options.maxCheckpoints) {
      return;
    }

    // Keep only the most recent checkpoints
    const toDelete = checkpoints.slice(this.options.maxCheckpoints);
    
    for (const checkpoint of toDelete) {
      await this.deleteCheckpoint(checkpoint.id);
    }

    console.log(`Cleaned up ${toDelete.length} old checkpoints`);
  }

  /**
   * Export checkpoint
   * @param {string} checkpointId - Checkpoint ID
   * @returns {Promise<Object>} Exported checkpoint data
   */
  async exportCheckpoint(checkpointId) {
    const checkpoint = await this.loadCheckpoint(checkpointId);
    
    return {
      id: checkpoint.id,
      timestamp: checkpoint.timestamp,
      trainingState: checkpoint.trainingState,
      metadata: checkpoint.metadata,
      modelData: checkpoint.model ? await this.serializeModel(checkpoint.model) : null
    };
  }

  /**
   * Import checkpoint
   * @param {Object} checkpointData - Checkpoint data to import
   * @returns {Promise<string>} Imported checkpoint ID
   */
  async importCheckpoint(checkpointData) {
    try {
      const checkpointId = this.generateCheckpointId();
      
      // Save model if provided
      if (checkpointData.modelData) {
        const model = await this.deserializeModel(checkpointData.modelData);
        await this.modelManager.saveModel(model, checkpointId, checkpointData.metadata);
      }

      // Save checkpoint metadata
      const checkpoint = {
        id: checkpointId,
        timestamp: checkpointData.timestamp || Date.now(),
        trainingState: checkpointData.trainingState,
        metadata: checkpointData.metadata
      };

      const checkpointKey = `${this.options.checkpointPrefix}${checkpointId}`;
      localStorage.setItem(checkpointKey, JSON.stringify(checkpoint));

      this.checkpoints.set(checkpointId, checkpoint);
      
      console.log(`Checkpoint imported: ${checkpointId}`);
      return checkpointId;
    } catch (error) {
      console.error('Failed to import checkpoint:', error);
      throw error;
    }
  }

  /**
   * Serialize model for export
   * @param {Object} model - Model to serialize
   * @returns {Promise<Object>} Serialized model data
   */
  async serializeModel(model) {
    // This would serialize the model to a portable format
    // For now, return a placeholder
    return {
      type: 'tensorflow',
      data: 'serialized_model_data'
    };
  }

  /**
   * Deserialize model from import
   * @param {Object} modelData - Serialized model data
   * @returns {Promise<Object>} Deserialized model
   */
  async deserializeModel(modelData) {
    // This would deserialize the model from portable format
    // For now, return a placeholder
    return {
      type: 'tensorflow',
      data: 'deserialized_model_data'
    };
  }

  /**
   * Get checkpoint statistics
   * @returns {Object} Checkpoint statistics
   */
  getStatistics() {
    const checkpoints = this.getCheckpointList();
    
    return {
      total: checkpoints.length,
      latest: checkpoints[0] || null,
      oldest: checkpoints[checkpoints.length - 1] || null,
      totalSize: this.calculateTotalSize(),
      lastSaveTime: this.lastSaveTime
    };
  }

  /**
   * Calculate total size of all checkpoints
   * @returns {number} Total size in bytes
   */
  calculateTotalSize() {
    let totalSize = 0;
    
    for (const checkpoint of this.checkpoints.values()) {
      const checkpointKey = `${this.options.checkpointPrefix}${checkpoint.id}`;
      const data = localStorage.getItem(checkpointKey);
      if (data) {
        totalSize += data.length * 2; // Approximate byte size
      }
    }
    
    return totalSize;
  }

  /**
   * Clear all checkpoints
   * @returns {Promise<boolean>} Success status
   */
  async clearAllCheckpoints() {
    try {
      const checkpoints = Array.from(this.checkpoints.keys());
      
      for (const checkpointId of checkpoints) {
        await this.deleteCheckpoint(checkpointId);
      }
      
      this.checkpoints.clear();
      this.currentCheckpoint = null;
      
      console.log('All checkpoints cleared');
      return true;
    } catch (error) {
      console.error('Failed to clear checkpoints:', error);
      return false;
    }
  }

  /**
   * Dispose of checkpoint manager
   */
  dispose() {
    this.checkpoints.clear();
    this.currentCheckpoint = null;
  }
}
