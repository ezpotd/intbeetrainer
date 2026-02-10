import { Server } from "socket.io";
import { createServer } from "http";
import { Pool } from "pg"; 
import dotenv from "dotenv";
import nerdamer from "nerdamer";
require("nerdamer/Algebra");
require("nerdamer/Calculus");

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: "http://localhost:3000", methods: ["GET", "POST"] }
});

// --- TYPES ---
interface GameState {
  id: string;
  hostId: string;
  status: "WAITING" | "PLAYING" | "INTERMISSION" | "FINISHED";
  config: {
    minDiff: number; maxDiff: number; includeUnrated: boolean;
    timePerProblem: number; numProblems: number; password?: string;
  };
  players: { 
    id: string; 
    name: string; 
    score: number;
    email?: string;
    connected: boolean;
  }[];
  problems: any[];
  currentProblemIndex: number;
  
  // Round State
  roundSolvers: string[]; 
  roundFailers: string[]; 
  roundEndTime: number;
  timer: NodeJS.Timeout | null;
}

const activeGames: Record<string, GameState> = {};

// --- HELPER: Strip sensitive data ---
function getSafeRoomState(room: GameState) {
  const { timer, problems, ...rest } = room;
  const safeProblems = problems.map(p => {
    const { problem_answer_computed, ...safeP } = p;
    return safeP;
  });
  return { ...rest, problems: safeProblems };
}

// --- EQUALITY & ANTI-CHEAT ---

function isValidInput(input: string): boolean {
  if (!input) return false;
  const lower = input.toLowerCase();
  
  const bannedKeywords = [
    "int", "integrate", "defint", 
    "diff", "d", "derivative",
    "solve", "roots", 
    "limit", "lim",
    "sum", "product",
    "nerdamer"
  ];

  const regex = new RegExp(`\\b(${bannedKeywords.join("|")})\\b`, "i");
  return !regex.test(lower);
}

function areExpressionsEqual(userInput: string, expected: string): boolean {
  try {
    // 1. Symbolic Check
    const diff = nerdamer(`(${userInput}) - (${expected})`).simplify().toString();
    if (diff === "0") return true;

    // 2. Numerical Fallback (10 Random Points + Hybrid Error)
    const testPoints: number[] = [];
    for (let i = 0; i < 10; i++) {
        let val = (Math.random() * 20) - 10; 
        if (Math.abs(val) < 0.1) val += 0.5;
        testPoints.push(val);
    }

    const TOLERANCE = 0.001;

    for (const xVal of testPoints) {
      try {
        const uVal = Number(nerdamer(userInput).evaluate({ x: xVal }).text('decimals'));
        const eVal = Number(nerdamer(expected).evaluate({ x: xVal }).text('decimals'));

        if (!isFinite(uVal) || !isFinite(eVal)) continue;

        const absDiff = Math.abs(uVal - eVal);
        const magnitude = Math.max(Math.abs(uVal), Math.abs(eVal));

        if (magnitude < 1.0) {
            if (absDiff > TOLERANCE) return false;
        } else {
            if ((absDiff / magnitude) > TOLERANCE) return false;
        }
      } catch (e) {
        continue;
      }
    }

    return true; 
  } catch (e) {
    return false;
  }
}

// --- DB HELPERS ---
async function getProblemsFromDB(count: number, min: number, max: number, includeUnrated: boolean) {
  const client = await pool.connect();
  try {
    const params: any[] = [min, max];
    let whereClause = `(difficulty BETWEEN $1 AND $2)`;
    if (includeUnrated) whereClause += ` OR (difficulty = 0)`;
    
    const queryText = `
      SELECT 
        id, 
        problem_text, 
        problem_answer_computed, 
        difficulty
      FROM integration_problems
      WHERE ${whereClause}
      ORDER BY RANDOM() LIMIT $${params.length + 1}
    `;
    params.push(count);

    const res = await client.query(queryText, params);
    return res.rows;
  } catch (err) {
    console.error("DB Query Error:", err);
    return [];
  } finally {
    client.release();
  }
}

async function updateUserProgress(userEmail: string, problemId: string) {
  if (!userEmail || !problemId) return;
  const client = await pool.connect();
  try {
    const userRes = await client.query("SELECT id FROM users WHERE email = $1", [userEmail]);
    if (userRes.rows.length === 0) return; 
    const userId = userRes.rows[0].id;

    const updateQuery = `
      INSERT INTO user_progress (user_id, problem_id, is_solved, attempts, last_updated)
      VALUES ($1, $2, true, 1, NOW())
      ON CONFLICT (user_id, problem_id) 
      DO UPDATE SET 
        is_solved = true, 
        attempts = user_progress.attempts + 1,
        last_updated = NOW();
    `;
    await client.query(updateQuery, [userId, problemId]);
  } catch (err) {
    console.error("DB Update Error:", err);
  } finally {
    client.release();
  }
}

// --- GAME LOGIC ---

function startRound(roomId: string) {
  const room = activeGames[roomId];
  if (!room) return;

  if (room.currentProblemIndex >= room.problems.length) {
    room.status = "FINISHED";
    io.to(roomId).emit("update_room", getSafeRoomState(room)); 
    return;
  }

  room.status = "PLAYING";
  room.roundSolvers = [];
  room.roundFailers = [];
  room.roundEndTime = Date.now() + (room.config.timePerProblem * 1000);

  const fullProblem = room.problems[room.currentProblemIndex];
  const { problem_answer_computed, ...safeProblem } = fullProblem;

  io.to(roomId).emit("game_started", { 
    firstProblem: safeProblem, 
    totalProblems: room.problems.length,
    currentRound: room.currentProblemIndex + 1,
    endTime: room.roundEndTime
  });

  if (room.timer) clearTimeout(room.timer);
  room.timer = setTimeout(() => {
    endRound(roomId);
  }, room.config.timePerProblem * 1000);
}

function endRound(roomId: string) {
  const room = activeGames[roomId];
  if (!room) return;
  if (room.timer) clearTimeout(room.timer);
  io.to(roomId).emit("update_room", getSafeRoomState(room));
  room.status = "INTERMISSION";
  setTimeout(() => {
    if (activeGames[roomId]) {
      room.currentProblemIndex++;
      startRound(roomId);
    }
  }, 3000);
}

function handleLeaveRoom(socketId: string) {
  const roomId = Object.keys(activeGames).find(id => 
    activeGames[id].players.some(p => p.id === socketId)
  );

  if (!roomId) return;
  const room = activeGames[roomId];
  const player = room.players.find(p => p.id === socketId);
  if (player) player.connected = false;

  console.log(`User ${socketId} disconnected from ${roomId}.`);

  const activePlayers = room.players.filter(p => p.connected);

  if (activePlayers.length === 0) {
    if (room.timer) clearTimeout(room.timer);
    delete activeGames[roomId];
    console.log(`🗑️ Room ${roomId} deleted (empty).`);
    return;
  }

  if (room.hostId === socketId && activePlayers.length > 0) {
    room.hostId = activePlayers[0].id;
  }

  if (room.status === "PLAYING") {
     const activeAndFinished = activePlayers.filter(p => 
        room.roundSolvers.includes(p.id) || room.roundFailers.includes(p.id)
     ).length;

     if (activeAndFinished >= activePlayers.length) {
       endRound(roomId);
     }
  }

  io.to(roomId).emit("update_room", getSafeRoomState(room));
}

// --- SOCKET SERVER ---

io.on("connection", (socket) => {
  socket.on("create_room", (settings) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    activeGames[roomId] = {
      id: roomId,
      hostId: socket.id,
      status: "WAITING",
      config: settings,
      players: [{ 
        id: socket.id, 
        name: settings.username || "Anonymous", 
        score: 0,
        email: settings.userEmail,
        connected: true
      }],
      problems: [],
      currentProblemIndex: 0,
      roundSolvers: [],
      roundFailers: [],
      roundEndTime: 0,
      timer: null
    };
    socket.join(roomId);
    socket.emit("room_created", { roomId });
  });

  socket.on("join_room", ({ roomId, username, password, userEmail }) => {
    const room = activeGames[roomId];
    if (!room) { socket.emit("error", { message: "Room not found" }); return; }
    if (room.status !== "WAITING") { socket.emit("error", { message: "Game in progress" }); return; }
    if (room.config.password && room.config.password !== password) {
       socket.emit("error", { message: "Incorrect password" }); return;
    }

    socket.join(roomId);
    const existingPlayer = room.players.find(p => p.id === socket.id);
    if (!existingPlayer) {
      room.players.push({ 
        id: socket.id, 
        name: username || "Guest", 
        score: 0,
        email: userEmail,
        connected: true
      });
    } else {
      existingPlayer.connected = true;
    }
    io.to(roomId).emit("update_room", getSafeRoomState(room));
  });

  socket.on("start_game", async ({ roomId }) => {
    const room = activeGames[roomId];
    if (!room || room.hostId !== socket.id) return;
    try {
      const problems = await getProblemsFromDB(
        room.config.numProblems, room.config.minDiff, room.config.maxDiff, room.config.includeUnrated
      );
      if (problems.length === 0) { socket.emit("error", { message: "No problems found!" }); return; }
      room.problems = problems;
      room.currentProblemIndex = 0;
      startRound(roomId); 
    } catch (e) {
      console.error(e);
      socket.emit("error", { message: "DB Error" });
    }
  });

  socket.on("submit_answer", ({ roomId, input }) => {
    const room = activeGames[roomId];
    if (!room || room.status !== "PLAYING") return;
    if (room.roundSolvers.includes(socket.id) || room.roundFailers.includes(socket.id)) return;

    if (!isValidInput(input)) {
        room.roundFailers.push(socket.id);
        socket.emit("answer_result", { valid: false, reason: "Illegal Command" });
        const activePlayers = room.players.filter(p => p.connected);
        const finishedCount = activePlayers.filter(p => 
          room.roundSolvers.includes(p.id) || room.roundFailers.includes(p.id)
        ).length;
        if (finishedCount >= activePlayers.length) endRound(roomId);
        return;
    }

    const currentProb = room.problems[room.currentProblemIndex];
    if (!currentProb) return;

    const isCorrect = areExpressionsEqual(input, currentProb.problem_answer_computed);

    if (isCorrect) {
      const n = room.players.filter(p => p.connected).length;
      const i = room.roundSolvers.length + 1; 
      const points = Math.max(1, n + 1 - i); 

      const player = room.players.find(p => p.id === socket.id);
      if (player) {
        player.score += points;
        room.roundSolvers.push(socket.id);
        if (player.email) {
          updateUserProgress(player.email, currentProb.id);
        }
      }
      socket.emit("answer_result", { valid: true });

    } else {
      room.roundFailers.push(socket.id);
      socket.emit("answer_result", { valid: false });
    }

    io.to(roomId).emit("update_room", getSafeRoomState(room));

    const activePlayers = room.players.filter(p => p.connected);
    const finishedCount = activePlayers.filter(p => 
      room.roundSolvers.includes(p.id) || room.roundFailers.includes(p.id)
    ).length;

    if (finishedCount >= activePlayers.length) {
      endRound(roomId);
    }
  });

  socket.on("leave_room", () => handleLeaveRoom(socket.id));
  socket.on("disconnect", () => handleLeaveRoom(socket.id));
});

const PORT = 4000;
httpServer.listen(PORT, () => {
  console.log(`⚔️  Battle Server running on http://localhost:${PORT}`);
});