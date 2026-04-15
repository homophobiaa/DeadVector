# DeadVector Assignment Rules

## Core Brief
- Build a browser-based game with HTML5 Canvas and JavaScript.
- Use a reusable finite state machine for enemy or NPC AI.
- Keep all code and comments in English.
- Organize the project into clear files and modules.
- Avoid browser console errors.

## Required Events
- Implement at least 10 different event types.
- Valid event groups include keyboard, mouse, window or document, custom game events, animation timing, and optional touch support.
- DeadVector target events:
  - `load`
  - `keydown`
  - `keyup`
  - `keypress`
  - `mousemove`
  - `mousedown`
  - `mouseup`
  - `click`
  - `contextmenu`
  - `wheel`
  - `resize`
  - `focus`
  - `blur`
  - `visibilitychange`
  - Custom events: `gameStart`, `waveComplete`, `levelUp`, `gameOver`
  - `requestAnimationFrame`
  - `setTimeout`
  - `setInterval`

## FSM Requirements
- FSM must be a reusable class or module.
- Use at least five FSM-controlled enemies or NPCs in the game.
- Each AI must use at least 5 distinct states.
- Transitions need clear conditions.
- DeadVector FSM states:
  - `SPAWN`
  - `WANDER`
  - `CHASE`
  - `ATTACK`
  - `RETREAT`
  - `DEAD`

## Canvas Requirements
- Render game objects in HTML5 Canvas, not as DOM elements.
- Use a proper game loop with `requestAnimationFrame`.
- Clear and redraw the canvas every frame.
- Support responsive resizing.

## Documentation Requirements
- Include a visual FSM diagram.
- Include a transition table.
- Maintain a meaningful `README.md` with:
  - title and short description
  - screenshot or preview image
  - controls
  - implemented events list
  - FSM diagram
  - AI behavior summary
  - technologies used
  - GitHub Pages play link after deployment

## Visual Requirements
- Main menu with Play button.
- Game over screen with score and restart option.
- HUD with core stats.
- Pause menu on `Escape`.
- Sound effects and background music with mute option.
- Smooth animation and polished visuals.

## Repository Checklist
- Public GitHub repository.
- Regular English commit messages.
- GitHub Pages deployment.
- `.gitignore`.
- Clear file structure.
