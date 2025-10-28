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
  if (config.rl.explorationRate < 0 || config.rl.explorationRate > 1) {
    errors.push('Exploration rate must be between 0 and 1');
  }
  if (config.rl.batchSize <= 0) {
    errors.push('Batch size must be positive');
  }
  if (config.rl.discountFactor < 0 || config.rl.discountFactor > 1) {
    errors.push('Discount factor must be between 0 and 1');
  }
  if (config.rl.decisionInterval <= 0) {
    errors.push('Decision interval must be positive');
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
      batchSize: 32,
      discountFactor: 0.99,
      decisionInterval: 4,
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
    width: 16,        // Arena width in units
    height: 16,       // Arena height in units
    backgroundColor: '#1a1a1a',
    borderColor: '#ffffff',
    borderWidth: 2
  },

  // Player settings
  player: {
    radius: 0.5,      // Player collision radius in units
    movementSpeed: 5, // Movement speed in units per second
    color: '#4a9eff', // Blue color for human player
    initialPosition: { x: 5, y: 10 } // Starting position
  },

  // AI settings
  ai: {
    radius: 0.5,      // AI collision radius in units
    movementSpeed: 5, // Same speed as player
    color: '#ff4a4a', // Red color for AI
    initialPosition: { x: 15, y: 10 }, // Starting position
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
    tieGameHandling: 'restart' // How to handle tie games: 'restart', 'continue', 'random'
  },

  // Performance settings
  performance: {
    maxMemoryUsage: 2 * 1024 * 1024 * 1024, // 2GB in bytes
    frameTimeBudget: 16.67, // 16.67ms for 60 FPS
    inputLagThreshold: 16,   // Max input lag in milliseconds
    collisionAccuracy: 0.95  // Target collision detection accuracy (95%)
  },

  // Browser compatibility
  compatibility: {
    minChromeVersion: 57,
    minFirefoxVersion: 52,
    minSafariVersion: 11,
    requiredFeatures: ['Canvas', 'requestAnimationFrame', 'addEventListener']
  },

  // RL Training settings
  rl: {
    // Neural network architecture
    hiddenLayers: [128, 64, 32],
    
    // Training parameters
    learningRate: 0.001,
    explorationRate: 0.3, // Higher exploration for untrained network
    batchSize: 32,
    rewardScaling: 1.0,
    discountFactor: 0.99,
    trainingFrequency: 10, // Train every N games
    
    // Game settings
    decisionInterval: 4, // frames between AI decisions
    parallelGames: 10,   // number of parallel training games
    
    // Training algorithms
    algorithm: 'PPO', // 'PPO' or 'A2C'
    
    // Performance settings
    maxMemoryUsage: 2 * 1024 * 1024 * 1024, // 2GB
    autoSaveInterval: 50, // Auto-save every N games
    performanceMonitoring: true,
    
    // Reward structure
    rewards: {
      win: 1.0,
      loss: -1.0,
      timePenalty: -0.01, // Per second penalty
      maxGameLength: 60   // Max game length in seconds
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
