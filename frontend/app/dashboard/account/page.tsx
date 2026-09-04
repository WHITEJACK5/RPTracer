"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import TextReveal from "@/components/ui/TextReveal";
import { Input } from "@/components/ui/Input";
import Button from "@/components/ui/Button";

export default function AccountPage() {
  const [email, setEmail] = useState("analyst@razorpay.com");
  const [name, setName] = useState("Analyst");

  useEffect(() => {
    try {
      const e = localStorage.getItem("tracer.session.email") || "analyst@razorpay.com";
      setEmail(e);
      setName(e.split("@")[0].split(/[._-]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ") || "Analyst");
    } catch {}
  }, []);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const newEmail = String(fd.get("email") ?? "").trim();
    const newName = String(fd.get("name") ?? "").trim();
    if (newEmail) {
      try { localStorage.setItem("tracer.session.email", newEmail); } catch {}
      setEmail(newEmail);
    }
    if (newName) setName(newName);
    toast.success("Account updated", { description: `${newName || name} · ${newEmail || email}` });
  }

  function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    toast.success("Password updated", { description: "Demo: no real credential change" });
    (e.target as HTMLFormElement).reset();
  }

  function handleSignOut() {
    try { localStorage.removeItem("tracer.session"); localStorage.removeItem("tracer.session.email"); } catch {}
    window.location.href = "/login";
  }

  function handleExport() {
    const data = { email, name, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "tracer-account.json"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Account data exported");
  }

  return (
    <div className="flex flex-col gap-6">
      <TextReveal as="h1" text="Account" by="char" className="font-sans text-3xl font-bold text-text-primary" />
      <p className="text-sm text-text-secondary">Manage your TRACER analyst account — all changes persist in localStorage and sync instantly.</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={handleSave} className="glass flex flex-col gap-4 p-6">
          <h3 className="font-sans text-lg font-bold text-text-primary">Profile</h3>
          <Input label="Display name" name="name" defaultValue={name} placeholder="Analyst Name" />
          <Input label="Work email" name="email" type="email" defaultValue={email} placeholder="analyst@razorpay.com" />
          <div className="flex gap-2">
            <Button type="submit">Save profile</Button>
            <Button type="button" variant="ghost" onClick={handleExport}>Export JSON</Button>
          </div>
          <p className="font-mono text-[11px] text-text-muted">Saved as tracer.session.email · used by Public Profile and header</p>
        </form>

        <form onSubmit={handlePassword} className="glass flex flex-col gap-4 p-6">
          <h3 className="font-sans text-lg font-bold text-text-primary">Security</h3>
          <Input label="Current passphrase" name="current" type="password" placeholder="••••••••" />
          <Input label="New passphrase" name="next" type="password" placeholder="••••••••" />
          <Input label="Confirm new passphrase" name="confirm" type="password" placeholder="••••••••" />
          <Button type="submit">Update passphrase</Button>
          <p className="font-mono text-[11px] text-text-muted">Demo: no backend check — shows toast and resets form</p>
        </form>
      </div>

      <div className="glass flex flex-col gap-4 p-6">
        <h3 className="font-sans text-lg font-bold text-text-primary">Session</h3>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-risk-low/15 px-3 py-1.5 font-mono text-xs font-semibold text-risk-low">● Active session</span>
          <span className="font-mono text-xs text-text-muted">{email} · localStorage tracer.session</span>
          <Button variant="ghost" onClick={handleSignOut} className="ml-auto">Sign out</Button>
        </div>
      </div>
    </div>
  );
}
