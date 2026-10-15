// Lógica de la pantalla de Jugador Móvil
const socket = io();

// Lista de avatares simpáticos para elegir
const AVATARS = ['🥳', '👑', '🚀', '🦁', '🦊', '🦄', '🐼', '🔥', '🍕', '🥑', '🎸', '🎮'];
let selectedAvatar = AVATARS[0];
let playerState = {
  id: null,
  name: '',
  avatar: selectedAvatar,
  hasAnsweredThisRound: false,
  score: 0,
  streak: 0
};

// Vistas del jugador
const playerViews = {
  join: document.getElementById('playerJoinView'),
  waiting: document.getElementById('playerWaitingView'),
  intro: document.getElementById('playerIntroView'),
  question: document.getElementById('playerQuestionView'),
  submitted: document.getElementById('playerAnswerSubmittedView'),
  result: document.getElementById('playerResultView'),
  leaderboard: document.getElementById('playerLeaderboardView'),
  gameOver: document.getElementById('playerGameOverView')
};

function switchPlayerView(viewName) {
  Object.keys(playerViews).forEach(name => {
    playerViews[name].style.display = (name === viewName) ? (name === 'question' ? 'flex' : 'block') : 'none';
  });
}

// Inicializar selector de avatar
function initAvatarSelector() {
  const container = document.getElementById('avatarSelector');
  container.innerHTML = '';

  AVATARS.forEach((av, i) => {
    const el = document.createElement('div');
    el.className = `avatar-option ${i === 0 ? 'selected' : ''}`;
    el.textContent = av;
    el.addEventListener('click', () => {
      document.querySelectorAll('.avatar-option').forEach(opt => opt.classList.remove('selected'));
      el.classList.add('selected');
      selectedAvatar = av;
      window.soundEngine.click();
    });
    container.appendChild(el);
  });
}

// Auto-completar PIN desde URL si existe
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('pin')) {
  document.getElementById('inputPin').value = urlParams.get('pin');
}

initAvatarSelector();

// ==========================================
// UNIRSE AL JUEGO
// ==========================================

document.getElementById('btnJoin').addEventListener('click', () => {
  const pin = document.getElementById('inputPin').value.trim();
  const name = document.getElementById('inputNickname').value.trim();
  const errorEl = document.getElementById('joinErrorMessage');

  errorEl.style.display = 'none';

  if (!pin) {
    errorEl.textContent = 'Por favor escribe el PIN de la sala.';
    errorEl.style.display = 'block';
    return;
  }
  if (!name) {
    errorEl.textContent = 'Por favor escribe tu nombre o apodo.';
    errorEl.style.display = 'block';
    return;
  }

  window.soundEngine.init();
  window.soundEngine.click();

  socket.emit('player:join', {
    pin,
    name,
    avatar: selectedAvatar
  });
});

socket.on('player:join_error', (data) => {
  const errorEl = document.getElementById('joinErrorMessage');
  errorEl.textContent = data.message;
  errorEl.style.display = 'block';
  window.soundEngine.wrong();
});

socket.on('player:join_success', (data) => {
  playerState.id = data.id;
  playerState.name = data.name;
  playerState.avatar = data.avatar;

  document.getElementById('playerNameDisplay').textContent = `¡Hola, ${data.name}!`;
  document.getElementById('playerAvatarDisplay').textContent = data.avatar;
  document.getElementById('playerAppTitle').textContent = `${data.celebrant1} & ${data.celebrant2}`;

  switchPlayerView('waiting');
  window.soundEngine.correct();
});

socket.on('player:kicked', (data) => {
  alert(data.message || 'Has salido de la partida.');
  location.reload();
});

// ==========================================
// FLUJO DE PREGUNTAS Y RESPUESTAS
// ==========================================

// 1. INTRO
socket.on('game:intro', (data) => {
  playerState.hasAnsweredThisRound = false;
  switchPlayerView('intro');
  window.soundEngine.countdownBeep(false);

  const badge = document.getElementById('playerIntroBadge');
  badge.textContent = `🎯 ${data.celebrantName}`;
  badge.className = `celebrant-badge ${data.celebrant === 'p1' ? 'badge-p1' : data.celebrant === 'p2' ? 'badge-p2' : 'badge-both'}`;

  document.getElementById('playerIntroQuestionTitle').textContent = `Pregunta ${data.index} de ${data.total}`;
});

// 2. QUESTION START
socket.on('game:question_start', (data) => {
  playerState.hasAnsweredThisRound = false;
  switchPlayerView('question');
  window.soundEngine.countdownBeep(true);

  document.getElementById('playerQuestionNumberPill').textContent = `Pregunta ${data.index}/${data.total}`;
  document.getElementById('playerQuestionTextMobile').textContent = data.question.text;
  document.getElementById('playerTimerCircle').textContent = data.timeLimit;
  document.getElementById('playerTimerCircle').classList.remove('urgent');

  // Rellenar texto en los botones táctiles
  for (let i = 0; i < 4; i++) {
    const textEl = document.getElementById(`mOptText${i}`);
    if (textEl) {
      textEl.textContent = data.question.options[i] || '';
    }
  }

  // Habilitar botones
  document.querySelectorAll('.mobile-tap-btn').forEach(btn => {
    btn.disabled = false;
    btn.style.opacity = '1';
  });
});

// 3. TICK
socket.on('game:tick', (data) => {
  const timerEl = document.getElementById('playerTimerCircle');
  timerEl.textContent = Math.max(0, data.secondsLeft);

  if (data.secondsLeft <= 5 && data.secondsLeft > 0) {
    timerEl.classList.add('urgent');
    window.soundEngine.urgentTick();
  }
});

// Enviar respuesta al tocar un botón
window.submitAnswer = function(optionIndex) {
  if (playerState.hasAnsweredThisRound) return;
  playerState.hasAnsweredThisRound = true;

  // Feedback háptico en móviles compatibles
  if (navigator.vibrate) {
    navigator.vibrate(50);
  }

  window.soundEngine.click();
  socket.emit('player:answer', { optionIndex });
  switchPlayerView('submitted');
};

// 4. ROUND RESULT (FEEDBACK)
socket.on('player:round_result', (data) => {
  switchPlayerView('result');

  playerState.score = data.totalScore;
  playerState.streak = data.streak;

  const resultCard = document.getElementById('playerResultView');
  const iconEl = document.getElementById('resultIcon');
  const titleEl = document.getElementById('resultTitle');
  const pointsEl = document.getElementById('resultPoints');
  const streakEl = document.getElementById('resultStreak');
  const totalScoreEl = document.getElementById('resultTotalScore');

  totalScoreEl.textContent = data.totalScore.toLocaleString();

  resultCard.classList.remove('feedback-correct', 'feedback-wrong');

  if (data.answered && data.isCorrect) {
    resultCard.classList.add('feedback-correct');
    iconEl.textContent = '🎯';
    titleEl.textContent = '¡CORRECTO!';
    pointsEl.textContent = `+${data.pointsEarned.toLocaleString()} pts`;
    pointsEl.style.display = 'block';

    if (data.streak >= 2) {
      streakEl.textContent = `🔥 Racha: x${data.streak} seguidas`;
      streakEl.style.display = 'block';
    } else {
      streakEl.style.display = 'none';
    }

    window.soundEngine.correct();
    window.confetti.fire(50);
  } else {
    resultCard.classList.add('feedback-wrong');
    iconEl.textContent = data.answered ? '❌' : '⏰';
    titleEl.textContent = data.answered ? '¡FALLASTE!' : '¡TIEMPO AGOTADO!';
    pointsEl.textContent = '+0 pts';
    pointsEl.style.display = 'block';
    streakEl.style.display = 'none';
    window.soundEngine.wrong();
  }
});

// 5. LEADERBOARD INTERIM
socket.on('game:leaderboard', (data) => {
  switchPlayerView('leaderboard');
  document.getElementById('playerScoreInterim').textContent = playerState.score.toLocaleString();
});

// 6. PODIUM / FIN
socket.on('game:podium', (data) => {
  switchPlayerView('gameOver');
  window.soundEngine.fanfare();
  window.confetti.fire(80);
});

// Estadísticas individuales de los 3 tableros
socket.on('player:final_stats', (stats) => {
  const genRankEl = document.getElementById('statGenRank');
  const genScoreEl = document.getElementById('statGenScore');
  const p1RankEl = document.getElementById('statP1Rank');
  const p1ScoreEl = document.getElementById('statP1Score');
  const p2RankEl = document.getElementById('statP2Rank');
  const p2ScoreEl = document.getElementById('statP2Score');

  if (genRankEl) genRankEl.textContent = `Lugar #${stats.genRank}`;
  if (genScoreEl) genScoreEl.textContent = `${(stats.totalScore || 0).toLocaleString()} pts`;

  if (p1RankEl) p1RankEl.textContent = `Lugar #${stats.p1Rank}`;
  if (p1ScoreEl) p1ScoreEl.textContent = `${(stats.p1Score || 0).toLocaleString()} pts`;

  if (p2RankEl) p2RankEl.textContent = `Lugar #${stats.p2Rank}`;
  if (p2ScoreEl) p2ScoreEl.textContent = `${(stats.p2Score || 0).toLocaleString()} pts`;
});

// 7. RESET
socket.on('game:reset', (data) => {
  playerState.score = 0;
  playerState.streak = 0;
  playerState.hasAnsweredThisRound = false;
  switchPlayerView('waiting');
});

