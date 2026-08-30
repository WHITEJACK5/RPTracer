"use client";

import { useState } from "react";
import { useAnalysts } from "@/hooks/useApi";
import AvatarList from "@/components/ui/AvatarList";
import { Input } from "@/components/ui/Input";
import ErrorState from "@/components/ui/ErrorState";
import Loader from "@/components/ui/Loader";
import Button from "@/components/ui/Button";
import TextReveal from "@/components/ui/TextReveal";
import dynamic from "next/dynamic";

const GraphCanvas = dynamic(() => import("@/components/GraphCanvas"), {
  ssr: false,
  loading: () => (
    <div className="relative h-[460px]">
      <Loader center label="initializing canvas…" />
    </div>
  ),
});

export default function GraphPage() {
  const { data: analysts, isLoading: analystsLoading, isError: analystsError, refetch: refetchAnalysts } = useAnalysts();
  const [override, setOverride] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  const center = override || active || "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <TextReveal as="h1" text="Entity Graph" by="char" className="text-3xl font-bold text-text-primary" />
        {analystsError ? (
          <ErrorState title="Couldn't load analysts" message="Analyst roster unreachable" onRetry={() => refetchAnalysts()} />
        ) : analystsLoading ? (
          <Loader size="sm" />
        ) : (
          <AvatarList analysts={analysts ?? []} className="flex-wrap" />
        )}
      </div>

      <p className="text-sm text-text-secondary">
        Ego-graph around a focal entity. Mule nodes glow red; hover to isolate a node&apos;s neighborhood.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <Input
          label="Center entity (optional)"
          placeholder="Override live center — or leave blank"
          value={override}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOverride(e.target.value)}
          containerClassName="min-w-[260px]"
        />
        <Button
          variant="secondary"
          onClick={() => {
            setActive(override || null);
            setRefresh((n: number) => n + 1);
          }}
        >
          Re-center
        </Button>
      </div>

      {!center ? (
        <div className="grid min-h-[460px] place-items-center rounded-md border border-border bg-surface text-center">
          <div>
            <p className="text-sm font-medium text-text-primary">No ring activity observed yet</p>
            <p className="mt-1 text-sm text-text-secondary">
              Run a preset from the dashboard sandbox to populate the live graph.
            </p>
          </div>
        </div>
      ) : (
        <GraphCanvas key={refresh} center={center} refreshToken={refresh} />
      )}
    </div>
  );
}
