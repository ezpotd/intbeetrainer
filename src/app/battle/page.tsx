"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSocket } from "@/lib/socket"; 
import { useSession } from "next-auth/react";
import { CgSpinner } from "react-icons/cg";
import { FaPlay, FaUserPlus, FaLock, FaUnlock } from "react-icons/fa";

export default function BattleLobby() {
  const router = useRouter();
  const { data: session, status } = useSession(); 
  const socket = getSocket();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth");
    }
  }, [status, router]);

  const [joinCode, setJoinCode] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  
  const [settings, setSettings] = useState({
    minDiff: 1, maxDiff: 5, includeUnrated: false,
    numProblems: 5, timePerProblem: 60, password: "",
  });

  useEffect(() => {
    if (status !== "authenticated") return;
    socket.connect();
    socket.on("room_created", ({ roomId }) => {
      const pwdParam = settings.password ? `?pwd=${settings.password}` : "";
      router.push(`/battle/room/${roomId}${pwdParam}`);
    });
    socket.on("error", (err: any) => {
      alert(err.message);
      setIsCreating(false);
    });
    return () => {
      socket.off("room_created");
      socket.off("error");
    };
  }, [router, socket, settings.password, status]);

  if (status === "loading" || status === "unauthenticated") {
    return <div className="min-h-screen bg-[#050505] flex items-center justify-center text-white">Loading...</div>;
  }

  const handleCreateRoom = () => {
    if (settings.minDiff > settings.maxDiff) {
      alert("Min difficulty cannot be higher than Max difficulty!");
      return;
    }
    // Validation 0 - 600
    if (settings.timePerProblem < 0 || settings.timePerProblem > 600) {
      alert("Time limit must be between 0 and 600 seconds.");
      return;
    }
    setIsCreating(true);
    socket.emit("create_room", {
      ...settings,
      username: session?.user?.name || "Anonymous",
      userEmail: session?.user?.email,
    });
  };

  const handleJoinRoom = () => {
    if (!joinCode) return;
    const pwdParam = joinPassword ? `?pwd=${joinPassword}` : "";
    router.push(`/battle/room/${joinCode.toUpperCase()}${pwdParam}`);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-slate-300 font-sans pt-16">
      <nav className="fixed top-0 w-full z-50 bg-[#050505]/95 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex justify-between items-center">
          <Link href="/trainer" className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors group">
            <span className="text-xl group-hover:-translate-x-1 transition-transform">←</span>
            <span className="text-sm font-bold uppercase tracking-wider">Back to Trainer</span>
          </Link>
          <div className="text-sm font-bold uppercase tracking-wider text-slate-500">Battle Arena</div>
        </div>
      </nav>

      <main className="container mx-auto max-w-4xl px-4 py-12 flex flex-col items-center">
        <div className="text-center space-y-4 mb-12">
          <h1 className="text-5xl font-black tracking-tight text-white">Battle Arena</h1>
          <p className="text-xl text-slate-400">Compete against others in real-time integration duels.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
          <div className="p-8 rounded-3xl bg-[#0a0a0a] border border-white/5 space-y-6 hover:border-white/10 transition-colors">
            <div className="flex items-center gap-3 text-2xl font-bold text-white mb-2">
              <FaPlay className="text-emerald-400" />
              <h2>Create Room</h2>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Difficulty Range</label>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <span className="text-xs text-slate-500 mb-1 block">Min</span>
                  <select value={settings.minDiff} onChange={(e) => setSettings({...settings, minDiff: Number(e.target.value)})} className="w-full bg-[#111] border border-zinc-800 rounded-lg p-2 text-white focus:outline-none focus:border-emerald-500">
                    {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="text-slate-600 mt-5">-</div>
                <div className="flex-1">
                  <span className="text-xs text-slate-500 mb-1 block">Max</span>
                  <select value={settings.maxDiff} onChange={(e) => setSettings({...settings, maxDiff: Number(e.target.value)})} className="w-full bg-[#111] border border-zinc-800 rounded-lg p-2 text-white focus:outline-none focus:border-emerald-500">
                    {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${settings.includeUnrated ? "bg-emerald-500 border-emerald-500" : "border-zinc-700 bg-[#111]"}`}>
                  {settings.includeUnrated && <span className="text-black font-bold text-xs">✓</span>}
                </div>
                <input type="checkbox" className="hidden" checked={settings.includeUnrated} onChange={(e) => setSettings({...settings, includeUnrated: e.target.checked})} />
                <span className="text-sm text-slate-400 group-hover:text-white transition-colors">Include Unrated Problems</span>
              </label>
            </div>

            {/* TIME LIMIT INPUT - FIXED NaN */}
            <div className="space-y-3 pt-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex justify-between">
                <span>Time Limit (Seconds)</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="600"
                  value={settings.timePerProblem}
                  onChange={(e) => setSettings({ ...settings, timePerProblem: e.target.valueAsNumber || 0 })} 
                  className="w-full bg-[#111] border border-zinc-800 rounded-lg px-4 py-2 text-white placeholder-zinc-700 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Password (Optional)</label>
              <div className="relative">
                <FaLock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-sm" />
                <input type="text" placeholder="Leave empty for public" value={settings.password} onChange={(e) => setSettings({ ...settings, password: e.target.value })} className="w-full bg-[#111] border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-white placeholder-zinc-700 focus:outline-none focus:border-emerald-500 transition text-sm" />
              </div>
            </div>
            <button onClick={handleCreateRoom} disabled={isCreating} className="w-full py-4 rounded-xl bg-white text-black font-bold uppercase tracking-wide hover:bg-emerald-400 hover:text-black transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-4">
              {isCreating ? <CgSpinner className="animate-spin text-xl" /> : "Start Room"}
            </button>
          </div>

          <div className="p-8 rounded-3xl bg-[#0a0a0a] border border-white/5 space-y-6 flex flex-col justify-center hover:border-white/10 transition-colors">
            <div className="flex items-center gap-3 text-2xl font-bold text-white mb-2">
              <FaUserPlus className="text-blue-400" />
              <h2>Join Room</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 block">Room Code</label>
                <input type="text" placeholder="X7K9P" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} className="w-full bg-[#111] border border-zinc-800 rounded-xl px-6 py-4 text-center text-2xl font-mono uppercase text-white placeholder-zinc-700 focus:outline-none focus:border-blue-500 transition" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 block">Password (If required)</label>
                <div className="relative">
                  <FaUnlock className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" />
                  <input type="password" placeholder="Enter password..." value={joinPassword} onChange={(e) => setJoinPassword(e.target.value)} className="w-full bg-[#111] border border-zinc-800 rounded-xl pl-12 pr-4 py-3 text-white placeholder-zinc-700 focus:outline-none focus:border-blue-500 transition" />
                </div>
              </div>
              <button onClick={handleJoinRoom} className="w-full py-4 rounded-xl bg-blue-600 text-white font-bold uppercase tracking-wide hover:bg-blue-500 transition shadow-lg shadow-blue-900/20 mt-2">
                Join Game
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}