"use client";

import { useActionState, useState, useRef, useEffect } from "react";
import {
  requestSuperAdminOtpAction,
  verifySuperAdminOtpAction,
} from "./actions";
import type { SuperAdminActionResult } from "./actions";

const initialState: SuperAdminActionResult = { success: false };

export function SuperAdminLoginForm() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");

  const [otpState, requestOtp, otpPending] = useActionState(
    requestSuperAdminOtpAction,
    initialState
  );
  const [verifyState, verifyOtp, verifyPending] = useActionState(
    verifySuperAdminOtpAction,
    initialState
  );

  useEffect(() => {
    if (otpState.success && step === "email") {
      setStep("code");
    }
  }, [otpState.success, step]);

  if (step === "code") {
    return (
      <CodeStep
        email={email}
        verifyState={verifyState}
        verifyOtp={verifyOtp}
        verifyPending={verifyPending}
        onBack={() => setStep("email")}
      />
    );
  }

  return (
    <form action={requestOtp} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1.5">
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

interface CodeStepProps {
  email: string;
  verifyState: SuperAdminActionResult;
  verifyOtp: (formData: FormData) => void;
  verifyPending: boolean;
  onBack: () => void;
}

function CodeStep({
  email,
  verifyState,
  verifyOtp,
  verifyPending,
  onBack,
}: CodeStepProps) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
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
    if (!pasted) return;
    const newDigits = [...digits];
    for (let i = 0; i < pasted.length && i < 6; i++) newDigits[i] = pasted[i];
    setDigits(newDigits);
    const nextEmpty = newDigits.findIndex((d) => !d);
    inputRefs.current[nextEmpty === -1 ? 5 : nextEmpty]?.focus();
  };

  const code = digits.join("");
  const isComplete = code.length === 6;

  return (
    <form action={verifyOtp} className="space-y-4">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="code" value={code} />

      <div className="text-center mb-2">
        <p className="text-sm text-[var(--color-text-secondary)]">
          If that address is registered, we sent a 6-digit code to
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
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
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
          "Log in"
        )}
      </button>

      <button
        type="button"
        onClick={onBack}
        className="w-full text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
      >
        ← Use a different email
      </button>
    </form>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        className="opacity-25"
      />
      <path
        d="M4 12a8 8 0 018-8"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        className="opacity-75"
      />
    </svg>
  );
}
