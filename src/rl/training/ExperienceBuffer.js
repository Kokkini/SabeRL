/**
 * ExperienceBuffer - Circular buffer for storing and sampling experiences
 * Manages experience replay for training algorithms
 */

export class ExperienceBuffer {
  constructor(options = {}) {
    this.options = {
      maxSize: options.maxSize || 10000,
      batchSize: options.batchSize || 32,
      ...options
    };

    this.buffer = [];
    this.currentIndex = 0;
    this.size = 0;
  }

  /**
   * Add experience to buffer
   * @param {Object} experience - Experience object
   */
  add(experience) {
    if (this.size < this.options.maxSize) {
      this.buffer.push(experience);
      this.size++;
    } else {
      this.buffer[this.currentIndex] = experience;
      this.currentIndex = (this.currentIndex + 1) % this.options.maxSize;
    }
  }

  /**
   * Add multiple experiences to buffer
   * @param {Array} experiences - Array of experience objects
   */
  addBatch(experiences) {
    for (const experience of experiences) {
      this.add(experience);
    }
  }

  /**
   * Sample a batch of experiences
   * @param {number} batchSize - Size of batch to sample
   * @returns {Array} Sampled experiences
   */
  sample(batchSize = null) {
    const size = batchSize || this.options.batchSize;
    const sampleSize = Math.min(size, this.size);
    
    if (sampleSize === 0) {
      return [];
    }

    const indices = [];
    for (let i = 0; i < sampleSize; i++) {
      indices.push(Math.floor(Math.random() * this.size));
    }

    return indices.map(index => this.buffer[index]);
  }

  /**
   * Get all experiences in buffer
   * @returns {Array} All experiences
   */
  getAll() {
    return this.buffer.slice(0, this.size);
  }

  /**
   * Clear the buffer
   */
  clear() {
    this.buffer = [];
    this.currentIndex = 0;
    this.size = 0;
  }

  /**
   * Get current buffer size
   * @returns {number} Current size
   */
  getSize() {
    return this.size;
  }

  /**
   * Check if buffer is full
   * @returns {boolean} True if full
   */
  isFull() {
    return this.size >= this.options.maxSize;
  }

  /**
   * Get buffer capacity
   * @returns {number} Maximum capacity
   */
  getCapacity() {
    return this.options.maxSize;
  }

  /**
   * Get recent experiences
   * @param {number} count - Number of recent experiences to get
   * @returns {Array} Recent experiences
   */
  getRecent(count) {
    const start = Math.max(0, this.size - count);
    return this.buffer.slice(start, this.size);
  }

  /**
   * Get experiences by time range
   * @param {number} startTime - Start timestamp
   * @param {number} endTime - End timestamp
   * @returns {Array} Experiences in time range
   */
  getByTimeRange(startTime, endTime) {
    return this.buffer
      .slice(0, this.size)
      .filter(exp => exp.timestamp >= startTime && exp.timestamp <= endTime);
  }

  /**
   * Get experiences by game
   * @param {string} gameId - Game identifier
   * @returns {Array} Experiences from specific game
   */
  getByGame(gameId) {
    return this.buffer
      .slice(0, this.size)
      .filter(exp => exp.gameId === gameId);
  }

  /**
   * Get statistics about the buffer
   * @returns {Object} Buffer statistics
   */
  getStats() {
    if (this.size === 0) {
      return {
        size: 0,
        capacity: this.options.maxSize,
        utilization: 0,
        averageReward: 0,
        totalReward: 0
      };
    }

    const experiences = this.buffer.slice(0, this.size);
    const totalReward = experiences.reduce((sum, exp) => sum + (exp.reward || 0), 0);
    const averageReward = totalReward / this.size;

    return {
      size: this.size,
      capacity: this.options.maxSize,
      utilization: this.size / this.options.maxSize,
      averageReward: averageReward,
      totalReward: totalReward
    };
  }

  /**
   * Dispose of buffer resources
   */
  dispose() {
    this.clear();
  }
}
