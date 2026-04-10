// 簡單的 2D 向量類別
class Vector {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    add(v) { return new Vector(this.x + v.x, this.y + v.y); }
    sub(v) { return new Vector(this.x - v.x, this.y - v.y); }
    mul(n) { return new Vector(this.x * n, this.y * n); }
    mag() { return Math.sqrt(this.x * this.x + this.y * this.y); }
    normalize() {
        const m = this.mag();
        return m === 0 ? new Vector(0, 0) : new Vector(this.x / m, this.y / m);
    }
    dot(v) { return this.x * v.x + this.y * v.y; }
}

// 實體基底類別
class Entity {
    constructor(x, y, radius, color) {
        this.pos = new Vector(x, y);
        this.vel = new Vector(0, 0);
        this.radius = radius;
        this.color = color;
        this.mass = radius; // 質量跟半徑成正比
        this.isDead = false;
    }

    update(width, height) {
        // 套用速度
        this.pos = this.pos.add(this.vel);
        
        // 摩擦力減速
        this.vel = this.vel.mul(0.97);
        if (this.vel.mag() < 0.5) this.vel = new Vector(0, 0);

        // 邊界碰撞判斷 (反彈)
        if (this.pos.x - this.radius < 0) {
            this.pos.x = this.radius;
            this.vel.x *= -0.9;
        } else if (this.pos.x + this.radius > width) {
            this.pos.x = width - this.radius;
            this.vel.x *= -0.9;
        }
        
        if (this.pos.y - this.radius < 0) {
            this.pos.y = this.radius;
            this.vel.y *= -0.9;
        } else if (this.pos.y + this.radius > height) {
            this.pos.y = height - this.radius;
            this.vel.y *= -0.9;
        }
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.closePath();
    }
}

// 玩家類別
class Player extends Entity {
    constructor(x, y) {
        super(x, y, 20, '#60a5fa');
        this.type = 'bounce'; // 'bounce' 或 'pierce'
        this.isUltimateReady = false;
        this.isUltimateActive = false;
    }

    draw(ctx) {
        // 外發光特效
        ctx.shadowBlur = 20;
        ctx.shadowColor = this.color;
        
        // 如果開啟大絕，顯示強烈特效
        if (this.isUltimateActive) {
            ctx.shadowBlur = 40;
            ctx.shadowColor = '#ef4444';
            ctx.fillStyle = '#fca5a5';
        } else {
            ctx.fillStyle = this.color;
        }

        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.closePath();

        // 畫一個核心指示器代表類別
        ctx.beginPath();
        if (this.type === 'bounce') {
            ctx.arc(this.pos.x, this.pos.y, 8, 0, Math.PI * 2);
        } else {
            // 貫通型畫一個銳利的菱形
            ctx.moveTo(this.pos.x, this.pos.y - 12);
            ctx.lineTo(this.pos.x + 8, this.pos.y);
            ctx.lineTo(this.pos.x, this.pos.y + 12);
            ctx.lineTo(this.pos.x - 8, this.pos.y);
        }
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.closePath();

        ctx.shadowBlur = 0; // 重置
    }
}

// 敵人類別
class Enemy extends Entity {
    constructor(x, y) {
        super(x, y, 25, '#ef4444');
        this.hp = 3; // 預設血量
        this.maxHp = 3;
        this.hitCooldown = 0; // 避免一瞬間重複撞擊判定多次
    }

    takeDamage(amount) {
        if (this.hitCooldown > 0) return;
        this.hp -= amount;
        this.hitCooldown = 15; // 15 frames cooldown
        
        if (this.hp <= 0) {
            this.isDead = true;
        } else {
            // 受傷閃爍顏色
            this.color = '#fca5a5';
            setTimeout(() => { this.color = '#ef4444'; }, 100);
        }
    }

    update(width, height) {
        super.update(width, height);
        if (this.hitCooldown > 0) this.hitCooldown--;
    }

    draw(ctx) {
        super.draw(ctx);
        // 畫血條
        const hpPercent = this.hp / this.maxHp;
        ctx.fillStyle = '#333';
        ctx.fillRect(this.pos.x - 20, this.pos.y - this.radius - 12, 40, 6);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(this.pos.x - 20, this.pos.y - this.radius - 12, 40 * hpPercent, 6);
    }
}

// 遊戲狀態與變數
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let rect = canvas.getBoundingClientRect();
canvas.width = rect.width;
canvas.height = rect.height;

let player;
let enemies = [];
let turnCount = 0;
let ultimateCharge = 0;
let gameState = 'IDLE'; // IDLE, DRAGGING, MOVING, GAMEOVER

let dragStart = new Vector(0, 0);
let dragEnd = new Vector(0, 0);

// 初始化關卡
function initLevel() {
    player = new Player(canvas.width / 2, canvas.height - 100);
    enemies = [
        new Enemy(canvas.width / 2, 150),
        new Enemy(canvas.width / 2 - 100, 250),
        new Enemy(canvas.width / 2 + 100, 250)
    ];
    turnCount = 0;
    ultimateCharge = 0;
    gameState = 'IDLE';
    updateUIText();
    document.getElementById('game-over-modal').classList.add('hidden');
}

// 彈性碰撞物理計算核心
function resolveCollision(e1, e2, isPlayerPiercingThisEnemy) {
    const d = e1.pos.sub(e2.pos);
    const dist = d.mag();
    const minDist = e1.radius + e2.radius;

    if (dist < minDist) {
        const overlap = minDist - dist;
        const n = d.normalize();
        
        // 如果是貫通型撞擊敵人，允許兩者影像重疊穿透！
        if (isPlayerPiercingThisEnemy) {
            // 注意：我們【不要】修改 e1 或 e2 的位置(pos)，讓玩家可以直接穿過敵人身體！
            
            // 為了避免每秒 60 幀都在重疊導致速度瞬間歸零，我們只在能夠造成傷害的那一瞬間才進行減速
            if (e2.hitCooldown <= 0) {
                // 穿過敵人時，自身速度受到阻力衰減
                e1.vel = e1.vel.mul(0.75); 
                // 給予敵人輕微的「被劃過」的微小衝擊速度
                e2.vel = e2.vel.add(e1.vel.mul(0.1));
            }
            
        } else {
            // 普通反彈模式：將兩者推開避免黏在一起
            const correction = n.mul(overlap / 2);
            e1.pos = e1.pos.add(correction);
            e2.pos = e2.pos.sub(correction);

            // 計算一維彈性碰撞後的動能轉移
            const relativeVelocity = e1.vel.sub(e2.vel);
            const speed = relativeVelocity.dot(n);
            if (speed > 0) return; // 正在遠離

            const restitution = 0.8; // 彈性係數
            const impulse = -(1 + restitution) * speed / (1 / e1.mass + 1 / e2.mass);

            const impulseVector = n.mul(impulse);
            e1.vel = e1.vel.add(impulseVector.mul(1 / e1.mass));
            e2.vel = e2.vel.sub(impulseVector.mul(1 / e2.mass));
        }

        // 觸發傷害
        if (e2 instanceof Enemy) {
            e2.takeDamage(player.isUltimateActive ? 2 : 1); // 開大絕傷害兩倍
        } else if (e1 instanceof Enemy) {
            e1.takeDamage(player.isUltimateActive ? 2 : 1);
        }
    }
}

// 主迴圈
function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 狀態機判斷：所有物件是否停下
    let allStopped = player.vel.mag() === 0;
    for (let e of enemies) {
        if (e.vel.mag() !== 0) allStopped = false;
        e.update(canvas.width, canvas.height);
    }
    
    // 如果是在 MOVING 狀態下全部停等，就進入結算
    if (gameState === 'MOVING' && allStopped) {
        gameState = 'IDLE';
        // 關閉大絕招狀態
        if(player.isUltimateActive) {
            player.isUltimateActive = false;
        }
        updateUIText();
        checkGameOver();
    }

    player.update(canvas.width, canvas.height);

    // 處理碰撞
    for (let i = 0; i < enemies.length; i++) {
        // 玩家 vs 敵人
        const isPierceHit = (player.type === 'pierce');
        resolveCollision(player, enemies[i], isPierceHit);
        
        // 敵人 vs 敵人
        for (let j = i + 1; j < enemies.length; j++) {
            resolveCollision(enemies[i], enemies[j], false);
        }
    }

    // 清除死亡的敵人
    enemies = enemies.filter(e => !e.isDead);

    // 繪製
    for (let e of enemies) e.draw(ctx);
    player.draw(ctx);

    // 繪製拖曳瞄準線
    if (gameState === 'DRAGGING') {
        const dragVector = dragStart.sub(dragEnd); // 拉的「反方向」
        let pullDist = dragVector.mag();
        
        if (pullDist > 0) {
            // 限制最大拖曳長度代表最大力量
            const maxPull = 150;
            if (pullDist > maxPull) pullDist = maxPull;
            
            const n = dragVector.normalize();
            const startX = player.pos.x;
            const startY = player.pos.y;
            // 瞄準線的終點（投射出去的方向）
            const targetX = startX + n.x * pullDist * 2;
            const targetY = startY + n.y * pullDist * 2;

            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(targetX, targetY);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 3;
            // 實線如果是貫通，虛線如果是反彈 (只是增加細節視覺)
            if (player.type === 'bounce') ctx.setLineDash([10, 10]);
            else ctx.setLineDash([]);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // 畫個小箭頭在前端
            ctx.beginPath();
            ctx.arc(targetX, targetY, 4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.fill();
        }
    }

    requestAnimationFrame(gameLoop);
}

// 事件監聽 (滑鼠/觸控)
canvas.addEventListener('mousedown', (e) => startDrag(e.offsetX, e.offsetY));
canvas.addEventListener('mousemove', (e) => doDrag(e.offsetX, e.offsetY));
window.addEventListener('mouseup', () => endDrag());

canvas.addEventListener('touchstart', (e) => {
    const rect = canvas.getBoundingClientRect();
    startDrag(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
}, {passive: false});
canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    doDrag(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
}, {passive: false});
window.addEventListener('touchend', () => endDrag());

function startDrag(x, y) {
    if (gameState !== 'IDLE') return;
    gameState = 'DRAGGING';
    dragStart = new Vector(x, y);
    dragEnd = new Vector(x, y);
}

function doDrag(x, y) {
    if (gameState !== 'DRAGGING') return;
    dragEnd = new Vector(x, y);
}

function endDrag() {
    if (gameState !== 'DRAGGING') return;
    
    // 計算彈射向量
    let dragVector = dragStart.sub(dragEnd);
    let pullDist = dragVector.mag();
    
    if (pullDist > 10) { // 避免輕微誤觸
        const maxPull = 150;
        if (pullDist > maxPull) pullDist = maxPull;
        
        let powerRatio = pullDist / maxPull; // 0.0 ~ 1.0
        let baseSpeed = 20; 
        
        // 如果開大絕，速度加倍！
        if (player.isUltimateActive) baseSpeed = 45;

        player.vel = dragVector.normalize().mul(powerRatio * baseSpeed);
        
        gameState = 'MOVING';
        turnCount++;
        if (ultimateCharge < 2 && !player.isUltimateActive) {
            ultimateCharge++;
        }
        updateUIText();
    } else {
        gameState = 'IDLE'; // 取消拖曳
    }
}

// UI 系統邏輯
function updateUIText() {
    document.getElementById('turn-display').innerText = turnCount;
    document.getElementById('enemy-count').innerText = enemies.length;
    
    const skillBtn = document.getElementById('skill-btn');
    const cdDisplay = document.getElementById('cd-display');
    
    if (ultimateCharge >= 2) {
        player.isUltimateReady = true;
        skillBtn.disabled = false;
        skillBtn.classList.add('ready');
        cdDisplay.innerText = "(就緒!)";
    } else {
        player.isUltimateReady = false;
        skillBtn.disabled = true;
        skillBtn.classList.remove('ready');
        cdDisplay.innerText = `(充能中 ${ultimateCharge}/2)`;
    }
}

// 按鈕事件
document.getElementById('type-toggle-btn').addEventListener('click', () => {
    const display = document.getElementById('type-display');
    if (player.type === 'bounce') {
        player.type = 'pierce';
        player.color = '#f472b6'; // 粉色代表貫通
        display.innerText = "貫通型";
        display.className = "pierce-type";
    } else {
        player.type = 'bounce';
        player.color = '#60a5fa'; // 藍色代表反彈
        display.innerText = "反彈型";
        display.className = "bounce-type";
    }
});

document.getElementById('skill-btn').addEventListener('click', () => {
    if (gameState === 'IDLE' && ultimateCharge >= 2) {
        player.isUltimateActive = true;
        ultimateCharge = 0; // 收回充能
        updateUIText();
    }
});

document.getElementById('restart-btn').addEventListener('click', () => {
    initLevel();
});

// 遊戲勝利判定
function checkGameOver() {
    if (enemies.length === 0) {
        gameState = 'GAMEOVER';
        document.getElementById('game-over-modal').classList.remove('hidden');
        document.getElementById('final-turns').innerText = turnCount;
    }
}

// 啟動遊戲
initLevel();
gameLoop();
