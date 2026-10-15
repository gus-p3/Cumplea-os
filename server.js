require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');


const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const mongoose = require('mongoose');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'questions.json');
const MONGO_URI = process.env.MONGO_URL || process.env.MONGODB_URI || process.env.MONGO_PRIVATE_URL;

// Esquemas de Mongoose
const SettingSchema = new mongoose.Schema({
  key: { type: String, default: 'main', unique: true },
  celebrant1: { type: String, default: 'Cumpleañero 1' },
  celebrant2: { type: String, default: 'Cumpleañero 2' },
  pin: { type: String, default: '2026' },
  adminPassword: { type: String, default: 'admin' }
}, { timestamps: true });

const QuestionSchema = new mongoose.Schema({
  id: String,
  text: String,
  celebrant: { type: String, default: 'both' }, // 'p1', 'p2', 'both'
  options: [String],
  correctIndex: { type: Number, default: 0 },
  timeLimit: { type: Number, default: 20 },
  explanation: String
}, { timestamps: true });

const GameHistorySchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  celebrant1: String,
  celebrant2: String,
  players: [{
    name: String,
    avatar: String,
    rank: Number,
    score: Number,
    correctCount: Number,
    scoresByCelebrant: {
      p1: Number,
      p2: Number,
      both: Number
    }
  }]
}, { timestamps: true });

const SettingModel = mongoose.model('Setting', SettingSchema);
const QuestionModel = mongoose.model('Question', QuestionSchema);
const GameHistoryModel = mongoose.model('GameHistory', GameHistorySchema);

let isMongoConnected = false;

// Cargar preguntas y configuración (híbrido Mongo + Archivo local fallback)
let gameData = {
  settings: {
    celebrant1: "Cumpleañero 1",
    celebrant2: "Cumpleañero 2",
    pin: "2026",
    adminPassword: "admin"
  },
  questions: []
};

async function initMongo() {
  if (!MONGO_URI) {
    console.log('[MongoDB] Variable MONGO_URL no detectada. Operando en modo archivo local (questions.json).');
    loadFromFile();
    return;
  }

  try {
    console.log('[MongoDB] Conectando a MongoDB en Railway...');
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000
    });
    isMongoConnected = true;
    console.log('✅ [MongoDB] ¡Conexión exitosa a la base de datos de MongoDB!');

    // Sincronizar o sembrar datos iniciales
    await syncFromMongo();
  } catch (err) {
    console.error('⚠️ [MongoDB] Error de conexión:', err.message);
    console.log('[MongoDB] Continuando con archivo questions.json como respaldo seguro.');
    loadFromFile();
  }
}

async function syncFromMongo() {
  if (!isMongoConnected) return;
  try {
    let settingsDoc = await SettingModel.findOne({ key: 'main' });
    if (!settingsDoc) {
      loadFromFile(); // Cargar base inicial de archivo
      settingsDoc = await SettingModel.create({
        key: 'main',
        celebrant1: gameData.settings.celebrant1,
        celebrant2: gameData.settings.celebrant2,
        pin: gameData.settings.pin,
        adminPassword: gameData.settings.adminPassword
      });
      console.log('[MongoDB] Ajustes sembrados en MongoDB.');
    } else {
      gameData.settings.celebrant1 = settingsDoc.celebrant1;
      gameData.settings.celebrant2 = settingsDoc.celebrant2;
      gameData.settings.pin = settingsDoc.pin;
      gameData.settings.adminPassword = settingsDoc.adminPassword;
    }

    const count = await QuestionModel.countDocuments();
    if (count === 0) {
      loadFromFile();
      if (gameData.questions.length > 0) {
        await QuestionModel.insertMany(gameData.questions);
        console.log(`[MongoDB] ${gameData.questions.length} preguntas sembradas en MongoDB.`);
      }
    } else {
      const docs = await QuestionModel.find().lean();
      gameData.questions = docs.map(d => ({
        id: d.id || d._id.toString(),
        text: d.text,
        celebrant: d.celebrant,
        options: d.options,
        correctIndex: d.correctIndex,
        timeLimit: d.timeLimit,
        explanation: d.explanation || ''
      }));
      console.log(`[MongoDB] Cargadas ${gameData.questions.length} preguntas desde MongoDB.`);
    }
  } catch (err) {
    console.error('[MongoDB] Error al sincronizar con Mongo:', err.message);
    loadFromFile();
  }
}

function loadFromFile() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed.settings) gameData.settings = parsed.settings;
      if (Array.isArray(parsed.questions)) gameData.questions = parsed.questions;
      console.log(`[Config] Cargadas ${gameData.questions.length} preguntas desde questions.json.`);
    }
  } catch (err) {
    console.error('[Error] No se pudo leer questions.json:', err.message);
  }
}

async function saveGameData() {
  // 1. Guardar en JSON siempre como respaldo
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(gameData, null, 2), 'utf-8');
    console.log('[Config] Datos guardados en questions.json');
  } catch (err) {
    console.error('[Error] No se pudo guardar questions.json:', err.message);
  }

  // 2. Guardar en MongoDB si está activo
  if (isMongoConnected) {
    try {
      await SettingModel.findOneAndUpdate(
        { key: 'main' },
        {
          celebrant1: gameData.settings.celebrant1,
          celebrant2: gameData.settings.celebrant2,
          pin: gameData.settings.pin,
          adminPassword: gameData.settings.adminPassword
        },
        { upsert: true }
      );

      // Reemplazar colección de preguntas
      await QuestionModel.deleteMany({});
      if (gameData.questions.length > 0) {
        await QuestionModel.insertMany(gameData.questions);
      }
      console.log('[MongoDB] Preguntas y ajustes guardados en MongoDB.');
    } catch (err) {
      console.error('[MongoDB] Error al guardar en MongoDB:', err.message);
    }
  }
}

initMongo();


// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Estado en memoria del juego
const gameState = {
  status: 'LOBBY', // LOBBY, INTRO, QUESTION, REVEAL, LEADERBOARD, PODIUM
  currentQuestionIndex: -1,
  currentQuestion: null,
  timer: null,
  secondsLeft: 0,
  questionTotalSeconds: 20,
  questionStartTime: 0,
  players: new Map(), // socketId -> Player
  answersCurrentRound: new Map(), // socketId -> { optionIndex, timeMs, points, isCorrect }
  previousRanks: new Map() // socketId -> rank
};

// Player Class
class Player {
  constructor(socketId, name, avatar) {
    this.id = socketId;
    this.name = name;
    this.avatar = avatar || '🎉';
    this.score = 0;
    this.streak = 0;
    this.correctCount = 0;
    this.wrongCount = 0;
    this.scoresByCelebrant = {
      p1: 0,
      p2: 0,
      both: 0
    };
    this.history = []; // { questionId, chosenIndex, isCorrect, points, timeMs }
  }
}

// Helpers
function getLeaderboard() {
  const list = Array.from(gameState.players.values()).map(p => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    score: p.score,
    streak: p.streak,
    correctCount: p.correctCount,
    scoresByCelebrant: p.scoresByCelebrant
  }));

  list.sort((a, b) => b.score - a.score);

  return list.map((p, index) => {
    const prevRank = gameState.previousRanks.get(p.id) ?? (index + 1);
    const diff = prevRank - (index + 1); // positivo = subió
    return {
      ...p,
      rank: index + 1,
      rankDiff: diff
    };
  });
}

function updatePreviousRanks() {
  const currentLeaderboard = getLeaderboard();
  gameState.previousRanks.clear();
  currentLeaderboard.forEach(p => {
    gameState.previousRanks.set(p.id, p.rank);
  });
}

function stopTimer() {
  if (gameState.timer) {
    clearInterval(gameState.timer);
    gameState.timer = null;
  }
}

function calculatePoints(timeMs, timeLimitSeconds, isCorrect, currentStreak) {
  if (!isCorrect) return 0;
  const maxPoints = 1000;
  const timeLimitMs = timeLimitSeconds * 1000;
  const safeTimeMs = Math.min(timeMs, timeLimitMs);
  
  // Fórmula Kahoot: 500 a 1000 puntos según velocidad
  const timeFactor = 1 - (safeTimeMs / timeLimitMs) / 2;
  let basePoints = Math.round(maxPoints * Math.max(0.5, timeFactor));

  // Bonus por racha (+50 por racha tras la primera, max +250)
  const streakBonus = Math.min(currentStreak * 50, 250);
  return basePoints + streakBonus;
}

function sanitizeQuestionForPlayer(q) {
  if (!q) return null;
  return {
    id: q.id,
    text: q.text,
    celebrant: q.celebrant,
    celebrantName: q.celebrant === 'p1' ? gameData.settings.celebrant1 :
                   q.celebrant === 'p2' ? gameData.settings.celebrant2 : 'Ambos Cumpleañeros',
    options: q.options,
    timeLimit: q.timeLimit || 20,
    index: gameState.currentQuestionIndex,
    totalQuestions: gameData.questions.length
  };
}

function endCurrentQuestion() {
  stopTimer();
  gameState.status = 'REVEAL';

  const q = gameState.currentQuestion;
  const counts = [0, 0, 0, 0];
  
  // Contar respuestas por opción
  gameState.answersCurrentRound.forEach(ans => {
    if (ans.optionIndex >= 0 && ans.optionIndex < 4) {
      counts[ans.optionIndex]++;
    }
  });

  // Notificar al Host
  io.to('host').emit('game:reveal', {
    question: q,
    counts,
    totalAnswered: gameState.answersCurrentRound.size,
    totalPlayers: gameState.players.size,
    correctIndex: q.correctIndex,
    explanation: q.explanation || ''
  });

  // Notificar a cada jugador su resultado individual
  gameState.players.forEach((player, socketId) => {
    const ans = gameState.answersCurrentRound.get(socketId);
    const didAnswer = !!ans;
    const isCorrect = didAnswer && ans.isCorrect;
    const points = didAnswer ? ans.points : 0;

    io.to(socketId).emit('player:round_result', {
      answered: didAnswer,
      isCorrect,
      correctIndex: q.correctIndex,
      pointsEarned: points,
      totalScore: player.score,
      streak: player.streak
    });
  });

  // Notificar cambio de estado general
  io.emit('game:status', {
    status: gameState.status,
    questionIndex: gameState.currentQuestionIndex
  });
}

function startQuestion(index) {
  stopTimer();
  gameState.currentQuestionIndex = index;
  gameState.currentQuestion = gameData.questions[index];
  gameState.answersCurrentRound.clear();

  if (!gameState.currentQuestion) {
    finishGame();
    return;
  }

  // 1. Mostrar pantalla INTRO (3 segundos de preparación "Pregunta X de Y...")
  gameState.status = 'INTRO';
  io.emit('game:intro', {
    index: index + 1,
    total: gameData.questions.length,
    celebrant: gameState.currentQuestion.celebrant,
    celebrantName: gameState.currentQuestion.celebrant === 'p1' ? gameData.settings.celebrant1 :
                   gameState.currentQuestion.celebrant === 'p2' ? gameData.settings.celebrant2 : '¡Ambos Cumpleañeros!'
  });

  setTimeout(() => {
    // Si el estado cambió en el ínterin, no iniciar
    if (gameState.status !== 'INTRO') return;

    gameState.status = 'QUESTION';
    const totalSecs = gameState.currentQuestion.timeLimit || 20;
    gameState.questionTotalSeconds = totalSecs;
    gameState.secondsLeft = totalSecs;
    gameState.questionStartTime = Date.now();

    // Broadcast a jugadores y host
    const sanitized = sanitizeQuestionForPlayer(gameState.currentQuestion);
    io.emit('game:question_start', {
      question: sanitized,
      timeLimit: totalSecs,
      index: index + 1,
      total: gameData.questions.length
    });

    // Iniciar temporizador regresivo de 1 segundo
    gameState.timer = setInterval(() => {
      gameState.secondsLeft--;
      io.emit('game:tick', {
        secondsLeft: gameState.secondsLeft,
        total: gameState.questionTotalSeconds,
        answeredCount: gameState.answersCurrentRound.size,
        totalPlayers: gameState.players.size
      });

      if (gameState.secondsLeft <= 0) {
        endCurrentQuestion();
      }
    }, 1000);
  }, 3200);
}

function showLeaderboard() {
  stopTimer();
  gameState.status = 'LEADERBOARD';
  const leaderboard = getLeaderboard();

  io.emit('game:leaderboard', {
    leaderboard: leaderboard.slice(0, 5), // Top 5 para pantalla grande
    isLastQuestion: gameState.currentQuestionIndex >= gameData.questions.length - 1
  });

  updatePreviousRanks();
}

function finishGame() {
  stopTimer();
  gameState.status = 'PODIUM';

  const fullLeaderboard = getLeaderboard();

  // 1. Tablero General (Suma total)
  const generalLeaderboard = [...fullLeaderboard].sort((a, b) => b.score - a.score).map((p, i) => ({
    ...p,
    rank: i + 1,
    displayScore: p.score
  }));

  // 2. Tablero de Gustavo
  const p1Leaderboard = [...fullLeaderboard].sort((a, b) => (b.scoresByCelebrant.p1 || 0) - (a.scoresByCelebrant.p1 || 0)).map((p, i) => ({
    ...p,
    rank: i + 1,
    displayScore: p.scoresByCelebrant.p1 || 0
  }));

  // 3. Tablero de Lizeth
  const p2Leaderboard = [...fullLeaderboard].sort((a, b) => (b.scoresByCelebrant.p2 || 0) - (a.scoresByCelebrant.p2 || 0)).map((p, i) => ({
    ...p,
    rank: i + 1,
    displayScore: p.scoresByCelebrant.p2 || 0
  }));

  // Enviar los 3 tableros al Host y a todos
  io.emit('game:podium', {
    general: {
      title: '🏆 Tablero General: Quien contestó más',
      top3: generalLeaderboard.slice(0, 3),
      leaderboard: generalLeaderboard
    },
    gustavo: {
      title: `💙 Tablero: Quien conoce más a ${gameData.settings.celebrant1}`,
      celebrantName: gameData.settings.celebrant1,
      top3: p1Leaderboard.slice(0, 3),
      leaderboard: p1Leaderboard
    },
    lizeth: {
      title: `💖 Tablero: Quien conoce más a ${gameData.settings.celebrant2}`,
      celebrantName: gameData.settings.celebrant2,
      top3: p2Leaderboard.slice(0, 3),
      leaderboard: p2Leaderboard
    }
  });

  // Enviar estadísticas personalizadas a cada celular
  gameState.players.forEach((player, socketId) => {
    const genRank = generalLeaderboard.findIndex(x => x.id === player.id) + 1;
    const p1Rank = p1Leaderboard.findIndex(x => x.id === player.id) + 1;
    const p2Rank = p2Leaderboard.findIndex(x => x.id === player.id) + 1;

    io.to(socketId).emit('player:final_stats', {
      totalScore: player.score,
      genRank,
      p1Rank,
      p1Score: player.scoresByCelebrant.p1 || 0,
      p2Rank,
      p2Score: player.scoresByCelebrant.p2 || 0,
      celebrant1: gameData.settings.celebrant1,
      celebrant2: gameData.settings.celebrant2
    });
  });


  // Guardar partida terminada en la base de datos de MongoDB
  if (isMongoConnected && fullLeaderboard.length > 0) {
    GameHistoryModel.create({
      celebrant1: gameData.settings.celebrant1,
      celebrant2: gameData.settings.celebrant2,
      players: fullLeaderboard.map(p => ({
        name: p.name,
        avatar: p.avatar,
        rank: p.rank,
        score: p.score,
        correctCount: p.correctCount,
        scoresByCelebrant: p.scoresByCelebrant
      }))
    }).then(() => console.log('📁 [MongoDB] Historial de partida guardado en la base de datos.'))
      .catch(e => console.error('[MongoDB] Error guardando historial:', e.message));
  }
}

function resetGame() {
  stopTimer();
  if (isMongoConnected) {
    syncFromMongo();
  } else {
    loadFromFile();
  }
  gameState.status = 'LOBBY';
  gameState.currentQuestionIndex = -1;
  gameState.currentQuestion = null;
  gameState.answersCurrentRound.clear();
  gameState.previousRanks.clear();



  // Resetear puntajes de jugadores actuales
  gameState.players.forEach(p => {
    p.score = 0;
    p.streak = 0;
    p.correctCount = 0;
    p.wrongCount = 0;
    p.scoresByCelebrant = { p1: 0, p2: 0, both: 0 };
    p.history = [];
  });

  io.emit('game:reset', {
    pin: gameData.settings.pin,
    celebrant1: gameData.settings.celebrant1,
    celebrant2: gameData.settings.celebrant2
  });
}

// REST Endpoints
app.get('/api/config', (req, res) => {
  res.json({
    celebrant1: gameData.settings.celebrant1,
    celebrant2: gameData.settings.celebrant2,
    pin: gameData.settings.pin,
    questionCount: gameData.questions.length
  });
});

app.post('/api/admin/save-questions', async (req, res) => {
  const { password, questions, settings } = req.body;
  if (password !== gameData.settings.adminPassword && password !== 'admin') {
    return res.status(403).json({ error: 'Contraseña de administrador incorrecta' });
  }

  if (Array.isArray(questions)) {
    gameData.questions = questions;
  }
  if (settings) {
    if (settings.celebrant1) gameData.settings.celebrant1 = settings.celebrant1;
    if (settings.celebrant2) gameData.settings.celebrant2 = settings.celebrant2;
    if (settings.pin) gameData.settings.pin = settings.pin;
  }

  await saveGameData();
  res.json({ success: true, message: 'Configuración y preguntas guardadas con éxito' });
});

app.get('/api/admin/history', async (req, res) => {
  try {
    if (!isMongoConnected) {
      return res.json({ mongo: false, message: 'MongoDB no conectado aún', history: [] });
    }
    const history = await GameHistoryModel.find().sort({ createdAt: -1 }).limit(20).lean();
    res.json({ mongo: true, history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/admin/export-scores', (req, res) => {
  const full = getLeaderboard();
  res.json({
    celebrants: [gameData.settings.celebrant1, gameData.settings.celebrant2],
    generatedAt: new Date().toISOString(),
    players: full
  });
});

// Socket.IO Logic
io.on('connection', (socket) => {
  console.log(`[Socket] Conectado: ${socket.id}`);

  // Registro como Host
  socket.on('host:join', (data) => {
    socket.join('host');
    socket.emit('host:init', {
      settings: gameData.settings,
      questions: gameData.questions,
      gameState: {
        status: gameState.status,
        currentQuestionIndex: gameState.currentQuestionIndex,
        players: Array.from(gameState.players.values())
      }
    });
  });

  // Registro de Jugador
  socket.on('player:join', ({ name, pin, avatar }) => {
    const cleanName = (name || '').trim();
    const cleanPin = (pin || '').trim();

    if (cleanPin !== gameData.settings.pin) {
      return socket.emit('player:join_error', { message: 'El PIN de la sala es incorrecto.' });
    }

    if (!cleanName) {
      return socket.emit('player:join_error', { message: 'Por favor escribe tu nombre.' });
    }

    // Verificar si ya existe el nombre
    for (const p of gameState.players.values()) {
      if (p.name.toLowerCase() === cleanName.toLowerCase() && p.id !== socket.id) {
        return socket.emit('player:join_error', { message: 'Ese nombre ya está en uso, elige un apodo único.' });
      }
    }

    const player = new Player(socket.id, cleanName, avatar);
    gameState.players.set(socket.id, player);

    socket.emit('player:join_success', {
      id: socket.id,
      name: player.name,
      avatar: player.avatar,
      status: gameState.status,
      celebrant1: gameData.settings.celebrant1,
      celebrant2: gameData.settings.celebrant2
    });

    // Notificar al host y a la sala
    io.to('host').emit('room:player_joined', {
      player: { id: player.id, name: player.name, avatar: player.avatar },
      totalPlayers: gameState.players.size
    });

    io.emit('room:player_count', { count: gameState.players.size });

    // Si ya hay una pregunta en curso, enviarle el estado
    if (gameState.status === 'QUESTION' && gameState.currentQuestion) {
      socket.emit('game:question_start', {
        question: sanitizeQuestionForPlayer(gameState.currentQuestion),
        timeLimit: gameState.secondsLeft,
        index: gameState.currentQuestionIndex + 1,
        total: gameData.questions.length
      });
    }
  });

  // Respuesta de jugador
  socket.on('player:answer', ({ optionIndex }) => {
    if (gameState.status !== 'QUESTION' || !gameState.currentQuestion) return;

    const player = gameState.players.get(socket.id);
    if (!player) return;

    if (gameState.answersCurrentRound.has(socket.id)) {
      return; // Ya respondió esta ronda
    }

    const timeTakenMs = Math.max(50, Date.now() - gameState.questionStartTime);
    const q = gameState.currentQuestion;
    const isCorrect = optionIndex === q.correctIndex;

    if (isCorrect) {
      player.streak++;
      player.correctCount++;
    } else {
      player.streak = 0;
      player.wrongCount++;
    }

    const points = calculatePoints(timeTakenMs, q.timeLimit || 20, isCorrect, player.streak);
    player.score += points;

    // Acumular puntaje por categoría de cumpleañero
    if (q.celebrant === 'p1') {
      player.scoresByCelebrant.p1 += points;
    } else if (q.celebrant === 'p2') {
      player.scoresByCelebrant.p2 += points;
    } else {
      player.scoresByCelebrant.both += points;
    }

    const answerRecord = {
      optionIndex,
      timeMs: timeTakenMs,
      points,
      isCorrect
    };

    gameState.answersCurrentRound.set(socket.id, answerRecord);
    player.history.push({
      questionId: q.id,
      chosenIndex: optionIndex,
      isCorrect,
      points,
      timeMs: timeTakenMs
    });

    // Confirmación al jugador que su respuesta fue recibida
    socket.emit('player:answer_received', {
      chosenIndex: optionIndex
    });

    // Actualizar conteo de respuestas en el host
    io.to('host').emit('room:answer_update', {
      answeredCount: gameState.answersCurrentRound.size,
      totalPlayers: gameState.players.size
    });

    // Si todos los jugadores conectados ya respondieron, terminar la pregunta antes
    if (gameState.answersCurrentRound.size >= gameState.players.size && gameState.players.size > 0) {
      setTimeout(() => {
        if (gameState.status === 'QUESTION') {
          endCurrentQuestion();
        }
      }, 500);
    }
  });

  // Acciones de control del Host
  socket.on('host:action', ({ action, index, playerId }) => {
    switch (action) {
      case 'start':
        if (gameData.questions.length === 0) {
          return socket.emit('host:error', { message: 'No hay preguntas cargadas.' });
        }
        startQuestion(0);
        break;

      case 'next_question':
        startQuestion(gameState.currentQuestionIndex + 1);
        break;

      case 'end_question':
        endCurrentQuestion();
        break;

      case 'show_leaderboard':
        showLeaderboard();
        break;

      case 'finish':
        finishGame();
        break;

      case 'restart':
        resetGame();
        break;

      case 'kick':
        if (playerId && gameState.players.has(playerId)) {
          const p = gameState.players.get(playerId);
          gameState.players.delete(playerId);
          io.to(playerId).emit('player:kicked', { message: 'Has sido expulsado de la sala.' });
          io.to('host').emit('room:player_left', { id: playerId, name: p.name });
          io.emit('room:player_count', { count: gameState.players.size });
        }
        break;
    }
  });

  // Desconexión
  socket.on('disconnect', () => {
    if (gameState.players.has(socket.id)) {
      const p = gameState.players.get(socket.id);
      console.log(`[Socket] Jugador desconectado: ${p.name}`);
      gameState.players.delete(socket.id);
      gameState.answersCurrentRound.delete(socket.id);

      io.to('host').emit('room:player_left', { id: socket.id, name: p.name });
      io.emit('room:player_count', { count: gameState.players.size });
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`🎉 Servidor Kahoot Cumpleaños en ejecución`);
  console.log(`🌐 Acceso local:   http://localhost:${PORT}`);
  console.log(`📺 Pantalla Host:  http://localhost:${PORT}/host.html`);
  console.log(`📱 Pantalla Jugador: http://localhost:${PORT}/`);
  console.log(`🔑 PIN de sala:    ${gameData.settings.pin}`);
  console.log(`===============================================`);
});
