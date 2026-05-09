# 2D Adventure Game 🎮

A real-time multiplayer 2D adventure game built with **Node.js**, **Express**, **Phaser 3**, and **Socket.IO**.

## Features ✨

- 🎮 **Real-time Multiplayer**: Play with other players in the same world
- 👥 **Player Management**: See who's online and their positions
- ⚔️ **Combat System**: Attack mechanics (expandable)
- 🌍 **Persistent World**: Game state synced across all players
- 📱 **Responsive Design**: Works on desktop and mobile
- ⌨️ **Smooth Controls**: Arrow keys for movement, Space for attack

## Installation

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/sky337/2d-adventure-game.git
cd 2d-adventure-game

# Install dependencies
npm install

# Start the server
npm start
```

The game will be available at `http://localhost:3000`

## Development

For development with auto-reload:

```bash
npm run dev
```

Make sure you have `nodemon` installed (included in dev dependencies).

## Controls

| Key | Action |
|-----|--------|
| ↑ ↓ ← → | Move character |
| SPACE | Attack |

## Project Structure

```
.
├── server.js          # Main game server (Express + Socket.IO)
├── package.json       # Node.js dependencies
├── public/
│   ├── index.html     # Game HTML interface
│   └── game.js        # Phaser game logic
└── README.md          # This file
```

## Technology Stack

- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: Phaser 3, HTML5 Canvas
- **Communication**: WebSockets (Socket.IO)

## Game Architecture

### Server-Side
- Express server serves static files
- Socket.IO handles real-time communication
- Game state management (players, enemies, items)
- Event-driven updates (movement, attacks, spawns)

### Client-Side
- Phaser 3 for rendering and game loop
- Input handling (keyboard controls)
- Sprite management and animation
- UI for stats and player list

## Socket.IO Events

### Client → Server
- `playerJoin`: Player joins the game
- `playerMove`: Player position update
- `playerAttack`: Player initiates attack

### Server → Client
- `gameState`: Initial game state when joining
- `playerJoined`: New player joined
- `playerMoved`: Another player moved
- `playerLeft`: Player disconnected
- `playerAttacked`: Player performed attack

## Roadmap 🗺️

- [x] Enemy AI and spawning
- [x] Item collection and inventory system
- [x] Quest system (Level 5 Portal Goal)
- [x] Chat/messaging between players
- [x] Special Abilities (Dash, Blast)
- [x] Day/Night Cycle
- [x] Minimap & Discovery
- [x] Sound Effects (Web Audio)
- [ ] Dungeon/level system (Expansion)
- [ ] Mobile touch controls
- [ ] Database integration for persistence
- [ ] Authentication and accounts

## Controls

| Key | Action |
|-----|--------|
| WASD / Arrows | Move character |
| SPACE | Radial Attack |
| Q | Special: Dash (20 Mana) |
| E | Ultimate: AoE Blast (40 Mana) |
| 1 - 5 | Use Inventory Items |
| ENTER | Send Chat Message |


## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use this for your own projects!

## Support

If you encounter any issues or have questions, please open an issue on GitHub.

---

**Happy gaming! 🚀**
