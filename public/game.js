const socket = io();
let game;
let playerSprites = {};
let currentPlayerId = null;
let currentPlayerData = null;

function joinGame() {
    const playerName = document.getElementById('playerName').value || 'Player';
    if (!playerName.trim()) return;

    // Hide login, show game
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('game-container').classList.remove('hidden');
    document.getElementById('playerNameDisplay').textContent = playerName;

    // Initialize Phaser game
    initGame();

    // Tell server we joined
    socket.emit('playerJoin', {
        name: playerName,
        x: 400,
        y: 300
    });
}

function initGame() {
    const config = {
        type: Phaser.AUTO,
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: '#2d2d2d',
        scene: {
            preload: preload,
            create: create,
            update: update
        },
        physics: {
            default: 'arcade',
            arcade: {
                gravity: { y: 0 },
                debug: false
            }
        }
    };

    game = new Phaser.Game(config);
}

function preload() {
    // Load assets here (graphics, sounds, etc.)
}

let cursors;
let playerKeys = {};

function create() {
    cursors = this.input.keyboard.createCursorKeys();
    this.input.keyboard.on('keydown-SPACE', () => {
        socket.emit('playerAttack', { direction: 'down' });
    });
}

let lastSendTime = 0;
const SEND_INTERVAL = 50; // Send position every 50ms

function update() {
    if (!currentPlayerData) return;

    let moved = false;
    let newX = currentPlayerData.x;
    let newY = currentPlayerData.y;
    const speed = 5;

    if (cursors.up.isDown) {
        newY -= speed;
        moved = true;
    } else if (cursors.down.isDown) {
        newY += speed;
        moved = true;
    }

    if (cursors.left.isDown) {
        newX -= speed;
        moved = true;
    } else if (cursors.right.isDown) {
        newX += speed;
        moved = true;
    }

    // Clamp to world bounds
    newX = Math.max(0, Math.min(newX, window.innerWidth));
    newY = Math.max(0, Math.min(newY, window.innerHeight));

    if (moved) {
        currentPlayerData.x = newX;
        currentPlayerData.y = newY;

        // Update UI
        document.getElementById('playerX').textContent = Math.round(newX);
        document.getElementById('playerY').textContent = Math.round(newY);

        // Send to server
        const now = Date.now();
        if (now - lastSendTime > SEND_INTERVAL) {
            socket.emit('playerMove', { x: newX, y: newY });
            lastSendTime = now;
        }

        // Update sprite
        if (playerSprites[currentPlayerId]) {
            playerSprites[currentPlayerId].x = newX;
            playerSprites[currentPlayerId].y = newY;
        }
    }
}

// Socket events
socket.on('gameState', (state) => {
    currentPlayerId = socket.id;
    currentPlayerData = state.players[socket.id];

    // Create sprites for all players
    Object.values(state.players).forEach(player => {
        createPlayerSprite(player);
    });
});

socket.on('playerJoined', (player) => {
    createPlayerSprite(player);
    updatePlayersList();
});

socket.on('playerMoved', (data) => {
    if (data.id !== currentPlayerId && playerSprites[data.id]) {
        playerSprites[data.id].x = data.x;
        playerSprites[data.id].y = data.y;
    }
});

socket.on('playerLeft', (playerId) => {
    if (playerSprites[playerId]) {
        playerSprites[playerId].destroy();
        delete playerSprites[playerId];
    }
    updatePlayersList();
});

socket.on('playerAttacked', (data) => {
    if (playerSprites[data.id]) {
        // Flash effect
        playerSprites[data.id].setAlpha(0.5);
        setTimeout(() => {
            playerSprites[data.id].setAlpha(1);
        }, 100);
    }
});

function createPlayerSprite(player) {
    if (!game || !game.isRunning) return;
    
    const scene = game.scene.scenes[0];
    
    if (!playerSprites[player.id]) {
        // Create a simple circle for the player
        const graphics = scene.make.graphics({ x: player.x, y: player.y, add: false });
        graphics.fillStyle(0x667eea, 1);
        graphics.fillCircle(0, 0, 15);
        const texture = graphics.generateTexture('player_' + player.id, 30, 30);
        graphics.destroy();

        const sprite = scene.add.sprite(player.x, player.y, 'player_' + player.id);
        sprite.setDepth(1);
        playerSprites[player.id] = sprite;

        // Add name label
        const text = scene.add.text(player.x, player.y - 30, player.name, {
            fontSize: '14px',
            fill: '#ffffff',
            align: 'center'
        });
        text.setOrigin(0.5);
        playerSprites[player.id + '_name'] = text;
    }
    
    updatePlayersList();
}

function updatePlayersList() {
    const list = document.getElementById('playersList');
    list.innerHTML = '';
    
    Object.values(playerSprites).forEach(sprite => {
        if (sprite.name && !sprite.name.includes('_name')) return;
    });
    
    // Get all players from game state (this would require storing it)
    // For now, just show connected indicator
    const count = Object.keys(playerSprites).filter(k => !k.includes('_name')).length;
    list.innerHTML = `<div class="player-item">🟢 ${count} player${count !== 1 ? 's' : ''} online</div>`;
}

// Handle window resize
window.addEventListener('resize', () => {
    if (game) {
        game.scale.resize(window.innerWidth, window.innerHeight);
    }
});
