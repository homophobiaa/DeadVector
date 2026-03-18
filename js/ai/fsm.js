export class FiniteStateMachine {
  constructor({ owner, initialState, states, anyTransitions = [] }) {
    this.owner = owner;
    this.states = states;
    this.anyTransitions = anyTransitions;
    this.currentState = initialState;
    this.stateTime = 0;

    this.states[this.currentState]?.enter?.(this.owner, null, this);
  }

  setState(nextState, context = null) {
    if (!this.states[nextState] || nextState === this.currentState) {
      return false;
    }

    this.states[this.currentState]?.exit?.(this.owner, context, this);
    this.currentState = nextState;
    this.stateTime = 0;
    this.states[this.currentState]?.enter?.(this.owner, context, this);
    return true;
  }

  update(delta, context = null) {
    const previousState = this.currentState;
    const activeState = this.states[this.currentState];

    if (!activeState) {
      return;
    }

    this.stateTime += delta;
    activeState.update?.(this.owner, context, delta, this);

    for (const transition of this.anyTransitions) {
      if (transition.when(this.owner, context, this)) {
        this.setState(transition.to, context);
        return;
      }
    }

    if (previousState !== this.currentState) {
      return;
    }

    for (const transition of activeState.transitions ?? []) {
      if (transition.when(this.owner, context, this)) {
        this.setState(transition.to, context);
        return;
      }
    }
  }
}
