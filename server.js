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

app.use(express.static(path.join(__dirname, 'public')));

// Game constants
const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 1500;
const ENEMY_SPAWN_RATE = 0.02;
const CHEST_SPAWN_RATE = 0.005;

// Game state
const gameState = {
  players: {},
  enemies: [],
  items: [],
  chests: [],
  particles: [],
  obstacles: [],
  portal: { x: 1800, y: 1300, active: false },
  gameTime: 0, // 0 to 2400
  nextEnemyId: 0,
  nextItemId: 0,
  nextChestId: 0,
  nextParticleId: 0
};


// Initialize obstacles
for (let i = 0; i < 40; i++) {
  gameState.obstacles.push({
    id: i,
    x: Math.random() * WORLD_WIDTH,
    y: Math.random() * WORLD_HEIGHT,
    type: Math.random() > 0.5 ? 'tree' : 'rock',
    scale: 0.5 + Math.random() * 0.5
  });
}


// Enemy types with different properties
const ENEMY_TYPES = {
  goblin: {
    name: 'Goblin',
    health: 15,
    damage: 3,
    speed: 2,
    xp: 25,
    color: '#2ecc71',
    size: 10
  },
  orc: {
    name: 'Orc',
    health: 35,
    damage: 6,
    speed: 1.5,
    xp: 50,
    color: '#e74c3c',
    size: 14
  },
  skeleton: {
    name: 'Skeleton',
    health: 25,
    damage: 5,
    speed: 2.5,
    xp: 40,
    color: '#95a5a6',
    size: 11
  },
  boss_dragon: {
    name: 'Dragon Boss',
    health: 200,
    damage: 15,
    speed: 1,
    xp: 500,
    color: '#9b59b6',
    size: 25
  }
};

const ITEM_TYPES = {
  potion: { name: 'Health Potion', color: '#e91e63', effect: 'heal', value: 50 },
  mana: { name: 'Mana Potion', color: '#3498db', effect: 'mana', value: 30 },
  gold: { name: 'Gold', color: '#f39c12', effect: 'gold', value: 25 },
  sword: { name: 'Iron Sword', color: '#c0392b', effect: 'damage', value: 10 },
  shield: { name: 'Steel Shield', color: '#34495e', effect: 'defense', value: 8 }
};

// Socket connection
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('playerJoin', (playerData) => {
    gameState.players[socket.id] = {
      id: socket.id,
      name: playerData.name,
      x: WORLD_WIDTH / 2 + Math.random() * 100 - 50,
      y: WORLD_HEIGHT / 2 + Math.random() * 100 - 50,
      vx: 0,
      vy: 0,
      health: 100,
      maxHealth: 100,
      level: 1,
      xp: 0,
      xpNeeded: 100,
      mana: 50,
      maxMana: 50,
      gold: 0,
      damage: 10,
      defense: 5,
      inventory: [],
      lastAttackTime: 0,
      attackCooldown: 300,
      particles: []
    };

    socket.emit('gameState', gameState);
    socket.broadcast.emit('playerJoined', gameState.players[socket.id]);
  });

  socket.on('playerMove', (data) => {
    if (gameState.players[socket.id]) {
      let player = gameState.players[socket.id];
      player.vx = data.vx;
      player.vy = data.vy;
      player.x = data.x;
      player.y = data.y;

      // Keep in bounds
      player.x = Math.max(0, Math.min(player.x, WORLD_WIDTH));
      player.y = Math.max(0, Math.min(player.y, WORLD_HEIGHT));

      io.emit('playerMoved', {
        id: socket.id,
        x: player.x,
        y: player.y
      });

      // Check collision with items
      gameState.items = gameState.items.filter(item => {
        const dx = player.x - item.x;
        const dy = player.y - item.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 25) {
          handleItemPickup(socket.id, item);
          return false;
        }
        return true;
      });

      // Check collision with chests
      gameState.chests = gameState.chests.filter(chest => {
        const dx = player.x - chest.x;
        const dy = player.y - chest.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 30) {
          openChest(socket.id, chest);
          return false;
        }
        return true;
      });
    }
  });

  socket.on('playerAttack', (data) => {
    if (!gameState.players[socket.id]) return;
    
    const player = gameState.players[socket.id];
    const now = Date.now();

    if (now - player.lastAttackTime < player.attackCooldown) return;

    player.lastAttackTime = now;

    // Check enemies in range
    gameState.enemies = gameState.enemies.filter(enemy => {
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 60) {
        const damage = Math.max(1, player.damage + Math.floor(Math.random() * 5) - 2);
        enemy.health -= damage;

        // Create damage popup
        createParticle(enemy.x, enemy.y, `-${damage}`, '#ff4444');

        if (enemy.health <= 0) {
          // Enemy defeated
          gainXP(socket.id, enemy.type);
          dropLoot(enemy.x, enemy.y, enemy.type);
          return false;
        }
      }
      return true;
    });

    io.emit('playerAttacked', {
      id: socket.id,
      x: data.x,
      y: data.y,
      angle: data.angle
    });
  });

  socket.on('useItem', (data) => {
    if (!gameState.players[socket.id]) return;
    const player = gameState.players[socket.id];
    const item = player.inventory[data.index];

    if (!item) return;

    const itemType = ITEM_TYPES[item.type];
    if (itemType.effect === 'heal') {
      player.health = Math.min(player.maxHealth, player.health + itemType.value);
      createParticle(player.x, player.y, `+${itemType.value}`, '#2ecc71');
    } else if (itemType.effect === 'mana') {
      player.mana = Math.min(player.maxMana, player.mana + itemType.value);
      createParticle(player.x, player.y, `+${itemType.value}`, '#3498db');
    }

    player.inventory.splice(data.index, 1);
    socket.emit('inventoryUpdated', player.inventory);
  });
  
  socket.on('specialAbility', (data) => {
    if (!gameState.players[socket.id]) return;
    const player = gameState.players[socket.id];
    
    if (data.type === 'dash' && player.mana >= 20) {
      player.mana -= 20;
      // Actual dash is handled by client position but server needs to sync mana
      io.to(socket.id).emit('playerStatsUpdated', { mana: player.mana });
    } else if (data.type === 'blast' && player.mana >= 40) {
      player.mana -= 40;
      // AoE Damage
      gameState.enemies = gameState.enemies.filter(enemy => {
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          enemy.health -= 30;
          createParticle(enemy.x, enemy.y, `-30!`, '#ffaa00');
          if (enemy.health <= 0) {
            gainXP(socket.id, enemy.type);
            dropLoot(enemy.x, enemy.y, enemy.type);
            return false;
          }
        }
        return true;
      });
      io.to(socket.id).emit('playerStatsUpdated', { mana: player.mana });
      socket.broadcast.emit('playerSpecial', { id: socket.id, type: 'blast', x: player.x, y: player.y });
    }
  });

  socket.on('chatMessage', (msg) => {

    if (!gameState.players[socket.id]) return;
    const player = gameState.players[socket.id];
    
    io.emit('chatMessage', {
      id: socket.id,
      name: player.name,
      message: msg.substring(0, 100) // Limit length
    });
  });


  socket.on('disconnect', () => {
    if (gameState.players[socket.id]) {
      const playerName = gameState.players[socket.id].name;
      delete gameState.players[socket.id];
      io.emit('playerLeft', socket.id);
      console.log(`${playerName} left the game`);
    }
  });
});

// Game loop
setInterval(() => {
  // Spawn enemies randomly
  if (Math.random() < ENEMY_SPAWN_RATE && gameState.enemies.length < 50) {
    spawnEnemy();
  }

  // Spawn treasure chests
  if (Math.random() < CHEST_SPAWN_RATE && gameState.chests.length < 10) {
    spawnChest();
  }

  // Update enemies AI
  gameState.enemies.forEach(enemy => {
    // Find nearest player
    let nearest = null;
    let nearestDist = 500;

    Object.values(gameState.players).forEach(player => {
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = player;
      }
    });

    if (nearest) {
      // Move towards player
      const dx = nearest.x - enemy.x;
      const dy = nearest.y - enemy.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 0) {
        enemy.vx = (dx / dist) * ENEMY_TYPES[enemy.type].speed;
        enemy.vy = (dy / dist) * ENEMY_TYPES[enemy.type].speed;
      }

      // Attack if close
      if (dist < 30 && Date.now() - enemy.lastAttackTime > 1000) {
        nearest.health -= ENEMY_TYPES[enemy.type].damage;
        createParticle(nearest.x, nearest.y, `-${ENEMY_TYPES[enemy.type].damage}`, '#ff0000');
        enemy.lastAttackTime = Date.now();
      }
    }

    // Update position
    enemy.x += enemy.vx;
    enemy.y += enemy.vy;

    // Keep in bounds
    if (enemy.x < 0) enemy.x = 0;
    if (enemy.x > WORLD_WIDTH) enemy.x = WORLD_WIDTH;
    if (enemy.y < 0) enemy.y = 0;
    if (enemy.y > WORLD_HEIGHT) enemy.y = WORLD_HEIGHT;
  });

  // Remove dead particles
  gameState.particles = gameState.particles.filter(p => {
    p.life--;
    return p.life > 0;
  });

  // Update game time
  gameState.gameTime = (gameState.gameTime + 1) % 2400;

  // Broadcast world state
  io.emit('worldState', {
    enemies: gameState.enemies,
    items: gameState.items,
    chests: gameState.chests,
    particles: gameState.particles,
    gameTime: gameState.gameTime
  });


  // Check player deaths
  Object.entries(gameState.players).forEach(([id, player]) => {
    if (player.health <= 0) {
      player.health = player.maxHealth;
      player.x = WORLD_WIDTH / 2;
      player.y = WORLD_HEIGHT / 2;
      io.to(id).emit('playerDied');
    }
  });

}, 16);


// Helper functions
function spawnEnemy() {
  const types = Object.keys(ENEMY_TYPES);
  const randomType = types[Math.floor(Math.random() * types.length)];
  const isBoss = Math.random() < 0.02 || (gameState.gameTime === 1200 && gameState.enemies.length < 40);
  const type = isBoss ? 'boss_dragon' : randomType;
  const typeData = ENEMY_TYPES[type];

  if (isBoss) {
    io.emit('bossSpawned', { name: typeData.name, x: 0, y: 0 }); // Pos handled below
  }

  const enemy = {
    id: gameState.nextEnemyId++,
    type: type,
    x: Math.random() * WORLD_WIDTH,
    y: Math.random() * WORLD_HEIGHT,
    vx: 0,
    vy: 0,
    health: typeData.health,
    lastAttackTime: 0
  };

  gameState.enemies.push(enemy);
}

function spawnChest() {
  const chest = {
    id: gameState.nextChestId++,
    x: Math.random() * WORLD_WIDTH,
    y: Math.random() * WORLD_HEIGHT,
    opened: false
  };

  gameState.chests.push(chest);
}

function dropLoot(x, y, enemyType) {
  const lootTable = {
    goblin: ['gold', 'potion'],
    orc: ['gold', 'sword', 'potion'],
    skeleton: ['gold', 'mana'],
    boss_dragon: ['sword', 'shield', 'gold', 'gold', 'potion']
  };

  const loot = lootTable[enemyType] || ['gold'];
  loot.forEach(type => {
    if (Math.random() < 0.7) {
      const item = {
        id: gameState.nextItemId++,
        type: type,
        x: x + Math.random() * 40 - 20,
        y: y + Math.random() * 40 - 20
      };
      gameState.items.push(item);
    }
  });
}

function createParticle(x, y, text, color) {
  gameState.particles.push({
    id: gameState.nextParticleId++,
    x: x,
    y: y,
    text: text,
    color: color,
    life: 30,
    vy: -2
  });
}

function handleItemPickup(playerId, item) {
  const player = gameState.players[playerId];
  const itemType = ITEM_TYPES[item.type];

  if (itemType.effect === 'heal') {
    player.health = Math.min(player.maxHealth, player.health + itemType.value);
  } else if (itemType.effect === 'mana') {
    player.mana = Math.min(player.maxMana, player.mana + itemType.value);
  } else if (itemType.effect === 'gold') {
    player.gold = (player.gold || 0) + itemType.value;
  } else if (itemType.effect === 'damage') {
    player.damage += itemType.value;
  } else if (itemType.effect === 'defense') {
    player.defense += itemType.value;
  }

  if (itemType.effect === 'heal' || itemType.effect === 'mana' || itemType.effect === 'gold') {
    createParticle(item.x, item.y, `+${itemType.value}`, itemType.color);
  }

  if (!['heal', 'mana', 'gold'].includes(itemType.effect)) {
    player.inventory.push(item);
    io.to(playerId).emit('inventoryUpdated', player.inventory);
  }

  io.to(playerId).emit('playerStatsUpdated', {
    health: player.health,
    mana: player.mana,
    gold: player.gold || 0,
    damage: player.damage,
    defense: player.defense
  });
}

function gainXP(playerId, enemyType) {
  const player = gameState.players[playerId];
  const xpGain = ENEMY_TYPES[enemyType].xp;

  player.xp += xpGain;
  createParticle(player.x, player.y, `+${xpGain} XP`, '#f39c12');

  // Check level up
  while (player.xp >= player.xpNeeded) {
    player.xp -= player.xpNeeded;
    player.level++;
    player.maxHealth += 20;
    player.health = player.maxHealth;
    player.damage += 5;
    player.defense += 2;
    player.xpNeeded = Math.floor(player.xpNeeded * 1.2);

    io.to(playerId).emit('levelUp', {
      level: player.level,
      health: player.health,
      maxHealth: player.maxHealth,
      damage: player.damage,
      defense: player.defense
    });

    createParticle(player.x, player.y, '⬆ LEVEL UP!', '#ffd700');
  }

  io.to(playerId).emit('playerStatsUpdated', {
    level: player.level,
    xp: player.xp,
    xpNeeded: player.xpNeeded
  });
}

function openChest(playerId, chest) {
  const items = [];
  const numItems = Math.floor(Math.random() * 3) + 2;

  for (let i = 0; i < numItems; i++) {
    const types = Object.keys(ITEM_TYPES);
    const type = types[Math.floor(Math.random() * types.length)];
    items.push({ type: type, count: Math.floor(Math.random() * 3) + 1 });
  }

  io.to(playerId).emit('chestOpened', { items: items });

  // Give items to player
  items.forEach(item => {
    for (let i = 0; i < item.count; i++) {
      dropLoot(gameState.players[playerId].x, gameState.players[playerId].y, 'goblin');
    }
  });

  // Remove chest
  chest.opened = true;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 Game server running on http://localhost:${PORT}`);
});
