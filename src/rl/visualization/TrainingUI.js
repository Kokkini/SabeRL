/**
 * TrainingUI - User interface for RL training controls and progress display
 * Provides training controls, progress visualization, and metrics display
 */

import { GameConfig } from '../../config/config.js';

export class TrainingUI {
  constructor(containerId = 'training-ui') {
    this.container = document.getElementById(containerId);
    this.isInitialized = false;
    
    // UI elements
    this.startButton = null;
    this.pauseButton = null;
    this.stopButton = null;
    this.progressBar = null;
    this.metricsDisplay = null;
    this.chartContainer = null;
    this.chart = null;
    
    // Training session reference
    this.trainingSession = null;
    
    // Chart data
    this.chartData = {
      labels: [],
      datasets: [
        {
          label: 'Average Reward',
          data: [],
          borderColor: '#4a9eff',
          backgroundColor: 'rgba(74, 158, 255, 0.1)',
          tension: 0.1
        },
        {
          label: 'Min Reward',
          data: [],
          borderColor: '#ff6b6b',
          backgroundColor: 'rgba(255, 107, 107, 0.1)',
          tension: 0.1
        },
        {
          label: 'Max Reward',
          data: [],
          borderColor: '#4caf50',
          backgroundColor: 'rgba(76, 175, 80, 0.1)',
          tension: 0.1
        }
      ]
    };
  }

  /**
   * Initialize the training UI
   */
  initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      this.createUI();
      this.setupEventListeners();
      this.isInitialized = true;
      console.log('Training UI initialized');
    } catch (error) {
      console.error('Failed to initialize training UI:', error);
    }
  }

  /**
   * Create the training UI elements
   */
  createUI() {
    if (!this.container) {
      console.error('Training UI container not found');
      return;
    }

    this.container.innerHTML = `
      <div class="training-controls">
        <h3>RL Training</h3>
        
        <div class="control-buttons">
          <button id="start-training" class="control-button">Start Training</button>
          <button id="pause-training" class="control-button" disabled>Pause</button>
          <button id="stop-training" class="control-button" disabled>Stop</button>
        </div>
        
        <div class="training-status">
          <div class="status-item">
            <span class="status-label">Status:</span>
            <span id="training-status" class="status-value">Ready</span>
          </div>
          <div class="status-item">
            <span class="status-label">Games:</span>
            <span id="games-completed" class="status-value">0 / 1000</span>
          </div>
          <div class="status-item">
            <span class="status-label">Win Rate:</span>
            <span id="win-rate" class="status-value">0%</span>
          </div>
        </div>
        
        <div class="progress-container">
          <div class="progress-label">Training Progress</div>
          <div class="progress-bar">
            <div id="progress-fill" class="progress-fill"></div>
          </div>
        </div>
        
        <div class="metrics-display">
          <h4>Training Metrics</h4>
          <div class="metrics-grid">
            <div class="metric-item">
              <span class="metric-label">Avg Reward:</span>
              <span id="avg-reward" class="metric-value">0.00</span>
            </div>
            <div class="metric-item">
              <span class="metric-label">Min Reward:</span>
              <span id="min-reward" class="metric-value">0.00</span>
            </div>
            <div class="metric-item">
              <span class="metric-label">Max Reward:</span>
              <span id="max-reward" class="metric-value">0.00</span>
            </div>
            <div class="metric-item">
              <span class="metric-label">Training Time:</span>
              <span id="training-time" class="metric-value">0s</span>
            </div>
          </div>
        </div>
        
        <div class="chart-container" id="chart-container" style="display: none;">
          <h4>Reward Progress</h4>
          <canvas id="reward-chart" width="400" height="200"></canvas>
        </div>
      </div>
    `;

    // Get references to UI elements
    this.startButton = document.getElementById('start-training');
    this.pauseButton = document.getElementById('pause-training');
    this.stopButton = document.getElementById('stop-training');
    this.progressBar = document.getElementById('progress-fill');
    this.chartContainer = document.getElementById('reward-chart');
    this.chartContainerDiv = document.getElementById('chart-container');
    
    // Initialize chart
    this.initializeChart();
  }

  /**
   * Initialize the reward progress chart
   */
  initializeChart() {
    if (!this.chartContainer) {
      return;
    }

    // Check if Chart.js is available
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js not loaded, chart will be initialized later');
      return;
    }

    // Check if Chart.js is properly loaded (not just the module loader)
    if (typeof Chart !== 'function') {
      console.warn('Chart.js not properly loaded, chart will be initialized later');
      return;
    }

    const ctx = this.chartContainer.getContext('2d');
    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Average Reward',
            data: [],
            borderColor: '#4a9eff',
            backgroundColor: 'rgba(74, 158, 255, 0.1)',
            tension: 0.1
          },
          {
            label: 'Min Reward',
            data: [],
            borderColor: '#ff6b6b',
            backgroundColor: 'rgba(255, 107, 107, 0.1)',
            tension: 0.1
          },
          {
            label: 'Max Reward',
            data: [],
            borderColor: '#4caf50',
            backgroundColor: 'rgba(76, 175, 80, 0.1)',
            tension: 0.1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: {
              display: true,
              text: 'Games'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Reward'
            }
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'top'
          }
        }
      }
    });
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    if (this.startButton) {
      this.startButton.addEventListener('click', () => {
        this.startTraining();
      });
    }

    if (this.pauseButton) {
      this.pauseButton.addEventListener('click', () => {
        this.pauseTraining();
      });
    }

    if (this.stopButton) {
      this.stopButton.addEventListener('click', () => {
        this.stopTraining();
      });
    }
  }

  /**
   * Set training session reference
   * @param {TrainingSession} trainingSession - Training session instance
   */
  setTrainingSession(trainingSession) {
    this.trainingSession = trainingSession;
    
    // Set up training session callbacks
    if (trainingSession) {
      trainingSession.onGameEnd = (winner, gamesCompleted, metrics) => {
        this.updateGameEnd(winner, gamesCompleted, metrics);
      };
      
      trainingSession.onTrainingProgress = (metrics) => {
        this.updateTrainingProgress(metrics);
      };
      
      trainingSession.onTrainingComplete = (metrics) => {
        this.updateTrainingComplete(metrics);
      };
    }

    // Try to initialize chart if Chart.js is now available
    if (!this.chart && typeof Chart === 'function') {
      this.initializeChart();
    }
  }

  /**
   * Initialize chart when Chart.js becomes available
   */
  tryInitializeChart() {
    if (!this.chart && typeof Chart === 'function' && this.chartContainer) {
      this.initializeChart();
    }
  }

  /**
   * Start training
   */
  async startTraining() {
    if (!this.trainingSession) {
      console.error('No training session available');
      return;
    }

    try {
      await this.trainingSession.start();
      this.updateButtonStates('training');
      this.updateStatus('Training...');
    } catch (error) {
      console.error('Failed to start training:', error);
    }
  }

  /**
   * Pause training
   */
  pauseTraining() {
    if (!this.trainingSession) {
      return;
    }

    this.trainingSession.pause();
    this.updateButtonStates('paused');
    this.updateStatus('Paused');
  }

  /**
   * Stop training
   */
  stopTraining() {
    if (!this.trainingSession) {
      return;
    }

    this.trainingSession.stop();
    this.updateButtonStates('stopped');
    this.updateStatus('Stopped');
    
    // Hide chart when training stops
    if (this.chartContainerDiv) {
      this.chartContainerDiv.style.display = 'none';
    }

    // Return player to human control when training stops
    if (this.trainingSession.game) {
      const player = this.trainingSession.game.getPlayer();
      if (player) {
        player.setControlMode('human');
      }
    }
  }

  /**
   * Update button states
   * @param {string} state - Current state ('ready', 'training', 'paused', 'stopped')
   */
  updateButtonStates(state) {
    const states = {
      ready: { start: false, pause: true, stop: true },
      training: { start: true, pause: false, stop: false },
      paused: { start: false, pause: false, stop: false },
      stopped: { start: false, pause: true, stop: true }
    };

    const buttonState = states[state] || states.ready;
    
    if (this.startButton) {
      this.startButton.disabled = buttonState.start;
    }
    if (this.pauseButton) {
      this.pauseButton.disabled = buttonState.pause;
    }
    if (this.stopButton) {
      this.stopButton.disabled = buttonState.stop;
    }
  }

  /**
   * Update training status
   * @param {string} status - Status text
   */
  updateStatus(status) {
    const statusElement = document.getElementById('training-status');
    if (statusElement) {
      statusElement.textContent = status;
    }
  }

  /**
   * Update game end display
   * @param {string} winner - Winner of the game
   * @param {number} gamesCompleted - Number of games completed
   * @param {Object} metrics - Training metrics
   */
  updateGameEnd(winner, gamesCompleted, metrics) {
    // Update games completed
    const gamesElement = document.getElementById('games-completed');
    if (gamesElement) {
      gamesElement.textContent = `${gamesCompleted} / ${this.trainingSession?.options.maxGames || 1000}`;
    }

    // Update win rate
    const winRateElement = document.getElementById('win-rate');
    if (winRateElement) {
      winRateElement.textContent = `${(metrics.winRate * 100).toFixed(1)}%`;
    }

    // Update progress bar
    this.updateProgressBar(gamesCompleted);

    // Update metrics
    this.updateMetrics(metrics);
  }

  /**
   * Update training progress
   * @param {Object} metrics - Training metrics
   */
  updateTrainingProgress(metrics) {
    this.updateMetrics(metrics);
    
    // Only update chart if we have valid training data
    if (metrics && metrics.gamesCompleted > 0) {
      this.updateChart(metrics);
    }
  }

  /**
   * Update training complete
   * @param {Object} metrics - Final training metrics
   */
  updateTrainingComplete(metrics) {
    this.updateButtonStates('stopped');
    this.updateStatus('Training Complete');
    this.updateMetrics(metrics);
    
    // Only update chart if we have valid training data
    if (metrics && metrics.gamesCompleted > 0) {
      this.updateChart(metrics);
    }
    
    console.log('Training completed!', metrics);
  }

  /**
   * Update metrics display
   * @param {Object} metrics - Training metrics
   */
  updateMetrics(metrics) {
    const avgRewardElement = document.getElementById('avg-reward');
    if (avgRewardElement) {
      avgRewardElement.textContent = metrics.rewardStats.avg.toFixed(2);
    }

    const minRewardElement = document.getElementById('min-reward');
    if (minRewardElement) {
      minRewardElement.textContent = metrics.rewardStats.min.toFixed(2);
    }

    const maxRewardElement = document.getElementById('max-reward');
    if (maxRewardElement) {
      maxRewardElement.textContent = metrics.rewardStats.max.toFixed(2);
    }

    const trainingTimeElement = document.getElementById('training-time');
    if (trainingTimeElement) {
      const timeSeconds = Math.floor(metrics.trainingTime / 1000);
      trainingTimeElement.textContent = `${timeSeconds}s`;
    }
  }

  /**
   * Update progress bar
   * @param {number} gamesCompleted - Number of games completed
   */
  updateProgressBar(gamesCompleted) {
    if (!this.progressBar || !this.trainingSession) {
      return;
    }

    const maxGames = this.trainingSession.options.maxGames;
    const progress = Math.min((gamesCompleted / maxGames) * 100, 100);
    this.progressBar.style.width = `${progress}%`;
  }

  /**
   * Update reward chart (throttled to every 100 games)
   * @param {Object} metrics - Training metrics
   */
  updateChart(metrics) {
    // Only update chart if training is active and every 100 games
    if (!this.trainingSession || !this.trainingSession.isTraining || metrics.gamesCompleted % 100 !== 0) {
      return;
    }

    // Show chart container when we have data to display
    if (this.chartContainerDiv && metrics.gamesCompleted > 0) {
      this.chartContainerDiv.style.display = 'block';
    }

    // Try to initialize chart if not already done
    if (!this.chart && typeof Chart === 'function') {
      this.initializeChart();
    }

    if (!this.chart) {
      return;
    }

    // Only add data if we have valid metrics
    if (metrics.gamesCompleted <= 0) {
      return;
    }

    // Add new data point
    const gameNumber = metrics.gamesCompleted;
    this.chartData.labels.push(gameNumber);
    this.chartData.datasets[0].data.push(metrics.rewardStats.avg);
    this.chartData.datasets[1].data.push(metrics.rewardStats.min);
    this.chartData.datasets[2].data.push(metrics.rewardStats.max);

    // Keep only last 100 data points
    if (this.chartData.labels.length > 100) {
      this.chartData.labels.shift();
      this.chartData.datasets.forEach(dataset => {
        dataset.data.shift();
      });
    }

    // Update chart
    this.chart.update('none');
  }

  /**
   * Reset UI to initial state
   */
  reset() {
    this.updateButtonStates('ready');
    this.updateStatus('Ready');
    
    // Reset metrics
    const gamesElement = document.getElementById('games-completed');
    if (gamesElement) {
      gamesElement.textContent = '0 / 1000';
    }

    const winRateElement = document.getElementById('win-rate');
    if (winRateElement) {
      winRateElement.textContent = '0%';
    }

    // Reset progress bar
    if (this.progressBar) {
      this.progressBar.style.width = '0%';
    }

    // Hide chart and reset data
    if (this.chartContainerDiv) {
      this.chartContainerDiv.style.display = 'none';
    }

    if (this.chart) {
      this.chartData.labels = [];
      this.chartData.datasets.forEach(dataset => {
        dataset.data = [];
      });
      this.chart.update();
    }
  }

  /**
   * Dispose of training UI
   */
  dispose() {
    if (this.chart) {
      this.chart.destroy();
    }
    
    this.trainingSession = null;
    this.isInitialized = false;
  }
}
