# Data Model: Base Game Arena

**Feature**: Base Game Arena  
**Date**: 2025-01-27  
**Status**: Complete

## Entities

### Player
Represents the human-controlled game character.

**Attributes**:
- `id`: string - Unique identifier
- `position`: Vector2 - Current position in game coordinates (x, y)
- `velocity`: Vector2 - Current movement velocity
- `radius`: number - Collision radius (0.5 units)
- `saber`: Saber - Attached rotating weapon
- `isAlive`: boolean - Game state (true/false)
- `inputState`: object - Current key states (W, A, S, D)

**Relationships**:
- Has one Saber
- Belongs to one Game

**State Transitions**:
- `spawning` → `alive` (game start)
- `alive` → `dead` (saber contact with opponent)
- `dead` → `spawning` (game restart)

### AI
Represents the computer-controlled opponent.

**Attributes**:
- `id`: string - Unique identifier
- `position`: Vector2 - Current position in game coordinates (x, y)
- `velocity`: Vector2 - Current movement velocity
- `radius`: number - Collision radius (0.5 units)
- `saber`: Saber - Attached rotating weapon
- `isAlive`: boolean - Game state (true/false)
- `direction`: Vector2 - Current movement direction
- `lastDirectionChange`: number - Timestamp of last direction change
- `directionChangeInterval`: number - Random interval for direction changes

**Relationships**:
- Has one Saber
- Belongs to one Game

**State Transitions**:
- `spawning` → `alive` (game start)
- `alive` → `dead` (saber contact with opponent)
- `dead` → `spawning` (game restart)

### Saber
Represents the rotating weapon attached to each player.

**Attributes**:
- `id`: string - Unique identifier
- `length`: number - Saber length in units (2 units)
- `angle`: number - Current rotation angle in radians
- `rotationSpeed`: number - Rotation speed in radians per second (2π rad/s)
- `owner`: string - ID of player who owns this saber
- `isActive`: boolean - Whether saber can cause damage

**Relationships**:
- Belongs to one Player or AI
- Belongs to one Game

**State Transitions**:
- `inactive` → `active` (game start)
- `active` → `inactive` (game end)

### Arena
Represents the playable game area.

**Attributes**:
- `id`: string - Unique identifier
- `width`: number - Arena width in units (20)
- `height`: number - Arena height in units (20)
- `bounds`: object - Boundary coordinates (minX, maxX, minY, maxY)

**Relationships**:
- Contains multiple Players
- Belongs to one Game

### Game
Represents the overall game state and session.

**Attributes**:
- `id`: string - Unique identifier
- `state`: string - Current game state (waiting, playing, paused, gameOver, tie)
- `winner`: string - ID of winning player (null for tie)
- `startTime`: number - Game start timestamp
- `endTime`: number - Game end timestamp
- `players`: array - Array of player IDs
- `arena`: Arena - Game arena instance
- `config`: object - Game configuration parameters

**Relationships**:
- Contains one Arena
- Contains multiple Players
- Contains multiple Sabers

**State Transitions**:
- `waiting` → `playing` (game start)
- `playing` → `gameOver` (winner determined)
- `playing` → `tie` (simultaneous contact)
- `gameOver` → `waiting` (game restart)
- `tie` → `waiting` (game restart)

## Value Objects

### Vector2
Represents 2D coordinates and vectors.

**Attributes**:
- `x`: number - X coordinate
- `y`: number - Y coordinate

**Methods**:
- `add(vector)`: Vector2 - Vector addition
- `subtract(vector)`: Vector2 - Vector subtraction
- `multiply(scalar)`: Vector2 - Scalar multiplication
- `magnitude()`: number - Vector length
- `normalize()`: Vector2 - Unit vector
- `distanceTo(vector)`: number - Distance to another vector

### GameConfig
Represents game configuration parameters.

**Attributes**:
- `arenaWidth`: number - Arena width (20)
- `arenaHeight`: number - Arena height (20)
- `playerRadius`: number - Player collision radius (0.5)
- `saberLength`: number - Saber length (2)
- `saberRotationSpeed`: number - Rotation speed in rad/s (2π)
- `playerMovementSpeed`: number - Movement speed in units/s (5)
- `aiDirectionChangeMin`: number - Min AI direction change interval (0.5s)
- `aiDirectionChangeMax`: number - Max AI direction change interval (2s)
- `targetFPS`: number - Target frame rate (60)

## Validation Rules

### Player/AI Validation
- Position must be within arena bounds
- Velocity magnitude must not exceed movement speed
- Radius must be positive
- Input state must contain valid key mappings

### Saber Validation
- Length must be positive
- Rotation speed must be positive
- Angle must be between 0 and 2π
- Owner must reference valid player

### Arena Validation
- Width and height must be positive
- Bounds must be calculated correctly
- Arena must be large enough for players

### Game Validation
- State must be valid enum value
- Winner must reference valid player or be null
- Start time must be before end time
- Players array must contain valid player IDs

## Data Flow

### Game Initialization
1. Create Arena with configured dimensions
2. Create Player and AI entities
3. Create Sabers for each player
4. Initialize Game state as 'waiting'
5. Load configuration from config.js

### Game Loop
1. Process input events
2. Update player positions based on input
3. Update AI movement and direction
4. Update saber rotations
5. Check for collisions
6. Render all entities
7. Repeat at target FPS

### Collision Detection
1. Check saber-to-player collisions
2. Check player-to-boundary collisions
3. Determine game outcome
4. Update game state accordingly

### Game End
1. Determine winner or tie
2. Update game state
3. Display results
4. Prepare for restart
