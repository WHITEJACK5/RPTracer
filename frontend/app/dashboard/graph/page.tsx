"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useAnalysts } from "@/hooks/useApi";
import AvatarList from "@/components/ui/AvatarList";
import { GoldInput } from "@/components/ui/GoldInput";
import GoldLoader from "@/components/ui/GoldLoader";
import GoldButton from "@/components/ui/GoldButton";
import TextReveal from "@/components/ui/TextReveal";

const GraphCanvas = dynamic(() => import("@/components/GraphCanvas"), {
  ssr: false,
  loading: () => (
    <div className="relative h-[460px]">
      <GoldLoader center label="initializing canvas…" />
    </div>
  ),
});

export default function GraphPage() {
  const { data: analysts } = useAnalysts();
  const [center, setCenter] = useState("DEV-MULE-RING-01");
  const [active, setActive] = useState<string | null>("DEV-MULE-RING-01");
  const [refresh, setRefresh] = useState(0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <TextReveal as="h1" text="Entity Graph" by="char" className="font-grotesk text-3xl font-bold text-text-primary" />
        <AvatarList analysts={analysts ?? []} className="flex-wrap" />
      </div>

      <p className="text-sm text-text-secondary">
        Ego-graph around a focal entity. Mule nodes glow red; hover to isolate a node’s neighborhood.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <GoldInput
          label="Center entity"
          placeholder="device:DEV-… or vpa:…"
          value={center}
          onChange={(e) => setCenter(e.target.value)}
          containerClassName="min-w-[260px]"
        />
        <GoldButton
          onClick={() => {
            setActive(center || null);
            setRefresh((n) => n + 1);
          }}
        >
          Re-center
        </GoldButton>
      </div>

      <GraphCanvas center={active} refreshToken={refresh} />
    </div>
  );
}
