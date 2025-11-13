/**
 * ProgressChart - Real-time chart component for training progress visualization
 * Provides interactive charts for monitoring training metrics and performance
 */

export class ProgressChart {
  constructor(canvasId, options = {}) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      throw new Error(`Canvas element with id '${canvasId}' not found`);
    }

    this.options = {
      type: options.type || 'line',
      maxDataPoints: options.maxDataPoints || 100,
      updateInterval: options.updateInterval || 1000,
      animationDuration: options.animationDuration || 500,
      responsive: options.responsive !== false,
      ...options
    };

    this.chart = null;
    this.data = {
      labels: [],
      datasets: []
    };

    this.isInitialized = false;
    this.updateTimer = null;
  }

  /**
   * Initialize the chart
   * @param {Object} config - Chart configuration
   */
  initialize(config = {}) {
    if (this.isInitialized) {
      return;
    }

    try {
      const defaultConfig = {
        type: this.options.type,
        data: this.data,
        options: {
          responsive: this.options.responsive,
          maintainAspectRatio: false,
          animation: {
            duration: this.options.animationDuration
          },
          scales: {
            x: {
              type: 'linear',
              position: 'bottom',
              title: {
                display: true,
                text: 'Games'
              }
            },
            y: {
              title: {
                display: true,
                text: 'Value'
              }
            }
          },
          plugins: {
            legend: {
              display: true,
              position: 'top'
            },
            tooltip: {
              enabled: true,
              mode: 'index',
              intersect: false
            }
          },
          interaction: {
            mode: 'nearest',
            axis: 'x',
            intersect: false
          }
        }
      };

      const chartConfig = this.mergeConfig(defaultConfig, config);
      this.chart = new Chart(this.canvas.getContext('2d'), chartConfig);
      this.isInitialized = true;

      console.log('ProgressChart initialized');
    } catch (error) {
      console.error('Failed to initialize ProgressChart:', error);
    }
  }

  /**
   * Add dataset to chart
   * @param {Object} dataset - Dataset configuration
   */
  addDataset(dataset) {
    const defaultDataset = {
      label: 'Dataset',
      data: [],
      borderColor: this.getRandomColor(),
      backgroundColor: this.getRandomColor(0.1),
      fill: false,
      tension: 0.1,
      pointRadius: 2,
      pointHoverRadius: 4
    };

    const mergedDataset = { ...defaultDataset, ...dataset };
    this.data.datasets.push(mergedDataset);
    
    if (this.chart) {
      this.chart.update('none');
    }
  }

  /**
   * Add data point to dataset
   * @param {number} x - X value (usually game number)
   * @param {number} y - Y value
   * @param {number} datasetIndex - Dataset index (default: 0)
   */
  addDataPoint(x, y, datasetIndex = 0) {
    if (datasetIndex >= this.data.datasets.length) {
      console.warn(`Dataset index ${datasetIndex} out of range`);
      return;
    }

    const dataset = this.data.datasets[datasetIndex];
    dataset.data.push({ x, y });

    // Keep only recent data points
    if (dataset.data.length > this.options.maxDataPoints) {
      dataset.data.shift();
    }

    // Update labels if needed
    if (!this.data.labels.includes(x)) {
      this.data.labels.push(x);
      if (this.data.labels.length > this.options.maxDataPoints) {
        this.data.labels.shift();
      }
    }

    this.updateChart();
  }

  /**
   * Add multiple data points
   * @param {Array} dataPoints - Array of {x, y} objects
   * @param {number} datasetIndex - Dataset index
   */
  addDataPoints(dataPoints, datasetIndex = 0) {
    for (const point of dataPoints) {
      this.addDataPoint(point.x, point.y, datasetIndex);
    }
  }

  /**
   * Update chart with new data
   * @param {Object} newData - New data object
   */
  updateData(newData) {
    if (newData.labels) {
      this.data.labels = newData.labels;
    }

    if (newData.datasets) {
      this.data.datasets = newData.datasets;
    }

    this.updateChart();
  }

  /**
   * Update chart display
   * @param {string} mode - Update mode ('none', 'show', 'hide', 'reset')
   */
  updateChart(mode = 'show') {
    if (this.chart) {
      this.chart.update(mode);
    }
  }

  /**
   * Clear all data
   */
  clear() {
    this.data.labels = [];
    this.data.datasets.forEach(dataset => {
      dataset.data = [];
    });
    this.updateChart();
  }

  /**
   * Clear specific dataset
   * @param {number} datasetIndex - Dataset index to clear
   */
  clearDataset(datasetIndex) {
    if (datasetIndex >= 0 && datasetIndex < this.data.datasets.length) {
      this.data.datasets[datasetIndex].data = [];
      this.updateChart();
    }
  }

  /**
   * Set dataset visibility
   * @param {number} datasetIndex - Dataset index
   * @param {boolean} visible - Visibility state
   */
  setDatasetVisibility(datasetIndex, visible) {
    if (this.chart && datasetIndex >= 0 && datasetIndex < this.data.datasets.length) {
      this.chart.setDatasetVisibility(datasetIndex, visible);
      this.chart.update();
    }
  }

  /**
   * Get chart data
   * @returns {Object} Chart data
   */
  getData() {
    return { ...this.data };
  }

  /**
   * Export chart as image
   * @param {string} format - Image format ('png', 'jpeg')
   * @returns {string} Data URL
   */
  exportAsImage(format = 'png') {
    if (this.chart) {
      return this.chart.toBase64Image(format);
    }
    return null;
  }

  /**
   * Resize chart
   * @param {number} width - New width
   * @param {number} height - New height
   */
  resize(width, height) {
    if (this.chart) {
      this.chart.resize(width, height);
    }
  }

  /**
   * Get random color for datasets
   * @param {number} alpha - Alpha value (0-1)
   * @returns {string} Color string
   */
  getRandomColor(alpha = 1) {
    const colors = [
      `rgba(74, 158, 255, ${alpha})`,    // Blue
      `rgba(255, 107, 107, ${alpha})`,   // Red
      `rgba(76, 175, 80, ${alpha})`,     // Green
      `rgba(255, 193, 7, ${alpha})`,     // Yellow
      `rgba(156, 39, 176, ${alpha})`,    // Purple
      `rgba(255, 152, 0, ${alpha})`,     // Orange
      `rgba(0, 188, 212, ${alpha})`,     // Cyan
      `rgba(244, 67, 54, ${alpha})`      // Deep Red
    ];
    
    return colors[Math.floor(Math.random() * colors.length)];
  }

  /**
   * Merge configuration objects
   * @param {Object} defaultConfig - Default configuration
   * @param {Object} userConfig - User configuration
   * @returns {Object} Merged configuration
   */
  mergeConfig(defaultConfig, userConfig) {
    const merged = { ...defaultConfig };
    
    for (const key in userConfig) {
      if (typeof userConfig[key] === 'object' && userConfig[key] !== null && !Array.isArray(userConfig[key])) {
        merged[key] = this.mergeConfig(merged[key] || {}, userConfig[key]);
      } else {
        merged[key] = userConfig[key];
      }
    }
    
    return merged;
  }

  /**
   * Create reward progress chart
   * @param {Object} options - Chart options
   */
  createRewardChart(options = {}) {
    const config = {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Average Reward',
            data: [],
            borderColor: 'rgba(74, 158, 255, 1)',
            backgroundColor: 'rgba(74, 158, 255, 0.1)',
            fill: true,
            tension: 0.1
          },
          {
            label: 'Min Reward',
            data: [],
            borderColor: 'rgba(255, 107, 107, 1)',
            backgroundColor: 'rgba(255, 107, 107, 0.1)',
            fill: false,
            tension: 0.1
          },
          {
            label: 'Max Reward',
            data: [],
            borderColor: 'rgba(76, 175, 80, 1)',
            backgroundColor: 'rgba(76, 175, 80, 0.1)',
            fill: false,
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
    };

    this.initialize(this.mergeConfig(config, options));
  }

  /**
   * Create win rate chart
   * @param {Object} options - Chart options
   */
  createWinRateChart(options = {}) {
    const config = {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Win Rate',
            data: [],
            borderColor: 'rgba(76, 175, 80, 1)',
            backgroundColor: 'rgba(76, 175, 80, 0.1)',
            fill: true,
            tension: 0.1,
            yAxisID: 'y'
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
            type: 'linear',
            display: true,
            position: 'left',
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
    };

    this.initialize(this.mergeConfig(config, options));
  }

  /**
   * Dispose of chart resources
   */
  dispose() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
    
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    
    this.isInitialized = false;
  }
}
