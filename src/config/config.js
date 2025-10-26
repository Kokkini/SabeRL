/**
 * Game Configuration
 * All game parameters are centralized here for easy tuning
 */

export const GameConfig = {
  // Arena settings
  arena: {
    width: 20,        // Arena width in units
    height: 20,       // Arena height in units
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
  }
};

/**
 * Validate configuration values
 * @returns {boolean} True if configuration is valid
 */
export function validateConfig() {
  const config = GameConfig;
  
  // Validate arena dimensions
  if (config.arena.width <= 0 || config.arena.height <= 0) {
    console.error('Invalid arena dimensions');
    return false;
  }
  
  // Validate player settings
  if (config.player.radius <= 0 || config.player.movementSpeed <= 0) {
    console.error('Invalid player settings');
    return false;
  }
  
  // Validate saber settings
  if (config.saber.length <= 0 || config.saber.rotationSpeed <= 0) {
    console.error('Invalid saber settings');
    return false;
  }
  
  // Validate AI settings
  if (config.ai.directionChangeMin >= config.ai.directionChangeMax) {
    console.error('Invalid AI direction change intervals');
    return false;
  }
  
  return true;
}

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
