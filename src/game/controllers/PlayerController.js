/**
 * PlayerController interface (shape via JSDoc)
 * decide(observation, deltaTime) -> boolean[4] mask for [W,A,S,D]
 */
export class PlayerController {
  constructor(id = 'controller') {
    this.id = id;
    this.lastActionMask = [false, false, false, false];
    this.rng = null;
  }

  decide(observation, deltaTime) {
    throw new Error('PlayerController.decide must be implemented by subclasses');
  }
}


