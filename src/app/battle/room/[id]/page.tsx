"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { useSession } from "next-auth/react";
import { BlockMath } from "react-katex";
import "katex/dist/katex.min.css";
import nerdamer from "nerdamer";
import "nerdamer/Algebra";
import "nerdamer/Calculus";
import confetti from "canvas-confetti";
import { FaCopy, FaClock, FaTrophy, FaSignOutAlt, FaPlay } from "react-icons/fa"; // Added FaPlay
import { CgSpinner } from "react-icons/cg";

export default function BattleRoomPage() {
  const { id } = useParams();
  const roomId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const password = searchParams.get("pwd");
  const { data: session, status } = useSession();
  const socket = getSocket();

  // --- STATE ---
  const [roomStatus, setRoomStatus] = useState<"WAITING" | "PLAYING" | "INTERMISSION" | "FINISHED">("WAITING");
  const [players, setPlayers] = useState<any[]>([]);
  const [hostId, setHostId] = useState("");
  const [config, setConfig] = useState<any>(null);
  
  const [currentProblem, setCurrentProblem] = useState<any>(null);
  const [roundNumber, setRoundNumber] = useState(1);
  const [totalProblems, setTotalProblems] = useState(5);
  
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [isSolved, setIsSolved] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  
  // Timer State
  const [roundEndTime, setRoundEndTime] = useState<number | null>(null);
  const [displayTime, setDisplayTime] = useState(0);

  // --- AUTH CHECK ---
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth");
    }
  }, [status, router]);

  // --- TIMER LOGIC (Timestamp Based) ---
  useEffect(() => {
    if (roomStatus === "PLAYING" && roundEndTime) {
      const updateTimer = () => {
        const now = Date.now();
        const remaining = Math.max(0, Math.ceil((roundEndTime - now) / 1000));
        setDisplayTime(remaining);
      };
      
      updateTimer(); // Initial calculation
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
    }
  }, [roomStatus, roundEndTime]);

  // --- SOCKET LISTENERS ---
  useEffect(() => {
    if (status !== "authenticated") return;
    if (!socket.connected) socket.connect();

    const username = session?.user?.name || "Guest";
    const userEmail = session?.user?.email;

    // Join room on mount
    socket.emit("join_room", { roomId, username, password, userEmail });

    socket.on("update_room", (room) => {
      setRoomStatus(room.status);
      setPlayers(room.players);
      setHostId(room.hostId);
      setConfig(room.config);
      
      // Sync timer if joining mid-game
      if (room.roundEndTime && room.status === "PLAYING") {
         setRoundEndTime(room.roundEndTime);
      }
    });

    socket.on("game_started", (data) => {
      setRoomStatus("PLAYING");
      setCurrentProblem(data.firstProblem);
      setTotalProblems(data.totalProblems);
      setRoundNumber(data.currentRound || 1);
      
      // Set end time from server to keep everyone synced
      setRoundEndTime(data.endTime);
      
      setIsSolved(false);
      setHasFailed(false);
      setInput("");
      setFeedback(null);
    });

    socket.on("error", (err: any) => {
      alert(err.message);
      router.push("/battle");
    });

    return () => {
      socket.off("update_room");
      socket.off("game_started");
      socket.off("error");
    };
  }, [roomId, session, status, socket, router, password]);

  // --- HANDLERS ---
  const checkAnswer = () => {
    if (!currentProblem || isSolved || hasFailed) return;
    try {
      const expected = currentProblem.problem_answer_computed;
      const expr = nerdamer(`(${input}) - (${expected})`);
      const diff = (expr as any).simplify().toString();

      if (diff === "0") {
        setFeedback("correct");
        setIsSolved(true);
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        socket.emit("problem_solved", { roomId }); 
      } else {
        setFeedback("wrong");
        setHasFailed(true);
        socket.emit("problem_failed", { roomId }); 
      }
    } catch (e) {
      setFeedback("wrong");
      setHasFailed(true);
      socket.emit("problem_failed", { roomId });
    }
  };

  const handleStartGame = () => socket.emit("start_game", { roomId });
  
  const handleLeaveGame = () => {
    if (confirm("Are you sure you want to leave?")) {
      socket.emit("leave_room");
      router.push("/battle");
    }
  };

  const copyCode = () => { navigator.clipboard.writeText(roomId); alert("Room code copied!"); };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (status === "loading" || status === "unauthenticated") return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading...</div>;

  // VIEW 1: WAITING ROOM
  if (roomStatus === "WAITING") {
    const isHost = socket.id === hostId;
    return (
      <div className="min-h-screen bg-[#050505] text-white pt-24 px-4 font-sans">
        <div className="max-w-4xl mx-auto space-y-12">
          
          <div className="relative text-center space-y-4">
            <button 
              onClick={handleLeaveGame}
              className="absolute left-0 top-0 text-red-500 hover:text-red-400 font-bold flex items-center gap-2 transition-colors"
            >
              <FaSignOutAlt /> Leave
            </button>

            <h1 className="text-3xl font-bold text-slate-400 tracking-widest uppercase">Lobby</h1>
            <div onClick={copyCode} className="inline-flex items-center gap-4 text-6xl font-black bg-[#111] border border-white/10 px-12 py-6 rounded-3xl cursor-pointer hover:bg-[#1a1a1a] hover:border-white/20 transition active:scale-95 group">
              <span className="tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">{roomId}</span>
              <FaCopy className="text-3xl text-slate-600 group-hover:text-white transition-colors" />
            </div>
            <p className="text-slate-500 text-sm font-medium uppercase tracking-wide">Click code to copy</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {players.map((p, i) => (
              <div key={p.id || i} className={`bg-[#111] border border-white/5 p-4 rounded-2xl flex items-center gap-3 animate-in fade-in zoom-in duration-300 ${!p.connected ? 'opacity-40 grayscale border border-dashed border-white/10' : (socket.id === p.id ? "bg-white/10 border border-white/20" : "bg-white/5 border border-transparent")}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shadow-lg ${i === 0 ? "bg-yellow-400 text-black" : i === 1 ? "bg-zinc-400 text-black" : i === 2 ? "bg-orange-700 text-white" : "bg-slate-800 text-white"}`}>{i + 1}</div>
                  <div className="flex flex-col">
                    <span className={`text-sm font-bold ${socket.id === p.id ? "text-white" : "text-slate-300"}`}>
                      {p.name} {socket.id === p.id && "(You)"}
                    </span>
                    {!p.connected && <span className="text-[10px] text-red-400 font-bold uppercase">Disconnected</span>}
                  </div>
                </div>
                <span className="font-mono font-bold text-xl text-emerald-400">{p.score}</span>
              </div>
            ))}
          </div>

          <div className="flex justify-center pt-8">
            {isHost ? (
              <button onClick={handleStartGame} className="bg-white text-black text-xl font-black px-12 py-5 rounded-full hover:scale-105 hover:bg-emerald-400 transition-all shadow-[0_0_30px_rgba(255,255,255,0.1)] flex items-center gap-3 uppercase tracking-wide">
                <FaPlay className="text-lg" /> Start Game
              </button>
            ) : (
              <div className="flex items-center gap-3 text-slate-500 bg-[#111] px-8 py-4 rounded-full border border-white/5 font-bold uppercase tracking-wider">
                <CgSpinner className="animate-spin text-2xl" /> Waiting for host...
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // VIEW 2: GAMEPLAY
  return (
    <div className="min-h-screen bg-[#050505] text-white pt-20 px-4 font-sans">
      <nav className="fixed top-0 left-0 w-full h-16 bg-[#050505]/90 backdrop-blur border-b border-white/5 flex items-center justify-between px-6 z-50">
        <button onClick={handleLeaveGame} className="text-red-500 hover:text-red-400 font-bold flex items-center gap-2 text-sm uppercase tracking-wider transition-colors">
          <FaSignOutAlt /> Leave
        </button>

        <div className="flex items-center gap-2 font-mono text-xl font-bold absolute left-1/2 -translate-x-1/2">
           <div className={`flex items-center gap-2 ${displayTime < 10 ? "text-red-500 animate-pulse" : "text-emerald-400"}`}>
             <FaClock />
             <span>{roomStatus === "FINISHED" ? "DONE" : roomStatus === "INTERMISSION" ? "NEXT..." : formatTime(displayTime)}</span>
           </div>
        </div>

        <div className="font-bold text-slate-400 uppercase tracking-wider text-sm">
          Round <span className="text-white">{roundNumber}</span> / {totalProblems}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 pt-8 pb-20">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#111] border border-white/10 rounded-[30px] p-8 min-h-[350px] flex items-center justify-center shadow-2xl relative overflow-hidden group hover:border-white/20 transition-colors">
             {isSolved && (
               <div className="absolute inset-0 bg-emerald-500/10 flex items-center justify-center z-10 backdrop-blur-[2px] animate-in fade-in duration-150">
                 <div className="bg-emerald-500 text-black font-black text-4xl px-10 py-5 rounded-full rotate-[-3deg] shadow-[0_0_50px_rgba(16,185,129,0.5)] transform scale-110">SOLVED!</div>
               </div>
             )}
             {hasFailed && (
               <div className="absolute inset-0 bg-red-500/10 flex items-center justify-center z-10 backdrop-blur-[2px] animate-in fade-in duration-150">
                 <div className="bg-red-500 text-white font-black text-4xl px-10 py-5 rounded-full rotate-[3deg] shadow-[0_0_50px_rgba(239,68,68,0.5)] transform scale-110">FAILED</div>
               </div>
             )}
             {roomStatus === "FINISHED" && (
               <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-20 backdrop-blur-md">
                 <div className="text-center">
                   <h2 className="text-5xl font-black text-white mb-4">GAME OVER</h2>
                   <p className="text-slate-400">Check the leaderboard for final results.</p>
                 </div>
               </div>
             )}
             
             <div className="w-full overflow-x-auto no-scrollbar py-4 text-center">
               <div className="inline-block text-3xl md:text-5xl text-white whitespace-nowrap px-4 animate-in fade-in zoom-in duration-150">
                 {currentProblem ? <BlockMath math={currentProblem.problem_text} /> : <CgSpinner className="animate-spin text-slate-600 mx-auto" />}
               </div>
             </div>
          </div>

          <div className={`relative transition-all duration-150 ${feedback === "wrong" ? "animate-shake" : ""}`}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && checkAnswer()}
              disabled={isSolved || hasFailed || roomStatus !== "PLAYING"}
              placeholder={hasFailed ? "Incorrect. Wait for next round." : roomStatus === "INTERMISSION" ? "Next round starting..." : "Enter answer..."}
              className={`w-full bg-[#0a0a0a] border-2 rounded-2xl p-6 text-2xl font-mono focus:outline-none transition-all ${
                isSolved 
                  ? "border-emerald-500/50 text-emerald-500 bg-emerald-900/10" 
                  : hasFailed
                    ? "border-red-500/50 text-red-500 bg-red-900/10 opacity-50 cursor-not-allowed"
                    : feedback === "wrong" 
                      ? "border-red-500 text-red-500 bg-red-900/10" 
                      : "border-white/10 focus:border-blue-500 text-white placeholder-zinc-700"
              }`}
            />
            <button 
              onClick={checkAnswer}
              disabled={isSolved || hasFailed || roomStatus !== "PLAYING"}
              className="absolute right-3 top-3 bottom-3 bg-white text-black font-bold px-8 rounded-xl hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider text-sm transition-colors"
            >
              Submit
            </button>
          </div>
        </div>

        <div className="bg-[#111] border border-white/10 rounded-[30px] p-6 h-fit sticky top-24">
          <h3 className="text-slate-400 font-bold mb-6 uppercase tracking-widest text-xs border-b border-white/5 pb-4">Live Standings</h3>
          <div className="space-y-3">
            {[...players].sort((a,b) => b.score - a.score).map((p, i) => (
              <div key={p.id || i} className={`flex items-center justify-between p-4 rounded-xl transition-all ${!p.connected ? 'opacity-40 grayscale border border-dashed border-white/10' : (socket.id === p.id ? "bg-white/10 border border-white/20" : "bg-white/5 border border-transparent")}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shadow-lg ${i === 0 ? "bg-yellow-400 text-black" : i === 1 ? "bg-zinc-400 text-black" : i === 2 ? "bg-orange-700 text-white" : "bg-slate-800 text-white"}`}>{i + 1}</div>
                  <div className="flex flex-col">
                    <span className={`text-sm font-bold ${socket.id === p.id ? "text-white" : "text-slate-300"}`}>
                      {p.name} {socket.id === p.id && "(You)"}
                    </span>
                    {!p.connected && <span className="text-[10px] text-red-400 font-bold uppercase">Disconnected</span>}
                  </div>
                </div>
                <span className="font-mono font-bold text-xl text-emerald-400">{p.score}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
      <style jsx global>{`
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
        .animate-shake { animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}