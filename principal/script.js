// ===== ELEMENTOS DOM =====
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const debugDiv = document.getElementById('debug');

// UI Elements
const sliderCarga = document.getElementById('sliderCarga');
const valCarga = document.getElementById('valCarga');
const btnReset = document.getElementById('btnReset');
const btnWinReset = document.getElementById('btnWinReset');
const winMsg = document.getElementById('winMsg');
const statShots = document.getElementById('statShots');
const statWins = document.getElementById('statWins');
const statBest = document.getElementById('statBest');
const finalShots = document.getElementById('finalShots');
const uiPanel = document.getElementById('ui');

// Menú
const startScreen = document.getElementById('startScreen');
const btnStartGame = document.getElementById('btnStartGame');
const btnBackMenu = document.getElementById('btnBackMenu');

// Configurar canvas
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// ===== ESTADÍSTICAS =====
let stats = {
    shots: 0,
    wins: 0,
    bestScore: null
};

// ===== CONSTANTES FÍSICAS =====
const K = 18000; // Constante de Coulomb
const DT = 0.016; // Delta tiempo
const FRICTION = 0.994; // Fricción

// Parámetros de disparo
const MAX_POWER = 1200; // Potencia máxima
const POWER_SENSITIVITY = 12.0; // Sensibilidad del arrastre
const SHOT_DURATION = 5000; // Duración máxima del tiro (5 segundos)

// === VARIABLES DE ANIMACIÓN ===
// Ya no usamos delay fijo para evitar el lag visual
let lastAnimTime = 0;

// ===== VARIABLES DEL JUEGO =====
let particles = [];
let gameActive = false; // Control del menú

// POSICIONES RELATIVAS (en porcentajes del canvas)
const BALL_START_X_PERCENT = 0.15; // 15% desde la izquierda

// Función para calcular posiciones basadas en el tamaño del canvas
function getGamePositions() {
    return {
        cx: canvas.width / 2,
        cy: canvas.height / 2,
        ballStartX: canvas.width * BALL_START_X_PERCENT,
        ballStartY: canvas.height / 2
    };
}

// Función para generar posición aleatoria del hoyo
function generateRandomHolePosition() {
    const margin = 150; // Margen desde los bordes
    return {
        x: margin + Math.random() * (canvas.width - margin * 2),
        y: margin + Math.random() * (canvas.height - margin * 2)
    };
}

// Inicializar posiciones
let positions = getGamePositions();

// Hoyo (posición inicial aleatoria)
let holePos = generateRandomHolePosition();
let hole = { 
    x: holePos.x, 
    y: holePos.y, 
    r: 25 
};

// Obstáculos
let obstacles = [];

// Bola
let ball = { 
    startX: positions.ballStartX, 
    startY: positions.ballStartY,
    x: positions.ballStartX, 
    y: positions.ballStartY, 
    vx: 0, 
    vy: 0, 
    q: 10, 
    r: 12, 
    moving: false,
    shotStartTime: 0 
};

// Mouse/Touch
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let dragCurrent = { x: 0, y: 0 };

// ===== FUNCIONES DEL JUEGO =====

/**
 * Genera obstáculos aleatorios (SOLO llamar en reset/inicio)
 */
function generateRandomObstacles() {
    obstacles = [];
    const pos = getGamePositions();
    
    // Generar exactamente 2 partículas positivas y 2 negativas
    const particleTypes = [true, true, false, false]; // true = positivo, false = negativo
    
    // Mezclar el array para posiciones aleatorias
    for(let i = particleTypes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [particleTypes[i], particleTypes[j]] = [particleTypes[j], particleTypes[i]];
    }
    
    for(let i = 0; i < particleTypes.length; i++) {
        const isPositive = particleTypes[i];
        // Generar en el área central
        const minX = pos.ballStartX + 100;
        const maxX = canvas.width - 100;
        const x = minX + Math.random() * (maxX - minX);
        const y = pos.cy + (Math.random() - 0.5) * (canvas.height * 0.6);
        
        // Guardamos x, y ADEMÁS de baseX, baseY
        const finalX = Math.max(200, Math.min(canvas.width - 200, x));
        const finalY = Math.max(100, Math.min(canvas.height - 100, y));

        obstacles.push({
            x: finalX,
            y: finalY,
            baseX: finalX, // Guardamos la posición original para que no se pierda al vibrar
            baseY: finalY, // Guardamos la posición original
            q: isPositive ? (20 + Math.random() * 30) : -(20 + Math.random() * 30),
            r: 30 + Math.random() * 15,
            color: isPositive ? '#ff3333' : '#00ccff'
        });
    }
}

/**
 * Actualiza el layout al cambiar tamaño (ARREGLADO: mantiene proporciones)
 */
function updateLayoutOnResize() {
    // Recalcular todas las posiciones basadas en el nuevo tamaño
    positions = getGamePositions();
    
    // El hoyo mantiene su posición relativa
    const relativeHoleX = hole.x / canvas.width;
    const relativeHoleY = hole.y / canvas.height;
    
    hole.x = relativeHoleX * canvas.width;
    hole.y = relativeHoleY * canvas.height;
    
    // Actualizar posición inicial de la bola
    ball.startX = positions.ballStartX;
    ball.startY = positions.ballStartY;
    
    // Si la bola no se está moviendo, reposicionarla
    if(!ball.moving) {
        ball.x = positions.ballStartX;
        ball.y = positions.ballStartY;
    }
    
    // Reposicionar obstáculos proporcionalmente
    obstacles.forEach(obs => {
        // Usamos baseX en lugar de x para el cálculo relativo, para evitar drift
        const relativeX = (obs.baseX || obs.x) / canvas.width;
        const relativeY = (obs.baseY || obs.y) / canvas.height;
        
        obs.baseX = relativeX * canvas.width;
        obs.baseY = relativeY * canvas.height;
        
        // Asegurar que estén dentro de límites
        obs.baseX = Math.max(100, Math.min(canvas.width - 100, obs.baseX));
        obs.baseY = Math.max(80, Math.min(canvas.height - 80, obs.baseY));

        // Actualizamos la posición visual actual
        obs.x = obs.baseX;
        obs.y = obs.baseY;
    });
}

/**
 * Reinicia el juego (genera nuevos obstáculos)
 */
function resetGame() {
    // Recalcular posiciones
    positions = getGamePositions();
    
    ball.x = positions.ballStartX;
    ball.y = positions.ballStartY;
    ball.startX = positions.ballStartX;
    ball.startY = positions.ballStartY;
    ball.vx = 0;
    ball.vy = 0;
    ball.moving = false;
    winMsg.style.display = 'none';
    particles = [];
    stats.shots = 0;
    statShots.innerText = stats.shots;
    
    // Generar nueva posición aleatoria para el hoyo
    const newHolePos = generateRandomHolePosition();
    hole.x = newHolePos.x;
    hole.y = newHolePos.y;
    
    generateRandomObstacles(); // Genera nivel nuevo
    
    debugDiv.innerText = "🟢 SISTEMA: NIVEL REINICIADO";
    draw();
}

/**
 * Actualiza la física del juego
 */
function update() {
    // === ANIMACIÓN FLUIDA DE OBSTÁCULOS (SIN LAG) ===
    // Usamos el tiempo y funciones matemáticas para un movimiento suave
    const time = Date.now() * 0.003; // Velocidad de la animación
    
    obstacles.forEach((obs, index) => {
        // Math.sin crea un movimiento de onda suave
        // 'index' hace que cada bola se mueva a destiempo (desfase)
        const offsetX = Math.sin(time + index) * 4; // 4px a los lados
        const offsetY = Math.cos(time + index * 0.7) * 4; // 4px arriba/abajo
        
        // Aplicamos el movimiento sobre la posición base
        obs.x = obs.baseX + offsetX;
        obs.y = obs.baseY + offsetY;
    });
    // ===============================================

    // Actualizar partículas
    particles = particles.filter(p => {
        p.life--;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.2; 
        p.alpha = p.life / p.maxLife;
        return p.life > 0;
    });

    if (ball.moving) {
        // Verificar tiempo límite del disparo
        const elapsedTime = Date.now() - ball.shotStartTime;
        if (elapsedTime >= SHOT_DURATION) {
            ball.moving = false;
            ball.vx = 0;
            ball.vy = 0;
            debugDiv.innerText = "⏱️ SISTEMA: TIEMPO AGOTADO";
            return;
        }
        
        let fx = 0, fy = 0;

        // Calcular fuerzas de obstáculos
        obstacles.forEach(obs => {
            let dx = ball.x - obs.x;
            let dy = ball.y - obs.y;
            let distSq = dx*dx + dy*dy;
            let dist = Math.sqrt(distSq);

            // Colisión con obstáculo
            if (dist < obs.r + ball.r + 5) {
                let angle = Math.atan2(dy, dx);
                ball.vx = Math.cos(angle) * 15; 
                ball.vy = Math.sin(angle) * 15;
                ball.x += Math.cos(angle) * 8; 
                ball.y += Math.sin(angle) * 8;
                
                // Efecto de partículas en colisión
                for(let i=0; i<15; i++) {
                    particles.push({
                        x: ball.x, y: ball.y,
                        vx: (Math.random()-0.5)*8, 
                        vy: (Math.random()-0.5)*8,
                        life: 30, maxLife: 30,
                        color: obs.color, alpha: 1
                    });
                }
            }

            // Fuerza eléctrica (Ley de Coulomb)
            if (dist > obs.r + ball.r + 10 && dist < 400) { 
                let F = (K * ball.q * obs.q) / distSq;
                fx += F * (dx / dist);
                fy += F * (dy / dist);
            }
        });

        // Aplicar fuerzas
        ball.vx += fx * DT;
        ball.vy += fy * DT;
        
        // Límite de velocidad
        let speed = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
        if(speed > 600) {
            ball.vx = (ball.vx / speed) * 600;
            ball.vy = (ball.vy / speed) * 600;
        }
        
        // Aplicar fricción
        ball.vx *= FRICTION; 
        ball.vy *= FRICTION;

        // Estela de partículas
        if(Math.random() < 0.2) {
            particles.push({
                x: ball.x, y: ball.y, 
                vx: 0, vy: 0,
                life: 15, maxLife: 15, 
                color: '#ffffff', alpha: 0.8
            });
        }

        // Detener si velocidad muy baja
        if (Math.abs(ball.vx) < 0.05 && Math.abs(ball.vy) < 0.05) {
            ball.moving = false;
            ball.vx = 0; 
            ball.vy = 0;
            debugDiv.innerText = "🟢 SISTEMA: BOLA DETENIDA";
        }

        // Actualizar posición
        ball.x += ball.vx * DT;
        ball.y += ball.vy * DT;

        // Colisiones con bordes
        if (ball.x < 0 || ball.x > canvas.width) ball.vx *= -0.8;
        if (ball.y < 0 || ball.y > canvas.height) ball.vy *= -0.8;
        ball.x = Math.max(ball.r, Math.min(canvas.width - ball.r, ball.x));
        ball.y = Math.max(ball.r, Math.min(canvas.height - ball.r, ball.y));

        // Verificar victoria (bola en hoyo)
        let dxH = ball.x - hole.x;
        let dyH = ball.y - hole.y;
        if (Math.sqrt(dxH*dxH + dyH*dyH) < hole.r) {
            ball.moving = false;
            stats.wins++;
            statWins.innerText = stats.wins;
            
            // Actualizar mejor puntuación
            if(stats.bestScore === null || stats.shots < stats.bestScore) {
                stats.bestScore = stats.shots;
                statBest.innerText = stats.bestScore;
            }
            
            finalShots.innerText = stats.shots;
            winMsg.style.display = 'block';
            
            // Generar nueva posición aleatoria para el hoyo
            const newHolePos = generateRandomHolePosition();
            hole.x = newHolePos.x;
            hole.y = newHolePos.y;
            
            // Generar nuevos obstáculos para siguiente nivel
            generateRandomObstacles(); 
            
            // Efecto de victoria
            for(let i=0; i<80; i++) {
                particles.push({
                    x: hole.x, y: hole.y,
                    vx: (Math.random()-0.5)*20, 
                    vy: (Math.random()-0.5)*20 - 5,
                    life: 80, maxLife: 80,
                    color: ['#ffd700','#ffffff','#ff0000'][Math.floor(Math.random()*3)],
                    alpha: 1
                });
            }
        }
    }
}

/**
 * Dibuja el juego
 */
function draw() {
    // Fondo con gradiente
    const gradient = ctx.createRadialGradient(
        canvas.width/2, canvas.height/2, 0, 
        canvas.width/2, canvas.height/2, canvas.width
    );
    gradient.addColorStop(0, '#1a5f3a');
    gradient.addColorStop(0.5, '#2e8b57');
    gradient.addColorStop(1, '#0f3520');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Cuadrícula
    ctx.strokeStyle = 'rgba(0,255,255,0.15)';
    ctx.lineWidth = 1;
    for(let i=0; i<canvas.width; i+=50) { 
        ctx.beginPath(); 
        ctx.moveTo(i,0); 
        ctx.lineTo(i,canvas.height); 
        ctx.stroke(); 
    }
    for(let i=0; i<canvas.height; i+=50) { 
        ctx.beginPath(); 
        ctx.moveTo(0,i); 
        ctx.lineTo(canvas.width,i); 
        ctx.stroke(); 
    }

    // Dibujar partículas
    particles.forEach(p => {
        ctx.globalAlpha = p.alpha * 0.8;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI*2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Dibujar hoyo
    ctx.save();
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 5;
    ctx.beginPath(); 
    ctx.arc(hole.x, hole.y, hole.r, 0, Math.PI*2);
    ctx.fillStyle = '#000'; 
    ctx.fill();
    ctx.strokeStyle = '#1a5f3a'; 
    ctx.lineWidth = 8; 
    ctx.stroke();
    ctx.restore();
    
    // Bandera del hoyo
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hole.x, hole.y);
    ctx.lineTo(hole.x, hole.y - 50);
    ctx.stroke();
    
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.moveTo(hole.x, hole.y - 50);
    ctx.lineTo(hole.x + 25, hole.y - 40);
    ctx.lineTo(hole.x, hole.y - 30);
    ctx.closePath();
    ctx.fill();
    
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Dibujar obstáculos
    obstacles.forEach(obs => {
        // Aura del campo
        ctx.beginPath();
        ctx.arc(obs.x, obs.y, obs.r*2, 0, Math.PI*2);
        ctx.fillStyle = obs.color === '#ff3333' ? 
            'rgba(255,50,50,0.2)' : 'rgba(0,200,255,0.2)';
        ctx.fill();
        
        // Obstáculo con brillo
        ctx.save();
        ctx.shadowColor = obs.color;
        ctx.shadowBlur = 20;
        ctx.beginPath(); 
        ctx.arc(obs.x, obs.y, obs.r, 0, Math.PI*2);
        ctx.fillStyle = obs.color; 
        ctx.fill();
        ctx.strokeStyle = '#000'; 
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
        
        // Símbolo de carga
        ctx.fillStyle = '#fff'; 
        ctx.font = "bold 24px Arial"; 
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(obs.q > 0 ? "+" : "−", obs.x, obs.y);
        
        // Valor de carga
        ctx.font = "bold 12px Arial";
        let chargeVal = Math.abs(obs.q).toFixed(0);
        ctx.fillText(chargeVal, obs.x, obs.y + 25);
    });

    // Dibujar bola
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    
    const ballColor = ball.q > 0 ? '#ff3333' : '#00ccff';
    const glowColor = ball.q > 0 ? 
        'rgba(255,50,50,0.3)' : 'rgba(0,200,255,0.3)';
    
    // Aura si está en movimiento
    if(ball.moving) {
        ctx.shadowColor = ballColor;
        ctx.shadowBlur = 25;
        ctx.beginPath(); 
        ctx.arc(ball.x, ball.y, ball.r*2, 0, Math.PI*2);
        ctx.fillStyle = glowColor;
        ctx.fill();
    }
    
    // Bola base
    ctx.shadowBlur = 5;
    ctx.beginPath(); 
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI*2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    
    // Textura de golf
    ctx.fillStyle = '#e0e0e0';
    for(let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
        for(let radius = 3; radius < ball.r; radius += 4) {
            const px = ball.x + Math.cos(angle) * radius;
            const py = ball.y + Math.sin(angle) * radius;
            ctx.beginPath();
            ctx.arc(px, py, 0.8, 0, Math.PI*2);
            ctx.fill();
        }
    }
    
    // Borde de la bola
    ctx.strokeStyle = '#ccc'; 
    ctx.lineWidth = 2;
    ctx.beginPath(); 
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI*2);
    ctx.stroke();
    
    // Símbolo de carga en la bola
    ctx.shadowBlur = 0;
    ctx.fillStyle = ballColor;
    ctx.font = "bold 14px Arial";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ball.q > 0 ? "+" : "−", ball.x, ball.y);
    
    ctx.restore();

    // Dibujar línea de apuntado
    if (isDragging) {
        let dx = dragStart.x - dragCurrent.x;
        let dy = dragStart.y - dragCurrent.y;
        let dist = Math.sqrt(dx*dx + dy*dy);
        let power = Math.min(dist * POWER_SENSITIVITY, MAX_POWER);
        
        const arrowColor = ball.q > 0 ? '#ff3333' : '#00ccff';
        
        ctx.save();
        
        // Línea punteada de trayectoria
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.moveTo(ball.x, ball.y);
        let aimX = ball.x + dx * 2; 
        let aimY = ball.y + dy * 2;
        ctx.lineTo(aimX, aimY);
        ctx.lineWidth = 3;
        ctx.strokeStyle = arrowColor;
        ctx.globalAlpha = 0.6;
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Flecha de dirección
        ctx.globalAlpha = 1;
        ctx.shadowColor = arrowColor;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(ball.x, ball.y);
        let shortX = ball.x + dx; 
        let shortY = ball.y + dy;
        ctx.lineTo(shortX, shortY);
        ctx.lineWidth = 6;
        ctx.strokeStyle = arrowColor;
        ctx.stroke();
        
        // Punta de flecha
        let angle = Math.atan2(dy, dx);
        ctx.beginPath();
        ctx.moveTo(shortX, shortY);
        ctx.lineTo(
            shortX - 20*Math.cos(angle-0.3), 
            shortY - 20*Math.sin(angle-0.3)
        );
        ctx.lineTo(
            shortX - 20*Math.cos(angle+0.3), 
            shortY - 20*Math.sin(angle+0.3)
        );
        ctx.closePath();
        ctx.fillStyle = arrowColor;
        ctx.fill();
        
        // Medidor de potencia
        const meterWidth = 120;
        const meterHeight = 20;
        const meterX = ball.x - meterWidth/2;
        const meterY = ball.y - 50;
        
        // Fondo del medidor
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(meterX, meterY, meterWidth, meterHeight);
        
        // Barra de potencia
        const powerPercent = power / MAX_POWER;
        const gradient = ctx.createLinearGradient(
            meterX, 0, meterX + meterWidth, 0
        );
        gradient.addColorStop(0, '#00ff00');
        gradient.addColorStop(0.5, '#ffff00');
        gradient.addColorStop(1, '#ff0000');
        ctx.fillStyle = gradient;
        ctx.fillRect(
            meterX + 2, meterY + 2, 
            (meterWidth - 4) * powerPercent, 
            meterHeight - 4
        );
        
        // Borde del medidor
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(meterX, meterY, meterWidth, meterHeight);
        
        // Porcentaje de potencia
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(
            `${Math.round(powerPercent * 100)}%`, 
            ball.x, meterY - 8
        );
        
        ctx.restore();
    }
}

/**
 * Loop principal del juego
 */
function loop() { 
    update(); 
    draw(); 
    requestAnimationFrame(loop);
}

// ===== EVENT LISTENERS =====

// Ocultar panel de control
btnToggleUI.addEventListener('click', () => {
    if(uiPanel.style.display === 'none') {
        uiPanel.style.display = 'block';
        btnToggleUI.innerText = '✕'; // Cerrar
    } else {
        uiPanel.style.display = 'none';
        btnToggleUI.innerText = '☰'; // Abrir
    }
});

// Slider de carga
sliderCarga.addEventListener('input', (e) => {
    let val = parseInt(e.target.value);
    ball.q = val;
    valCarga.innerText = (val > 0 ? "+" : "") + val;
    valCarga.style.color = val > 0 ? "#ff3333" : "#00ccff";
    if(!ball.moving) draw();
});

// Botones de reset
btnReset.addEventListener('click', resetGame);
btnWinReset.addEventListener('click', resetGame);

// Funciones auxiliares para obtener coordenadas
function getInputCoords(e) {
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches[0]) {
        return {
            x: e.touches[0].clientX - rect.left,
            y: e.touches[0].clientY - rect.top
        };
    }
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

// Mouse/Touch Down
function handleInputDown(e) {
    if (!gameActive) return; // Bloquear si no está jugando
    e.preventDefault();
    const coords = getInputCoords(e);
    
    let dx = coords.x - ball.x;
    let dy = coords.y - ball.y;
    
    // ARREGLADO: Solo permitir arrastre si la bola NO está en movimiento
    if (!ball.moving && Math.sqrt(dx*dx + dy*dy) < 80) { 
        isDragging = true;
        dragStart = { x: coords.x, y: coords.y };
        dragCurrent = { x: coords.x, y: coords.y };
        debugDiv.innerText = "🔵 APUNTANDO...";
    }
}

// Mouse/Touch Move
function handleInputMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    const coords = getInputCoords(e);
    dragCurrent = { x: coords.x, y: coords.y };
}

// Mouse/Touch Up
function handleInputUp(e) {
    if (!isDragging) return;
    e.preventDefault();
    isDragging = false;
    
    const coords = getInputCoords(e);
    
    let dx = dragStart.x - coords.x;
    let dy = dragStart.y - coords.y;
    let dist = Math.sqrt(dx*dx + dy*dy);
    let power = Math.min(dist * POWER_SENSITIVITY, MAX_POWER);
    let angle = Math.atan2(dy, dx);

    if (dist > 10) {
        ball.vx += Math.cos(angle) * power;
        ball.vy += Math.sin(angle) * power;
        ball.moving = true;
        ball.shotStartTime = Date.now(); 
        stats.shots++;
        statShots.innerText = stats.shots;
        debugDiv.innerText = "🔴 ¡DISPARO! 💥";
    } else {
        debugDiv.innerText = "⚠️ TIRO CANCELADO";
    }
}

// Eventos de mouse
canvas.addEventListener('mousedown', handleInputDown);
canvas.addEventListener('mousemove', handleInputMove);
canvas.addEventListener('mouseup', handleInputUp);

// Eventos táctiles (móvil)
canvas.addEventListener('touchstart', handleInputDown, { passive: false });
canvas.addEventListener('touchmove', handleInputMove, { passive: false });
canvas.addEventListener('touchend', handleInputUp, { passive: false });

// Tecla R para reiniciar
window.addEventListener('keydown', (e) => {
    if(e.key.toLowerCase() === 'r') resetGame();
});

// Resize (ARREGLADO: usa posiciones relativas)
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    updateLayoutOnResize();
    draw();
});

// ===== LÓGICA DE MENÚS =====

// 1. INICIAR JUEGO (Botón Jugar)
btnStartGame.addEventListener('click', () => {
    startScreen.style.display = 'none'; // Ocultar menú
    gameActive = true; // Activar controles
    resetGame(); // Iniciar limpio
    
    // Reiniciar estadísticas globales al empezar juego nuevo
    stats.wins = 0;
    statWins.innerText = "0";
    stats.bestScore = null;
    statBest.innerText = "--";
});

// 2. VOLVER AL MENÚ (Desde Victoria)
btnBackMenu.addEventListener('click', () => {
    winMsg.style.display = 'none'; // Ocultar victoria
    startScreen.style.display = 'flex'; // Mostrar menú inicio
    gameActive = false; // Desactivar controles
});

// ===== INICIAR JUEGO =====
generateRandomObstacles();
loop();