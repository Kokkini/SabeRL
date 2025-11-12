/**
 * NetworkUtils - Utility functions for network serialization/deserialization
 * Game-agnostic utilities for saving and loading TensorFlow.js models
 * JavaScript version (TypeScript version also exists)
 */

// TensorFlow.js is loaded from CDN as a global 'tf' object

export class NetworkUtils {
  /**
   * Load a tf.LayersModel from serialized weights
   * @param {Object} serializedData - Serialized network data
   * @param {Object} serializedData.architecture - Network architecture config
   *   - inputSize: number - Input layer size
   *   - hiddenLayers: number[] - Hidden layer sizes
   *   - outputSize: number - Output layer size
   *   - activation: string - Activation function for hidden layers
   * @param {Array} serializedData.weights - Serialized weights array
   *   Each element: { data: number[], shape: number[], dtype: string }
   * @returns {tf.LayersModel} Loaded model with weights restored
   */
  static loadNetworkFromSerialized(serializedData) {
    const { architecture, weights } = serializedData;
    
    // Create model with same architecture
    const model = tf.sequential();
    
    // Input layer (first hidden layer with input shape)
    model.add(tf.layers.dense({
      units: architecture.hiddenLayers[0],
      inputShape: [architecture.inputSize],
      activation: architecture.activation,
      name: 'input_layer'
    }));
    
    // Additional hidden layers
    for (let i = 1; i < architecture.hiddenLayers.length; i++) {
      model.add(tf.layers.dense({
        units: architecture.hiddenLayers[i],
        activation: architecture.activation,
        name: `hidden_layer_${i}`
      }));
    }
    
    // Output layer (linear activation)
    model.add(tf.layers.dense({
      units: architecture.outputSize,
      activation: 'linear',
      name: 'output_layer'
    }));
    
    // Load weights if provided
    if (weights && weights.length > 0) {
      // Convert serialized weights back to tensors
      const weightTensors = weights.map(w => 
        tf.tensor(w.data, w.shape, w.dtype)
      );
      model.setWeights(weightTensors);
    }
    
    return model;
  }
  
  /**
   * Serialize a tf.LayersModel to a storable format
   * @param {tf.LayersModel} model - Model to serialize
   * @param {Object} architecture - Architecture config (inputSize, hiddenLayers, outputSize, activation)
   * @returns {Object} Serialized model data
   */
  static serializeNetwork(model, architecture) {
    const weights = model.getWeights();
    const serializedWeights = weights.map(w => ({
      data: Array.from(w.dataSync()),
      shape: w.shape,
      dtype: w.dtype
    }));
    
    return {
      architecture,
      weights: serializedWeights
    };
  }
}

