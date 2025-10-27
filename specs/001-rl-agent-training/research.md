# Research Findings: RL Agent Training

**Feature**: RL Agent Training  
**Date**: 2025-01-27  
**Purpose**: Research technical approaches and best practices for browser-based reinforcement learning

## TensorFlow.js Core for Neural Networks

**Decision**: Use TensorFlow.js Core (@tensorflow/tfjs-core) for neural network implementation

**Rationale**: 
- Native browser support with WebAssembly acceleration
- Comprehensive neural network API (layers, models, training)
- Policy gradient methods (PPO/A2C) can be implemented using core operations
- Memory-efficient tensor operations with automatic disposal
- No external dependencies beyond CDN

**Alternatives considered**:
- Brain.js: Limited to basic neural networks, no RL-specific features
- ML5.js: Higher-level but less control over training algorithms
- Custom implementation: Too complex for browser environment

## Policy Gradient Methods (PPO/A2C)

**Decision**: Implement both PPO and A2C algorithms with configurable selection

**Rationale**:
- PPO: More stable training, better sample efficiency, good for continuous control
- A2C: Simpler implementation, faster training, good baseline
- Both work well with discrete action spaces (WASD movement)
- Can be implemented using TensorFlow.js operations

**Alternatives considered**:
- Q-Learning: Requires discrete state space, less suitable for continuous game state
- DQN: Overkill for simple 2D game, more complex implementation
- Random policy: No learning capability

## Browser-Based Training Architecture

**Decision**: Use Web Workers for parallel training games with main thread for UI

**Rationale**:
- Web Workers prevent UI blocking during intensive training
- Parallel games can run in separate workers
- Main thread handles rendering and user interaction
- localStorage accessible from both main thread and workers

**Alternatives considered**:
- Single-threaded: Would block UI during training
- Service Workers: Not suitable for game logic, designed for caching
- SharedArrayBuffer: Limited browser support, security concerns

## Experience Storage and Replay

**Decision**: Use IndexedDB for large experience buffers, localStorage for model weights

**Rationale**:
- IndexedDB: Better for large datasets (experience buffers)
- localStorage: Simpler for small data (model weights, config)
- Both persist across browser sessions
- No external storage dependencies

**Alternatives considered**:
- Memory only: Lost on page refresh
- WebSQL: Deprecated, limited support
- External storage: Violates data sovereignty principle

## Reward Function Design

**Decision**: Win/loss + time-based penalties with configurable scaling

**Rationale**:
- Clear learning signal from win/loss
- Time penalty encourages efficient gameplay
- Configurable scaling allows tuning
- Simple to implement and understand

**Alternatives considered**:
- Complex reward shaping: Harder to tune, may lead to reward hacking
- Sparse rewards only: Slower learning
- Human demonstration: Requires additional data collection

## Neural Network Architecture

**Decision**: 4-layer feedforward network (Input → 128 → 64 → 32 → 4) with ReLU activations

**Rationale**:
- Sufficient capacity for 2D game state (6 inputs)
- Not too large for browser performance
- ReLU: Standard activation, good for policy networks
- Configurable hidden layers for experimentation

**Alternatives considered**:
- Deeper networks: Overkill for simple game, slower training
- Recurrent networks: Unnecessary for stateless game
- Convolutional networks: No spatial structure in input

## Training Visualization

**Decision**: Use Chart.js for real-time line graphs with rolling window

**Rationale**:
- Lightweight, no external dependencies
- Good performance for real-time updates
- Easy to implement rolling window (last 100 games)
- Responsive design support

**Alternatives considered**:
- D3.js: More powerful but heavier
- Canvas API: More work, less features
- SVG: Manual implementation required

## Performance Optimization

**Decision**: Implement progressive training with automatic quality degradation

**Rationale**:
- Maintains 60 FPS during training
- Reduces parallel games if performance drops
- Graceful degradation preserves functionality
- User can adjust settings if needed

**Alternatives considered**:
- Fixed performance: May cause UI blocking
- No optimization: Poor user experience
- External processing: Violates browser-first principle
