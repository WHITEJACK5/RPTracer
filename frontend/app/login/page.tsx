"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import DotBackground from "@/components/ui/DotBackground";
import GlassForm from "@/components/ui/GlassForm";
import { Input } from "@/components/ui/Input";
import TextReveal from "@/components/ui/TextReveal";

export default function LoginPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "");
    setTimeout(() => {
      setSubmitting(false);
      try { localStorage.setItem("tracer.session", "1"); localStorage.setItem("tracer.session.email", email); } catch {}
      toast.success("Authenticated", { description: email });
      router.push("/dashboard");
    }, 700);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <DotBackground />
      <div className="relative w-full max-w-md">
        <div className="mb-6 text-center">
          <TextReveal as="h1" text="Analyst Sign-in" by="char" className="font-sans text-3xl font-bold text-text-primary" />
          <p className="mt-2 text-sm text-text-secondary">Secure access to the TRACER risk console.</p>
        </div>
        <GlassForm title="" onSubmit={onSubmit} submitLabel="Sign in" submitting={submitting}>
          <Input label="Work email" name="email" type="email" placeholder="analyst@razorpay.com" required />
          <Input label="Passphrase" name="password" type="password" placeholder="••••••••" required />
        </GlassForm>
        <p className="mt-4 text-center font-mono text-[10px] text-text-muted">Simulated auth for demo — no real credentials checked · COMPLIANT</p>
      </div>
    </div>
  );
}
