### Goal
Replace the current system with a simpler design that clearly separates headless game state updates from input/decision making and from rendering. The game core is the single source of truth and is agnostic to who decides actions (human, AI) and how input is collected. It exposes a single-step API that applies an external action mask and returns an observation, reward, done, and outcome. Rendering is a separate concern.

### Core Concepts and Data
- **ActionMask**: `[boolean, boolean, boolean, boolean]` representing [W, A, S, D] pressed.
- **Observation**: Minimal state for the agent (player/opponent positions, angles, angular velocities, etc.).
- **Outcome**: `{ isTie: boolean, winnerId: string | null }` set only on terminal steps; null otherwise.
- **Reward Calculation**: Owned by `GameCore`, configurable via `GameConfig` (time penalties, distance shaping, terminal rewards).

### Class Overview (Replacement, not a wrapper)

1) GameCore (Headless, deterministic) — replaces legacy Game.update/updateRollout logic
- Responsibilities:
  - Own arena, physics, entities (agnostic to roles) and systems (movement, collision).
  - Single-step API: `step(actionMask, deltaTime)` → returns `{ observation, reward, done, outcome }`.
  - Maintain episode state ('playing'/'tie'/'gameOver'), time, stepCount.
  - Apply training rules (timeouts, reward shaping), but remain agnostic to who produced the actionMask.
- Key methods:
  - `reset(): Observation` — reset entities and timers, return initial observation.
  - `step(actionMask: boolean[4], deltaTime: number): { observation, reward, done, outcome }` — apply action, advance physics, collisions, rewards. Returns observation after the step.
  - `isDone(): boolean` — terminal status.
- Main properties:
  - `arena: Arena`
  - `entities: Entity[]` (generic collection; no role assumptions)
  - `movementSystem: MovementSystem`
  - `collisionSystem: CollisionSystem`
  - `episodeState: 'playing' | 'tie' | 'gameOver' | 'waiting'`
  - `stepCount: number`
  - `startTimeMs: number`, `endTimeMs: number`
  - `config: GameConfig`
  - Reward parameters (from config):
    - `timePenaltyPerSec: number`
    - `distancePenaltyFactorPerSec: number`
    - `deltaDistanceRewardFactorPerSec: number`
    - `maxGameLengthSec: number`
  - Internal methods:
    - `computeStepReward(ctx): number`
    - `computeTerminalReward(ctx): number`
    - `shouldTimeout(ctx): boolean`

2) PlayerController (Interface) — produces ActionMask
- Responsibilities:
  - Decide the next actionMask given the latest observation and elapsed time.
  - Stateless or stateful, but not coupled to GameCore.
- Method:
  - `decide(observation: Observation, deltaTime: number): boolean[4]`
- Main properties (implementations):
  - `id: string`
  - `lastActionMask: boolean[4]`
  - `rng?: RandomSource`

3) HumanController implements PlayerController
- Responsibilities:
  - Wrap browser input (keyboard) and convert current key states to actionMask.
- Main properties:
  - `keyState: Map<string, boolean>` (e.g., KeyW/KeyA/KeyS/KeyD)
  - `bindings: { up: string, left: string, down: string, right: string }`

4) PolicyController implements PlayerController
- Responsibilities:
  - Use a neural network policy to sample a Bernoulli mask from per-action probabilities.
  - Optionally return value estimates and log-probs for training, but the core interface returns only the mask.
- Main properties:
  - `policyModel: tf.LayersModel` (produces per-action logits)
  - `valueModel?: tf.LayersModel`
  - `lastProbs: number[4]`
  - `lastLogProb: number` (summed Bernoulli log-prob of sampled mask)
  - `id: string`

5) Renderer (Optional) — independent from stepping
- Responsibilities:
  - Draw the current GameCore state to a canvas.
  - No game logic; pure presentation.
- Methods:
  - `render(gameCore: GameCore): void`
- Main properties:
  - `canvas: HTMLCanvasElement`
  - `ctx: CanvasRenderingContext2D`
  - `theme: { colors, lineWidths, fonts }`

6) Loops (Orchestrators) — use GameCore directly
- TrainingRolloutRunner (Headless)
  - Start: call `gameCore.reset()` to get initial `observation`, then ask `policyController.decide(observation, dt)` for first `actionMask`.
  - Loop: call `gameCore.step(actionMask, dt)` to get `{ observation, reward, done, outcome }`, ask `policyController.decide(observation, dt)` for next `actionMask`, push transitions to buffer. If done, call `reset()` to restart.
  - No rendering; uses fixed `dt` and applies yielding policy for responsiveness.
- LiveGameLoop (Rendered)
  - Loop: ask controller (Human or Policy) for `actionMask`, call `gameCore.step(mask, dt)`; then call `renderer.render(gameCore)`.
  - Uses real-time `dt` from `requestAnimationFrame`.
- Main properties:
  - TrainingRolloutRunner:
    - `dt: number`
    - `maxSteps: number`
    - `yieldInterval: number`
    - `buffer: Experience[]`
- LiveGameLoop:
  - `running: boolean`
  - `lastTimestampMs: number`
  - `targetFPS?: number`

### Dependencies and Direction
- GameCore depends only on:
  - Entities/systems (arena, movement, collision),
  - Config (including reward parameters).
- Controllers depend on:
  - Observation schema and possibly Config.
- Renderer depends on:
  - GameCore read-only state.
- Loops depend on:
  - GameCore + a PlayerController (+ Renderer for live loop).

### Proposed Public APIs (authoritative, to replace legacy calls)

```ts
// GameCore.ts
class GameCore {
  reset(): Observation
  step(actionMask: boolean[4], deltaTime: number): {
    observation: Observation,
    reward: number,
    done: boolean,
    outcome: { isTie: boolean, winnerId: string | null } | null
  }
  isDone(): boolean
}

// PlayerController.ts
interface PlayerController {
  decide(observation: Observation, deltaTime: number): boolean[4]
}

// TrainingRolloutRunner.ts
class TrainingRolloutRunner {
  runRollout(core: GameCore, controller: PlayerController, dt: number, maxSteps: number): Experience[]
}

// LiveGameLoop.ts
class LiveGameLoop {
  start(core: GameCore, controller: PlayerController, renderer: Renderer): void
  stop(): void
}
```

### Migration Notes (Replace, don’t wrap)
- Delete legacy `Game.update(...)` and fold its physics/collision/render sequencing into `GameCore.step(...)` (headless) and `Renderer.render(...)` (visual). No dual paths.
- Delete legacy `Game.updateRollout(...)`; the new `GameCore.step(...)` is the single stepping function used by both training and live loops.
- Remove input handling from the game; input now lives solely in controllers (HumanController/PolicyController).
- Remove rendering from the game; rendering is done only by `Renderer.render(gameCore)`.
- PPO sampling/log-prob/entropy remains in PolicyController/Trainer; `GameCore` never touches PPO-specific concerns.

### Eliminate Legacy Paths
- No `InputSystem` calls inside the game core.
- No direct `PolicyAgent` calls inside the game core.
- No `RenderSystem` calls inside the game core.
- A single timing model for stepping: all loops call `GameCore.step(mask, dt)`; live loop timing is external (RAF), training uses fixed dt.

### Simplicity Principles
- One stepping function (`step`) for all modes (live/training/tests).
- One state owner (`GameCore`) for arena/entities/physics.
- Controllers and renderer are pure consumers/producers at the edges.
- Config-driven reward logic inside `GameCore` keeps it small and testable.

### Benefits
- Deterministic, testable game stepping for both training and live play.
- Swap controllers without changing game logic (human, scripted AI, policy).
- Rendering/UI performance and policy training decoupled from core game simulation.

