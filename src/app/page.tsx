'use client';
import Link from 'next/link';
import { InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css'; // Ensure CSS is imported for Math

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-100 flex flex-col selection:bg-blue-500/30">
      {/* Navbar Section */}
      <nav className="z-20 flex items-center justify-between px-8 py-6 max-w-7xl w-full mx-auto">
        <div className="text-xl font-bold tracking-tight">
          ∫ <span className="text-blue-500">Integral</span>Master
        </div>
        <div className="space-x-8 text-sm font-medium text-gray-400">
          <Link href="/problems" className="hover:text-white transition-colors">Problems</Link>
          <Link href="/leaderboard" className="hover:text-white transition-colors">Leaderboard</Link>
          <Link href="/login" className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-all">Sign In</Link>
        </div>
      </nav>

      <main className="flex-1 relative flex flex-col items-center justify-center px-6 overflow-hidden">
        {/* Ambient Background Glows */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-blue-600/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-indigo-600/10 rounded-full blur-[120px]" />
        </div>

        {/* Content Container */}
        <div className="z-10 text-center max-w-4xl space-y-8">
          <h1 className="text-7xl md:text-8xl lg:text-9xl font-extrabold tracking-tighter leading-none bg-gradient-to-b from-white to-gray-500 bg-clip-text text-transparent">
            Master the <br /> 
            <span className="text-blue-500 italic font-black">Integral.</span>
          </h1>

          <div className="flex justify-center py-4 opacity-50 text-2xl md:text-3xl transition-opacity hover:opacity-100">
            <InlineMath math="\int_{0}^{\infty} \frac{\sin(x)}{x} dx = \frac{\pi}{2}" />
          </div>

          <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
            The ultimate trainer for competitive calculus. Solve hundreds of hand-picked problems from the 
            <span className="text-gray-200 font-medium"> MIT Integration Bee</span> and beyond.
          </p>

          <div className="pt-6">
            <Link 
              href="/trainer" 
              className="inline-block px-10 py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold text-xl transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-600/40 hover:-translate-y-1 active:scale-95"
            >
              Enter the Trainer
            </Link>
          </div>
        </div>
      </main>

          </div>
  );
}