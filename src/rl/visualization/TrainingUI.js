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
    
    // Chart instances
    this.chart = null;
    this.gameLengthChart = null;
    this.winRateChart = null;

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

    // Game length chart data
    this.gameLengthChartData = {
      labels: [],
      datasets: [
        {
          label: 'Average Game Length (steps)',
          data: [],
          borderColor: '#ff9800',
          backgroundColor: 'rgba(255, 152, 0, 0.1)',
          tension: 0.1
        }
      ]
    };

    // Win rate chart data
    this.winRateChartData = {
      labels: [],
      datasets: [
        {
          label: 'Win Rate (%)',
          data: [],
          borderColor: '#9c27b0',
          backgroundColor: 'rgba(156, 39, 176, 0.1)',
          tension: 0.1
        }
      ]
    };

    // Batch tracking for 100-game statistics
    this.currentBatchRewards = [];
    this.currentBatchGameLengths = [];
    this.currentBatchWins = [];
    this.batchSize = 100;
    
    // Track individual game results for current batch
    this.currentBatchGameResults = [];
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
      <style>
        .chart-container {
          height: 400px !important;
          overflow: hidden;
        }
        .chart-container canvas {
          max-height: 300px !important;
        }
      </style>
      <div class="training-controls">
        <h3>RL Training</h3>
        
        <div class="control-buttons">
          <button id="start-training" class="control-button">Start Training</button>
          <button id="pause-training" class="control-button" disabled>Pause</button>
          <button id="stop-training" class="control-button" disabled>Stop</button>
          <button id="test-chart" class="control-button">Create Test Chart (20 Points)</button>
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
        
        <div class="chart-container" id="chart-container" style="display: none; height: 400px;">
          <h4>Reward Progress</h4>
          <canvas id="reward-chart" width="400" height="300"></canvas>
        </div>
        
        <div class="chart-container" id="game-length-chart-container" style="display: none; height: 400px;">
          <h4>Average Game Length</h4>
          <canvas id="game-length-chart" width="400" height="300"></canvas>
        </div>
        
        <div class="chart-container" id="win-rate-chart-container" style="display: none; height: 400px;">
          <h4>Average Win Rate</h4>
          <canvas id="win-rate-chart" width="400" height="300"></canvas>
        </div>
      </div>
    `;

    // Get references to UI elements
    this.startButton = document.getElementById('start-training');
    this.pauseButton = document.getElementById('pause-training');
    this.stopButton = document.getElementById('stop-training');
    this.testChartButton = document.getElementById('test-chart');
    this.progressBar = document.getElementById('progress-fill');
    this.chartContainer = document.getElementById('reward-chart');
    this.chartContainerDiv = document.getElementById('chart-container');
    this.gameLengthChartContainer = document.getElementById('game-length-chart');
    this.gameLengthChartContainerDiv = document.getElementById('game-length-chart-container');
    this.winRateChartContainer = document.getElementById('win-rate-chart');
    this.winRateChartContainerDiv = document.getElementById('win-rate-chart-container');
    
    // Don't initialize chart until training starts
    // this.initializeChart();
  }

  /**
   * Initialize all charts
   */
  initializeAllCharts() {
    this.initializeChart();
    this.initializeGameLengthChart();
    this.initializeWinRateChart();
  }

  /**
   * Initialize the reward progress chart
   */
  initializeChart() {
    console.log('Initializing chart...');
    console.log('Chart container:', this.chartContainer);
    console.log('Chart from window:', window.Chart);
    console.log('Chart type:', typeof Chart);
    console.log('Chart type from window:', typeof window.Chart);
    
    if (!this.chartContainer) {
      console.warn('No chart container found');
      return;
    }

    // Check if Chart.js is available (try both global and window)
    const ChartConstructor = window.Chart || Chart;
    if (typeof ChartConstructor === 'undefined') {
      console.warn('Chart.js not loaded, chart will be initialized later');
      return;
    }

    // Check if Chart.js is properly loaded (not just the module loader)
    if (typeof ChartConstructor !== 'function') {
      console.warn('Chart.js not properly loaded, chart will be initialized later');
      return;
    }

    try {
      const ctx = this.chartContainer.getContext('2d');
      console.log('Canvas context:', ctx);
      
      this.chart = new ChartConstructor(ctx, {
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
        layout: {
          padding: {
            top: 10,
            bottom: 10,
            left: 10,
            right: 10
          }
        },
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
    
    console.log('Chart created successfully:', !!this.chart);
    } catch (error) {
      console.error('Failed to initialize chart:', error);
    }
  }

  /**
   * Initialize the game length chart
   */
  initializeGameLengthChart() {
    console.log('Initializing game length chart...');
    
    if (!this.gameLengthChartContainer) {
      console.warn('No game length chart container found');
      return;
    }

    const ChartConstructor = window.Chart || Chart;
    if (typeof ChartConstructor === 'undefined') {
      console.warn('Chart.js not loaded, game length chart will be initialized later');
      return;
    }

    try {
      const ctx = this.gameLengthChartContainer.getContext('2d');
      this.gameLengthChart = new ChartConstructor(ctx, {
        type: 'line',
        data: this.gameLengthChartData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: {
            padding: {
              top: 10,
              bottom: 10,
              left: 10,
              right: 10
            }
          },
          scales: {
            x: {
              title: {
                display: true,
                text: 'Batches'
              }
            },
            y: {
              title: {
                display: true,
                text: 'Game Length (steps)'
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
      console.log('Game length chart created successfully:', !!this.gameLengthChart);
    } catch (error) {
      console.error('Failed to initialize game length chart:', error);
    }
  }

  /**
   * Initialize the win rate chart
   */
  initializeWinRateChart() {
    console.log('Initializing win rate chart...');
    
    if (!this.winRateChartContainer) {
      console.warn('No win rate chart container found');
      return;
    }

    const ChartConstructor = window.Chart || Chart;
    if (typeof ChartConstructor === 'undefined') {
      console.warn('Chart.js not loaded, win rate chart will be initialized later');
      return;
    }

    try {
      const ctx = this.winRateChartContainer.getContext('2d');
      this.winRateChart = new ChartConstructor(ctx, {
        type: 'line',
        data: this.winRateChartData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: {
            padding: {
              top: 10,
              bottom: 10,
              left: 10,
              right: 10
            }
          },
          scales: {
            x: {
              title: {
                display: true,
                text: 'Batches'
              }
            },
            y: {
              title: {
                display: true,
                text: 'Win Rate (%)'
              },
              min: 0,
              max: 100
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
      console.log('Win rate chart created successfully:', !!this.winRateChart);
    } catch (error) {
      console.error('Failed to initialize win rate chart:', error);
    }
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

    if (this.testChartButton) {
      this.testChartButton.addEventListener('click', () => {
        this.createTestChart();
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
   * Force chart initialization (for debugging)
   */
  forceChartInitialization() {
    console.log('Forcing chart initialization...');
    console.log('Chart.js available:', typeof Chart === 'function');
    console.log('Chart container:', this.chartContainer);
    console.log('Chart container div:', this.chartContainerDiv);
    
    // Show the chart container for debugging
    if (this.chartContainerDiv) {
      this.chartContainerDiv.style.display = 'block';
      console.log('Chart container made visible');
    }
    
    const ChartConstructor = window.Chart || Chart;
    if (typeof ChartConstructor === 'function' && this.chartContainer) {
      this.initializeAllCharts();
      console.log('Charts initialized - Reward:', !!this.chart, 'Game Length:', !!this.gameLengthChart, 'Win Rate:', !!this.winRateChart);
    } else {
      console.warn('Cannot initialize chart - Chart.js or container not available');
      console.log('Chart.js type:', typeof Chart);
      console.log('Chart container element:', this.chartContainer);
      
      // Try to wait for Chart.js to load
      this.waitForChartJS();
    }
  }

  /**
   * Wait for Chart.js to load and then initialize chart
   */
  waitForChartJS() {
    console.log('Waiting for Chart.js to load...');
    let attempts = 0;
    const maxAttempts = 20; // 10 seconds max
    
    const checkChartJS = () => {
      attempts++;
      console.log(`Checking for Chart.js (attempt ${attempts}/${maxAttempts})...`);
      
      const ChartConstructor = window.Chart || Chart;
      if (typeof ChartConstructor === 'function') {
        console.log('Chart.js loaded! Initializing chart...');
        this.forceChartInitialization();
      } else if (attempts < maxAttempts) {
        setTimeout(checkChartJS, 500); // Check every 500ms
      } else {
        console.error('Chart.js failed to load after 10 seconds');
        console.log('Available globals:', Object.keys(window).filter(key => key.toLowerCase().includes('chart')));
        console.log('Window.Chart:', window.Chart);
        console.log('Trying to load Chart.js manually...');
        this.loadChartJSManually();
      }
    };
    
    checkChartJS();
  }

  /**
   * Manually load Chart.js as a fallback
   */
  loadChartJSManually() {
    console.log('Attempting to load Chart.js manually...');
    
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js';
    script.onload = () => {
      console.log('Chart.js loaded manually!');
      setTimeout(() => {
        this.forceChartInitialization();
      }, 100);
    };
    script.onerror = () => {
      console.error('Failed to load Chart.js manually');
    };
    
    document.head.appendChild(script);
  }

  /**
   * Add test data to chart for debugging
   */
  addTestData() {
    if (!this.chart) {
      console.error('Cannot add test data - chart not initialized');
      return;
    }
    
    console.log('Adding test data to chart...');
    console.log('Chart data before:', this.chart.data);
    
    // Clear existing data and add test data directly to chart
    this.chart.data.labels = [];
    this.chart.data.datasets.forEach(dataset => {
      dataset.data = [];
    });
    
    // Add 20 static test data points
    for (let i = 1; i <= 20; i++) {
      this.chart.data.labels.push(`Point ${i}`);
      this.chart.data.datasets[0].data.push(Math.sin(i * 0.3) * 2); // avg reward - sine wave
      this.chart.data.datasets[1].data.push(Math.sin(i * 0.3) * 2 - 1); // min reward - sine wave offset down
      this.chart.data.datasets[2].data.push(Math.sin(i * 0.3) * 2 + 1); // max reward - sine wave offset up
    }
    
    console.log('Chart data after adding test data:', this.chart.data);
    console.log('Labels:', this.chart.data.labels);
    console.log('Dataset 0 data:', this.chart.data.datasets[0].data);
    console.log('Dataset 1 data:', this.chart.data.datasets[1].data);
    console.log('Dataset 2 data:', this.chart.data.datasets[2].data);
    
    this.chart.update();
    console.log('Chart updated with test data - 20 points');
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
      
      // Initialize chart only when training starts
      this.initializeChartForTraining();
    } catch (error) {
      console.error('Failed to start training:', error);
    }
  }

  /**
   * Initialize chart specifically for training (no test data)
   */
  initializeChartForTraining() {
    console.log('Initializing charts for training...');
    
    // Show all chart containers
    if (this.chartContainerDiv) {
      this.chartContainerDiv.style.display = 'block';
    }
    if (this.gameLengthChartContainerDiv) {
      this.gameLengthChartContainerDiv.style.display = 'block';
    }
    if (this.winRateChartContainerDiv) {
      this.winRateChartContainerDiv.style.display = 'block';
    }
    
    // Initialize all charts if not already done
    if (!this.chart || !this.gameLengthChart || !this.winRateChart) {
      this.forceChartInitialization();
    }
  }

  /**
   * Show chart for testing (public method)
   */
  showChart() {
    console.log('Manually showing chart...');
    this.forceChartInitialization();
  }

  /**
   * Create a simple test chart with static data
   */
  createTestChart() {
    console.log('Creating test chart...');
    
    // Show chart container
    if (this.chartContainerDiv) {
      this.chartContainerDiv.style.display = 'block';
    }
    
    // Initialize chart if not already done
    if (!this.chart) {
      this.forceChartInitialization();
    }
    
    if (!this.chart) {
      console.error('Failed to initialize chart for test');
      return;
    }
    
    // Add test data
    this.addTestData();
    
    console.log('Test chart created successfully with 20 points');
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
    
    // Keep charts visible when training is paused
    // Charts remain displayed to show training progress
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
    
    // Keep charts visible when training stops
    // Charts remain displayed to show final training results

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
      console.log('[TrainingUI] updateTrainingProgress:', {
        gamesCompleted: metrics.gamesCompleted,
        winRateRaw: metrics.winRate,
        winRatePercent: metrics.winRate * 100
      });
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

    // Debug metrics object
    if (this.trainingSession && this.trainingSession.isTraining && metrics && metrics.gamesCompleted > 0) {
      console.log('Metrics object:', metrics);
      console.log('Reward stats:', metrics.rewardStats);
      console.log('Win rate:', metrics.winRate);
      console.log('Average game length:', metrics.averageGameLength);
      console.log('Games completed:', metrics.gamesCompleted);
    }

    // Update chart (called every game, but chart only updates every 100 games)
    if (this.trainingSession && this.trainingSession.isTraining && metrics && metrics.gamesCompleted > 0) {
      this.updateChart(metrics);
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
   * Update reward chart (throttled to configurable frequency with batch statistics)
   * @param {Object} metrics - Training metrics
   */
  updateChart(metrics) {
    const updateFrequency = GameConfig.rl.chartUpdateFrequency;
    // Only update chart if training is active and at configured frequency
    if (!this.trainingSession || !this.trainingSession.isTraining || metrics.gamesCompleted % updateFrequency !== 0) {
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
      console.warn('Chart not initialized, skipping update');
      return;
    }

    // Only add data if we have valid metrics
    if (metrics.gamesCompleted <= 0) {
      return;
    }

    // Calculate batch statistics for the last N games (where N = updateFrequency)
    const batchStats = this.calculateBatchStatistics(metrics, updateFrequency);
    
    console.log(`Updating chart with batch at game ${metrics.gamesCompleted}: avg=${batchStats.avg}, min=${batchStats.min}, max=${batchStats.max}`);

    // Add new data point (every updateFrequency games)
    const batchNumber = Math.floor(metrics.gamesCompleted / updateFrequency);
    this.chart.data.labels.push(`Batch ${batchNumber}`);
    this.chart.data.datasets[0].data.push(batchStats.avg);
    this.chart.data.datasets[1].data.push(batchStats.min);
    this.chart.data.datasets[2].data.push(batchStats.max);

    // Keep only last N data points (N batches = N * updateFrequency games)
    const maxPoints = GameConfig.rl.chartMaxDataPoints;
    if (this.chart.data.labels.length > maxPoints) {
      this.chart.data.labels.shift();
      this.chart.data.datasets.forEach(dataset => {
        dataset.data.shift();
      });
    }

    // Update chart
    this.chart.update('none');
    
    // Update other charts
    this.updateGameLengthChart(batchStats, batchNumber);
    this.updateWinRateChart(batchStats, batchNumber);
  }

  /**
   * Update game length chart
   * @param {Object} batchStats - Batch statistics
   * @param {number} batchNumber - Batch number
   */
  updateGameLengthChart(batchStats, batchNumber) {
    if (!this.gameLengthChart) return;
    
    // Add new data point
    this.gameLengthChart.data.labels.push(`Batch ${batchNumber}`);
    this.gameLengthChart.data.datasets[0].data.push(batchStats.avgGameLength);
    
    // Keep only last N data points
    const maxPointsGL = GameConfig.rl.chartMaxDataPoints;
    if (this.gameLengthChart.data.labels.length > maxPointsGL) {
      this.gameLengthChart.data.labels.shift();
      this.gameLengthChart.data.datasets[0].data.shift();
    }
    
    this.gameLengthChart.update('none');
  }

  /**
   * Update win rate chart
   * @param {Object} batchStats - Batch statistics
   * @param {number} batchNumber - Batch number
   */
  updateWinRateChart(batchStats, batchNumber) {
    if (!this.winRateChart) return;
    
    // Add new data point
    console.log('[TrainingUI] updateWinRateChart add point:', {
      batchNumber,
      winRatePercent: batchStats.winRate,
      gamesCompleted: this.trainingSession?.gamesCompleted,
      rawWinRate: this.trainingSession?.trainingMetrics?.winRate
    });
    this.winRateChart.data.labels.push(`Batch ${batchNumber}`);
    this.winRateChart.data.datasets[0].data.push(batchStats.winRate);
    
    // Keep only last N data points
    const maxPointsWR = GameConfig.rl.chartMaxDataPoints;
    if (this.winRateChart.data.labels.length > maxPointsWR) {
      this.winRateChart.data.labels.shift();
      this.winRateChart.data.datasets[0].data.shift();
    }
    
    this.winRateChart.update('none');
  }

  /**
   * Add a game result to the current batch
   * @param {Object} gameResult - Individual game result
   */
  addGameResult(gameResult) {
    this.currentBatchGameResults.push(gameResult);
    
    // Keep only last 100 games
    if (this.currentBatchGameResults.length > this.batchSize) {
      this.currentBatchGameResults.shift();
    }
  }

  /**
   * Calculate batch statistics for the last N games
   * @param {Object} metrics - Training metrics
   * @param {number} updateFrequency - Number of games per batch
   * @returns {Object} Batch statistics
   */
  calculateBatchStatistics(metrics, updateFrequency = 100) {
    console.log('Calculating batch statistics from metrics:', metrics);
    
    // Use metrics directly for now
    const rewardStats = metrics.rewardStats || { avg: 0, min: 0, max: 0 };
    const avgGameLength = metrics.averageGameLength || 0;
    const winRate = (metrics.winRate || 0) * 100; // Convert to percentage
    
    console.log('Calculated stats:', { 
      avg: rewardStats.avg, 
      min: rewardStats.min, 
      max: rewardStats.max, 
      avgGameLength, 
      winRate 
    });
    
    return { 
      avg: rewardStats.avg, 
      min: rewardStats.min, 
      max: rewardStats.max,
      avgGameLength,
      winRate
    };
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

    // Hide all charts and reset data
    if (this.chartContainerDiv) {
      this.chartContainerDiv.style.display = 'none';
    }
    if (this.gameLengthChartContainerDiv) {
      this.gameLengthChartContainerDiv.style.display = 'none';
    }
    if (this.winRateChartContainerDiv) {
      this.winRateChartContainerDiv.style.display = 'none';
    }

    if (this.chart) {
      this.chart.data.labels = [];
      this.chart.data.datasets.forEach(dataset => {
        dataset.data = [];
      });
      this.chart.update();
    }

    if (this.gameLengthChart) {
      this.gameLengthChart.data.labels = [];
      this.gameLengthChart.data.datasets.forEach(dataset => {
        dataset.data = [];
      });
      this.gameLengthChart.update();
    }

    if (this.winRateChart) {
      this.winRateChart.data.labels = [];
      this.winRateChart.data.datasets.forEach(dataset => {
        dataset.data = [];
      });
      this.winRateChart.update();
    }

    // Reset batch tracking
    this.currentBatchRewards = [];
    this.currentBatchGameLengths = [];
    this.currentBatchWins = [];
    this.currentBatchGameResults = [];
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
