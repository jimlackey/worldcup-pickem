"use client";

import { useActionState, useState, useRef, useEffect } from "react";
import {
  requestOtpAction,
  verifyOtpAction,
  requestAccessAction,
} from "../actions";
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

  // When the login attempt was rejected (e.g. email not whitelisted), make
  // the "Request access" affordance more prominent.
  const rejected = !!otpState.error;

  return (
    <>
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
              {pool.is_demo ? "Logging in..." : "Sending code..."}
            </span>
          ) : (
            pool.is_demo ? "Log in" : "Send login code"
          )}
        </button>

        {/* Sender + spam note. Only shown for real pools — demo pools log
            in directly without sending an email, so the note would be
            misleading there. Names the exact From address so recipients
            know what to search for and can whitelist it; flags the spam
            folder since transactional code emails from a custom domain
            commonly land there on first contact. */}
        {!pool.is_demo && (
          <p className="text-xs text-[var(--color-text-muted)] text-center leading-relaxed">
            Emails come from World Cup Pick&apos;em{" "}
            <span className="whitespace-nowrap">
              &lt;noreply@jimlackey.com&gt;
            </span>
            . If you don&apos;t see it, check your Spam folder.
          </p>
        )}
      </form>

      {/* Demo pools have seeded membership — no self-service requests there. */}
      {!pool.is_demo && (
        <RequestAccess pool={pool} email={email} prominent={rejected} />
      )}
    </>
  );
}

// ---- Request access (self-service) ----

interface RequestAccessProps {
  pool: Pool;
  /** Pre-fill from the login email field if the user typed one. */
  email: string;
  /** When true (after a login rejection) render the entry point loudly. */
  prominent: boolean;
}

function RequestAccess({ pool, email, prominent }: RequestAccessProps) {
  const [open, setOpen] = useState(false);
  const [reqEmail, setReqEmail] = useState("");
  const [referral, setReferral] = useState("");

  const [state, submit, pending] = useActionState(
    requestAccessAction,
    initialState
  );

  // Seed the request email from whatever they typed above, the first time
  // the panel opens.
  useEffect(() => {
    if (open && !reqEmail && email) {
      setReqEmail(email);
    }
  }, [open, email, reqEmail]);

  if (state.success) {
    return (
      <div className="mt-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
        <p className="font-semibold mb-1">Request sent</p>
        <p className="text-green-700 leading-relaxed">
          We&apos;ve let the pool admins know. If they approve, you&apos;ll get
          an email letting you know you can log in.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <div className={prominent ? "mt-5" : "mt-6"}>
        {prominent ? (
          <div className="rounded-lg border border-pitch-200 bg-pitch-50 px-4 py-3 text-center">
            <p className="text-sm text-pitch-800 mb-2">
              Not on the invite list yet?
            </p>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-sm font-semibold text-pitch-700 hover:text-pitch-800 underline underline-offset-2 transition-colors"
            >
              Request access
            </button>
          </div>
        ) : (
          <p className="text-center">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] underline underline-offset-2 transition-colors"
            >
              Request access
            </button>
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={submit} className="mt-6 space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <input type="hidden" name="poolId" value={pool.id} />
      <input type="hidden" name="poolSlug" value={pool.slug} />

      <div>
        <p className="text-sm font-semibold mb-1">Request access</p>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          Tell the pool admins who you are and who invited you. They&apos;ll
          get an email and can grant you access.
        </p>
      </div>

      <div>
        <label htmlFor="req-email" className="block text-sm font-medium mb-1.5">
          Your email
        </label>
        <input
          id="req-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={reqEmail}
          onChange={(e) => setReqEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3.5 py-2.5 text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 transition-colors"
        />
      </div>

      <div>
        <label htmlFor="req-referral" className="block text-sm font-medium mb-1.5">
          Who referred you?
        </label>
        <textarea
          id="req-referral"
          name="referral"
          rows={3}
          value={referral}
          onChange={(e) => setReferral(e.target.value)}
          placeholder="e.g. Jane Smith invited me, we work together at…"
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3.5 py-2.5 text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 transition-colors resize-none"
        />
      </div>

      {state.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending || reqEmail.trim().length === 0}
          className="flex-1 rounded-lg bg-pitch-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-pitch-700 focus:outline-none focus:ring-2 focus:ring-pitch-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors tap-target"
        >
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <Spinner />
              Sending...
            </span>
          ) : (
            "Submit request"
          )}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-3 py-2.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
        >
          Cancel
        </button>
      </div>
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
