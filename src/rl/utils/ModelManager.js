/**
 * ModelManager - Handles saving and loading of neural network models
 * Uses localStorage for model persistence and IndexedDB for large data
 */

export class ModelManager {
  constructor(config = {}) {
    this.storagePrefix = config.storagePrefix || 'saber_rl_';
    this.maxModels = config.maxModels || 10;
    this.autoSaveInterval = config.autoSaveInterval || 50; // Auto-save every N games
    this.compressionEnabled = config.compressionEnabled || false;
    
    this.initializeStorage();
  }

  /**
   * Initialize storage systems
   */
  async initializeStorage() {
    try {
      // Check localStorage availability
      if (typeof Storage === 'undefined') {
        throw new Error('localStorage not available');
      }
      
      // Initialize IndexedDB for large data
      await this.initializeIndexedDB();
      
      console.log('ModelManager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize ModelManager:', error);
      throw error;
    }
  }

  /**
   * Initialize IndexedDB for large data storage
   */
  async initializeIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('SabeRL_RL_Data', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create object stores
        if (!db.objectStoreNames.contains('models')) {
          db.createObjectStore('models', { keyPath: 'id' });
        }
        
        if (!db.objectStoreNames.contains('experiences')) {
          db.createObjectStore('experiences', { keyPath: 'id', autoIncrement: true });
        }
        
        if (!db.objectStoreNames.contains('metrics')) {
          db.createObjectStore('metrics', { keyPath: 'id' });
        }
      };
    });
  }

  /**
   * Save a neural network model
   * Only keeps the current/latest model - overwrites previous saves
   * @param {Object} model - Neural network model
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<string>} Model ID
   */
  async saveModel(model, metadata = {}) {
    try {
      // Use fixed key for current model - overwrites previous save
      const FIXED_MODEL_KEY = `${this.storagePrefix}current_model`;
      
      // Delete old model data before saving new one (free up space)
      const oldModelData = localStorage.getItem(FIXED_MODEL_KEY);
      if (oldModelData) {
        // Try to parse old model to get its ID for cleanup
        try {
          const oldData = JSON.parse(oldModelData);
          if (oldData.id) {
            // Remove from IndexedDB if it exists
            await this.deleteFromIndexedDB('models', oldData.id);
          }
        } catch (e) {
          // Ignore parse errors for old data
        }
      }
      
      // Delete all old model entries from localStorage
      this.cleanupOldModels();
      
      const modelId = model.id || this.generateModelId();
      const serializedModel = model.serialize();
      
      const modelData = {
        id: modelId,
        model: serializedModel,
        metadata: {
          ...metadata,
          savedAt: new Date().toISOString(),
          version: '1.0.0'
        }
      };
      
      // Save to localStorage with fixed key (overwrites previous)
      localStorage.setItem(FIXED_MODEL_KEY, JSON.stringify(modelData));
      
      // Save to IndexedDB for backup (also overwrites with fixed ID)
      const indexedDBData = {
        id: 'current_model', // Fixed ID for IndexedDB too
        ...modelData
      };
      await this.saveToIndexedDB('models', indexedDBData);
      
      console.log(`Model saved successfully: ${modelId}`);
      return modelId;
    } catch (error) {
      console.error('Failed to save model:', error);
      throw error;
    }
  }

  /**
   * Clean up old model entries from localStorage
   * Removes all model entries except the current one
   */
  cleanupOldModels() {
    try {
      const FIXED_MODEL_KEY = `${this.storagePrefix}current_model`;
      const keysToRemove = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.storagePrefix) && key.includes('model_') && key !== FIXED_MODEL_KEY) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
        console.log(`Removed old model: ${key}`);
      });
      
      // Also clear the model list
      const modelListKey = `${this.storagePrefix}model_list`;
      localStorage.removeItem(modelListKey);
      
    } catch (error) {
      console.error('Failed to cleanup old models:', error);
    }
  }

  /**
   * Load a neural network model
   * @param {string} modelId - Model ID (optional, defaults to current model)
   * @returns {Promise<Object>} Loaded model
   */
  async loadModel(modelId = null) {
    try {
      // If no modelId provided, load the current model
      const storageKey = modelId 
        ? `${this.storagePrefix}model_${modelId}`
        : `${this.storagePrefix}current_model`;
      
      const storedData = localStorage.getItem(storageKey);
      
      if (storedData) {
        const modelData = JSON.parse(storedData);
        return this.deserializeModel(modelData.model);
      }
      
      // Fallback to IndexedDB (try current_model first, then provided ID)
      const dbId = modelId || 'current_model';
      const modelData = await this.loadFromIndexedDB('models', dbId);
      if (modelData) {
        return this.deserializeModel(modelData.model);
      }
      
      throw new Error(`Model not found: ${modelId || 'current_model'}`);
    } catch (error) {
      console.error('Failed to load model:', error);
      throw error;
    }
  }

  /**
   * List all saved models
   * @returns {Promise<Array>} List of model information
   */
  async listModels() {
    try {
      const models = [];
      const modelListKey = `${this.storagePrefix}model_list`;
      const modelList = localStorage.getItem(modelListKey);
      
      if (modelList) {
        const list = JSON.parse(modelList);
        for (const modelId of list) {
          const storageKey = `${this.storagePrefix}model_${modelId}`;
          const storedData = localStorage.getItem(storageKey);
          
          if (storedData) {
            const modelData = JSON.parse(storedData);
            models.push({
              id: modelId,
              metadata: modelData.metadata,
              size: storedData.length
            });
          }
        }
      }
      
      return models.sort((a, b) => new Date(b.metadata.savedAt) - new Date(a.metadata.savedAt));
    } catch (error) {
      console.error('Failed to list models:', error);
      return [];
    }
  }

  /**
   * Delete a model
   * @param {string} modelId - Model ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteModel(modelId) {
    try {
      // Remove from localStorage
      const storageKey = `${this.storagePrefix}model_${modelId}`;
      localStorage.removeItem(storageKey);
      
      // Remove from IndexedDB
      await this.deleteFromIndexedDB('models', modelId);
      
      // Update model list
      await this.removeFromModelList(modelId);
      
      console.log(`Model deleted: ${modelId}`);
      return true;
    } catch (error) {
      console.error('Failed to delete model:', error);
      return false;
    }
  }

  /**
   * Save training session data
   * @param {Object} sessionData - Training session data
   * @returns {Promise<string>} Session ID
   */
  async saveTrainingSession(sessionData) {
    try {
      const sessionId = sessionData.id || this.generateSessionId();
      const data = {
        ...sessionData,
        id: sessionId,
        savedAt: new Date().toISOString()
      };
      
      // Save to IndexedDB
      await this.saveToIndexedDB('sessions', data);
      
      console.log(`Training session saved: ${sessionId}`);
      return sessionId;
    } catch (error) {
      console.error('Failed to save training session:', error);
      throw error;
    }
  }

  /**
   * Load training session data
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Session data
   */
  async loadTrainingSession(sessionId) {
    try {
      const sessionData = await this.loadFromIndexedDB('sessions', sessionId);
      if (!sessionData) {
        throw new Error(`Session not found: ${sessionId}`);
      }
      
      return sessionData;
    } catch (error) {
      console.error('Failed to load training session:', error);
      throw error;
    }
  }

  /**
   * Save experience data
   * @param {Array} experiences - Experience data
   * @returns {Promise<string>} Experience ID
   */
  async saveExperiences(experiences) {
    try {
      const experienceId = this.generateExperienceId();
      const data = {
        id: experienceId,
        experiences: experiences,
        savedAt: new Date().toISOString(),
        count: experiences.length
      };
      
      // Save to IndexedDB
      await this.saveToIndexedDB('experiences', data);
      
      console.log(`Experiences saved: ${experienceId} (${experiences.length} items)`);
      return experienceId;
    } catch (error) {
      console.error('Failed to save experiences:', error);
      throw error;
    }
  }

  /**
   * Load experience data
   * @param {string} experienceId - Experience ID
   * @returns {Promise<Array>} Experience data
   */
  async loadExperiences(experienceId) {
    try {
      const data = await this.loadFromIndexedDB('experiences', experienceId);
      if (!data) {
        throw new Error(`Experiences not found: ${experienceId}`);
      }
      
      return data.experiences;
    } catch (error) {
      console.error('Failed to load experiences:', error);
      throw error;
    }
  }

  /**
   * Get storage usage statistics
   * @returns {Object} Storage statistics
   */
  getStorageStats() {
    try {
      let totalSize = 0;
      let modelCount = 0;
      
      // Calculate localStorage usage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.storagePrefix)) {
          const value = localStorage.getItem(key);
          totalSize += value.length;
          if (key.includes('model_')) {
            modelCount++;
          }
        }
      }
      
      return {
        totalSize: totalSize,
        modelCount: modelCount,
        localStorageUsage: totalSize,
        maxStorage: 5 * 1024 * 1024, // 5MB typical limit
        usagePercentage: (totalSize / (5 * 1024 * 1024)) * 100
      };
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      return { totalSize: 0, modelCount: 0, localStorageUsage: 0, maxStorage: 0, usagePercentage: 0 };
    }
  }

  /**
   * Clear all stored data
   * @returns {Promise<boolean>} Success status
   */
  async clearAllData() {
    try {
      // Clear localStorage
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.storagePrefix)) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // Clear IndexedDB
      if (this.db) {
        const transaction = this.db.transaction(['models', 'experiences', 'metrics', 'sessions'], 'readwrite');
        const stores = ['models', 'experiences', 'metrics', 'sessions'];
        
        for (const storeName of stores) {
          const store = transaction.objectStore(storeName);
          await new Promise((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          });
        }
      }
      
      console.log('All data cleared successfully');
      return true;
    } catch (error) {
      console.error('Failed to clear data:', error);
      return false;
    }
  }

  /**
   * Deserialize model from stored data
   * @param {Object} modelData - Serialized model data
   * @returns {Object} Deserialized model
   */
  deserializeModel(modelData) {
    // This would depend on the specific model implementation
    // For now, return the data as-is
    return modelData;
  }

  /**
   * Save data to IndexedDB
   * @param {string} storeName - Store name
   * @param {Object} data - Data to save
   * @returns {Promise<void>}
   */
  async saveToIndexedDB(storeName, data) {
    if (!this.db) return;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Load data from IndexedDB
   * @param {string} storeName - Store name
   * @param {string} key - Data key
   * @returns {Promise<Object>} Loaded data
   */
  async loadFromIndexedDB(storeName, key) {
    if (!this.db) return null;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete data from IndexedDB
   * @param {string} storeName - Store name
   * @param {string} key - Data key
   * @returns {Promise<void>}
   */
  async deleteFromIndexedDB(storeName, key) {
    if (!this.db) return;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Update model list
   * @param {string} modelId - Model ID
   * @param {Object} modelData - Model data
   * @returns {Promise<void>}
   */
  async updateModelList(modelId, modelData) {
    const modelListKey = `${this.storagePrefix}model_list`;
    let modelList = [];
    
    const stored = localStorage.getItem(modelListKey);
    if (stored) {
      modelList = JSON.parse(stored);
    }
    
    if (!modelList.includes(modelId)) {
      modelList.push(modelId);
      
      // Keep only the most recent models
      if (modelList.length > this.maxModels) {
        modelList = modelList.slice(-this.maxModels);
      }
      
      localStorage.setItem(modelListKey, JSON.stringify(modelList));
    }
  }

  /**
   * Remove from model list
   * @param {string} modelId - Model ID
   * @returns {Promise<void>}
   */
  async removeFromModelList(modelId) {
    const modelListKey = `${this.storagePrefix}model_list`;
    const stored = localStorage.getItem(modelListKey);
    
    if (stored) {
      const modelList = JSON.parse(stored);
      const filteredList = modelList.filter(id => id !== modelId);
      localStorage.setItem(modelListKey, JSON.stringify(filteredList));
    }
  }

  /**
   * Generate unique model ID
   * @returns {string} Model ID
   */
  generateModelId() {
    return `model_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique session ID
   * @returns {string} Session ID
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique experience ID
   * @returns {string} Experience ID
   */
  generateExperienceId() {
    return `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
