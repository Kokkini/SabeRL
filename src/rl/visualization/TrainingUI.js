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
    this.toggleButton = null;
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

    // Snapshot initial defaults from config.js at construction time
    this.initialDefaults = {
      learningRate: GameConfig.rl.learningRate,
      miniBatchSize: GameConfig.rl.miniBatchSize,
      epochs: GameConfig.rl.epochs,
      discountFactor: GameConfig.rl.discountFactor,
      clipRatio: GameConfig.rl.clipRatio,
      valueLossCoeff: GameConfig.rl.valueLossCoeff,
      entropyCoeff: GameConfig.rl.entropyCoeff,
      maxGradNorm: GameConfig.rl.maxGradNorm,
      gaeLambda: GameConfig.rl.gaeLambda,
      rewards: { ...GameConfig.rl.rewards }
    };

    // Training parameters
    this.trainingParams = this.loadTrainingParams();
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
        .instructions-modal {
          display: none;
          position: fixed;
          z-index: 10000;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.7);
          overflow: auto;
        }
        .instructions-modal-content {
          background-color: #1a1a1a;
          margin: 5% auto;
          padding: 30px;
          border: 2px solid #4a9eff;
          border-radius: 10px;
          width: 80%;
          max-width: 800px;
          max-height: 80vh;
          overflow-y: auto;
          color: #e0e0e0;
          box-shadow: 0 4px 20px rgba(74, 158, 255, 0.3);
          text-align: left;
        }
        .instructions-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          border-bottom: 2px solid #4a9eff;
          padding-bottom: 15px;
        }
        .instructions-modal-header h2 {
          margin: 0;
          color: #4a9eff;
        }
        .instructions-close {
          color: #aaa;
          font-size: 28px;
          font-weight: bold;
          cursor: pointer;
          background: none;
          border: none;
          padding: 0;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .instructions-close:hover,
        .instructions-close:focus {
          color: #4a9eff;
        }
        .instructions-section {
          margin-bottom: 10px;
          text-align: left;
          border: 1px solid #333;
          border-radius: 5px;
          overflow: hidden;
        }
        .instructions-section-header {
          background-color: #2a2a2a;
          padding: 15px 20px;
          cursor: pointer;
          user-select: none;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: background-color 0.2s;
        }
        .instructions-section-header:hover {
          background-color: #333;
        }
        .instructions-section-header h3 {
          color: #4a9eff;
          margin: 0;
          font-size: 1.2em;
          text-align: left;
          flex: 1;
        }
        .instructions-section-toggle {
          color: #4a9eff;
          font-size: 1.5em;
          font-weight: bold;
          transition: transform 0.3s;
          margin-left: 15px;
        }
        .instructions-section.expanded .instructions-section-toggle {
          transform: rotate(90deg);
        }
        .instructions-section-content {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.3s ease-out, padding 0.3s ease-out;
          padding: 0 20px;
        }
        .instructions-section.expanded .instructions-section-content {
          max-height: 2000px;
          padding: 20px;
        }
        .instructions-section-content p {
          margin: 8px 0;
          line-height: 1.6;
          text-align: left;
        }
        .instructions-section-content ul {
          margin: 10px 0;
          padding-left: 25px;
          text-align: left;
        }
        .instructions-section-content li {
          margin: 8px 0;
          line-height: 1.6;
          text-align: left;
        }
        .instructions-code {
          background-color: #2a2a2a;
          padding: 10px;
          border-radius: 5px;
          font-family: monospace;
          margin: 10px 0;
          border-left: 3px solid #4a9eff;
        }
      </style>
      <div class="training-controls">
        <h3>Train an AI Agent to Play the Game for You</h3>
        
        <div class="control-buttons">
          <button id="toggle-training" class="control-button">Start Training</button>
          <button id="instructions-button" class="control-button">Instructions</button>
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

        <div class="progress-container">
          <div class="progress-label">Training Progress</div>
          <div class="progress-bar">
            <div id="progress-fill" class="progress-fill"></div>
          </div>
        </div>

        <div class="opponent-config">
          <h3>Blue (Player) Settings</h3>
          <button id="export-weights" class="control-button">Export Weights</button>
          <button id="import-weights" class="control-button">Import Weights</button>
          <input id="import-weights-file" type="file" accept="application/json" style="display:none" />
        </div>

        <div class="opponent-config">
          <h3>Red (Opponent) Settings</h3>
          <div id="opp-options-list"></div>
          <div style="margin-top:8px;">
            <button id="opp-add-policy" class="control-button">Add Policy (Upload JSON)</button>
            <input id="opp-upload-input" type="file" accept="application/json" style="display:none" />
            <button id="opp-reset" class="control-button">Reset to Random</button>
          </div>
        </div>

        <div class="training-params" style="margin:16px 0; border:1px solid #444; padding:12px; border-radius:4px;">
          <h3>Training Parameters</h3>
          <details>
            <summary style="cursor:pointer; margin-bottom:8px;">Training Hyperparameters</summary>
            <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:8px; font-size:12px; margin-bottom:8px;">
              <div><label>Learning Rate: <input id="param-learningRate" type="number" step="0.0001" min="0.0001" max="1" style="width:80px;" /></label></div>
              <div><label>Mini Batch Size: <input id="param-miniBatchSize" type="number" step="1" min="1" max="512" style="width:80px;" /></label></div>
              <div><label>Epochs: <input id="param-epochs" type="number" step="1" min="1" max="20" style="width:80px;" /></label></div>
              <div><label>Discount Factor: <input id="param-discountFactor" type="number" step="0.01" min="0" max="1" style="width:80px;" /></label></div>
              <div><label>Clip Ratio: <input id="param-clipRatio" type="number" step="0.01" min="0" max="1" style="width:80px;" /></label></div>
              <div><label>Value Loss Coeff: <input id="param-valueLossCoeff" type="number" step="0.1" min="0" max="10" style="width:80px;" /></label></div>
              <div><label>Entropy Coeff: <input id="param-entropyCoeff" type="number" step="0.001" min="0" max="1" style="width:80px;" /></label></div>
              <div><label>Max Grad Norm: <input id="param-maxGradNorm" type="number" step="0.1" min="0" max="10" style="width:80px;" /></label></div>
              <div><label>GAE Lambda: <input id="param-gaeLambda" type="number" step="0.01" min="0" max="1" style="width:80px;" /></label></div>
            </div>
          </details>
          <details>
            <summary style="cursor:pointer; margin-top:8px; margin-bottom:8px;">Reward Structure</summary>
            <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:8px; font-size:12px; margin-bottom:8px;">
              <div><label>Win Reward: <input id="param-reward-win" type="number" step="0.1" style="width:80px;" /></label></div>
              <div><label>Loss Reward: <input id="param-reward-loss" type="number" step="0.1" style="width:80px;" /></label></div>
              <div><label>Tie Reward: <input id="param-reward-tie" type="number" step="0.1" style="width:80px;" /></label></div>
              <div><label>Time Penalty: <input id="param-reward-timePenalty" type="number" step="0.01" style="width:80px;" /></label></div>
              <div><label>Max Game Length: <input id="param-reward-maxGameLength" type="number" step="1" min="1" style="width:80px;" /></label></div>
              <div><label>Distance Penalty Factor: <input id="param-reward-distancePenaltyFactor" type="number" step="0.1" style="width:80px;" /></label></div>
              <div><label>Delta Distance Reward Factor: <input id="param-reward-deltaDistanceRewardFactor" type="number" step="0.01" min="0" style="width:80px;" /></label></div>
            </div>
          </details>
          <button id="reset-training-params" class="control-button" style="margin-top:8px;">Reset to Defaults</button>
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
      
      <!-- Instructions Modal -->
      <div id="instructions-modal" class="instructions-modal">
        <div class="instructions-modal-content">
          <div class="instructions-modal-header">
            <h2>Training Instructions</h2>
            <button class="instructions-close" id="instructions-close">&times;</button>
          </div>
          
          <p style="margin: 0 0 20px 0; padding: 0 20px; color: #e0e0e0; line-height: 1.6;">You can train an AI agent to play the game for you. The agent learns by playing thousands of games and gradually improves its strategy. Use the sections below to get started.</p>
          
          <div class="instructions-section">
            <div class="instructions-section-header">
              <h3>Training Your Own Agent</h3>
              <span class="instructions-section-toggle">▶</span>
            </div>
            <div class="instructions-section-content">
              <p>Click <strong>"Start Training"</strong>. The agent plays thousands of games in the background and learns automatically. Click "Pause" to stop.</p>
              <p>By default, it trains against a random opponent. Watch the win rate increase as it improves.</p>
            </div>
          </div>

          <div class="instructions-section">
            <div class="instructions-section-header">
              <h3>Seeing Your Trained Agent Play the Game</h3>
              <span class="instructions-section-toggle">▶</span>
            </div>
            <div class="instructions-section-content">
              <p>Click <strong>"Enable AI Control"</strong>, then <strong>"Start Game"</strong>. Your trained agent controls blue, opponent controls red. Watch and learn!</p>
            </div>
          </div>
          
          <div class="instructions-section">
            <div class="instructions-section-header">
              <h3>Seeing the Agent Training Progress</h3>
              <span class="instructions-section-toggle">▶</span>
            </div>
            <div class="instructions-section-content">
              <p>Watch the <strong>Win Rate</strong> increase as your agent improves. Scroll down for detailed charts:</p>
              <ul>
                <li><strong>Reward Progress:</strong> Average rewards over time (upward = good)</li>
                <li><strong>Win / Loss / Tie Rates:</strong> Game outcome percentages. Win rates should increase with training.</li>
                <li><strong>Average Game Length:</strong> How long games last. Should decrease with training.</li>
                <li><strong>Policy Entropy:</strong> Exploration vs exploitation balance (higher = more exploration)</li>
                <li><strong>Policy Loss:</strong> How much the policy is changing (decreasing = stabilizing)</li>
                <li><strong>Value Loss:</strong> Quality of reward predictions (lower = better)</li>
              </ul>
            </div>
          </div>
          
          <div class="instructions-section">
            <div class="instructions-section-header">
              <h3>Saving and Restoring Training Progress</h3>
              <span class="instructions-section-toggle">▶</span>
            </div>
            <div class="instructions-section-content">
              <p><strong>Save:</strong> Click <strong>"Export Weights"</strong> in "Blue (Player) Settings". A JSON file downloads with your agent's state.</p>
              <p><strong>Restore:</strong> Click <strong>"Import Weights"</strong> and select your saved JSON file. Training continues from that point.</p>
            </div>
          </div>
          
          <div class="instructions-section">
            <div class="instructions-section-header">
              <h3>Playing Against Your Trained Agent</h3>
              <span class="instructions-section-toggle">▶</span>
            </div>
            <div class="instructions-section-content">
              <p>1. Export your trained agent's weights (see "Save and Restore" section).</p>
              <p>2. In "Opponent Settings", click <strong>"Add Policy (Upload JSON)"</strong> and select your exported file.</p>
              <p>3. Set random opponent weight to 0.</p>
              <p>4. Click <strong>"Start Game"</strong>. Control blue with WASD keys. Your agent controls red.</p>
            </div>
          </div>
          
          <div class="instructions-section">
            <div class="instructions-section-header">
              <h3>Training Another Agent to Beat Your Trained Agent</h3>
              <span class="instructions-section-toggle">▶</span>
            </div>
            <div class="instructions-section-content">
              <p>Follow the previous section to add your trained agent as an opponent, then click <strong>"Start Training"</strong>. The new agent learns to beat your trained agent. Repeat to create stronger agents!</p>
            </div>
          </div>
          
          <div class="instructions-section">
            <div class="instructions-section-header">
              <h3>Advanced: Customizing Training Parameters</h3>
              <span class="instructions-section-toggle">▶</span>
            </div>
            <div class="instructions-section-content">
              <p>Adjust parameters in "Training Parameters":</p>
              <ul>
                <li><strong>Learning Rate:</strong> Speed of learning (lower = stable, higher = fast)</li>
                <li><strong>Reward Structure:</strong> Reward for the agent to win, lose, tie, etc.</li>
                <li><strong>Other:</strong> Batch size, epochs, discount factor, and more</li>
              </ul>
              <p>Settings auto-save. Use "Reset to Defaults" to restore originals.</p>
            </div>
          </div>
        </div>
      </div>
    `;

    // Get references to UI elements
    this.toggleButton = document.getElementById('toggle-training');
    this.instructionsButton = document.getElementById('instructions-button');
    this.instructionsModal = document.getElementById('instructions-modal');
    this.instructionsClose = document.getElementById('instructions-close');
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

    // Initialize training parameter inputs
    this.initializeTrainingParams();
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
    if (this.toggleButton) {
      this.toggleButton.addEventListener('click', () => {
        this.toggleTraining();
      });
    }

    // Instructions modal
    if (this.instructionsButton) {
      this.instructionsButton.addEventListener('click', () => {
        if (this.instructionsModal) {
          this.instructionsModal.style.display = 'block';
        }
      });
    }

    if (this.instructionsClose) {
      this.instructionsClose.addEventListener('click', () => {
        if (this.instructionsModal) {
          this.instructionsModal.style.display = 'none';
        }
      });
    }

    // Close modal when clicking outside of it
    if (this.instructionsModal) {
      this.instructionsModal.addEventListener('click', (e) => {
        if (e.target === this.instructionsModal) {
          this.instructionsModal.style.display = 'none';
        }
      });
    }

    // Close modal with Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.instructionsModal && this.instructionsModal.style.display === 'block') {
        this.instructionsModal.style.display = 'none';
      }
    });

    // Instructions accordion functionality
    if (this.instructionsModal) {
      const sections = this.instructionsModal.querySelectorAll('.instructions-section');
      sections.forEach((section) => {
        const header = section.querySelector('.instructions-section-header');
        if (header) {
          header.addEventListener('click', () => {
            const isExpanded = section.classList.contains('expanded');
            
            // Collapse all sections
            sections.forEach((s) => s.classList.remove('expanded'));
            
            // Expand clicked section if it wasn't already expanded
            if (!isExpanded) {
              section.classList.add('expanded');
            }
          });
        }
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
    const html = [`<table style="width:100%; font-size:12px;"><thead><tr><th style="text-align:center;">Label</th><th>Type</th><th>Weight</th><th></th></tr></thead><tbody>`];
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
      
      trainingSession.onRolloutStart = () => {
        this.updateStatus('Collecting experience...');
      };
      
      trainingSession.onTrainingProgress = (metrics) => {
        this.updateStatus('Training...');
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
   * Toggle training (start/pause/resume)
   */
  async toggleTraining() {
    if (!this.trainingSession) {
      console.error('No training session available');
      return;
    }

    // If not training, start training
    if (!this.trainingSession.isTraining) {
      await this.startTraining();
    } else if (this.trainingSession.isPaused) {
      // If paused, resume
      this.pauseTraining(); // This will resume since it's already paused
    } else {
      // If training, pause
      this.pauseTraining();
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
      // Update training session with current UI parameters before starting
      const params = this.getTrainingParams();
      await this.trainingSession.updateTrainingParams(params);
      
      await this.trainingSession.start();
      this.updateButtonStates('training');
      this.updateStatus('Collecting experience...');
      
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
      this.updateStatus('Collecting experience...');
    } else {
      // Pause training
      this.trainingSession.pause();
      this.updateButtonStates('paused');
      this.updateStatus('Paused');
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
      ready: { toggle: false, toggleText: 'Start Training', stop: true },
      training: { toggle: false, toggleText: 'Pause', stop: false },
      paused: { toggle: false, toggleText: 'Resume', stop: false },
      stopped: { toggle: false, toggleText: 'Start Training', stop: true }
    };

    const buttonState = states[state] || states.ready;
    
    if (this.toggleButton) {
      this.toggleButton.disabled = buttonState.toggle;
      this.toggleButton.textContent = buttonState.toggleText;
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
    let progress = Math.min((gamesCompleted / maxGames) * 100 + 1, 100);
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
    this.chart.data.labels.push(`Rollout ${this.batchNumber}`);
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
    this.gameLengthChart.data.labels.push(`Rollout ${batchNumber}`);
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
    this.winRateChart.data.labels.push(`Rollout ${batchNumber}`);
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
    this.entropyChart.data.labels.push(`Rollout ${batchNumber}`);
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
    this.policyLossChart.data.labels.push(`Rollout ${batchNumber}`);
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
    this.valueLossChart.data.labels.push(`Rollout ${batchNumber}`);
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
   * Load training parameters from localStorage or return defaults
   */
  loadTrainingParams() {
    const storageKey = 'saber_rl_training_params';
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        return this.mergeWithDefaults(parsed);
      }
    } catch (e) {
      // ignore
    }
    return this.getDefaultParams();
  }

  /**
   * Get default parameters from GameConfig
   */
  getDefaultParams() {
    // Use the snapshot captured on construction time to avoid picking up modified runtime values
    return JSON.parse(JSON.stringify(this.initialDefaults));
  }

  /**
   * Merge parsed params with defaults to ensure all fields exist
   */
  mergeWithDefaults(parsed) {
    const defaults = this.getDefaultParams();
    return {
      ...defaults,
      ...parsed,
      rewards: {
        ...defaults.rewards,
        ...(parsed.rewards || {})
      }
    };
  }

  /**
   * Save training parameters to localStorage
   */
  saveTrainingParams() {
    const storageKey = 'saber_rl_training_params';
    try {
      localStorage.setItem(storageKey, JSON.stringify(this.trainingParams));
    } catch (e) {
      // ignore
    }
  }

  /**
   * Initialize training parameter inputs with values and bind change handlers
   */
  initializeTrainingParams() {
    const params = this.trainingParams;
    
    // Set input values
    const setValue = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };
    
    setValue('param-learningRate', params.learningRate);
    setValue('param-miniBatchSize', params.miniBatchSize);
    setValue('param-epochs', params.epochs);
    setValue('param-discountFactor', params.discountFactor);
    setValue('param-clipRatio', params.clipRatio);
    setValue('param-valueLossCoeff', params.valueLossCoeff);
    setValue('param-entropyCoeff', params.entropyCoeff);
    setValue('param-maxGradNorm', params.maxGradNorm);
    setValue('param-gaeLambda', params.gaeLambda);
    setValue('param-reward-win', params.rewards.win);
    setValue('param-reward-loss', params.rewards.loss);
    setValue('param-reward-tie', params.rewards.tie);
    setValue('param-reward-timePenalty', params.rewards.timePenalty);
    setValue('param-reward-maxGameLength', params.rewards.maxGameLength);
    setValue('param-reward-distancePenaltyFactor', params.rewards.distancePenaltyFactor);
    setValue('param-reward-deltaDistanceRewardFactor', params.rewards.deltaDistanceRewardFactor);

    // Bind change handlers
    const bindChange = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', fn);
    };
    
    bindChange('param-learningRate', (e) => {
      this.trainingParams.learningRate = Number(e.target.value);
      this.saveTrainingParams();
    });
    bindChange('param-miniBatchSize', (e) => {
      this.trainingParams.miniBatchSize = Number(e.target.value);
      this.saveTrainingParams();
    });
    bindChange('param-epochs', (e) => {
      this.trainingParams.epochs = Number(e.target.value);
      this.saveTrainingParams();
    });
    bindChange('param-discountFactor', (e) => {
      this.trainingParams.discountFactor = Number(e.target.value);
      this.saveTrainingParams();
    });
    bindChange('param-clipRatio', (e) => {
      this.trainingParams.clipRatio = Number(e.target.value);
      this.saveTrainingParams();
    });
    bindChange('param-valueLossCoeff', (e) => {
      this.trainingParams.valueLossCoeff = Number(e.target.value);
      this.saveTrainingParams();
    });
    bindChange('param-entropyCoeff', (e) => {
      this.trainingParams.entropyCoeff = Number(e.target.value);
      this.saveTrainingParams();
    });
    bindChange('param-maxGradNorm', (e) => {
      this.trainingParams.maxGradNorm = Number(e.target.value);
      this.saveTrainingParams();
    });
    bindChange('param-gaeLambda', (e) => {
      this.trainingParams.gaeLambda = Number(e.target.value);
      this.saveTrainingParams();
    });
    bindChange('param-reward-win', (e) => {
      this.trainingParams.rewards.win = Number(e.target.value);
      this.saveTrainingParams();
    });
    bindChange('param-reward-loss', (e) => {
      this.trainingParams.rewards.loss = Number(e.target.value);
      this.saveTrainingParams();
    });
    bindChange('param-reward-tie', (e) => {
      this.trainingParams.rewards.tie = Number(e.target.value);
      this.saveTrainingParams();
    });
    bindChange('param-reward-timePenalty', (e) => {
      this.trainingParams.rewards.timePenalty = Number(e.target.value);
      this.saveTrainingParams();
    });
    bindChange('param-reward-maxGameLength', (e) => {
      this.trainingParams.rewards.maxGameLength = Number(e.target.value);
      this.saveTrainingParams();
    });
    bindChange('param-reward-distancePenaltyFactor', (e) => {
      this.trainingParams.rewards.distancePenaltyFactor = Number(e.target.value);
      this.saveTrainingParams();
    });
    bindChange('param-reward-deltaDistanceRewardFactor', (e) => {
      this.trainingParams.rewards.deltaDistanceRewardFactor = Number(e.target.value);
      this.saveTrainingParams();
    });

    const resetBtn = document.getElementById('reset-training-params');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.trainingParams = this.getDefaultParams();
        this.saveTrainingParams();
        this.initializeTrainingParams();
      });
    }
  }

  /**
   * Get current training parameters (for passing to TrainingSession)
   */
  getTrainingParams() {
    return { ...this.trainingParams };
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
