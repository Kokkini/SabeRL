# Tasks: Base Game Arena

**Input**: Design documents from `/specs/001-base-game-arena/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are OPTIONAL - not explicitly requested in the feature specification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Browser-based RL**: `src/`, `public/`, `tests/` (single project structure)
- Paths shown below assume single project - adjust based on plan.md structure

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Create project structure per implementation plan
- [x] T002 Initialize JavaScript project with HTML5 Canvas dependencies
- [x] T003 [P] Create public directory structure with index.html and styles.css
- [x] T004 [P] Create src directory structure with game/, config/, utils/ folders
- [x] T005 [P] Create tests directory structure with unit/ and integration/ folders

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T006 Create game configuration file in src/config/config.js
- [x] T007 [P] Create Vector2 utility class in src/utils/Vector2.js
- [x] T008 [P] Create MathUtils utility class in src/utils/MathUtils.js
- [x] T009 Create main entry point in src/main.js
- [x] T010 Create HTML5 Canvas setup in public/index.html
- [x] T011 Create basic CSS styling in public/styles.css

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Play Arena Combat Game (Priority: P1) 🎯 MVP

**Goal**: Core gameplay experience with human player movement, saber rotation, and basic collision detection

**Independent Test**: Launch the game, move character with WASD, and have rotating saber make contact with opponent to achieve victory

### Implementation for User Story 1

- [x] T012 [P] [US1] Create Player entity class in src/game/entities/Player.js
- [x] T013 [P] [US1] Create Saber entity class in src/game/entities/Saber.js
- [x] T014 [P] [US1] Create Arena entity class in src/game/entities/Arena.js
- [x] T015 [US1] Create InputSystem class in src/game/systems/InputSystem.js
- [x] T016 [US1] Create MovementSystem class in src/game/systems/MovementSystem.js
- [x] T017 [US1] Create CollisionSystem class in src/game/systems/CollisionSystem.js
- [x] T018 [US1] Create RenderSystem class in src/game/systems/RenderSystem.js
- [x] T019 [US1] Create Game class in src/game/Game.js
- [x] T020 [US1] Create GameLoop class in src/game/GameLoop.js
- [x] T021 [US1] Integrate all systems in main.js for basic gameplay

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Human vs AI Gameplay (Priority: P2)

**Goal**: Single-player gameplay with AI opponent that moves randomly

**Independent Test**: Start game with AI opponent, observe random movement behavior, and successfully win or lose against AI

### Implementation for User Story 2

- [ ] T022 [P] [US2] Create AI entity class in src/game/entities/AI.js
- [ ] T023 [US2] Update MovementSystem to handle AI movement in src/game/systems/MovementSystem.js
- [ ] T024 [US2] Update Game class to initialize AI opponent in src/game/Game.js
- [ ] T025 [US2] Update RenderSystem to render AI opponent in src/game/systems/RenderSystem.js
- [ ] T026 [US2] Update CollisionSystem to handle AI collisions in src/game/systems/CollisionSystem.js
- [ ] T027 [US2] Integrate AI gameplay in main.js

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Arena Boundaries and Collision (Priority: P3)

**Goal**: Movement constraints and boundary detection to prevent players from leaving playable area

**Independent Test**: Attempt to move character to arena edges and verify they cannot move beyond boundaries

### Implementation for User Story 3

- [ ] T028 [US3] Update MovementSystem to enforce arena boundaries in src/game/systems/MovementSystem.js
- [ ] T029 [US3] Update Arena class to provide boundary validation in src/game/entities/Arena.js
- [ ] T030 [US3] Update CollisionSystem to handle boundary collisions in src/game/systems/CollisionSystem.js
- [ ] T031 [US3] Update RenderSystem to visualize arena boundaries in src/game/systems/RenderSystem.js
- [ ] T032 [US3] Test boundary enforcement with both human and AI players

**Checkpoint**: All user stories should now be independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T033 [P] Add responsive scaling for different screen sizes in src/game/systems/RenderSystem.js
- [ ] T034 [P] Add game state management and restart functionality in src/game/Game.js
- [ ] T035 [P] Add tie game detection and handling in src/game/systems/CollisionSystem.js
- [ ] T036 [P] Add performance optimization and frame rate management in src/game/GameLoop.js
- [ ] T037 [P] Add error handling and graceful degradation in src/main.js
- [ ] T038 [P] Add game UI and status display in src/game/systems/RenderSystem.js
- [ ] T039 [P] Add configuration validation and fallbacks in src/config/config.js
- [ ] T040 [P] Add browser compatibility checks and feature detection in src/main.js

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Depends on US1 entities and systems
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Depends on US1 and US2 systems

### Within Each User Story

- Entities before systems
- Systems before game integration
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, user stories can start in parallel (if team capacity allows)
- Entities within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch all entities for User Story 1 together:
Task: "Create Player entity class in src/game/entities/Player.js"
Task: "Create Saber entity class in src/game/entities/Saber.js"
Task: "Create Arena entity class in src/game/entities/Arena.js"

# Launch all systems for User Story 1 together (after entities):
Task: "Create InputSystem class in src/game/systems/InputSystem.js"
Task: "Create MovementSystem class in src/game/systems/MovementSystem.js"
Task: "Create CollisionSystem class in src/game/systems/CollisionSystem.js"
Task: "Create RenderSystem class in src/game/systems/RenderSystem.js"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
