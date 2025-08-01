document.addEventListener('DOMContentLoaded', () => {
    // --- DOM ELEMENTS ---
    const mainMenu = document.getElementById('main-menu');
    const settingsScreen = document.getElementById('settings-screen');
    const upgradeScreen = document.getElementById('upgrade-screen');
    const startButton = document.getElementById('start-button');
    const settingsButton = document.getElementById('settings-button');
    const backButton = document.getElementById('back-to-menu-button');
    const upgradeOptionsContainer = document.getElementById('upgrade-options');
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');

    // --- GAME STATE & SETTINGS ---
    let gameRunning = false;
    let isPaused = false;
    let waveNumber = 0;
    let enemies = [];
    let bullets = [];
    let bots = [];
    let particles = [];
    let sfxVolume = 0.5;
    let musicVolume = 0.5; // Placeholder for music
    let isMobile = 'ontouchstart' in window;

    // --- INPUT HANDLING ---
    const keys = {};
    const joystick = {
        active: false,
        baseX: 0, baseY: 0,
        stickX: 0, stickY: 0,
        dx: 0, dy: 0,
    };
    const joystickContainer = document.getElementById('joystick-container');
    const joystickElement = document.getElementById('joystick');

    // --- GAME OBJECTS ---
    const player = {
        x: 0, y: 0,
        radius: 15,
        color: '#0077FF',
        speed: 3,
        health: 100,
        maxHealth: 100,
        damage: 10,
        attackSpeed: 500, // ms between shots
        bulletSpeed: 5,
        shootCooldown: 0,
        dashSpeed: 12,
        dashDuration: 150, // ms
        dashCooldown: 2000, // ms
        isDashing: false,
        dashTimer: 0,
        dashCooldownTimer: 0,
        autoShoot: false,
        lifesteal: 0,
        poisonChance: 0,
        electricChance: 0,

        reset() {
            this.x = canvas.width / 2;
            this.y = canvas.height / 2;
            this.health = 100;
            this.maxHealth = 100;
            this.damage = 10;
            this.attackSpeed = 500;
            this.speed = 3;
            this.dashCooldown = 2000;
            this.autoShoot = false;
            this.lifesteal = 0;
            this.poisonChance = 0;
            this.electricChance = 0;
            bots = [];
            waveNumber = 0;
        },

        shoot(targetX, targetY) {
            if (this.shootCooldown <= 0) {
                const angle = Math.atan2(targetY - this.y, targetX - this.x);
                let bulletType = 'normal';
                if (this.poisonChance > 0 && Math.random() < this.poisonChance) {
                    bulletType = 'poison';
                }
                
                bullets.push(new Bullet(this.x, this.y, angle, bulletType));
                this.shootCooldown = this.attackSpeed;
            }
        },

        dash(dx, dy) {
            if (this.dashCooldownTimer <= 0) {
                this.isDashing = true;
                this.dashTimer = this.dashDuration;
                this.dashCooldownTimer = this.dashCooldown;
                // Store dash direction
                const magnitude = Math.sqrt(dx * dx + dy * dy);
                if (magnitude > 0) {
                    this.dashDirection = { x: dx / magnitude, y: dy / magnitude };
                } else {
                     this.dashDirection = { x: 1, y: 0 }; // Default dash right if idle
                }
            }
        },

        takeDamage(amount) {
            this.health -= amount;
            if (this.health <= 0) {
                endGame();
            }
        },

        update(deltaTime) {
            // Cooldowns
            if (this.shootCooldown > 0) this.shootCooldown -= deltaTime;
            if (this.dashCooldownTimer > 0) this.dashCooldownTimer -= deltaTime;
            if (this.dashTimer > 0) this.dashTimer -= deltaTime;
            else this.isDashing = false;

            // Movement
            let dx = 0;
            let dy = 0;
            
            // Input sources: Keyboard -> Joystick -> Gamepad
            if (keys['w'] || keys['ArrowUp']) dy -= 1;
            if (keys['s'] || keys['ArrowDown']) dy += 1;
            if (keys['a'] || keys['ArrowLeft']) dx -= 1;
            if (keys['d'] || keys['ArrowRight']) dx += 1;

            if (isMobile && joystick.active) {
                dx = joystick.dx;
                dy = joystick.dy;
            }

            const gamepads = navigator.getGamepads();
            if (gamepads[0]) {
                const gamepad = gamepads[0];
                const axisX = gamepad.axes[0];
                const axisY = gamepad.axes[1];
                if (Math.abs(axisX) > 0.1) dx = axisX;
                if (Math.abs(axisY) > 0.1) dy = axisY;
                if (gamepad.buttons[0].pressed) this.shoot(this.x + dx * 100, this.y + dy * 100); // A button
                if (gamepad.buttons[1].pressed) this.dash(dx, dy); // B button
            }

            const magnitude = Math.sqrt(dx * dx + dy * dy);
            if (magnitude > 0) {
                dx /= magnitude;
                dy /= magnitude;
            }

            if (this.isDashing) {
                this.x += this.dashDirection.x * this.dashSpeed;
                this.y += this.dashDirection.y * this.dashSpeed;
            } else if (magnitude > 0) {
                this.x += dx * this.speed;
                this.y += dy * this.speed;
            }

            // Boundary checks
            this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x));
            this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.y));
            
            // Auto Shoot
            if(this.autoShoot){
                const nearestEnemy = findNearestEnemy(this.x, this.y);
                if(nearestEnemy) {
                    this.shoot(nearestEnemy.x, nearestEnemy.y);
                }
            }

            // Keyboard actions
            if (keys[' ']) this.dash(dx, dy); // Spacebar dash
        },

        draw() {
            // Dash cooldown indicator
            if (this.dashCooldownTimer > 0) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius + 5, 0, Math.PI * 2);
                ctx.fill();
            }
             if (this.isDashing) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                 ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius + 2, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
        }
    };

    class Enemy {
        constructor(x, y) {
            super(x, y);
            this.size = 30;
            this.color = '#B10DC9';
            this.speed = 0.8 + waveNumber * 0.02;
            this.health = 80 + waveNumber * 10;
            this.damage = 15;
        }

        draw() {
            super.draw();
            ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
        }
    }

    class Bullet {
        constructor(x, y, angle, type = 'normal') {
            this.x = x;
            this.y = y;
            this.radius = 5;
            this.type = type;
            this.speed = player.bulletSpeed;
            this.velocity = { x: Math.cos(angle) * this.speed, y: Math.sin(angle) * this.speed };
            this.damage = player.damage;
            
            if(this.type === 'poison') this.color = '#3D9970';
            else if (this.type === 'lifesteal') this.color = '#F012BE';
            else if (this.type === 'freeze') this.color = '#7FDBFF';
            else this.color = '#FFFFFF';
        }

        update() {
            this.x += this.velocity.x;
            this.y += this.velocity.y;
        }

        draw() {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    class Bot {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            this.radius = 10;
            this.color = '#FFDC00';
            this.speed = player.speed * 0.8;
            this.shootCooldown = 0;
            this.attackSpeed = 700;
        }
        
        update(deltaTime) {
            const distToPlayer = distance(this.x, this.y, player.x, player.y);
            if (distToPlayer > 100) {
                 const angle = Math.atan2(player.y - this.y, player.x - this.x);
                 this.x += Math.cos(angle) * this.speed;
                 this.y += Math.sin(angle) * this.speed;
            }
            
            if(this.shootCooldown > 0) this.shootCooldown -= deltaTime;
            
            const nearestEnemy = findNearestEnemy(this.x, this.y);
            if(nearestEnemy && this.shootCooldown <= 0){
                const angle = Math.atan2(nearestEnemy.y - this.y, nearestEnemy.x - this.x);
                bullets.push(new Bullet(this.x, this.y, angle, 'normal'));
                this.shootCooldown = this.attackSpeed;
            }
        }
        
        draw(){
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }
    
    class Particle {
        constructor(x, y, color, size, life){
            this.x = x;
            this.y = y;
            this.color = color;
            this.size = size;
            this.life = life;
            this.initialLife = life;
            this.velocity = {x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4};
        }
        
        update(deltaTime){
            this.x += this.velocity.x;
            this.y += this.velocity.y;
            this.life -= deltaTime;
        }
        
        draw(){
            ctx.globalAlpha = this.life / this.initialLife;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
    }
    
    // --- BOOSTS ---
    const allBoosts = [
        { id: 'dmg_up', title: '+20% Damage', desc: 'Your bullets deal more damage.', apply: () => player.damage *= 1.2 },
        { id: 'aspd_up', title: '+25% Attack Speed', desc: 'Shoot faster.', apply: () => player.attackSpeed *= 0.75 },
        { id: 'hp_up', title: '+25 Max Health', desc: 'Increases and restores max health.', apply: () => { player.maxHealth += 25; player.health += 25; } },
        { id: 'speed_up', title: '+15% Move Speed', desc: 'Move faster.', apply: () => player.speed *= 1.15 },
        { id: 'dash_cd', title: '-20% Dash Cooldown', desc: 'Dash more often.', apply: () => player.dashCooldown *= 0.8 },
        { id: 'autoshoot', title: 'Auto Shoot', desc: 'Automatically shoot at the nearest enemy.', apply: () => player.autoShoot = true },
        { id: 'elec_hit', title: 'Electric Hits', desc: '15% chance to zap nearby enemies.', apply: () => player.electricChance = 0.15 },
        { id: 'lifesteal', title: 'Lifesteal Bullets', desc: 'Gain 5% of damage dealt as health.', apply: () => player.lifesteal += 0.05 },
        { id: 'poison', title: 'Poison Bullets', desc: '15% chance to poison enemies.', apply: () => player.poisonChance = 0.15 },
        { id: 'freeze', title: 'Freeze Bullets', desc: '10% chance to briefly slow enemies.', apply: () => {
             allBoosts.find(b => b.id === 'freeze').apply = () => {}; // Can't stack, so we make it do nothing on subsequent picks.
             bullets.forEach(b => b.type === 'normal' ? b.type = 'freeze' : ''); // change existing bullets
             Bullet.prototype.type = 'freeze'; // change future bullets
        }},
        { id: 'add_bot', title: 'Add AI Bot', desc: 'A friendly bot will help you fight.', apply: () => bots.push(new Bot(player.x, player.y)) },
    ];
    let availableBoosts = [];


    // --- UTILITY FUNCTIONS ---
    function distance(x1, y1, x2, y2) {
        return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    }

    function findNearestEnemy(fromX, fromY) {
        let nearest = null;
        let nearestDist = Infinity;
        for(const enemy of enemies) {
            const d = distance(fromX, fromY, enemy.x, enemy.y);
            if (d < nearestDist) {
                nearestDist = d;
                nearest = enemy;
            }
        }
        return nearest;
    }
    
    function createParticles(x, y, color, amount = 5, size = 3, life = 500) {
        for(let i=0; i<amount; i++) {
            particles.push(new Particle(x, y, color, Math.random() * size + 1, Math.random() * life + 200));
        }
    }


    // --- GAME LOGIC ---
    function init() {
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        
        // Menu Buttons
        startButton.addEventListener('click', startGame);
        settingsButton.addEventListener('click', () => {
            mainMenu.classList.add('hidden');
            settingsScreen.classList.remove('hidden');
        });
        backButton.addEventListener('click', () => {
            settingsScreen.classList.add('hidden');
            mainMenu.classList.remove('hidden');
        });

        // Input Listeners
        window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
        window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
        canvas.addEventListener('mousedown', e => {
            if(!player.autoShoot) player.shoot(e.clientX, e.clientY);
        });

        // Mobile Joystick
        if (isMobile) {
            joystickContainer.style.display = 'block';
            canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
            canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
            canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
            canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });
        }
    }

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    function startGame() {
        mainMenu.classList.add('hidden');
        canvas.classList.remove('hidden');
        if (isMobile) joystickContainer.style.display = 'block';
        
        gameRunning = true;
        isPaused = false;
        enemies = [];
        bullets = [];
        particles = [];
        player.reset();
        
        startNextWave();
        
        gameLoop();
    }
    
    function endGame() {
        gameRunning = false;
        canvas.classList.add('hidden');
        if (isMobile) joystickContainer.style.display = 'none';
        mainMenu.classList.remove('hidden');
        mainMenu.querySelector('h1').textContent = `Game Over! You reached Wave ${waveNumber}`;
    }

    /**
     * MODIFIED FUNCTION
     * Spawns enemies in a circle around the player, just off-screen.
     */
    function startNextWave() {
        waveNumber++;
        // Define a spawn radius just outside the viewport from the player's perspective
        const spawnRadius = Math.sqrt(Math.pow(canvas.width / 2, 2) + Math.pow(canvas.height / 2, 2)) + 50;

        const numTriangles = 5 + waveNumber * 2;
        const numCubes = Math.floor(waveNumber / 3);

        for (let i = 0; i < numTriangles; i++) {
            // Calculate a random angle
            const angle = Math.random() * Math.PI * 2;
            // Calculate spawn position based on player's location and the angle/radius
            const x = player.x + Math.cos(angle) * spawnRadius;
            const y = player.y + Math.sin(angle) * spawnRadius;
            enemies.push(new Triangle(x, y));
        }
        for (let i = 0; i < numCubes; i++) {
            const angle = Math.random() * Math.PI * 2;
            const x = player.x + Math.cos(angle) * spawnRadius;
            const y = player.y + Math.sin(angle) * spawnRadius;
            enemies.push(new Cube(x, y));
        }
        isPaused = false;
        upgradeScreen.classList.add('hidden');
    }
    
    function showUpgradeScreen() {
        isPaused = true;
        upgradeScreen.classList.remove('hidden');
        upgradeOptionsContainer.innerHTML = '';
        
        availableBoosts = [...allBoosts]; // Reset available boosts
        const chosenBoosts = [];
        // Prevent choosing auto-shoot if already have it
        if(player.autoShoot) availableBoosts = availableBoosts.filter(b => b.id !== 'autoshoot');

        for(let i=0; i<3; i++){
            if(availableBoosts.length === 0) break;
            const randIndex = Math.floor(Math.random() * availableBoosts.length);
            const boost = availableBoosts.splice(randIndex, 1)[0];
            chosenBoosts.push(boost);

            const card = document.createElement('div');
            card.className = 'upgrade-card';
            card.innerHTML = `<h3>${boost.title}</h3><p>${boost.desc}</p>`;
            card.addEventListener('click', () => {
                boost.apply();
                startNextWave();
            });
            upgradeOptionsContainer.appendChild(card);
        }
    }

    // --- MAIN GAME LOOP ---
    let lastTime = 0;
    function gameLoop(timestamp) {
        if (!gameRunning) return;

        const deltaTime = (timestamp - lastTime) || 0;
        lastTime = timestamp;

        if (!isPaused) {
            update(deltaTime);
        }
        draw();

        requestAnimationFrame(gameLoop);
    }

    function update(deltaTime) {
        player.update(deltaTime);
        
        enemies.forEach(enemy => enemy.update(deltaTime));
        bullets.forEach(bullet => bullet.update());
        bots.forEach(bot => bot.update(deltaTime));
        particles.forEach(p => p.update(deltaTime));

        // Collision: Bullet -> Enemy
        for (let i = bullets.length - 1; i >= 0; i--) {
            const bullet = bullets[i];
            for (let j = enemies.length - 1; j >= 0; j--) {
                const enemy = enemies[j];
                const dist = distance(bullet.x, bullet.y, enemy.x, enemy.y);
                if (dist < enemy.size / 2 + bullet.radius) {
                    // Electric hit check
                    if(player.electricChance > 0 && Math.random() < player.electricChance){
                         enemies.forEach(otherEnemy => {
                             if(otherEnemy !== enemy && distance(enemy.x, enemy.y, otherEnemy.x, otherEnemy.y) < 80){
                                 otherEnemy.takeDamage(player.damage * 0.5, 'normal');
                                 createParticles(enemy.x, enemy.y, '#FFFF33', 10, 2, 300);
                             }
                         });
                    }

                    enemy.takeDamage(bullet.damage, bullet.type);
                    if (player.lifesteal > 0) {
                        player.health = Math.min(player.maxHealth, player.health + bullet.damage * player.lifesteal);
                        createParticles(player.x, player.y, '#FF00FF', 1, 5, 200);
                    }
                    bullets.splice(i, 1);
                    break;
                }
            }
        }
        
        // Collision: Player -> Enemy
        if (!player.isDashing) {
             for (let i = enemies.length - 1; i >= 0; i--) {
                const enemy = enemies[i];
                const dist = distance(player.x, player.y, enemy.x, enemy.y);
                if (dist < enemy.size / 2 + player.radius) {
                    createParticles(player.x, player.y, '#FF0000', 5, 4, 400);
                    player.takeDamage(enemy.damage);
                    enemies.splice(i, 1);
                }
            }
        }

        // Cleanup dead enemies and out-of-bounds bullets
        enemies = enemies.filter(e => e.health > 0);
        bullets = bullets.filter(b => b.x > 0 && b.x < canvas.width && b.y > 0 && b.y < canvas.height);
        particles = particles.filter(p => p.life > 0);
        
        // Check for wave end
        if(enemies.length === 0 && gameRunning && !isPaused) {
            showUpgradeScreen();
        }
    }

    /**
     * NEW FUNCTION
     * Draws a checkerboard pattern on the canvas.
     */
    function drawBackground() {
        const tileSize = 50; // Size of the checkerboard squares
        const color1 = '#555555'; // Dark grey
        const color2 = '#444444'; // Darker grey

        for (let y = 0; y < canvas.height; y += tileSize) {
            for (let x = 0; x < canvas.width; x += tileSize) {
                const col = Math.floor(x / tileSize);
                const row = Math.floor(y / tileSize);

                if ((row + col) % 2 === 0) {
                    ctx.fillStyle = color1;
                } else {
                    ctx.fillStyle = color2;
                }
                ctx.fillRect(x, y, tileSize, tileSize);
            }
        }
    }

    /**
     * MODIFIED FUNCTION
     * Now draws the background first.
     */
    function draw() {
        // ctx.clearRect(0, 0, canvas.width, canvas.height); // No longer needed
        drawBackground(); // Draw the new background

        particles.forEach(p => p.draw());
        bots.forEach(bot => bot.draw());
        player.draw();
        enemies.forEach(enemy => enemy.draw());
        bullets.forEach(bullet => bullet.draw());
        
        // UI Drawing
        // Health bar
        const barWidth = 200;
        const barHeight = 20;
        const barX = canvas.width - barWidth - 20;
        const barY = canvas.height - barHeight - 20;
        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        ctx.fillStyle = '#FF4136';
        ctx.fillRect(barX, barY, barWidth * (player.health / player.maxHealth), barHeight);
        ctx.strokeStyle = 'white';
        ctx.strokeRect(barX, barY, barWidth, barHeight);
        
        // Wave number
        ctx.fillStyle = 'white';
        ctx.font = '24px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`Wave: ${waveNumber}`, 20, 40);

        // Dash Cooldown UI
        const dashIconX = canvas.width - 250;
        const dashIconY = canvas.height - 45;
        ctx.globalAlpha = player.dashCooldownTimer > 0 ? 0.5 : 1.0;
        ctx.fillStyle = "white";
        ctx.font = "bold 20px Arial";
        ctx.fillText("DASH", dashIconX, dashIconY + 15);
        ctx.globalAlpha = 1.0;
    }
    
    // --- MOBILE JOYSTICK HANDLERS ---
    function handleTouchStart(e) {
        e.preventDefault();
        const touch = e.changedTouches[0];
        // Only activate joystick on the left half of the screen
        if (touch.clientX < canvas.width / 2) {
            joystick.active = true;
            joystick.baseX = touch.clientX;
            joystick.baseY = touch.clientY;
            joystick.stickX = touch.clientX;
            joystick.stickY = touch.clientY;
            
            joystickContainer.style.left = `${joystick.baseX - 50}px`;
            joystickContainer.style.top = `${joystick.baseY - 50}px`;
            joystickContainer.style.display = 'block';
        } else {
             // Treat touches on the right half as shooting
            if (!player.autoShoot) {
                player.shoot(touch.clientX, touch.clientY);
            }
        }
    }
    
    function handleTouchMove(e) {
        e.preventDefault();
        if (!joystick.active) return;
        const touch = e.changedTouches[0];
        joystick.stickX = touch.clientX;
        joystick.stickY = touch.clientY;
        
        let dx = joystick.stickX - joystick.baseX;
        let dy = joystick.stickY - joystick.baseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if(dist > 50) { // Max range of joystick
            dx = (dx / dist) * 50;
            dy = (dy / dist) * 50;
        }

        joystickElement.style.transform = `translate(${dx}px, ${dy}px)`;

        joystick.dx = dx / 50;
        joystick.dy = dy / 50;
    }
    
    function handleTouchEnd(e) {
        e.preventDefault();
        if (joystick.active) {
            let touchEnded = false;
            for(let i=0; i<e.changedTouches.length; i++){
                const touch = e.changedTouches[i];
                 // If this is the touch that started the joystick
                 if(touch.clientX === joystick.baseX && touch.clientY === joystick.baseY){
                    touchEnded = true;
                    break;
                 }
            }
            if(touchEnded) {
                joystick.active = false;
                joystick.dx = 0;
                joystick.dy = 0;
                joystickElement.style.transform = `translate(0px, 0px)`;
                joystickContainer.style.display = 'none';
            }
        }
    }


    // --- INITIALIZE THE GAME ---
    init();
});
