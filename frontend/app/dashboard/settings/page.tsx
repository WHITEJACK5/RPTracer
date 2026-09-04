"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useAnalysts } from "@/hooks/useApi";
import AvatarList from "@/components/ui/AvatarList";
import ErrorState from "@/components/ui/ErrorState";
import GlassForm from "@/components/ui/GlassForm";
import { Input } from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Loader from "@/components/ui/Loader";
import TextReveal from "@/components/ui/TextReveal";
import type { Analyst } from "@/lib/types";

export default function SettingsPage() {
  const { data: analysts, isLoading: analystsLoading, isError: analystsError, refetch: refetchAnalysts } = useAnalysts();
  const [apiBase, setApiBase] = useState("");
  const [threshold, setThreshold] = useState("70");
  const [webhook, setWebhook] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [localAnalysts, setLocalAnalysts] = useState<Analyst[]>([]);
  const [testingWebhook, setTestingWebhook] = useState(false);

  useEffect(() => {
    setApiBase(localStorage.getItem("tracer.apiBase") ?? process.env.NEXT_PUBLIC_API_BASE ?? "");
    setThreshold(localStorage.getItem("tracer.riskThreshold") ?? "70");
    setWebhook(localStorage.getItem("tracer.webhookUrl") ?? "");
    const stored = localStorage.getItem("tracer.invitedAnalysts");
    if (stored) {
      try { setLocalAnalysts(JSON.parse(stored)); } catch { /* ignore */ }
    }
  }, []);

  function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const base = String(fd.get("apiBase") ?? "").trim();
    const thr = String(fd.get("threshold") ?? "70").trim();
    const hook = String(fd.get("webhook") ?? "").trim();
    if (thr) {
      const n = Number(thr);
      if (Number.isNaN(n) || n < 0 || n > 100) {
        toast.error("Invalid threshold", { description: "Threshold must be 0-100" });
        return;
      }
      localStorage.setItem("tracer.riskThreshold", String(n));
    }
    if (base) localStorage.setItem("tracer.apiBase", base);
    else localStorage.removeItem("tracer.apiBase");
    if (hook) localStorage.setItem("tracer.webhookUrl", hook);
    else localStorage.removeItem("tracer.webhookUrl");
    toast.success("Settings saved", { description: `API: ${base || "default"} · Threshold: ${thr} · Webhook: ${hook ? "set" : "none"}` });
    setApiBase(base);
    setThreshold(thr);
    setWebhook(hook);
  }

  async function testWebhook() {
    const url = webhook || (document.querySelector('input[name="webhook"]') as HTMLInputElement)?.value || "";
    if (!url) { toast.error("Enter a webhook URL first"); return; }
    try { new URL(url); } catch { toast.error("Invalid URL", { description: "Must be https://..." }); return; }
    setTestingWebhook(true);
    try {
      // Best-effort test ping (no-cors to avoid CORS blocking in demo)
      await fetch(url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "tracer.test", ts: Date.now(), threshold }) });
      toast.success("Webhook test sent", { description: `POST to ${url} (no-cors)` });
    } catch (err) {
      toast.error("Webhook test failed", { description: String(err) });
    } finally {
      setTestingWebhook(false);
    }
  }

  function handleInvite() {
    const email = inviteEmail.trim();
    if (!email) { toast.error("Enter an email"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error("Invalid email"); return; }
    const name = email.split("@")[0].split(".").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
    const newAnalyst: Analyst = { id: `inv_${Date.now()}`, name: name || email, role: "Invited Analyst", status: "online" };
    const updated = [...localAnalysts, newAnalyst];
    setLocalAnalysts(updated);
    localStorage.setItem("tracer.invitedAnalysts", JSON.stringify(updated));
    setInviteEmail("");
    toast.success("Analyst invited", { description: `${email} added to roster` });
  }

  const allAnalysts = [...(analysts ?? []), ...localAnalysts];

  return (
    <div className="flex flex-col gap-6">
      <TextReveal as="h1" text="Settings" by="char" className="font-sans text-3xl font-bold text-text-primary" />
      <p className="text-sm text-text-secondary">Engine connection, thresholds and response team — all live and synced.</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <GlassForm title="Engine configuration" description="Connection and alerting thresholds. Saved to localStorage and applied instantly." onSubmit={onSave} submitLabel="Save settings">
          <Input label="API base URL" name="apiBase" placeholder="http://127.0.0.1:8000" value={apiBase} onChange={(e) => setApiBase(e.target.value)} hint="Saved as tracer.apiBase · used by all API calls" />
          <Input label="Alert risk threshold" name="threshold" type="number" placeholder="70" value={threshold} onChange={(e) => setThreshold(e.target.value)} min={0} max={100} hint={`HIGH if risk_score ≥ ${threshold} · synced to Overview/Ledger live filters`} />
          <div className="flex flex-col gap-1.5">
            <Input label="Webhook URL" name="webhook" placeholder="https://hooks.razorpay.com/..." value={webhook} onChange={(e) => setWebhook(e.target.value)} hint="POST on HIGH alerts · saved as tracer.webhookUrl" />
            <Button type="button" variant="ghost" onClick={testWebhook} disabled={testingWebhook} className="self-start">
              {testingWebhook ? "Testing..." : "Test webhook"}
            </Button>
          </div>
        </GlassForm>

        <div className="glass flex flex-col gap-4 p-6">
          <h3 className="font-sans text-lg font-bold text-text-primary">Response team</h3>
          <p className="text-sm text-text-secondary">Analysts rostered on the TRACER watch — invite adds instantly and persists locally.</p>
          {analystsError ? (
            <ErrorState title="Couldn't load analysts" message="Roster unreachable" onRetry={() => refetchAnalysts()} />
          ) : analystsLoading ? (
            <Loader size="sm" label="loading analysts…" />
          ) : (
            <AvatarList analysts={allAnalysts ?? []} className="flex-wrap" />
          )}
          <div className="mt-auto flex flex-col gap-2">
            <Input label="Invite analyst" placeholder="name@razorpay.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} hint={`Roster: ${allAnalysts.length} analysts · stored in tracer.invitedAnalysts`} />
            <Button type="button" onClick={handleInvite} variant="secondary" className="self-start">Invite Analyst</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
