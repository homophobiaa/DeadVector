export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.keysDown = new Set();
    this.keysPressed = new Set();
    this.keysReleased = new Set();
    this.eventQueue = [];
    this.mouse = { x: 0, y: 0, leftDown: false, middleDown: false, rightDown: false };

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

  handleKeyDown = (e) => {
    const key = e.key.toLowerCase();
    if (key === "tab") e.preventDefault();
    if (key === "f1") e.preventDefault();
    if (!this.keysDown.has(key)) this.keysPressed.add(key);
    this.keysDown.add(key);
    this.queueEvent("keydown", { key, code: e.code, repeat: e.repeat });
  };

  handleKeyUp = (e) => {
    const key = e.key.toLowerCase();
    this.keysDown.delete(key);
    this.keysReleased.add(key);
    this.queueEvent("keyup", { key, code: e.code });
  };

  handleKeyPress = (e) => {
    this.queueEvent("keypress", { key: e.key.toLowerCase(), code: e.code });
  };

  handleMouseMove = (e) => {
    this.updatePointer(e);
    this.queueEvent("mousemove", { x: this.mouse.x, y: this.mouse.y });
  };

  handleMouseDown = (e) => {
    this.updatePointer(e);
    if (e.button === 0) this.mouse.leftDown = true;
    if (e.button === 1) this.mouse.middleDown = true;
    if (e.button === 2) this.mouse.rightDown = true;
    this.queueEvent("mousedown", { button: e.button, x: this.mouse.x, y: this.mouse.y });
  };

  handleMouseUp = (e) => {
    this.updatePointer(e);
    if (e.button === 0) this.mouse.leftDown = false;
    if (e.button === 1) this.mouse.middleDown = false;
    if (e.button === 2) this.mouse.rightDown = false;
    this.queueEvent("mouseup", { button: e.button, x: this.mouse.x, y: this.mouse.y });
  };

  handleClick = (e) => {
    this.updatePointer(e);
    this.queueEvent("click", { button: e.button, x: this.mouse.x, y: this.mouse.y });
  };

  handleContextMenu = (e) => {
    if (this.canvas.contains(e.target)) e.preventDefault();
    this.updatePointer(e);
    this.queueEvent("contextmenu", { x: this.mouse.x, y: this.mouse.y });
  };

  handleWheel = (e) => {
    if (this.canvas.contains(e.target)) e.preventDefault();
    this.queueEvent("wheel", { deltaX: e.deltaX, deltaY: e.deltaY });
  };

  handleFocus = () => this.queueEvent("focus");

  handleBlur = () => {
    this.queueEvent("blur");
    this.mouse.leftDown = false;
    this.mouse.middleDown = false;
    this.mouse.rightDown = false;
  };

  handleVisibilityChange = () => {
    this.queueEvent("visibilitychange", { hidden: document.hidden });
  };

  handleResize = () => this.queueEvent("resize");

  updatePointer(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = e.clientX - rect.left;
    this.mouse.y = e.clientY - rect.top;
  }

  queueEvent(type, payload = {}) {
    this.eventQueue.push({ type, timestamp: performance.now(), ...payload });
    if (this.eventQueue.length > 160) this.eventQueue.shift();
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
    return keys.some((k) => this.keysDown.has(k.toLowerCase()));
  }

  wasPressed(key) {
    return this.keysPressed.has(key.toLowerCase());
  }
}
