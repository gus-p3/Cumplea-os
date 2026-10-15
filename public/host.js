// Lógica de la pantalla de Host / Proyector
const socket = io();

// Elementos de la interfaz
const views = {
  lobby: document.getElementById('viewLobby'),
  intro: document.getElementById('viewIntro'),
  question: document.getElementById('viewQuestion'),
  reveal: document.getElementById('viewReveal'),
  leaderboard: document.getElementById('viewLeaderboard'),
  podium: document.getElementById('viewPodium')
};

// Estado local del Host
let hostData = {
  settings: {
    celebrant1: 'Cumpleañero 1',
    celebrant2: 'Cumpleañero 2',
    pin: '2026'
  },
  questions: [],
  players: [],
  currentQuestion: null,
  isLastQuestion: false
};

// Cambiar de vista
function switchView(viewName) {
  Object.keys(views).forEach(name => {
    views[name].style.display = (name === viewName) ? (name === 'lobby' || name === 'leaderboard' || name === 'podium' ? 'flex' : 'block') : 'none';
  });
}

// Actualizar textos de cumpleañeros en la UI
function updateCelebrantsUI() {
  const p1 = hostData.settings.celebrant1;
  const p2 = hostData.settings.celebrant2;
  document.getElementById('headerCelebrantsText').textContent = `${p1} & ${p2}`;
  document.getElementById('displayPin').textContent = hostData.settings.pin;
  document.getElementById('thScoreP1').textContent = `Pts ${p1}`;
  document.getElementById('thScoreP2').textContent = `Pts ${p2}`;
  document.getElementById('awardTitleP1').textContent = `Máster de ${p1}`;
  document.getElementById('awardTitleP2').textContent = `Máster de ${p2}`;
  document.getElementById('lobbyUrlDisplay').textContent = window.location.origin;
}

// Renderizar jugadores en la sala
function renderPlayersGrid(players) {
  const grid = document.getElementById('playersGrid');
  grid.innerHTML = '';
  document.getElementById('playersCountBadge').textContent = `${players.length} conectados`;

  players.forEach(p => {
    const chip = document.createElement('div');
    chip.className = 'player-chip';
    chip.innerHTML = `
      <button class="btn-kick" title="Expulsar jugador" onclick="kickPlayer('${p.id}')">✕</button>
      <div class="player-avatar">${p.avatar || '🎉'}</div>
      <div class="player-name">${p.name}</div>
    `;
    grid.appendChild(chip);
  });
}

window.kickPlayer = function(id) {
  if (confirm('¿Expulsar a este jugador?')) {
    socket.emit('host:action', { action: 'kick', playerId: id });
  }
};

// ==========================================
// EVENTOS DE SOCKET.IO
// ==========================================

socket.on('connect', () => {
  console.log('[Host] Conectado al servidor');
  socket.emit('host:join');
});

socket.on('host:init', (data) => {
  hostData.settings = data.settings;
  hostData.questions = data.questions;
  hostData.players = data.gameState.players || [];
  updateCelebrantsUI();
  renderPlayersGrid(hostData.players);

  // Cargar estado inicial
  if (data.gameState.status === 'LOBBY') {
    switchView('lobby');
  }
});

socket.on('room:player_joined', (data) => {
  window.soundEngine.pop();
  // Evitar duplicados
  const exists = hostData.players.some(p => p.id === data.player.id);
  if (!exists) {
    hostData.players.push(data.player);
  }
  renderPlayersGrid(hostData.players);
});

socket.on('room:player_left', (data) => {
  hostData.players = hostData.players.filter(p => p.id !== data.id);
  renderPlayersGrid(hostData.players);
});

socket.on('room:answer_update', (data) => {
  document.getElementById('answersCounterPill').textContent = `${data.answeredCount} / ${data.totalPlayers} respondieron`;
});

// 1. INTRO
socket.on('game:intro', (data) => {
  switchView('intro');
  window.soundEngine.countdownBeep(false);

  const badge = document.getElementById('introCategoryBadge');
  badge.textContent = `🎯 ${data.celebrantName}`;
  badge.className = `celebrant-badge ${data.celebrant === 'p1' ? 'badge-p1' : data.celebrant === 'p2' ? 'badge-p2' : 'badge-both'}`;

  document.getElementById('introQuestionTitle').textContent = `Pregunta ${data.index} de ${data.total}`;
});

// 2. QUESTION START
socket.on('game:question_start', (data) => {
  switchView('question');
  hostData.currentQuestion = data.question;
  window.soundEngine.countdownBeep(true);

  document.getElementById('questionCounterPill').textContent = `Pregunta ${data.index} / ${data.total}`;
  document.getElementById('answersCounterPill').textContent = `0 / ${hostData.players.length} respondieron`;

  const badge = document.getElementById('questionCelebrantBadge');
  badge.textContent = `🎯 ${data.question.celebrantName}`;
  badge.className = `celebrant-badge ${data.question.celebrant === 'p1' ? 'badge-p1' : data.question.celebrant === 'p2' ? 'badge-p2' : 'badge-both'}`;

  document.getElementById('questionText').textContent = data.question.text;

  // Llenar las 4 opciones
  for (let i = 0; i < 4; i++) {
    const textEl = document.getElementById(`optText${i}`);
    if (textEl) {
      textEl.textContent = data.question.options[i] || '';
    }
  }

  const timerEl = document.getElementById('timerCircle');
  timerEl.textContent = data.timeLimit;
  timerEl.classList.remove('urgent');
});

// 3. TICK
socket.on('game:tick', (data) => {
  const timerEl = document.getElementById('timerCircle');
  timerEl.textContent = Math.max(0, data.secondsLeft);

  if (data.secondsLeft <= 5 && data.secondsLeft > 0) {
    timerEl.classList.add('urgent');
    window.soundEngine.urgentTick();
  } else if (data.secondsLeft > 5) {
    window.soundEngine.tick();
  }

  document.getElementById('answersCounterPill').textContent = `${data.answeredCount} / ${data.totalPlayers} respondieron`;
});

// 4. REVEAL
socket.on('game:reveal', (data) => {
  switchView('reveal');
  window.soundEngine.correct();

  document.getElementById('revealQuestionText').textContent = data.question.text;
  const badge = document.getElementById('revealCelebrantBadge');
  badge.textContent = `🎯 ${data.question.celebrant === 'p1' ? hostData.settings.celebrant1 : data.question.celebrant === 'p2' ? hostData.settings.celebrant2 : 'Ambos'}`;
  badge.className = `celebrant-badge ${data.question.celebrant === 'p1' ? 'badge-p1' : data.question.celebrant === 'p2' ? 'badge-p2' : 'badge-both'}`;

  // Renderizar opciones y resaltar la correcta
  const grid = document.getElementById('revealOptionsGrid');
  grid.innerHTML = '';

  const shapes = ['triangle', 'diamond', 'circle', 'square'];
  for (let i = 0; i < 4; i++) {
    const isCorrect = i === data.correctIndex;
    const btn = document.createElement('div');
    btn.className = `option-btn opt-${i} ${isCorrect ? 'is-correct' : 'is-wrong'}`;
    btn.innerHTML = `
      <div class="option-shape"><div class="shape-${shapes[i]}"></div></div>
      <span class="option-text">${data.question.options[i] || ''} ${isCorrect ? '✅' : ''}</span>
    `;
    grid.appendChild(btn);
  }

  // Gráfica de barras con conteo de respuestas
  const statsContainer = document.getElementById('statsBarContainer');
  statsContainer.innerHTML = '';
  const total = Math.max(1, data.totalAnswered);

  data.counts.forEach((count, i) => {
    const pct = Math.round((count / total) * 100);
    const isCorrect = i === data.correctIndex;
    const item = document.createElement('div');
    item.className = 'stat-bar-item';
    item.innerHTML = `
      <span style="width: 140px; font-size: 0.95rem;">${isCorrect ? '⭐ ' : ''}Opción ${i + 1}: ${count} votos</span>
      <div class="stat-bar-track">
        <div class="stat-bar-fill opt-${i}" style="width: ${pct}%;"></div>
      </div>
      <span style="width: 50px; text-align: right;">${pct}%</span>
    `;
    statsContainer.appendChild(item);
  });
});

// 5. LEADERBOARD
socket.on('game:leaderboard', (data) => {
  switchView('leaderboard');
  window.soundEngine.fanfare();

  hostData.isLastQuestion = data.isLastQuestion;
  const nextBtn = document.getElementById('btnNextFromLeaderboard');
  if (data.isLastQuestion) {
    nextBtn.textContent = '🏆 ¡Ver Podio Final!';
  } else {
    nextBtn.textContent = 'Siguiente Pregunta ➡️';
  }

  const list = document.getElementById('leaderboardList');
  list.innerHTML = '';

  data.leaderboard.forEach(p => {
    const item = document.createElement('div');
    item.className = `leaderboard-item rank-${p.rank}`;

    let streakBadge = p.streak >= 2 ? `<span style="color: #ff5722; font-weight: bold; font-size: 0.9rem;">🔥 x${p.streak}</span>` : '';
    let diffBadge = '';
    if (p.rankDiff > 0) {
      diffBadge = `<span style="color: #00ff88; font-weight: bold; font-size: 0.9rem;">▲ +${p.rankDiff}</span>`;
    }

    item.innerHTML = `
      <div class="player-info-side">
        <div class="rank-badge">${p.rank}</div>
        <div style="font-size: 2rem;">${p.avatar || '🎉'}</div>
        <div>
          <div style="font-family: var(--font-display); font-size: 1.3rem; font-weight: 800;">${p.name}</div>
          <div style="display: flex; gap: 0.5rem; align-items: center;">${streakBadge} ${diffBadge}</div>
        </div>
      </div>
      <div class="player-score-side">
        <div class="player-score">${p.score.toLocaleString()} pts</div>
      </div>
    `;
    list.appendChild(item);
  });
});

// 6. PODIUM CON 3 TABLEROS DINÁMICOS
let podiumResults = null;

function renderPodiumTab(tabKey) {
  if (!podiumResults) return;

  const tabButtons = {
    general: document.getElementById('btnTabGeneral'),
    gustavo: document.getElementById('btnTabGustavo'),
    lizeth: document.getElementById('btnTabLizeth')
  };

  Object.keys(tabButtons).forEach(k => {
    if (tabButtons[k]) {
      tabButtons[k].classList.toggle('active', k === tabKey);
    }
  });

  const categoryData = podiumResults[tabKey] || { top3: [], leaderboard: [], title: 'Resultados' };

  // Título y subtítulo
  document.getElementById('podiumMainTitle').textContent = categoryData.title;
  document.getElementById('podiumSubTitle').textContent = 
    tabKey === 'general' ? '👑 Quien contestó más preguntas y acumuló más puntos en total:' :
    tabKey === 'gustavo' ? `💙 Los invitados que más conocen a ${hostData.settings.celebrant1}:` :
    `💖 Las personas que más conocen a ${hostData.settings.celebrant2}:`;

  document.getElementById('podiumCategoryTableTitle').textContent = `Ranking Completo - ${categoryData.title}`;

  // Renderizar Podio 3D
  const stage = document.getElementById('podiumStage');
  stage.innerHTML = '';
  const top3 = categoryData.top3 || [];

  const order = [
    { p: top3[1], rank: 2, pillarClass: 'pillar-2' },
    { p: top3[0], rank: 1, pillarClass: 'pillar-1' },
    { p: top3[2], rank: 3, pillarClass: 'pillar-3' }
  ];

  order.forEach(item => {
    const p = item.p;
    const col = document.createElement('div');
    col.className = 'podium-col';

    if (p) {
      col.innerHTML = `
        <div class="podium-avatar">${p.avatar || '🎉'}</div>
        <div class="podium-player-name">${p.name}</div>
        <div class="podium-player-score">${(p.displayScore ?? p.score ?? 0).toLocaleString()} pts</div>
        <div class="podium-pillar ${item.pillarClass}">${item.rank}</div>
      `;
    } else {
      col.innerHTML = `
        <div class="podium-avatar" style="opacity: 0.3;">👤</div>
        <div class="podium-player-name" style="opacity: 0.3;">Vacante</div>
        <div class="podium-player-score" style="opacity: 0.3;">0 pts</div>
        <div class="podium-pillar ${item.pillarClass}">${item.rank}</div>
      `;
    }
    stage.appendChild(col);
  });

  // Renderizar Lista de posiciones de este tablero
  const list = document.getElementById('podiumCategoryRankingList');
  list.innerHTML = '';
  const fullList = categoryData.leaderboard || [];

  if (fullList.length === 0) {
    list.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 1rem;">Sin respuestas en esta categoría.</div>';
  } else {
    fullList.forEach(p => {
      const row = document.createElement('div');
      row.className = `leaderboard-item rank-${p.rank}`;
      row.style.padding = '0.7rem 1.2rem';
      row.innerHTML = `
        <div class="player-info-side">
          <div class="rank-badge" style="width: 34px; height: 34px; font-size: 1.1rem;">${p.rank}</div>
          <div style="font-size: 1.6rem;">${p.avatar || '🎉'}</div>
          <div style="font-family: var(--font-display); font-weight: 700; font-size: 1.15rem;">${p.name}</div>
        </div>
        <div class="player-score-side">
          <div class="player-score" style="font-size: 1.3rem;">${(p.displayScore ?? p.score ?? 0).toLocaleString()} pts</div>
        </div>
      `;
      list.appendChild(row);
    });
  }
}

socket.on('game:podium', (data) => {
  switchView('podium');
  podiumResults = data;
  window.soundEngine.fanfare();
  window.confetti.fire(160);

  // Iniciar mostrando el Tablero General
  renderPodiumTab('general');

  setTimeout(() => window.confetti.fire(100), 1200);
  setTimeout(() => window.confetti.fire(100), 2500);
});

// Event listeners para los 3 tableros
document.getElementById('btnTabGeneral').addEventListener('click', () => {
  window.soundEngine.click();
  window.confetti.fire(60);
  renderPodiumTab('general');
});

document.getElementById('btnTabGustavo').addEventListener('click', () => {
  window.soundEngine.click();
  window.confetti.fire(60);
  renderPodiumTab('gustavo');
});

document.getElementById('btnTabLizeth').addEventListener('click', () => {
  window.soundEngine.click();
  window.confetti.fire(60);
  renderPodiumTab('lizeth');
});


// 7. RESET
socket.on('game:reset', (data) => {
  switchView('lobby');
  updateCelebrantsUI();
});

// ==========================================
// BOTONES Y ACCIONES DEL HOST
// ==========================================

// Copiar enlace directo para WhatsApp
document.getElementById('btnCopyInviteLink').addEventListener('click', () => {
  const url = `${window.location.origin}/?pin=${hostData.settings.pin}`;
  navigator.clipboard.writeText(url).then(() => {
    alert(`¡Enlace copiado al portapapeles!\n\n${url}\n\nCompártelo en tu grupo de WhatsApp para que tus invitados entren directamente.`);
  }).catch(() => {
    prompt('Copia este enlace para compartir:', url);
  });
});

// Iniciar juego desde el lobby
document.getElementById('btnStartGame').addEventListener('click', () => {
  window.soundEngine.click();
  socket.emit('host:action', { action: 'start' });
});

// Saltar tiempo de pregunta
document.getElementById('btnSkipQuestion').addEventListener('click', () => {
  window.soundEngine.click();
  socket.emit('host:action', { action: 'end_question' });
});

// Proceder de Resultados a Marcador
document.getElementById('btnProceedLeaderboard').addEventListener('click', () => {
  window.soundEngine.click();
  socket.emit('host:action', { action: 'show_leaderboard' });
});

// Siguiente pregunta desde Marcador
document.getElementById('btnNextFromLeaderboard').addEventListener('click', () => {
  window.soundEngine.click();
  if (hostData.isLastQuestion) {
    socket.emit('host:action', { action: 'finish' });
  } else {
    socket.emit('host:action', { action: 'next_question' });
  }
});

// Reiniciar juego desde el Podio o desde la barra superior en cualquier momento
const handleRestart = () => {
  if (confirm('¿Quieres reiniciar la trivia y volver al lobby? Todos los puntajes se pondrán en cero pero los jugadores seguirán conectados en la sala.')) {
    socket.emit('host:action', { action: 'restart' });
  }
};
document.getElementById('btnRestartGame').addEventListener('click', handleRestart);
const topRestartBtn = document.getElementById('btnTopRestart');
if (topRestartBtn) {
  topRestartBtn.addEventListener('click', handleRestart);
}


// Sonido Mute/Unmute
document.getElementById('btnSoundToggle').addEventListener('click', () => {
  const isMuted = window.soundEngine.toggleMute();
  document.getElementById('btnSoundToggle').textContent = isMuted ? '🔇' : '🔊';
});

// ==========================================
// MODAL DE TABLA COMPLETA DE PUNTAJES
// ==========================================

const modalScores = document.getElementById('modalScores');
document.getElementById('btnOpenScoresModal').addEventListener('click', openScoresModal);
document.getElementById('btnPodiumViewScores').addEventListener('click', openScoresModal);
document.getElementById('btnCloseScores').addEventListener('click', () => modalScores.style.display = 'none');
document.getElementById('btnCloseScoresBtn').addEventListener('click', () => modalScores.style.display = 'none');

async function openScoresModal() {
  try {
    const res = await fetch('/api/admin/export-scores');
    const data = await res.json();
    const tbody = document.getElementById('scoresTableBody');
    tbody.innerHTML = '';

    if (!data.players || data.players.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">Aún no hay respuestas registradas.</td></tr>`;
    } else {
      data.players.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>#${p.rank}</strong></td>
          <td>${p.avatar || '🎉'} <strong>${p.name}</strong></td>
          <td style="color: #ffd700; font-weight: bold;">${p.score.toLocaleString()}</td>
          <td style="color: #00ff88;">${p.correctCount || 0}</td>
          <td style="color: #ff4d6d;">${(p.history ? p.history.length : 0) - (p.correctCount || 0)}</td>
          <td>${(p.scoresByCelebrant ? p.scoresByCelebrant.p1 : 0).toLocaleString()}</td>
          <td>${(p.scoresByCelebrant ? p.scoresByCelebrant.p2 : 0).toLocaleString()}</td>
          <td>${(p.scoresByCelebrant ? p.scoresByCelebrant.both : 0).toLocaleString()}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    modalScores.style.display = 'flex';
  } catch (err) {
    alert('Error al obtener puntajes: ' + err.message);
  }
}

// Descargar CSV para Excel / Sheets
document.getElementById('btnExportCSV').addEventListener('click', async () => {
  try {
    const res = await fetch('/api/admin/export-scores');
    const data = await res.json();
    const p1 = data.celebrants[0] || 'Cumple 1';
    const p2 = data.celebrants[1] || 'Cumple 2';

    let csv = `Posicion,Nombre,Puntaje_Total,Aciertos,Pts_${p1.replace(/\s+/g,'_')},Pts_${p2.replace(/\s+/g,'_')},Pts_Ambos\n`;

    data.players.forEach(p => {
      csv += `${p.rank},"${p.name}",${p.score},${p.correctCount || 0},${p.scoresByCelebrant.p1},${p.scoresByCelebrant.p2},${p.scoresByCelebrant.both}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Resultados_Trivia_${p1}_y_${p2}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Error al exportar CSV: ' + err.message);
  }
});

// ==========================================
// MODAL DE CONFIGURACIÓN Y EDITOR DE PREGUNTAS
// ==========================================

const modalSettings = document.getElementById('modalSettings');
document.getElementById('btnOpenSettings').addEventListener('click', openSettingsModal);
document.getElementById('btnCloseSettings').addEventListener('click', () => modalSettings.style.display = 'none');
document.getElementById('btnCancelSettings').addEventListener('click', () => modalSettings.style.display = 'none');

let editableQuestions = [];

function openSettingsModal() {
  document.getElementById('inputCelebrant1').value = hostData.settings.celebrant1;
  document.getElementById('inputCelebrant2').value = hostData.settings.celebrant2;
  document.getElementById('inputRoomPin').value = hostData.settings.pin;

  editableQuestions = JSON.parse(JSON.stringify(hostData.questions));
  renderQuestionsEditor();
  modalSettings.style.display = 'flex';
}

function renderQuestionsEditor() {
  const container = document.getElementById('questionsEditorList');
  container.innerHTML = '';
  document.getElementById('modalQuestionCount').textContent = editableQuestions.length;

  editableQuestions.forEach((q, index) => {
    const card = document.createElement('div');
    card.className = 'glass-card';
    card.style.padding = '1.2rem';
    card.style.border = '1px solid rgba(255, 255, 255, 0.15)';

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.8rem;">
        <strong>Pregunta #${index + 1}</strong>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <select class="input-control" style="font-size: 0.9rem; padding: 0.4rem;" onchange="updateQuestionCategory(${index}, this.value)">
            <option value="both" ${q.celebrant === 'both' ? 'selected' : ''}>Ambos</option>
            <option value="p1" ${q.celebrant === 'p1' ? 'selected' : ''}>${hostData.settings.celebrant1}</option>
            <option value="p2" ${q.celebrant === 'p2' ? 'selected' : ''}>${hostData.settings.celebrant2}</option>
          </select>
          <select class="input-control" style="font-size: 0.9rem; padding: 0.4rem;" onchange="updateQuestionTime(${index}, this.value)">
            <option value="15" ${q.timeLimit === 15 ? 'selected' : ''}>15s</option>
            <option value="20" ${(!q.timeLimit || q.timeLimit === 20) ? 'selected' : ''}>20s</option>
            <option value="30" ${q.timeLimit === 30 ? 'selected' : ''}>30s</option>
          </select>
          <button class="btn btn-secondary" style="color: #ff4d6d; padding: 0.4rem 0.8rem;" onclick="deleteQuestion(${index})">Eliminar</button>
        </div>
      </div>

      <div class="form-group" style="margin-bottom: 0.8rem;">
        <input type="text" class="input-control" value="${escapeHtml(q.text)}" placeholder="Escribe la pregunta..." style="text-align: left; font-size: 1.05rem;" onchange="updateQuestionText(${index}, this.value)">
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
        ${[0, 1, 2, 3].map(optIdx => `
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <input type="radio" name="correct_${index}" ${q.correctIndex === optIdx ? 'checked' : ''} onchange="setCorrectOption(${index}, ${optIdx})" title="Marcar como respuesta correcta">
            <input type="text" class="input-control" value="${escapeHtml(q.options[optIdx] || '')}" placeholder="Opción ${optIdx + 1}" style="text-align: left; font-size: 0.9rem; padding: 0.5rem;" onchange="updateOptionText(${index}, ${optIdx}, this.value)">
          </div>
        `).join('')}
      </div>
    `;
    container.appendChild(card);
  });
}

function escapeHtml(text) {
  return (text || '').replace(/"/g, '&quot;');
}

window.updateQuestionText = (qIdx, val) => { editableQuestions[qIdx].text = val; };
window.updateOptionText = (qIdx, optIdx, val) => { editableQuestions[qIdx].options[optIdx] = val; };
window.setCorrectOption = (qIdx, optIdx) => { editableQuestions[qIdx].correctIndex = optIdx; };
window.updateQuestionCategory = (qIdx, val) => { editableQuestions[qIdx].celebrant = val; };
window.updateQuestionTime = (qIdx, val) => { editableQuestions[qIdx].timeLimit = parseInt(val, 10); };
window.deleteQuestion = (qIdx) => {
  if (confirm(`¿Eliminar la pregunta #${qIdx + 1}?`)) {
    editableQuestions.splice(qIdx, 1);
    renderQuestionsEditor();
  }
};

document.getElementById('btnAddQuestion').addEventListener('click', () => {
  editableQuestions.push({
    id: 'q_' + Date.now(),
    text: 'Nueva pregunta...',
    celebrant: 'both',
    timeLimit: 20,
    options: ['Opción 1', 'Opción 2', 'Opción 3', 'Opción 4'],
    correctIndex: 0
  });
  renderQuestionsEditor();
});

// Guardar cambios al backend
document.getElementById('btnSaveSettings').addEventListener('click', async () => {
  const password = document.getElementById('inputAdminPass').value;
  const c1 = document.getElementById('inputCelebrant1').value.trim() || 'Cumpleañero 1';
  const c2 = document.getElementById('inputCelebrant2').value.trim() || 'Cumpleañero 2';
  const pin = document.getElementById('inputRoomPin').value.trim() || '2026';

  try {
    const res = await fetch('/api/admin/save-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password,
        settings: {
          celebrant1: c1,
          celebrant2: c2,
          pin: pin
        },
        questions: editableQuestions
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Error al guardar');
    }

    alert('¡Preguntas y configuración guardadas con éxito!');
    modalSettings.style.display = 'none';

    // Recargar datos locales
    hostData.settings.celebrant1 = c1;
    hostData.settings.celebrant2 = c2;
    hostData.settings.pin = pin;
    updateCelebrantsUI();
  } catch (err) {
    alert('No se pudo guardar: ' + err.message);
  }
});

// Cierre accesible de modales con Escape y clic en el fondo
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    modalSettings.style.display = 'none';
    modalScores.style.display = 'none';
  }
});

[modalSettings, modalScores].forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });
});


