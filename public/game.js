/**
 * DUNGEON QUEST - Main Game Logic
 * Improved for smoothness, entertainment, and visual polish.
 */

const socket = io();

// Constants
const WORLD = { width: 2000, height: 1500 };
const TICK_RATE = 45; // ms
const SPEED = 300;

// State
let game;
let me = null;
let entities = {
    players: {},
    enemies: {},
    items: {},
    particles: {}
};
let input = { cursors: null, wasd: null };
let ui = {};
let audioCtx = null;

// Initialize UI Refs
function initUIRefs() {
    ui = {
        name: document.getElementById('p-name'),
        level: document.getElementById('p-level'),
        hpBar: document.getElementById('bar-hp'),
        mpBar: document.getElementById('bar-mp'),
        xpBar: document.getElementById('bar-xp'),
        hpTxt: document.getElementById('txt-hp'),
        mpTxt: document.getElementById('txt-mp'),
        xpTxt: document.getElementById('txt-xp'),
        pos: document.getElementById('pos-val'),
        gold: document.getElementById('gold-val'),
        online: document.getElementById('online-val'),
        chatIn: document.getElementById('chat-in'),
        messages: document.getElementById('messages'),
        notifs: document.getElementById('notif-center'),
        mmapBox: document.getElementById('mmap'),
        invite: document.getElementById('btn-invite')
    };
}

function startGame() {
    const name = document.getElementById('playerName').value || 'Hero';
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('game-container').style.display = 'block';
    
    initUIRefs();
    initAudio();
    initPhaser();
    
    socket.emit('playerJoin', { name });

    // Setup UI Events
    ui.invite.onclick = () => {
        navigator.clipboard.writeText(window.location.href);
        pushNotif("Invite link copied! 📋");
    };

    ui.chatIn.onkeydown = (e) => {
        if (e.key === 'Enter' && ui.chatIn.value.trim()) {
            socket.emit('chatMessage', ui.chatIn.value.trim());
            ui.chatIn.value = '';
        }
    };
}

// Audio System (Synthesized)
function initAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playSound(freq, type = 'sine', duration = 0.1, vol = 0.1) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

const SFX = {
    attack: () => playSound(150, 'triangle', 0.2, 0.15),
    hit: () => playSound(80, 'sawtooth', 0.1, 0.2),
    pickup: () => playSound(880, 'sine', 0.1, 0.1),
    level: () => {
        [440, 554, 659].forEach((f, i) => setTimeout(() => playSound(f, 'sine', 0.4, 0.2), i * 150));
    },
    spawn: () => playSound(100, 'sine', 0.5, 0.2)
};

// Phaser Logic
function initPhaser() {
    const config = {
        type: Phaser.AUTO,
        parent: 'game-container',
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: '#020617',
        physics: { default: 'arcade', arcade: { gravity: { y: 0 } } },
        scene: { preload, create, update }
    };
    game = new Phaser.Game(config);
}

function preload() {
    const s = this;
    s.load.image('floor', 'assets/floor.png');
    s.load.image('player', 'assets/player.png');
    s.load.image('goblin', 'assets/goblin.png');
    s.load.image('orc', 'assets/orc.png');
    s.load.image('tree', 'assets/tree.png');
    s.load.image('rock', 'assets/rock.png');
    s.load.image('portal', 'assets/portal.png');
}

let mmapGraphics;

function create() {
    const s = this;
    s.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);
    
    // Background
    const bg = s.add.tileSprite(0, 0, WORLD.width, WORLD.height, 'floor').setOrigin(0).setDepth(-10).setAlpha(0.5);

    // Controls
    input.cursors = s.input.keyboard.createCursorKeys();
    input.wasd = s.input.keyboard.addKeys('W,A,S,D');

    // Combat
    s.input.keyboard.on('keydown-SPACE', () => {
        if (!me) return;
        socket.emit('playerAttack', { x: me.x, y: me.y, angle: entities.players[socket.id]?.rotation || 0 });
        SFX.attack();
        vfxSlash(s, entities.players[socket.id]);
    });

    // Special Keys
    s.input.keyboard.on('keydown-Q', () => ability('dash'));
    s.input.keyboard.on('keydown-E', () => ability('blast'));

    // Minimap Graphics
    mmapGraphics = s.add.graphics().setScrollFactor(0).setDepth(2000);
}

function update() {
    const s = this;
    if (!me || !entities.players[socket.id]) return;

    const sprite = entities.players[socket.id];
    let vx = 0, vy = 0;

    if (input.cursors.left.isDown || input.wasd.A.isDown) vx = -SPEED;
    else if (input.cursors.right.isDown || input.wasd.D.isDown) vx = SPEED;
    if (input.cursors.up.isDown || input.wasd.W.isDown) vy = -SPEED;
    else if (input.cursors.down.isDown || input.wasd.S.isDown) vy = SPEED;

    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }

    sprite.body.setVelocity(vx, vy);
    if (vx !== 0 || vy !== 0) {
        sprite.rotation = Math.atan2(vy, vx);
        me.x = sprite.x;
        me.y = sprite.y;
        
        // Footstep particles?
        if (Math.random() < 0.1) vfxDust(s, sprite.x, sprite.y);
    }

    // Sync HUD
    ui.pos.textContent = `${Math.round(sprite.x)}, ${Math.round(sprite.y)}`;

    // Network Sync
    if (Date.now() - me.lastSync > TICK_RATE) {
        socket.emit('playerMove', { x: sprite.x, y: sprite.y, vx, vy });
        me.lastSync = Date.now();
    }

    // Camera
    s.cameras.main.setLerp(0.1, 0.1);

    // Refresh UI & Map
    renderMinimap();
}

// VFX Helpers
function vfxSlash(scene, sprite) {
    const arc = scene.add.arc(sprite.x, sprite.y, 50, 0, 360, false, 0xffffff, 0.2);
    scene.tweens.add({ targets: arc, radius: 70, alpha: 0, duration: 200, onComplete: () => arc.destroy() });
}

function vfxDust(scene, x, y) {
    const d = scene.add.circle(x, y, 3, 0xffffff, 0.2);
    scene.tweens.add({ targets: d, y: y - 10, alpha: 0, scale: 0.5, duration: 400, onComplete: () => d.destroy() });
}

// Socket Receivers
socket.on('gameState', (state) => {
    const s = game.scene.scenes[0];
    currentPlayerId = socket.id;
    me = { ...state.players[socket.id], lastSync: 0 };
    
    Object.values(state.players).forEach(p => spawnPlayer(s, p));
    
    // Static obstacles
    state.obstacles.forEach(o => {
        const obs = s.physics.add.staticSprite(o.x, o.y, o.type).setScale(o.scale);
        if (entities.players[socket.id]) s.physics.add.collider(entities.players[socket.id], obs);
    });

    // Portal
    if (state.portal) {
        const p = s.add.sprite(state.portal.x, state.portal.y, 'portal').setScale(0.8).setDepth(2);
        s.tweens.add({ targets: p, angle: 360, duration: 10000, repeat: -1 });
    }

    updateHUD();
});

socket.on('playerJoined', (p) => spawnPlayer(game.scene.scenes[0], p));

socket.on('playerMoved', (d) => {
    if (d.id === socket.id) return;
    const sprite = entities.players[d.id];
    if (sprite) {
        // Smooth interpolation
        game.scene.scenes[0].tweens.add({
            targets: sprite,
            x: d.x,
            y: d.y,
            duration: TICK_RATE,
            ease: 'Linear'
        });
        if (d.vx !== 0 || d.vy !== 0) sprite.rotation = Math.atan2(d.vy, d.vx);
    }
});

socket.on('worldState', (state) => {
    const s = game.scene.scenes[0];
    if (!s) return;

    // Sync Enemies
    state.enemies.forEach(e => {
        if (!entities.enemies[e.id]) {
            const sprite = s.add.sprite(e.x, e.y, e.type === 'orc' ? 'orc' : 'goblin').setScale(0.5).setDepth(4);
            entities.enemies[e.id] = sprite;
            entities.enemies[e.id + '_hp'] = s.add.rectangle(e.x, e.y - 30, 30, 3, 0xef4444);
        } else {
            const sprite = entities.enemies[e.id];
            const hp = entities.enemies[e.id + '_hp'];
            s.tweens.add({ targets: [sprite, hp], x: e.x, y: (obj) => obj === hp ? e.y - 30 : e.y, duration: TICK_RATE });
            hp.width = 30 * (e.health / (e.type === 'orc' ? 35 : 15));
        }
    });

    // Cleanup dead enemies
    const ids = state.enemies.map(e => e.id);
    Object.keys(entities.enemies).forEach(id => {
        if (!id.includes('_hp') && !ids.includes(parseInt(id))) {
            entities.enemies[id].destroy();
            entities.enemies[id + '_hp'].destroy();
            delete entities.enemies[id];
            delete entities.enemies[id + '_hp'];
        }
    });

    // Particles/Items etc logic...
    syncParticles(s, state.particles);
});

socket.on('chatMessage', (d) => {
    const msg = document.createElement('div');
    msg.style.marginBottom = '4px';
    msg.innerHTML = `<span style="color:${d.id === socket.id ? 'var(--primary)' : 'var(--secondary)'}; font-weight:700;">${d.name}:</span> ${d.message}`;
    ui.messages.appendChild(msg);
    ui.messages.scrollTop = ui.messages.scrollHeight;
});

socket.on('playerStatsUpdated', (stats) => {
    if (me) {
        if (stats.health < me.health) {
            game.scene.scenes[0].cameras.main.shake(150, 0.005);
            SFX.hit();
        }
        Object.assign(me, stats);
        updateHUD();
    }
});

socket.on('levelUp', (d) => {
    Object.assign(me, d);
    updateHUD();
    SFX.level();
    pushNotif(`✨ LEVEL UP! NOW LV. ${d.level}`);
});

socket.on('bossSpawned', (d) => {
    pushNotif(`👹 BOSS SPAWNED: ${d.name}!`, 'var(--danger)');
    SFX.spawn();
});

// Helpers
function spawnPlayer(scene, p) {
    if (entities.players[p.id]) return;
    const sprite = scene.physics.add.sprite(p.x, p.y, 'player').setDepth(5).setScale(0.6);
    entities.players[p.id] = sprite;
    
    if (p.id === socket.id) {
        scene.cameras.main.startFollow(sprite, true, 0.1, 0.1);
        ui.name.textContent = p.name;
    }
}

function updateHUD() {
    if (!me) return;
    ui.hpTxt.textContent = `${Math.round(me.health)}/${me.maxHealth}`;
    ui.hpBar.style.width = (me.health / me.maxHealth * 100) + '%';
    ui.mpTxt.textContent = `${Math.round(me.mana)}/${me.maxMana}`;
    ui.mpBar.style.width = (me.mana / me.maxMana * 100) + '%';
    ui.xpTxt.textContent = `${me.xp}/${me.xpNeeded}`;
    ui.xpBar.style.width = (me.xp / me.xpNeeded * 100) + '%';
    ui.level.textContent = me.level;
    ui.gold.textContent = me.gold || 0;
}

function renderMinimap() {
    if (!mmapGraphics || !me) return;
    mmapGraphics.clear();
    const rect = ui.mmapBox.getBoundingClientRect();
    const mw = 200, mh = 150;
    const sx = mw / WORLD.width, sy = mh / WORLD.height;

    // Draw Entities
    Object.values(entities.players).forEach(p => {
        mmapGraphics.fillStyle(p === entities.players[socket.id] ? 0xffffff : 0x8b5cf6, 1);
        mmapGraphics.fillCircle(rect.left + p.x * sx, rect.top + p.y * sy, 3);
    });
}

function syncParticles(scene, ps) {
    ps.forEach(p => {
        if (!entities.particles[p.id]) {
            const txt = scene.add.text(p.x, p.y, p.text, { fontSize: '16px', fontWeight: 'bold', color: p.color }).setOrigin(0.5).setDepth(10);
            entities.particles[p.id] = txt;
            scene.tweens.add({ targets: txt, y: p.y - 50, alpha: 0, duration: 800, onComplete: () => { txt.destroy(); delete entities.particles[p.id]; } });
        }
    });
}

function pushNotif(msg, color = 'var(--primary)') {
    const n = document.createElement('div');
    n.className = 'notif glass';
    n.style.background = color;
    n.textContent = msg;
    ui.notifs.appendChild(n);
    setTimeout(() => n.remove(), 4000);
}

function ability(type) {
    if (!me || (type === 'dash' && me.mana < 20) || (type === 'blast' && me.mana < 40)) return;
    socket.emit('specialAbility', { type, x: me.x, y: me.y });
    if (type === 'dash') {
        const sprite = entities.players[socket.id];
        const dist = 150;
        sprite.x += Math.cos(sprite.rotation) * dist;
        sprite.y += Math.sin(sprite.rotation) * dist;
    }
}

window.onresize = () => game.scale.resize(window.innerWidth, window.innerHeight);
