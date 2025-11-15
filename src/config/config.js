/**
 * Game Configuration
 * All game parameters are centralized here for easy tuning
 */

/**
 * Validate configuration values
 * @param {Object} config - Configuration object to validate
 * @returns {Object} Validation result
 */
export function validateConfig(config = GameConfig) {
  const errors = [];
  const warnings = [];

  // Validate arena configuration
  if (config.arena.playerRadius <= 0) {
    errors.push('Player radius must be positive');
  }
  if (config.arena.saberLength <= 0) {
    errors.push('Saber length must be positive');
  }

  // Validate game configuration
  if (config.game.playerSpeed <= 0) {
    errors.push('Player speed must be positive');
  }
  if (config.game.aiSpeed <= 0) {
    errors.push('AI speed must be positive');
  }

  // Validate RL configuration
  if (config.rl.learningRate <= 0 || config.rl.learningRate > 1) {
    errors.push('Learning rate must be between 0 and 1');
  }
  if (config.rl.discountFactor < 0 || config.rl.discountFactor > 1) {
    errors.push('Discount factor must be between 0 and 1');
  }
  if (config.rl.parallelGames <= 0) {
    errors.push('Parallel games must be positive');
  }

  // Validate neural network architecture
  if (!Array.isArray(config.rl.hiddenLayers) || config.rl.hiddenLayers.length === 0) {
    errors.push('Hidden layers must be a non-empty array');
  }
  for (const layer of config.rl.hiddenLayers) {
    if (layer <= 0) {
      errors.push('Hidden layer size must be positive');
    }
  }

  // Validate reward structure
  if (config.rl.rewards.win <= 0) {
    warnings.push('Win reward should be positive');
  }
  if (config.rl.rewards.loss >= 0) {
    warnings.push('Loss reward should be negative');
  }
  if (config.rl.rewards.timePenalty > 0) {
    warnings.push('Time penalty should be negative');
  }

  // Validate performance settings
  if (config.rl.maxMemoryUsage <= 0) {
    errors.push('Max memory usage must be positive');
  }
  if (config.rl.autoSaveInterval <= 0) {
    errors.push('Auto-save interval must be positive');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Apply default values to configuration
 * @param {Object} config - Configuration object
 * @returns {Object} Configuration with defaults applied
 */
export function applyDefaults(config) {
  const defaults = {
    arena: {
      width: 16,
      height: 16,
      playerRadius: 1,
      saberLength: 2,
      saberRotationSpeed: 2 * Math.PI
    },
    game: {
      playerSpeed: 5,
      aiSpeed: 5,
      aiDirectionChangeInterval: { min: 0.5, max: 2.0 }
    },
    rl: {
      hiddenLayers: [128, 64, 32],
      learningRate: 0.001,
      explorationRate: 0.1,
      discountFactor: 0.99,
      parallelGames: 10,
      algorithm: 'PPO',
      maxMemoryUsage: 2 * 1024 * 1024 * 1024,
      autoSaveInterval: 50,
      performanceMonitoring: true,
      rewards: {
        win: 1.0,
        loss: -1.0,
        timePenalty: -0.01,
        maxGameLength: 60
      }
    }
  };

  return mergeDeep(defaults, config);
}

/**
 * Deep merge objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged object
 */
function mergeDeep(target, source) {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = mergeDeep(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  
  return result;
}

export const GameConfig = {
  // Arena settings
  arena: {
    width: 12,        // Arena width in units
    height: 12,       // Arena height in units
    backgroundColor: '#1a1a1a',
    borderColor: '#ffffff',
    borderWidth: 2
  },

  // Player settings
  player: {
    radius: 0.5,      // Player collision radius in units
    movementSpeed: 5, // Movement speed in units per second
    color: '#4a9eff'  // Blue color for human player
  },

  // AI settings
  ai: {
    radius: 0.5,      // AI collision radius in units
    movementSpeed: 5, // Same speed as player
    color: '#ff4a4a', // Red color for AI
    directionChangeMin: 0.5, // Min time between direction changes (seconds)
    directionChangeMax: 2.0  // Max time between direction changes (seconds)
  },

  // Saber settings
  saber: {
    length: 2,        // Saber length in units
    rotationSpeed: 2 * Math.PI, // 1 full rotation per second (radians per second)
    color: '#ffff00', // Yellow color for sabers
    width: 3          // Saber line width in pixels
  },

  // Rendering settings
  rendering: {
    targetFPS: 60,    // Target frame rate
    canvasWidth: 800, // Canvas width in pixels
    canvasHeight: 600, // Canvas height in pixels
    backgroundColor: '#1a1a1a',
    showFPS: true,    // Show FPS counter
    showDebugInfo: false // Show debug information
  },

  // Input settings
  input: {
    keyMappings: {
      up: 'KeyW',     // W key
      left: 'KeyA',   // A key
      down: 'KeyS',   // S key
      right: 'KeyD',  // D key
      start: 'Space'  // Space key to start game
    },
    continuousMovement: true, // Allow continuous movement while keys held
    ignoreRapidPresses: true  // Ignore rapid key press spam
  },

  // Game settings
  game: {
    states: {
      WAITING: 'waiting',
      PLAYING: 'playing',
      PAUSED: 'paused',
      GAME_OVER: 'gameOver',
      TIE: 'tie'
    },
    spawnMinDistance: 3 // Minimum distance between spawned entities (units)
  },

  // Performance settings
  performance: {
    collisionAccuracy: 0.95  // Target collision detection accuracy (95%)
  },

  // Browser compatibility
  compatibility: {
    requiredFeatures: ['Canvas', 'requestAnimationFrame', 'addEventListener']
  },

  // RL Training settings
  rl: {
    // Neural network architecture
    hiddenLayers: [64, 64],
    
    // Training parameters
    learningRate: 0.001,
    miniBatchSize: 64, // Mini-batch size for gradient updates
    epochs: 4, // Number of epochs to train for
    discountFactor: 0.99,
    
    // PPO-specific hyperparameters
    clipRatio: 0.2,           // PPO clipping ratio (typically 0.1-0.3)
    valueLossCoeff: 0.5,       // Value function loss coefficient (typically 0.5)
    entropyCoeff: 0.01,         // Entropy bonus coefficient (typically 0.01-0.05, encourages exploration)
    maxGradNorm: 0.5,          // Gradient clipping norm (typically 0.5)
    gaeLambda: 0.95,           // GAE lambda parameter (typically 0.9-0.99)
    
    // Game settings
    parallelGames: 1,   // number of parallel training games
    
    // Training algorithms
    algorithm: 'PPO', // Only PPO is supported
    
    // Performance settings
    autoSaveInterval: 50, // Auto-save every N games
    maxGames: 10000, // Maximum number of games to train for
    
    // UI settings
    chartMaxDataPoints: 500,    // Keep only last N data points on charts
    
    // Reward structure
    rewards: {
      win: 1.0,
      loss: -1.0,
      tie: 0.0,
      timePenalty: -0.05, // Per second penalty
      // timePenalty: 0.0, // Per second penalty
      timePenaltyThreshold: 0, // Start applying time penalty after this many seconds
      maxGameLength: 60,   // Max game length in seconds
      // distancePenaltyFactor: -1.0 // Per second penalty proportional to distance (distance * factor)
      distancePenaltyFactor: 0.0, // Per second penalty proportional to distance (distance * factor)
      deltaDistanceRewardFactor: 0.1 // Per second reward for getting closer (deltaDistance * factor * deltaTime)
    },

    // Rollout configuration
    rollout: {
      rolloutMaxLength: 4096,      // Number of experiences to collect in each rollout
      deltaTime: 0.05,             // Fixed timestep for game updates
      actionIntervalSeconds: 0.2,   // Time between agent actions
      yieldInterval: 10            // Yield to event loop every N experiences (for UI responsiveness)
    },

    // Behavior Cloning configuration
    behaviorCloning: {
      enabled: true,                // Enable behavior cloning functionality
      demonstrationStorageKey: 'mimicrl_demonstrations', // Storage key for demonstrations (localStorage)
      learningRate: 0.001,          // Learning rate for BC optimizer
      batchSize: 32,                // Batch size for training
      epochs: 5,                   // Number of epochs to train
      lossType: 'mixed',            // Loss function type: 'mse', 'crossentropy', or 'mixed'
      weightDecay: 0.0001,          // L2 regularization weight decay
      validationSplit: 0.2          // Fraction of data to use for validation (0-1)
    }
  }
};


/**
 * Get configuration with fallback values
 * @param {string} path - Dot notation path to config value
 * @param {*} fallback - Fallback value if path not found
 * @returns {*} Configuration value or fallback
 */
export function getConfig(path, fallback = null) {
  const keys = path.split('.');
  let value = GameConfig;
  
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return fallback;
    }
  }
  
  return value;
}

// Validate configuration on load
if (!validateConfig()) {
  console.warn('Game configuration validation failed, using default values');
}
