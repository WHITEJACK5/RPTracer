import Navbar from "@/components/Navbar";
import LumaDotBackground from "@/components/ui/LumaDotBackground";
import TextReveal from "@/components/ui/TextReveal";
import GoldButton from "@/components/ui/GoldButton";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <LumaDotBackground />

      <Navbar />

      <main className="relative mx-auto max-w-[1100px] px-6 pb-24 pt-20 text-center">
        <span className="chip mx-auto mb-6 font-mono !text-[10px] tracking-[0.22em] !border-gold-500/30 !text-gold-400">
          DEFENSE-ONLY AUTONOMOUS RISK ENGINE
        </span>

        <h1 className="font-grotesk text-5xl font-bold leading-[1.05] tracking-tight text-text-primary md:text-7xl">
          <TextReveal text="Mule rings don’t hide" direction="up" by="word" />
          <br />
          <TextReveal text="from topology." direction="up" by="word" delay={0.4} className="text-gradient" />
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-text-secondary">
          TRACER links devices, VPAs, cards and IPs into a live entity graph,
          detects abuse-ring fan-out in milliseconds, and hands the case to a
          bounded agent that can only approve, challenge or hold — every action
          written to a hash-chained ledger.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <GoldButton href="/dashboard" size="lg">
            Open Dashboard →
          </GoldButton>
          <GoldButton href="/login" size="lg" variant="secondary">
            Analyst Sign-in
          </GoldButton>
        </div>

        <div className="mt-14 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-mono text-[10px] tracking-wide text-text-muted">
          <span className="font-grotesk font-bold text-text-secondary">TRACER v1.0</span>
          <span>◆ XGBOOST + SHAP</span>
          <span>◆ MULE-RING GRAPH</span>
          <span>◆ BOUNDED AGENT</span>
          <span>◆ SUB-50ms SLA</span>
          <span>◆ DOUBLE-ENTRY LEDGER</span>
        </div>
      </main>
    </div>
  );
}
