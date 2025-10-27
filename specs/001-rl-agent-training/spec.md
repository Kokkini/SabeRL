# Feature Specification: RL Agent Training

**Feature Branch**: `001-rl-agent-training`  
**Created**: 2025-01-27  
**Status**: Draft  
**Input**: User description: "Reinforcement learning: Add an option to control the play character using a neural network. Also add the feature to train the neural network with reinforcement learning. While training, every time the game start, make a copy of the neural network being trained and let that copy play the game. When the game ends, automatically start a new one with a new copy of the network (so that the user can see the agent improving gradually)."

## Clarifications

### Session 2025-01-27

- Q: What type of neural network architecture and RL algorithm should be used? → A: Deep neural network with policy gradient methods (PPO, A2C)
- Q: How should training data and model checkpoints be stored and managed? → A: Browser localStorage only (no cloud backup)
- Q: How should users control training sessions (start, pause, stop)? → A: Add training controls to existing game UI (buttons, indicators)
- Q: How should the system handle performance issues during long training sessions? → A: Automatic performance monitoring with graceful degradation
- Q: How should the AI be rewarded/penalized during training? → A: Win/loss reward + time-based penalties (encourage quick wins)
- Q: What should be the specific neural network architecture (layers, nodes, activation functions)? → A: Default is 4-layer feedforward: Input → Hidden(128) → Hidden(64) → Hidden(32) → Output(4), ReLU activations, but make this configurable in config.js as: hiddenLayers = [128, 64, 32]
- Q: How should the system handle training interruptions and recovery? → A: Auto-save training progress every 50 games, resume from last checkpoint
- Q: What specific training metrics should be tracked and displayed? → A: Win rate, average game length, reward statistics (avg/min/max), training time
- Q: What other training parameters should be configurable in config.js? → A: Learning rate, exploration rate, training batch size, reward scaling, discount factor, and training frequency

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Neural Network Agent Control (Priority: P1)

As a user, I want to switch between human control and AI neural network control for the player character, so that I can observe how the AI agent performs in the game.

**Why this priority**: This is the core functionality that enables the RL training system. Without agent control, there's no foundation for training.

**Independent Test**: Can be fully tested by switching control modes and observing different movement patterns between human and AI control.

**Acceptance Scenarios**:

1. **Given** the game is running, **When** I toggle to AI control mode, **Then** the player character moves automatically based on neural network decisions
2. **Given** AI control is active, **When** I toggle back to human control, **Then** the player character responds to my WASD input again
3. **Given** AI control is active, **When** the game is running, **Then** the AI makes movement decisions at the configured frame interval

---

### User Story 2 - Reinforcement Learning Training Loop (Priority: P1)

As a user, I want to start a training session where the AI agent automatically plays multiple games and learns from experience, so that I can watch the agent improve over time.

**Why this priority**: This is the core value proposition - watching the AI learn and improve through repeated gameplay.

**Independent Test**: Can be fully tested by starting a training session and observing multiple games with automatic restarts and learning progression.

**Acceptance Scenarios**:

1. **Given** I'm in the main menu, **When** I start RL training mode, **Then** the game begins with AI control and automatically restarts after each game ends
2. **Given** training is active, **When** a game ends, **Then** a new game starts immediately with a copy of the neural network using the latest learned weights
3. **Given** training is active, **When** I want to stop training, **Then** I can pause or stop the training loop and return to normal gameplay

---

### User Story 3 - Agent Perception and Decision Making (Priority: P2)

As a user, I want the AI agent to make decisions based on game state information, so that it can learn effective strategies for winning.

**Why this priority**: This enables the AI to make informed decisions and learn meaningful strategies rather than random actions.

**Independent Test**: Can be fully tested by observing AI behavior and verifying it responds to different game situations appropriately.

**Acceptance Scenarios**:

1. **Given** the AI is controlling the player, **When** the opponent is nearby, **Then** the AI considers the opponent's position in its movement decisions
2. **Given** the AI is controlling the player, **When** its saber is at a specific angle, **Then** the AI considers saber positioning in its strategy
3. **Given** the AI is controlling the player, **When** the game state changes, **Then** the AI receives updated perception data at the configured frame interval

---

### User Story 4 - Training Progress Visualization (Priority: P3)

As a user, I want to see metrics and indicators of the AI's learning progress, so that I can understand how well the training is working.

**Why this priority**: This provides valuable feedback about training effectiveness but isn't essential for basic functionality.

**Independent Test**: Can be fully tested by running training sessions and observing the displayed metrics and progress indicators.

**Acceptance Scenarios**:

1. **Given** training is active, **When** I view the training interface, **Then** I can see current training metrics (win rate, average game length, etc.)
2. **Given** training has been running, **When** I check the progress, **Then** I can see how the AI's performance has changed over time
3. **Given** training is complete, **When** I review the results, **Then** I can see a summary of the training session and final performance

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a toggle between human control and AI neural network control for the player character
- **FR-002**: System MUST implement a deep neural network with policy gradient methods (PPO/A2C) that can process game state and output movement decisions. The default neural network is 4-layer feedforward: Input → Hidden(128) → Hidden(64) → Hidden(32) → Output(4), ReLU activations. But make this configurable in config.js as: hiddenLayers: [128, 64, 32]
- **FR-003**: System MUST execute AI decisions at configurable frame intervals (stored in config.js, default: 4 frames)
- **FR-004**: System MUST provide perception data to the AI including: player position, opponent position, player saber angle, player saber angular velocity, opponent saber angle, opponent saber angular velocity
- **FR-005**: System MUST implement a reinforcement learning training loop that automatically restarts games
- **FR-006**: System MUST create a copy of the neural network with the latest learned weights for each training game
- **FR-007**: System MUST automatically start a new game immediately after each game ends during training
- **FR-008**: System MUST provide training control buttons (start, pause, stop) in the existing game UI
- **FR-009**: System MUST provide visual indicators showing which control mode is active (human vs AI) and training status
- **FR-010**: System MUST handle the transition between training games without user intervention
- **FR-011**: System MUST maintain training progress and metrics during active training sessions
- **FR-012**: System MUST allow users to save and load trained neural network models using browser localStorage
- **FR-013**: System MUST provide training progress visualization showing win rate, average game length, reward statistics (avg/min/max), and training time
- **FR-014**: System MUST implement automatic performance monitoring and graceful degradation during long training sessions
- **FR-015**: System MUST implement reward structure with win/loss rewards and time-based penalties to encourage efficient gameplay
- **FR-016**: System MUST run multiple games in parallel during training (without rendering) to optimize training speed, with the number of parallel games configurable in config.js
- **FR-017**: System MUST provide a live line graph showing average, minimum, and maximum reward of the last 100 games to visualize training progress
- **FR-018**: System MUST auto-save training progress every 50 games and resume from last checkpoint after interruptions
- **FR-019**: System MUST make training parameters configurable in config.js: learning rate, exploration rate, training batch size, reward scaling, discount factor, and training frequency

### Key Entities *(include if feature involves data)*

- **Neural Network**: Represents the AI brain that processes game state and outputs movement decisions, contains weights and architecture
- **Training Session**: Represents an active learning period with metrics, game count, and performance tracking
- **Game State**: Represents the current perception data provided to the AI (positions, angles, velocities)
- **Movement Decision**: Represents the AI's chosen action (WASD key) for the next 4 frames
- **Training Metrics**: Represents performance data collected during training (win rate, average game length, learning progress)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can switch between human and AI control modes within 1 second
- **SC-002**: AI makes movement decisions consistently at the configured frame interval during gameplay
- **SC-003**: Training sessions can run continuously for at least 100 games without performance degradation
- **SC-004**: AI shows measurable improvement in win rate over the course of a training session (minimum 10% improvement over 50 games)
- **SC-005**: System automatically restarts games within 2 seconds of game completion during training
- **SC-006**: Users can start and stop training sessions with a single action
- **SC-007**: Training progress is visible and updates in real-time during active sessions
- **SC-008**: AI responds appropriately to different game situations (opponent proximity, saber positioning, etc.)