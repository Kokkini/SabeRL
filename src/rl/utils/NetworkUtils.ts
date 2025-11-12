/**
 * NetworkUtils - Utility functions for network serialization/deserialization
 * Game-agnostic utilities for saving and loading TensorFlow.js models
 */

// TensorFlow.js is loaded from CDN as a global 'tf' object
declare const tf: any;

export interface NetworkArchitecture {
  inputSize: number;
  hiddenLayers: number[];
  outputSize: number;
  activation: string;
}

export interface SerializedWeight {
  data: number[];
  shape: number[];
  dtype: string;
}

export interface SerializedNetworkData {
  architecture: NetworkArchitecture;
  weights: SerializedWeight[];
}

export class NetworkUtils {
  /**
   * Load a tf.LayersModel from serialized weights
   * @param {SerializedNetworkData} serializedData - Serialized network data
   * @returns {any} Loaded model with weights restored (tf.LayersModel)
   */
  static loadNetworkFromSerialized(serializedData: SerializedNetworkData): any {
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
      const weightTensors = weights.map((w: SerializedWeight) => 
        tf.tensor(w.data, w.shape, w.dtype)
      );
      model.setWeights(weightTensors);
    }
    
    return model;
  }
  
  /**
   * Serialize a tf.LayersModel to a storable format
   * @param {any} model - Model to serialize (tf.LayersModel)
   * @param {NetworkArchitecture} architecture - Architecture config
   * @returns {SerializedNetworkData} Serialized model data
   */
  static serializeNetwork(model: any, architecture: NetworkArchitecture): SerializedNetworkData {
    const weights = model.getWeights();
    const serializedWeights: SerializedWeight[] = weights.map((w: any) => ({
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

