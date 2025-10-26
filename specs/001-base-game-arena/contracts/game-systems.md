# Game Systems Contracts: Base Game Arena

**Feature**: Base Game Arena  
**Date**: 2025-01-27  
**Status**: Complete

## System Interfaces

### InputSystem
Handles user input and key state management.

**Interface**:
```javascript
class InputSystem {
  constructor(canvas)
  onKeyDown(keyCode) -> void
  onKeyUp(keyCode) -> void
  isKeyPressed(keyCode) -> boolean
  getMovementVector() -> Vector2
  update() -> void
}
```

**Key Mappings**:
- W (87): Move up
- A (65): Move left  
- S (83): Move down
- D (68): Move right

**Behavior**:
- Continuous movement while keys held
- Ignore rapid key press spam
- Return normalized movement vector
- Update key states each frame

### MovementSystem
Handles entity movement and boundary constraints.

**Interface**:
```javascript
class MovementSystem {
  constructor(arena)
  updatePlayer(player, inputVector, deltaTime) -> void
  updateAI(ai, deltaTime) -> void
  constrainToBounds(entity) -> void
  isValidPosition(position) -> boolean
}
```

**Behavior**:
- Apply movement speed from config
- Constrain movement to arena bounds
- Handle continuous movement input
- Update AI random direction changes

### CollisionSystem
Handles collision detection and game state changes.

**Interface**:
```javascript
class CollisionSystem {
  constructor()
  checkSaberToPlayerCollision(saber, player) -> boolean
  checkSimultaneousCollision(player1, player2) -> boolean
  getCollisionPoint(saber, player) -> Vector2
  update(game, deltaTime) -> void
}
```

**Collision Detection**:
- Saber tip to player circle collision
- Simultaneous collision detection
- Return collision points for rendering
- Update game state on collisions

### RenderSystem
Handles all game rendering to Canvas.

**Interface**:
```javascript
class RenderSystem {
  constructor(canvas, context)
  clear() -> void
  renderArena(arena) -> void
  renderPlayer(player) -> void
  renderAI(ai) -> void
  renderSaber(saber, owner) -> void
  renderUI(game) -> void
  update(game, deltaTime) -> void
}
```

**Rendering**:
- Clear canvas each frame
- Render arena boundaries
- Render players as circles
- Render sabers as lines
- Render game UI (score, status)

## Game Loop Contract

### GameLoop
Main game loop managing all systems.

**Interface**:
```javascript
class GameLoop {
  constructor(game, systems)
  start() -> void
  stop() -> void
  update(deltaTime) -> void
  render() -> void
  isRunning() -> boolean
}
```

**Behavior**:
- Run at target FPS (60)
- Update all systems in order
- Render all entities
- Handle game state transitions
- Manage frame timing

## Entity Contracts

### Player Entity
```javascript
class Player {
  constructor(id, position)
  update(inputSystem, deltaTime) -> void
  getPosition() -> Vector2
  setPosition(position) -> void
  getSaber() -> Saber
  isAlive() -> boolean
  kill() -> void
}
```

### AI Entity
```javascript
class AI {
  constructor(id, position)
  update(deltaTime) -> void
  getPosition() -> Vector2
  setPosition(position) -> void
  getSaber() -> Saber
  isAlive() -> boolean
  kill() -> void
  changeDirection() -> void
}
```

### Saber Entity
```javascript
class Saber {
  constructor(id, owner, length)
  update(deltaTime) -> void
  getTipPosition(ownerPosition) -> Vector2
  getAngle() -> number
  setAngle(angle) -> void
  isActive() -> boolean
  setActive(active) -> void
}
```

## Configuration Contract

### GameConfig
```javascript
const GameConfig = {
  arena: {
    width: 20,
    height: 20
  },
  player: {
    radius: 0.5,
    movementSpeed: 5
  },
  saber: {
    length: 2,
    rotationSpeed: 2 * Math.PI // 1 rotation per second
  },
  ai: {
    directionChangeMin: 0.5,
    directionChangeMax: 2.0
  },
  rendering: {
    targetFPS: 60
  }
}
```

## Error Handling

### System Errors
- Invalid input parameters
- Canvas context not available
- Configuration loading failures
- Entity state inconsistencies

### Recovery Strategies
- Graceful degradation for missing features
- Fallback to default configurations
- Error logging to console
- Game state reset on critical errors

## Performance Contracts

### Frame Rate
- Target: 60 FPS
- Minimum: 30 FPS
- Frame time budget: 16.67ms

### Memory Usage
- Target: <100MB
- Maximum: <2GB
- No memory leaks in game loop

### Input Response
- Maximum input lag: 16ms
- Key press detection: <1ms
- Movement update: <1ms
