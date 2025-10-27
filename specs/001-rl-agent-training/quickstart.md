# Quickstart Guide: RL Agent Training

**Feature**: RL Agent Training  
**Date**: 2025-01-27  
**Purpose**: Get started with training AI agents in the SabeRL arena game

## Prerequisites

- Modern browser with WebAssembly support (Chrome 57+, Firefox 52+, Safari 11+)
- JavaScript enabled
- At least 2GB available memory for training

## Basic Usage

### 1. Start the Game
1. Open the game in your browser
2. You'll see the main game interface with a new "RL Training" section
3. The game starts in human control mode by default

### 2. Switch to AI Control
1. Click the "AI Control" toggle button
2. The player character will now move automatically based on the neural network
3. You'll see "AI Control Active" indicator in the UI

### 3. Start Training
1. Click "Start Training" button
2. The system will begin running parallel training games
3. You can watch one game in real-time while others run in the background
4. Training metrics will appear in the progress chart

### 4. Monitor Progress
- **Win Rate**: Percentage of games the AI wins
- **Average Game Length**: How long games typically last
- **Reward Chart**: Real-time graph showing average, min, and max rewards
- **Training Time**: Total time spent training

### 5. Stop Training
1. Click "Pause Training" to temporarily stop
2. Click "Stop Training" to end the session
3. Click "Save Model" to save the trained neural network

## Configuration

### Neural Network Settings
Edit `src/config/config.js` to customize:

```javascript
rl: {
  // Neural network architecture
  hiddenLayers: [128, 64, 32],
  
  // Training parameters
  learningRate: 0.001,
  explorationRate: 0.1,
  batchSize: 32,
  
  // Game settings
  decisionInterval: 4, // frames between decisions
  parallelGames: 10,   // number of parallel training games
}
```

### Training Parameters
- **Learning Rate**: How fast the AI learns (0.0001 - 0.01)
- **Exploration Rate**: How much the AI explores vs exploits (0.01 - 0.5)
- **Batch Size**: Number of experiences used per training update (16 - 128)
- **Parallel Games**: Number of simultaneous training games (1 - 100)

## Advanced Features

### Model Management
- **Save Model**: Store trained neural network locally
- **Load Model**: Resume training from saved checkpoint
- **Delete Model**: Remove saved models to free space

### Training Modes
- **Continuous Training**: Runs until manually stopped
- **Target Training**: Stops when win rate reaches target
- **Time Training**: Stops after specified duration

### Performance Tuning
- **Auto-Save**: Automatically saves every 50 games
- **Performance Monitoring**: Reduces parallel games if performance drops
- **Memory Management**: Clears old data to prevent memory issues

## Troubleshooting

### Common Issues

**Training is too slow**
- Reduce `parallelGames` in config
- Close other browser tabs
- Check if WebAssembly is enabled

**AI not learning**
- Increase `learningRate` slightly
- Increase `explorationRate` for more exploration
- Check if rewards are being calculated correctly

**Memory errors**
- Reduce `batchSize` in config
- Reduce `parallelGames`
- Clear browser cache and restart

**UI becomes unresponsive**
- The system will automatically reduce parallel games
- Click "Pause Training" to stop intensive computation
- Check browser performance in developer tools

### Performance Tips

1. **Start Small**: Begin with 5-10 parallel games
2. **Monitor Memory**: Watch memory usage in browser dev tools
3. **Save Frequently**: Save models every 100-200 games
4. **Close Tabs**: Free up memory by closing unused tabs
5. **Use Chrome**: Generally best performance for WebAssembly

## Expected Results

### Training Timeline
- **0-50 games**: Random behavior, learning basics
- **50-200 games**: Basic movement patterns emerge
- **200-500 games**: Strategic positioning and timing
- **500+ games**: Advanced tactics and efficient play

### Success Metrics
- **Win Rate**: Should improve from ~10% to 60%+ over time
- **Game Length**: Should decrease as AI becomes more efficient
- **Reward Trend**: Should show upward trend in chart

### When to Stop
- Win rate plateaus (no improvement for 100+ games)
- Training time exceeds available time
- Memory usage becomes too high
- Satisfied with current performance

## Next Steps

After basic training:
1. Experiment with different network architectures
2. Try different reward functions
3. Compare PPO vs A2C algorithms
4. Train for longer periods for better performance
5. Share successful models with others

## Support

If you encounter issues:
1. Check browser console for error messages
2. Verify WebAssembly support
3. Try reducing parallel games
4. Clear browser data and restart
5. Check available system memory
