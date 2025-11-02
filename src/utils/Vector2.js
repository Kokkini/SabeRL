/**
 * Vector2 - 2D vector class for game mathematics
 * Lightweight replacement for TensorFlow tensors in vector operations
 * API designed to be compatible with Victor.js for easy migration if needed
 */

export class Vector2 {
  /**
   * Create a new Vector2
   * @param {number} x - X component (default: 0)
   * @param {number} y - Y component (default: 0)
   */
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  /**
   * Create a copy of this vector
   * @returns {Vector2} New vector with same values
   */
  clone() {
    return new Vector2(this.x, this.y);
  }

  /**
   * Copy values from another vector
   * @param {Vector2} vec - Vector to copy from
   * @returns {Vector2} This vector for chaining
   */
  copy(vec) {
    this.x = vec.x;
    this.y = vec.y;
    return this;
  }

  /**
   * Set vector components
   * @param {number} x - X component
   * @param {number} y - Y component
   * @returns {Vector2} This vector for chaining
   */
  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }

  /**
   * Add another vector to this vector
   * @param {Vector2} vec - Vector to add
   * @returns {Vector2} This vector for chaining
   */
  add(vec) {
    this.x += vec.x;
    this.y += vec.y;
    return this;
  }

  /**
   * Add another vector and return a new vector
   * @param {Vector2} vec - Vector to add
   * @returns {Vector2} New vector with result
   */
  addX(vec) {
    return this.clone().add(vec);
  }

  /**
   * Subtract another vector from this vector
   * @param {Vector2} vec - Vector to subtract
   * @returns {Vector2} This vector for chaining
   */
  subtract(vec) {
    this.x -= vec.x;
    this.y -= vec.y;
    return this;
  }

  /**
   * Subtract another vector and return a new vector
   * @param {Vector2} vec - Vector to subtract
   * @returns {Vector2} New vector with result
   */
  subtractX(vec) {
    return this.clone().subtract(vec);
  }

  /**
   * Multiply this vector by a scalar
   * @param {number} scalar - Scalar to multiply by
   * @returns {Vector2} This vector for chaining
   */
  multiplyScalar(scalar) {
    this.x *= scalar;
    this.y *= scalar;
    return this;
  }

  /**
   * Multiply this vector by another vector (component-wise)
   * @param {Vector2} vec - Vector to multiply by
   * @returns {Vector2} This vector for chaining
   */
  multiply(vec) {
    this.x *= vec.x;
    this.y *= vec.y;
    return this;
  }

  /**
   * Divide this vector by a scalar
   * @param {number} scalar - Scalar to divide by
   * @returns {Vector2} This vector for chaining
   */
  divideScalar(scalar) {
    if (scalar !== 0) {
      this.x /= scalar;
      this.y /= scalar;
    }
    return this;
  }

  /**
   * Get the magnitude (length) of this vector
   * @returns {number} Magnitude
   */
  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  /**
   * Get the squared magnitude (length squared) - faster than length()
   * @returns {number} Squared magnitude
   */
  lengthSq() {
    return this.x * this.x + this.y * this.y;
  }

  /**
   * Normalize this vector (make it unit length)
   * @returns {Vector2} This vector for chaining
   */
  normalize() {
    const len = this.length();
    if (len > 0) {
      this.x /= len;
      this.y /= len;
    }
    return this;
  }

  /**
   * Get a normalized copy of this vector
   * @returns {Vector2} New normalized vector
   */
  normalizeX() {
    return this.clone().normalize();
  }

  /**
   * Get the distance to another vector
   * @param {Vector2} vec - Target vector
   * @returns {number} Distance
   */
  distance(vec) {
    const dx = this.x - vec.x;
    const dy = this.y - vec.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Get the squared distance to another vector (faster than distance)
   * @param {Vector2} vec - Target vector
   * @returns {number} Squared distance
   */
  distanceSq(vec) {
    const dx = this.x - vec.x;
    const dy = this.y - vec.y;
    return dx * dx + dy * dy;
  }

  /**
   * Get the dot product with another vector
   * @param {Vector2} vec - Vector to dot with
   * @returns {number} Dot product
   */
  dot(vec) {
    return this.x * vec.x + this.y * vec.y;
  }

  /**
   * Get the angle of this vector in radians
   * @returns {number} Angle in radians
   */
  angle() {
    return Math.atan2(this.y, this.x);
  }

  /**
   * Set this vector from an angle and magnitude
   * @param {number} angle - Angle in radians
   * @param {number} magnitude - Magnitude (default: 1)
   * @returns {Vector2} This vector for chaining
   */
  fromAngle(angle, magnitude = 1) {
    this.x = Math.cos(angle) * magnitude;
    this.y = Math.sin(angle) * magnitude;
    return this;
  }

  /**
   * Rotate this vector by an angle (in radians)
   * @param {number} angle - Angle to rotate by (in radians)
   * @returns {Vector2} This vector for chaining
   */
  rotate(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = this.x * cos - this.y * sin;
    const y = this.x * sin + this.y * cos;
    this.x = x;
    this.y = y;
    return this;
  }

  /**
   * Get a rotated copy of this vector
   * @param {number} angle - Angle to rotate by (in radians)
   * @returns {Vector2} New rotated vector
   */
  rotateX(angle) {
    return this.clone().rotate(angle);
  }

  /**
   * Limit the magnitude of this vector
   * @param {number} max - Maximum magnitude
   * @returns {Vector2} This vector for chaining
   */
  limit(max) {
    const len = this.length();
    if (len > max) {
      this.normalize().multiplyScalar(max);
    }
    return this;
  }

  /**
   * Invert this vector (multiply by -1)
   * @returns {Vector2} This vector for chaining
   */
  invert() {
    this.x = -this.x;
    this.y = -this.y;
    return this;
  }

  /**
   * Get an inverted copy of this vector
   * @returns {Vector2} New inverted vector
   */
  invertX() {
    return this.clone().invert();
  }

  /**
   * Check if this vector equals another vector
   * @param {Vector2} vec - Vector to compare with
   * @param {number} epsilon - Tolerance for comparison (default: 0.0001)
   * @returns {boolean} True if vectors are equal
   */
  equals(vec, epsilon = 0.0001) {
    return Math.abs(this.x - vec.x) < epsilon && Math.abs(this.y - vec.y) < epsilon;
  }

  /**
   * Check if this vector is zero
   * @param {number} epsilon - Tolerance for comparison (default: 0.0001)
   * @returns {boolean} True if vector is zero
   */
  isZero(epsilon = 0.0001) {
    return this.lengthSq() < epsilon * epsilon;
  }

  /**
   * Convert to array [x, y]
   * @returns {Array<number>} Array representation
   */
  toArray() {
    return [this.x, this.y];
  }

  /**
   * Create Vector2 from array [x, y]
   * @param {Array<number>} arr - Array [x, y]
   * @returns {Vector2} New vector
   */
  static fromArray(arr) {
    return new Vector2(arr[0] || 0, arr[1] || 0);
  }

  /**
   * Convert to object {x, y}
   * @returns {Object} Object representation
   */
  toObject() {
    return { x: this.x, y: this.y };
  }

  /**
   * Create Vector2 from object {x, y}
   * @param {Object} obj - Object with x and y properties
   * @returns {Vector2} New vector
   */
  static fromObject(obj) {
    return new Vector2(obj.x || 0, obj.y || 0);
  }

  /**
   * Convert from TensorFlow tensor (for migration)
   * @param {tf.Tensor} tensor - TensorFlow tensor with shape [1, 2]
   * @returns {Vector2} New vector
   */
  static fromTensor(tensor) {
    const data = tensor.dataSync();
    return new Vector2(data[0], data[1]);
  }

  /**
   * Linear interpolation between two vectors
   * @param {Vector2} vec - Target vector
   * @param {number} t - Interpolation factor (0-1)
   * @returns {Vector2} This vector for chaining
   */
  lerp(vec, t) {
    this.x += (vec.x - this.x) * t;
    this.y += (vec.y - this.y) * t;
    return this;
  }

  /**
   * String representation
   * @returns {string} String representation
   */
  toString() {
    return `Vector2(${this.x.toFixed(2)}, ${this.y.toFixed(2)})`;
  }
}

/**
 * Convenience factory functions
 */

/**
 * Create a vector from angle and magnitude
 * @param {number} angle - Angle in radians
 * @param {number} magnitude - Magnitude (default: 1)
 * @returns {Vector2} New vector
 */
export function vectorFromAngle(angle, magnitude = 1) {
  return new Vector2(Math.cos(angle) * magnitude, Math.sin(angle) * magnitude);
}

/**
 * Create a zero vector
 * @returns {Vector2} Zero vector
 */
export function vectorZero() {
  return new Vector2(0, 0);
}

/**
 * Create a unit vector (1, 0)
 * @returns {Vector2} Unit vector
 */
export function vectorUnitX() {
  return new Vector2(1, 0);
}

/**
 * Create a unit vector (0, 1)
 * @returns {Vector2} Unit vector
 */
export function vectorUnitY() {
  return new Vector2(0, 1);
}

