/**
 * TrainingUI - User interface for RL training controls and progress display
 * Provides training controls, progress visualization, and metrics display
 */

import { GameConfig } from '../../config/config.js';
import { OpponentPolicyManager } from '../utils/OpponentPolicyManager.js';

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
    this.entropyChart = null;
    this.policyLossChart = null;
    this.valueLossChart = null;

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
          label: 'Average Game Length (seconds)',
          data: [],
          borderColor: '#ff9800',
          backgroundColor: 'rgba(255, 152, 0, 0.1)',
          tension: 0.1
        }
      ]
    };

    // Win/Loss/Tie rate chart data
    this.winRateChartData = {
      labels: [],
      datasets: [
        {
          label: 'Win Rate (%)',
          data: [],
          borderColor: '#4caf50',
          backgroundColor: 'rgba(76, 175, 80, 0.1)',
          tension: 0.1
        },
        {
          label: 'Loss Rate (%)',
          data: [],
          borderColor: '#f44336',
          backgroundColor: 'rgba(244, 67, 54, 0.1)',
          tension: 0.1
        },
        {
          label: 'Tie Rate (%)',
          data: [],
          borderColor: '#ff9800',
          backgroundColor: 'rgba(255, 152, 0, 0.1)',
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
    
    // Track batch number for chart updates (increments after each experience collection phase)
    this.batchNumber = 0;

    // Export/Import elements
    this.exportButton = null;
    this.importButton = null;
    this.importFileInput = null;

    // Opponent settings
    this.opponentManager = new OpponentPolicyManager();
    this.oppListContainer = null;
    this.oppUploadInput = null;
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
          <button id="export-weights" class="control-button">Export Weights</button>
          <button id="import-weights" class="control-button">Import Weights</button>
          <input id="import-weights-file" type="file" accept="application/json" style="display:none" />
        </div>
        
        <div class="training-status">
          <div class="status-item">
            <span class="status-label">Status:</span>
            <span id="training-status" class="status-value">Ready</span>
          </div>
          <div class="status-item">
            <span class="status-label">Games:</span>
            <span id="games-completed" class="status-value">0 / ${GameConfig.rl.maxGames || 1000}</span>
          </div>
          <div class="status-item">
            <span class="status-label">Win Rate:</span>
            <span id="win-rate" class="status-value">0%</span>
          </div>
        </div>
        
        <div class="opponent-config">
          <h4>Opponent Settings</h4>
          <div id="opp-options-list"></div>
          <div style="margin-top:8px;">
            <button id="opp-add-policy" class="control-button">Add Policy (Upload JSON)</button>
            <input id="opp-upload-input" type="file" accept="application/json" style="display:none" />
            <button id="opp-reset" class="control-button">Reset to Random</button>
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
        
        <div class="chart-container" id="win-rate-chart-container" style="display: none; height: 400px;">
          <h4>Win / Loss / Tie Rates</h4>
          <canvas id="win-rate-chart" width="400" height="300"></canvas>
        </div>
        
        <div class="chart-container" id="chart-container" style="display: none; height: 400px;">
          <h4>Reward Progress</h4>
          <canvas id="reward-chart" width="400" height="300"></canvas>
        </div>
        
        <div class="chart-container" id="game-length-chart-container" style="display: none; height: 400px;">
          <h4>Average Game Length</h4>
          <canvas id="game-length-chart" width="400" height="300"></canvas>
        </div>
        <div class="chart-container" id="entropy-chart-container" style="display: none; height: 400px;">
          <h4>Policy Entropy</h4>
          <canvas id="entropy-chart" width="400" height="300"></canvas>
        </div>
        <div class="chart-container" id="policy-loss-chart-container" style="display: none; height: 400px;">
          <h4>Policy Loss</h4>
          <canvas id="policy-loss-chart" width="400" height="300"></canvas>
        </div>
        <div class="chart-container" id="value-loss-chart-container" style="display: none; height: 400px;">
          <h4>Value Loss</h4>
          <canvas id="value-loss-chart" width="400" height="300"></canvas>
        </div>
      </div>
    `;

    // Get references to UI elements
    this.startButton = document.getElementById('start-training');
    this.pauseButton = document.getElementById('pause-training');
    this.stopButton = document.getElementById('stop-training');
    this.exportButton = document.getElementById('export-weights');
    this.importButton = document.getElementById('import-weights');
    this.importFileInput = document.getElementById('import-weights-file');
    this.progressBar = document.getElementById('progress-fill');
    this.chartContainer = document.getElementById('reward-chart');
    this.chartContainerDiv = document.getElementById('chart-container');
    this.gameLengthChartContainer = document.getElementById('game-length-chart');
    this.gameLengthChartContainerDiv = document.getElementById('game-length-chart-container');
    this.winRateChartContainer = document.getElementById('win-rate-chart');
    this.winRateChartContainerDiv = document.getElementById('win-rate-chart-container');
    
    // Entropy chart refs
    this.entropyChartContainer = document.getElementById('entropy-chart');
    this.entropyChartContainerDiv = document.getElementById('entropy-chart-container');
    // Loss charts refs
    this.policyLossChartContainer = document.getElementById('policy-loss-chart');
    this.policyLossChartContainerDiv = document.getElementById('policy-loss-chart-container');
    this.valueLossChartContainer = document.getElementById('value-loss-chart');
    this.valueLossChartContainerDiv = document.getElementById('value-loss-chart-container');
    
    // Don't initialize chart until training starts
    // this.initializeChart();

    // Opponent settings refs
    this.oppListContainer = document.getElementById('opp-options-list');
    this.oppUploadInput = document.getElementById('opp-upload-input');
    this.renderOpponentOptions();
  }

  /**
   * Initialize all charts
   */
  initializeAllCharts() {
    this.initializeChart();
    this.initializeGameLengthChart();
    this.initializeWinRateChart();
    this.initializeEntropyChart();
    this.initializePolicyLossChart();
    this.initializeValueLossChart();
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
                text: 'Game Length (seconds)'
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
                text: 'Rate (%)'
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
   * Initialize entropy chart
   */
  initializeEntropyChart() {
    console.log('Initializing entropy chart...');
    if (!this.entropyChartContainer) {
      console.warn('No entropy chart container found');
      return;
    }
    const ChartConstructor = window.Chart || Chart;
    if (typeof ChartConstructor === 'undefined') {
      console.warn('Chart.js not loaded, entropy chart will be initialized later');
      return;
    }
    try {
      const ctx = this.entropyChartContainer.getContext('2d');
      this.entropyChart = new ChartConstructor(ctx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'Policy Entropy',
              data: [],
              borderColor: '#9c27b0',
              backgroundColor: 'rgba(156, 39, 176, 0.1)',
              tension: 0.1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: {
            padding: { top: 10, bottom: 10, left: 10, right: 10 }
          },
          scales: {
            x: { title: { display: true, text: 'Batches' } },
            y: { title: { display: true, text: 'Entropy' } }
          },
          plugins: { legend: { display: true, position: 'top' } }
        }
      });
      console.log('Entropy chart created successfully:', !!this.entropyChart);
    } catch (error) {
      console.error('Failed to initialize entropy chart:', error);
    }
  }

  /**
   * Initialize policy loss chart
   */
  initializePolicyLossChart() {
    console.log('Initializing policy loss chart...');
    if (!this.policyLossChartContainer) {
      console.warn('No policy loss chart container found');
      return;
    }
    const ChartConstructor = window.Chart || Chart;
    if (typeof ChartConstructor === 'undefined') {
      console.warn('Chart.js not loaded, policy loss chart will be initialized later');
      return;
    }
    try {
      const ctx = this.policyLossChartContainer.getContext('2d');
      this.policyLossChart = new ChartConstructor(ctx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'Policy Loss',
              data: [],
              borderColor: '#2196f3',
              backgroundColor: 'rgba(33, 150, 243, 0.1)',
              tension: 0.1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 10, bottom: 10, left: 10, right: 10 } },
          scales: {
            x: { title: { display: true, text: 'Batches' } },
            y: { title: { display: true, text: 'Policy Loss' } }
          },
          plugins: { legend: { display: true, position: 'top' } }
        }
      });
    } catch (error) {
      console.error('Failed to initialize policy loss chart:', error);
    }
  }

  /**
   * Initialize value loss chart
   */
  initializeValueLossChart() {
    console.log('Initializing value loss chart...');
    if (!this.valueLossChartContainer) {
      console.warn('No value loss chart container found');
      return;
    }
    const ChartConstructor = window.Chart || Chart;
    if (typeof ChartConstructor === 'undefined') {
      console.warn('Chart.js not loaded, value loss chart will be initialized later');
      return;
    }
    try {
      const ctx = this.valueLossChartContainer.getContext('2d');
      this.valueLossChart = new ChartConstructor(ctx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'Value Loss',
              data: [],
              borderColor: '#ff9800',
              backgroundColor: 'rgba(255, 152, 0, 0.1)',
              tension: 0.1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 10, bottom: 10, left: 10, right: 10 } },
          scales: {
            x: { title: { display: true, text: 'Batches' } },
            y: { title: { display: true, text: 'Value Loss' } }
          },
          plugins: { legend: { display: true, position: 'top' } }
        }
      });
    } catch (error) {
      console.error('Failed to initialize value loss chart:', error);
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

    if (this.exportButton) {
      this.exportButton.addEventListener('click', async () => {
        await this.handleExportWeights();
      });
    }

    if (this.importButton && this.importFileInput) {
      this.importButton.addEventListener('click', () => {
        this.importFileInput.click();
      });
      this.importFileInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          await this.handleImportWeights(file);
          // reset input so same file can be selected again later
          this.importFileInput.value = '';
        }
      });
    }

    // removed test chart button and handlers

    // Opponent settings
    const oppAddBtn = document.getElementById('opp-add-policy');
    const oppResetBtn = document.getElementById('opp-reset');
    if (oppAddBtn && this.oppUploadInput) {
      oppAddBtn.addEventListener('click', () => this.oppUploadInput.click());
      this.oppUploadInput.addEventListener('change', async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        try {
          const text = await f.text();
          const bundle = JSON.parse(text);
          this.opponentManager.addPolicy(f.name.replace(/\.json$/i, ''), bundle);
          this.renderOpponentOptions();
        } catch (err) {
          console.error('Invalid opponent policy JSON', err);
        } finally {
          this.oppUploadInput.value = '';
        }
      });
    }
    if (oppResetBtn) {
      oppResetBtn.addEventListener('click', () => {
        this.opponentManager.resetToDefault();
        this.renderOpponentOptions();
      });
    }
  }

  renderOpponentOptions() {
    if (!this.oppListContainer) return;
    const opts = this.opponentManager.getOptions();
    const html = [`<table style="width:100%; font-size:12px;"><thead><tr><th style="text-align:left;">Label</th><th>Type</th><th>Weight</th><th></th></tr></thead><tbody>`];
    for (const o of opts) {
      html.push(
        `<tr>
          <td>${o.label}</td>
          <td>${o.type}</td>
          <td><input data-opp-id="${o.id}" class="opp-weight" type="number" min="0" step="1" value="${Number(o.weight)||0}" style="width:64px;" /></td>
          <td>${o.id==='random'?'':`<button data-del-id="${o.id}" class="control-button">Delete</button>`}</td>
        </tr>`
      );
    }
    html.push('</tbody></table>');
    this.oppListContainer.innerHTML = html.join('');

    // Bind events
    const weightInputs = this.oppListContainer.querySelectorAll('input.opp-weight');
    weightInputs.forEach(inp => {
      inp.addEventListener('change', (e) => {
        const id = e.target.getAttribute('data-opp-id');
        const val = e.target.value;
        this.opponentManager.updateWeight(id, Number(val));
      });
    });
    const deleteBtns = this.oppListContainer.querySelectorAll('button[data-del-id]');
    deleteBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-del-id');
        this.opponentManager.removeOption(id);
        this.renderOpponentOptions();
      });
    });
  }

  async handleExportWeights() {
    try {
      if (!this.trainingSession) {
        console.error('No training session available');
        return;
      }
      const bundle = this.trainingSession.exportAgentWeights();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = `saberl-agent-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log('Agent weights exported');
    } catch (err) {
      console.error('Failed to export weights:', err);
    }
  }

  async handleImportWeights(file) {
    try {
      if (!this.trainingSession) {
        console.error('No training session available');
        return;
      }
      const text = await file.text();
      const bundle = JSON.parse(text);
      await this.trainingSession.importAgentWeights(bundle);
      console.log('Agent weights imported');
      // Keep UI state; if training is active, continue with new weights
    } catch (err) {
      console.error('Failed to import weights:', err);
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
  // removed test chart debug utilities (forceChartInitialization, waitForChartJS, loadChartJSManually, addTestData)

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
    if (this.entropyChartContainerDiv) {
      this.entropyChartContainerDiv.style.display = 'block';
    }
    if (this.policyLossChartContainerDiv) {
      this.policyLossChartContainerDiv.style.display = 'block';
    }
    if (this.valueLossChartContainerDiv) {
      this.valueLossChartContainerDiv.style.display = 'block';
    }
    
    // Initialize all charts if not already done
    if (!this.chart || !this.gameLengthChart || !this.winRateChart || !this.entropyChart || !this.policyLossChart || !this.valueLossChart) {
      this.initializeAllCharts();
    }
  }

  /**
   * Show chart for testing (public method)
   */
  // removed showChart()

  /**
   * Create a simple test chart with static data
   */
  // removed createTestChart()

  /**
   * Pause training
   */
  pauseTraining() {
    if (!this.trainingSession) {
      return;
    }

    if (this.trainingSession.isPaused) {
      // If already paused, resume training
      this.trainingSession.resume();
      this.updateButtonStates('training');
      this.updateStatus('Training');
      // Update button text back to Pause
      if (this.pauseButton) {
        this.pauseButton.textContent = 'Pause';
      }
    } else {
      // Pause training
      this.trainingSession.pause();
      this.updateButtonStates('paused');
      this.updateStatus('Paused');
      // Update button text to show it can resume
      if (this.pauseButton) {
        this.pauseButton.textContent = 'Resume';
      }
    }
    
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
   * @param {string} winner - Winner of the game (null for batch updates)
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
    if (winRateElement && metrics) {
      const winRate = metrics.winRate || 0;
      winRateElement.textContent = `${(winRate * 100).toFixed(1)}%`;
    }

    // Update progress bar
    this.updateProgressBar(gamesCompleted);

    // Update metrics (only if metrics provided)
    if (metrics) {
      this.updateMetrics(metrics);
    }
  }

  /**
   * Update training progress
   * @param {Object} metrics - Training metrics
   */
  updateTrainingProgress(metrics) {
    // Update metrics immediately (lightweight DOM updates)
    this.updateMetrics(metrics);
    
    // Schedule chart update asynchronously to avoid blocking training
    if (metrics && metrics.gamesCompleted > 0) {
      console.log('[TrainingUI] updateTrainingProgress:', {
        gamesCompleted: metrics.gamesCompleted,
        winRateRaw: metrics.winRate,
        winRatePercent: metrics.winRate * 100
      });
      
      // Use requestAnimationFrame when tab is visible, setTimeout when hidden
      const isHidden = typeof document !== 'undefined' && 
                       (document.hidden || document.visibilityState === 'hidden');
      if (isHidden) {
        setTimeout(() => this.updateChart(metrics), 0);
      } else {
        requestAnimationFrame(() => this.updateChart(metrics));
      }
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
   * Update reward chart (updated after every experience collection phase)
   * @param {Object} metrics - Training metrics
   */
  updateChart(metrics) {
    // Only update chart if training is active
    if (!this.trainingSession || !this.trainingSession.isTraining) {
      return;
    }

    // Show chart container when we have data to display (schedule async)
    if (this.chartContainerDiv && metrics.gamesCompleted > 0) {
      // Use requestAnimationFrame for smooth display when visible
      const isHidden = typeof document !== 'undefined' && 
                       (document.hidden || document.visibilityState === 'hidden');
      if (isHidden) {
        this.chartContainerDiv.style.display = 'block';
      } else {
        requestAnimationFrame(() => {
          this.chartContainerDiv.style.display = 'block';
        });
      }
    }

    // Try to initialize chart if not already done (schedule async to avoid blocking)
    if (!this.chart && typeof Chart === 'function') {
      // Initialize charts asynchronously to avoid blocking
      setTimeout(() => {
        if (!this.chart || !this.gameLengthChart || !this.winRateChart) {
          this.initializeAllCharts();
        }
      }, 0);
      return; // Return early, will update next time
    }

    if (!this.chart) {
      // Charts not ready yet, skip this update
      return;
    }

    // Only add data if we have valid metrics
    if (metrics.gamesCompleted <= 0) {
      return;
    }

    // Calculate batch statistics from current metrics
    // Use current metrics directly (aggregated from all games so far)
    const batchStats = this.calculateBatchStatistics(metrics);
    
    // Increment batch number for this experience collection phase
    this.batchNumber++;
    
    console.log(`Updating chart with batch ${this.batchNumber} at game ${metrics.gamesCompleted}: avg=${batchStats.avg}, min=${batchStats.min}, max=${batchStats.max}`);

    // Add new data point (after each experience collection phase)
    this.chart.data.labels.push(`Batch ${this.batchNumber}`);
    this.chart.data.datasets[0].data.push(batchStats.avg);
    this.chart.data.datasets[1].data.push(batchStats.min);
    this.chart.data.datasets[2].data.push(batchStats.max);

    // Keep only last N data points
    const maxPoints = GameConfig.rl.chartMaxDataPoints;
    if (this.chart.data.labels.length > maxPoints) {
      this.chart.data.labels.shift();
      this.chart.data.datasets.forEach(dataset => {
        dataset.data.shift();
      });
    }

    // Schedule chart updates asynchronously to avoid blocking
    // Use requestAnimationFrame when tab is visible for smooth updates
    // Use setTimeout when tab is hidden
    const isHidden = typeof document !== 'undefined' && 
                     (document.hidden || document.visibilityState === 'hidden');
    
    if (isHidden) {
      // Tab hidden: use setTimeout for immediate update
      setTimeout(() => {
        this.chart.update('none');
        this.updateGameLengthChart(batchStats, this.batchNumber);
        this.updateWinRateChart(batchStats, this.batchNumber);
        this.updateEntropyChart(batchStats, this.batchNumber);
        this.updatePolicyLossChart(batchStats, this.batchNumber);
        this.updateValueLossChart(batchStats, this.batchNumber);
      }, 0);
    } else {
      // Tab visible: use requestAnimationFrame for smooth rendering
      requestAnimationFrame(() => {
        this.chart.update('none');
        this.updateGameLengthChart(batchStats, this.batchNumber);
        this.updateWinRateChart(batchStats, this.batchNumber);
        this.updateEntropyChart(batchStats, this.batchNumber);
        this.updatePolicyLossChart(batchStats, this.batchNumber);
        this.updateValueLossChart(batchStats, this.batchNumber);
      });
    }
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
   * Update win/loss/tie rate chart
   * @param {Object} batchStats - Batch statistics
   * @param {number} batchNumber - Batch number
   */
  updateWinRateChart(batchStats, batchNumber) {
    if (!this.winRateChart) return;
    
    // Add new data point for all three rates
    console.log('[TrainingUI] updateWinRateChart add point:', {
      batchNumber,
      winRatePercent: batchStats.winRate,
      lossRatePercent: batchStats.lossRate,
      tieRatePercent: batchStats.tieRate,
      gamesCompleted: this.trainingSession?.gamesCompleted
    });
    this.winRateChart.data.labels.push(`Batch ${batchNumber}`);
    this.winRateChart.data.datasets[0].data.push(batchStats.winRate || 0);   // Win rate
    this.winRateChart.data.datasets[1].data.push(batchStats.lossRate || 0); // Loss rate
    this.winRateChart.data.datasets[2].data.push(batchStats.tieRate || 0);   // Tie rate
    
    // Keep only last N data points
    const maxPointsWR = GameConfig.rl.chartMaxDataPoints;
    if (this.winRateChart.data.labels.length > maxPointsWR) {
      this.winRateChart.data.labels.shift();
      this.winRateChart.data.datasets.forEach(dataset => {
        dataset.data.shift();
      });
    }
    
    this.winRateChart.update('none');
  }

  /**
   * Update entropy chart
   * @param {Object} batchStats - Batch statistics
   * @param {number} batchNumber - Batch number
   */
  updateEntropyChart(batchStats, batchNumber) {
    if (!this.entropyChart) return;
    const trainerStats = (this.trainingSession && this.trainingSession.trainer && this.trainingSession.trainer.getStats) ? this.trainingSession.trainer.getStats() : {};
    const fallbackEntropy = trainerStats.entropy || 0;
    const entropy = typeof batchStats.policyEntropy === 'number' ? batchStats.policyEntropy : fallbackEntropy;
    this.entropyChart.data.labels.push(`Batch ${batchNumber}`);
    this.entropyChart.data.datasets[0].data.push(entropy);
    const maxPoints = GameConfig.rl.chartMaxDataPoints;
    if (this.entropyChart.data.labels.length > maxPoints) {
      this.entropyChart.data.labels.shift();
      this.entropyChart.data.datasets[0].data.shift();
    }
    this.entropyChart.update('none');
  }

  /**
   * Update policy loss chart
   */
  updatePolicyLossChart(batchStats, batchNumber) {
    if (!this.policyLossChart) return;
    const trainerStats = (this.trainingSession && this.trainingSession.trainer && this.trainingSession.trainer.getStats) ? this.trainingSession.trainer.getStats() : {};
    const loss = trainerStats.policyLoss || 0;
    this.policyLossChart.data.labels.push(`Batch ${batchNumber}`);
    this.policyLossChart.data.datasets[0].data.push(loss);
    const maxPoints = GameConfig.rl.chartMaxDataPoints;
    if (this.policyLossChart.data.labels.length > maxPoints) {
      this.policyLossChart.data.labels.shift();
      this.policyLossChart.data.datasets[0].data.shift();
    }
    this.policyLossChart.update('none');
  }

  /**
   * Update value loss chart
   */
  updateValueLossChart(batchStats, batchNumber) {
    if (!this.valueLossChart) return;
    const trainerStats = (this.trainingSession && this.trainingSession.trainer && this.trainingSession.trainer.getStats) ? this.trainingSession.trainer.getStats() : {};
    const loss = trainerStats.valueLoss || 0;
    this.valueLossChart.data.labels.push(`Batch ${batchNumber}`);
    this.valueLossChart.data.datasets[0].data.push(loss);
    const maxPoints = GameConfig.rl.chartMaxDataPoints;
    if (this.valueLossChart.data.labels.length > maxPoints) {
      this.valueLossChart.data.labels.shift();
      this.valueLossChart.data.datasets[0].data.shift();
    }
    this.valueLossChart.update('none');
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
   * Calculate batch statistics from metrics
   * @param {Object} metrics - Training metrics (rollout-specific for charts, cumulative for other metrics)
   * @returns {Object} Batch statistics
   */
  calculateBatchStatistics(metrics) {
    console.log('Calculating batch statistics from metrics:', metrics);
    
    // Use metrics directly (rollout-specific for charts: averageGameLength, wins/losses/ties, rewardStats)
    const rewardStats = metrics.rewardStats || { avg: 0, min: 0, max: 0 };
    
    // Convert game length from steps to seconds
    // gameLength is in steps (number of experiences/actions)
    // Each step represents actionIntervalSeconds (0.2s by default)
    const gameLengthSteps = metrics.averageGameLength || 0;
    const actionIntervalSeconds = GameConfig.rl.rollout.actionIntervalSeconds || 0.2;
    const avgGameLength = gameLengthSteps * actionIntervalSeconds; // Convert to seconds
    
    // Calculate rates as percentages
    const gamesCompleted = metrics.gamesCompleted || 0;
    const wins = metrics.wins || 0;
    const losses = metrics.losses || 0;
    const ties = metrics.ties || 0;
    
    const winRate = gamesCompleted > 0 ? (wins / gamesCompleted) * 100 : 0;
    const lossRate = gamesCompleted > 0 ? (losses / gamesCompleted) * 100 : 0;
    const tieRate = gamesCompleted > 0 ? (ties / gamesCompleted) * 100 : 0;
    
    console.log('Calculated stats:', { 
      avg: rewardStats.avg, 
      min: rewardStats.min, 
      max: rewardStats.max, 
      avgGameLengthSteps: gameLengthSteps,
      avgGameLengthSeconds: avgGameLength, 
      winRate,
      lossRate,
      tieRate
    });
    
    return { 
      avg: rewardStats.avg, 
      min: rewardStats.min, 
      max: rewardStats.max,
      avgGameLength,
      winRate,
      lossRate,
      tieRate,
      policyEntropy: metrics.policyEntropy || 0
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
      const maxGames = this.trainingSession?.options.maxGames || GameConfig.rl.maxGames || 1000;
      gamesElement.textContent = `0 / ${maxGames}`;
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
    this.batchNumber = 0;
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
