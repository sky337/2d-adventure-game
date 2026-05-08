const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game state
const gameState = {
  players: {},
  enemies: [],
  items: []
};

// Socket.IO events
io.on('connection', (socket) => {
  console.log('New player connected:', socket.id);

  // Player joins
  socket.on('playerJoin', (playerData) => {
    gameState.players[socket.id] = {
      id: socket.id,
      name: playerData.name,
      x: playerData.x || 400,
      y: playerData.y || 300,
      health: 100
    };

    // Send current game state to new player
    socket.emit('gameState', gameState);

    // Broadcast new player to others
    socket.broadcast.emit('playerJoined', gameState.players[socket.id]);

    console.log(`${playerData.name} joined the game`);
  });

  // Player movement
  socket.on('playerMove', (data) => {
    if (gameState.players[socket.id]) {
      gameState.players[socket.id].x = data.x;
      gameState.players[socket.id].y = data.y;

      // Broadcast movement to all players
      io.emit('playerMoved', {
        id: socket.id,
        x: data.x,
        y: data.y
      });
    }
  });

  // Player attack
  socket.on('playerAttack', (data) => {
    io.emit('playerAttacked', {
      id: socket.id,
      direction: data.direction
    });
  });

  // Player disconnect
  socket.on('disconnect', () => {
    if (gameState.players[socket.id]) {
      const playerName = gameState.players[socket.id].name;
      delete gameState.players[socket.id];
      io.emit('playerLeft', socket.id);
      console.log(`${playerName} left the game`);
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 Game server running on http://localhost:${PORT}`);
});
