export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.keysDown = new Set();
    this.keysPressed = new Set();
    this.keysReleased = new Set();
    this.eventQueue = [];
    this.mouse = {
      x: 0,
      y: 0,
      leftDown: false,
      middleDown: false,
      rightDown: false,
    };

    this.attach();
  }

  attach() {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("keypress", this.handleKeyPress);
    window.addEventListener("mousemove", this.handleMouseMove);
    window.addEventListener("mousedown", this.handleMouseDown);
    window.addEventListener("mouseup", this.handleMouseUp);
    window.addEventListener("click", this.handleClick);
    window.addEventListener("contextmenu", this.handleContextMenu);
    window.addEventListener("wheel", this.handleWheel, { passive: false });
    window.addEventListener("focus", this.handleFocus);
    window.addEventListener("blur", this.handleBlur);
    window.addEventListener("resize", this.handleResize);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
  }

  handleKeyDown = (event) => {
    const key = event.key.toLowerCase();

    if (!this.keysDown.has(key)) {
      this.keysPressed.add(key);
    }

    this.keysDown.add(key);
    this.queueEvent("keydown", { key, code: event.code, repeat: event.repeat });
  };

  handleKeyUp = (event) => {
    const key = event.key.toLowerCase();
    this.keysDown.delete(key);
    this.keysReleased.add(key);
    this.queueEvent("keyup", { key, code: event.code });
  };

  handleKeyPress = (event) => {
    this.queueEvent("keypress", { key: event.key.toLowerCase(), code: event.code });
  };

  handleMouseMove = (event) => {
    this.updatePointer(event);
    this.queueEvent("mousemove", { x: this.mouse.x, y: this.mouse.y });
  };

  handleMouseDown = (event) => {
    this.updatePointer(event);

    if (event.button === 0) {
      this.mouse.leftDown = true;
    }

    if (event.button === 1) {
      this.mouse.middleDown = true;
    }

    if (event.button === 2) {
      this.mouse.rightDown = true;
    }

    this.queueEvent("mousedown", { button: event.button, x: this.mouse.x, y: this.mouse.y });
  };

  handleMouseUp = (event) => {
    this.updatePointer(event);

    if (event.button === 0) {
      this.mouse.leftDown = false;
    }

    if (event.button === 1) {
      this.mouse.middleDown = false;
    }

    if (event.button === 2) {
      this.mouse.rightDown = false;
    }

    this.queueEvent("mouseup", { button: event.button, x: this.mouse.x, y: this.mouse.y });
  };

  handleClick = (event) => {
    this.updatePointer(event);
    this.queueEvent("click", { button: event.button, x: this.mouse.x, y: this.mouse.y });
  };

  handleContextMenu = (event) => {
    if (this.canvas.contains(event.target)) {
      event.preventDefault();
    }

    this.updatePointer(event);
    this.queueEvent("contextmenu", { x: this.mouse.x, y: this.mouse.y });
  };

  handleWheel = (event) => {
    if (this.canvas.contains(event.target)) {
      event.preventDefault();
    }

    this.queueEvent("wheel", { deltaX: event.deltaX, deltaY: event.deltaY });
  };

  handleFocus = () => {
    this.queueEvent("focus");
  };

  handleBlur = () => {
    this.queueEvent("blur");
    this.mouse.leftDown = false;
    this.mouse.middleDown = false;
    this.mouse.rightDown = false;
  };

  handleVisibilityChange = () => {
    this.queueEvent("visibilitychange", { hidden: document.hidden });
  };

  handleResize = () => {
    this.queueEvent("resize");
  };

  updatePointer(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = event.clientX - rect.left;
    this.mouse.y = event.clientY - rect.top;
  }

  queueEvent(type, payload = {}) {
    this.eventQueue.push({
      type,
      timestamp: performance.now(),
      ...payload,
    });

    if (this.eventQueue.length > 160) {
      this.eventQueue.shift();
    }
  }

  consumeEvents() {
    const events = [...this.eventQueue];
    this.eventQueue.length = 0;
    return events;
  }

  endFrame() {
    this.keysPressed.clear();
    this.keysReleased.clear();
  }

  isDown(...keys) {
    return keys.some((key) => this.keysDown.has(key.toLowerCase()));
  }

  wasPressed(key) {
    return this.keysPressed.has(key.toLowerCase());
  }
}
