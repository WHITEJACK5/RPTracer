"use client";

import { type FormEvent } from "react";
import { toast } from "sonner";
import { useAnalysts } from "@/hooks/useApi";
import AvatarList from "@/components/ui/AvatarList";
import GlassForm from "@/components/ui/GlassForm";
import { GoldInput } from "@/components/ui/GoldInput";
import TextReveal from "@/components/ui/TextReveal";

export default function SettingsPage() {
  const { data: analysts } = useAnalysts();

  function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const apiBase = String(fd.get("apiBase") ?? "");
    localStorage.setItem("tracer.apiBase", apiBase);
    toast.success("Settings saved", { description: `API base set to ${apiBase || "default"}` });
  }

  return (
    <div className="flex flex-col gap-6">
      <TextReveal as="h1" text="Settings" by="char" className="font-grotesk text-3xl font-bold text-text-primary" />
      <p className="text-sm text-text-secondary">Engine connection, thresholds and response team.</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <GlassForm title="Engine configuration" description="Connection and alerting thresholds." onSubmit={onSave} submitLabel="Save settings">
          <GoldInput label="API base URL" name="apiBase" placeholder="http://127.0.0.1:8000" defaultValue={process.env.NEXT_PUBLIC_API_BASE ?? ""} hint="Env: NEXT_PUBLIC_API_BASE" />
          <GoldInput label="Alert risk threshold" name="threshold" type="number" placeholder="70" defaultValue="70" />
          <GoldInput label="Webhook URL" name="webhook" placeholder="https://hooks.razorpay.com/…" />
        </GlassForm>

        <div className="glass flex flex-col gap-4 p-6">
          <h3 className="font-grotesk text-lg font-bold text-text-primary">Response team</h3>
          <p className="text-sm text-text-secondary">Analysts currently rostered on the TRACER watch.</p>
          <AvatarList analysts={analysts ?? []} className="flex-wrap" />
          <div className="mt-auto">
            <GoldInput label="Invite analyst" placeholder="name@razorpay.com" />
          </div>
        </div>
      </div>
    </div>
  );
}
