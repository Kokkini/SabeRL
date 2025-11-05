import { PlayerController } from './PlayerController.js';

export class HumanController extends PlayerController {
  constructor(id = 'human', bindings = { up: 'KeyW', left: 'KeyA', down: 'KeyS', right: 'KeyD' }) {
    super(id);
    this.bindings = bindings;
    this.keyState = new Map();

    // Bind keyboard listeners (no-ops in headless)
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        this.keyState.set(e.code, true);
      });
      window.addEventListener('keyup', (e) => {
        this.keyState.set(e.code, false);
      });
    }
  }

  decide(observation, deltaTime) {
    const mask = [
      !!this.keyState.get(this.bindings.up),
      !!this.keyState.get(this.bindings.left),
      !!this.keyState.get(this.bindings.down),
      !!this.keyState.get(this.bindings.right)
    ];
    this.lastActionMask = mask;
    return mask;
  }
}


