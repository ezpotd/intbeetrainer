"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { CgSpinner } from "react-icons/cg";

export default function SignInPage() {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      await signIn("google", { callbackUrl: "/" });
    } catch (error) {
      console.error("Authentication error:", error);
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-zinc-950 p-4">
      {/* Background Box Container */}
      <div className="w-full max-w-sm rounded-xl bg-zinc-900/50 p-8 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
        
        {/* New Heading Section */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Welcome Back
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Sign in to continue your training
          </p>
        </div>

        <button
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className="group flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 text-base font-semibold text-zinc-900 shadow-sm transition-all hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isLoading ? (
            <CgSpinner className="animate-spin text-2xl" />
          ) : (
            <FcGoogle className="text-2xl" />
          )}
          <span>{isLoading ? "Connecting..." : "Continue with Google"}</span>
        </button>
      </div>
    </div>
  );
}