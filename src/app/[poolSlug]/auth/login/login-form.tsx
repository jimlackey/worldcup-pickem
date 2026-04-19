"use client";

import { useActionState, useState, useRef, useEffect } from "react";
import { requestOtpAction, verifyOtpAction } from "../actions";
import type { AuthActionResult } from "../actions";
import type { Pool } from "@/types/database";

interface LoginFormProps {
  pool: Pool;
}

const initialState: AuthActionResult = { success: false };

export function LoginForm({ pool }: LoginFormProps) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");

  // Request OTP action
  const [otpState, requestOtp, otpPending] = useActionState(
    requestOtpAction,
    initialState
  );

  // Verify OTP action
  const [verifyState, verifyOtp, verifyPending] = useActionState(
    verifyOtpAction,
    initialState
  );

  // Move to code step when OTP is sent successfully
  useEffect(() => {
    if (otpState.success && step === "email") {
      setStep("code");
    }
  }, [otpState.success, step]);

  if (step === "code") {
    return (
      <CodeStep
        email={email}
        pool={pool}
        verifyState={verifyState}
        verifyOtp={verifyOtp}
        verifyPending={verifyPending}
        onBack={() => setStep("email")}
        onResend={() => {
          // Go back to email step to resend
          setStep("email");
        }}
      />
    );
  }

  return (
    <form action={requestOtp} className="space-y-4">
      <input type="hidden" name="poolId" value={pool.id} />
      <input type="hidden" name="poolSlug" value={pool.slug} />

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium mb-1.5"
        >
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 transition-colors"
        />
      </div>

      {otpState.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-sm text-red-700">
          {otpState.error}
        </div>
      )}

      <button
        type="submit"
        disabled={otpPending}
        className="w-full rounded-lg bg-pitch-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-pitch-700 focus:outline-none focus:ring-2 focus:ring-pitch-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors tap-target"
      >
        {otpPending ? (
          <span className="inline-flex items-center gap-2">
            <Spinner />
            Sending code...
          </span>
        ) : (
          "Send login code"
        )}
      </button>
    </form>
  );
}

// ---- Code verification step ----

interface CodeStepProps {
  email: string;
  pool: Pool;
  verifyState: AuthActionResult;
  verifyOtp: (formData: FormData) => void;
  verifyPending: boolean;
  onBack: () => void;
  onResend: () => void;
}

function CodeStep({
  email,
  pool,
  verifyState,
  verifyOtp,
  verifyPending,
  onBack,
}: CodeStepProps) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-focus first input
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, "").slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);

    // Auto-advance to next input
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    // Backspace: clear current and move back
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      const newDigits = [...digits];
      newDigits[index - 1] = "";
      setDigits(newDigits);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 0) return;

    const newDigits = [...digits];
    for (let i = 0; i < pasted.length && i < 6; i++) {
      newDigits[i] = pasted[i];
    }
    setDigits(newDigits);

    // Focus the next empty input, or the last one
    const nextEmpty = newDigits.findIndex((d) => !d);
    const focusIndex = nextEmpty === -1 ? 5 : nextEmpty;
    inputRefs.current[focusIndex]?.focus();
  };

  const code = digits.join("");
  const isComplete = code.length === 6;

  return (
    <form action={verifyOtp} className="space-y-4">
      <input type="hidden" name="poolId" value={pool.id} />
      <input type="hidden" name="poolSlug" value={pool.slug} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="code" value={code} />

      <div className="text-center mb-2">
        <p className="text-sm text-[var(--color-text-secondary)]">
          We sent a 6-digit code to
        </p>
        <p className="font-medium text-sm mt-0.5">{email}</p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2 text-center">
          Enter your code
        </label>
        <div className="flex justify-center gap-2" onPaste={handlePaste}>
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="w-11 h-13 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-center text-xl font-mono font-bold focus:outline-none focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 transition-colors"
              autoComplete={i === 0 ? "one-time-code" : "off"}
            />
          ))}
        </div>
      </div>

      {verifyState.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-sm text-red-700">
          {verifyState.error}
        </div>
      )}

      <button
        type="submit"
        disabled={verifyPending || !isComplete}
        className="w-full rounded-lg bg-pitch-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-pitch-700 focus:outline-none focus:ring-2 focus:ring-pitch-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors tap-target"
      >
        {verifyPending ? (
          <span className="inline-flex items-center gap-2">
            <Spinner />
            Verifying...
          </span>
        ) : (
          "Verify & log in"
        )}
      </button>

      <button
        type="button"
        onClick={onBack}
        className="w-full text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors py-2"
      >
        ← Use a different email
      </button>
    </form>
  );
}

// ---- Spinner ----
function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
