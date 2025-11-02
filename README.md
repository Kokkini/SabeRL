# RL experience collection
- There are N parallel headless games for collecting experience, each corresponding to a rollout, each run on a separate web worker. This is the main experience collection flow for each rollout:
    - A game object:
        - start(): initialize the game and return the initial observation
        - update(): take in a deltaTime and an action and return a new observation, done and a reward
    - An agent object:
        - update(): take in a deltaTime and the current observation and return an action, value (if has critic), logProb
    - Main loop pseudo code:
        ```jsx
        rolloutBuffer = []
        rolloutMaxLength = 2048 //number of experience to collect in a rollout
        deltaTime = 0.05 //example fixed value
        actionIntervalSeconds = 0.2 //time between every agent's action
        timeTillAction = 0
        observation = headlessGame.start()
        action, value, logProb = null, null, null
        done = false
        
        while rolloutBuffer.size() < rolloutMaxLength:
            action, value, logProb  = agent.act(observation)
            timeTillAction = actionIntervalSeconds
            rewardDuringSkip = 0
            while timeTillAction > 0:
                newObservation, done, reward = headlessGame.update(action, deltaTime)
                rewardDuringSkip += reward
                timeTilAction -= deltaTime
                if done: break
            
            experience = (observation, action, total_reward, done, value, logProb)
            rolloutBuffer.append(experience)
            observation = newObservation
            if done: observation = headlessGame.start()
        
        // After rollout ends. Compute last_value for bootstrapping advantages later
        if done:
            lastValue = 0.0  # episode ended naturally, no bootstrap
        else:
            lastValue = agent.getValue(observation)  //bootstrap from ongoing episode
        // send the rolloutBuffer and the lastValue back to the main training thread
        ```
- The main training thread will wait until all rollouts finish then do PPO training on all rollout experiences.
- After this training step, start new rollouts on all workers with the latest weight