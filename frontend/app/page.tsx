import Navbar from "@/components/Navbar";
import DotBackground from "@/components/ui/DotBackground";
import TextReveal from "@/components/ui/TextReveal";
import Button from "@/components/ui/Button";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <DotBackground />

      <Navbar />

      <main className="relative mx-auto max-w-[1100px] px-6 pb-24 pt-20 text-center">
        <span className="chip mx-auto mb-6 font-mono !text-[10px] tracking-[0.22em] !border-accent/30 !text-accent">
          DEFENSE-ONLY AUTONOMOUS RISK ENGINE
        </span>

        <h1 className="font-sans text-5xl font-bold leading-[1.05] tracking-tight text-text-primary md:text-7xl">
          <TextReveal text="Mule rings donâ€™t hide" direction="up" by="word" />
          <br />
          <TextReveal text="from topology." direction="up" by="word" delay={0.4} className="text-gradient" />
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-text-secondary">
          TRACER links devices, VPAs, cards and IPs into a live entity graph,
          detects abuse-ring fan-out in milliseconds, and hands the case to a
          bounded agent that can only approve, challenge or hold â€” every action
          written to a hash-chained ledger.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Button href="/dashboard" size="lg">
            Open Dashboard â†’
          </Button>
          <Button href="/login" size="lg" variant="secondary">
            Analyst Sign-in
          </Button>
        </div>

        <div className="mt-14 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-mono text-[10px] tracking-wide text-text-muted">
          <span className="font-sans font-bold text-text-secondary">TRACER v1.0</span>
          <span>â—† XGBOOST + SHAP</span>
          <span>â—† MULE-RING GRAPH</span>
          <span>â—† BOUNDED AGENT</span>
          <span>â—† SUB-50ms SLA</span>
          <span>â—† DOUBLE-ENTRY LEDGER</span>
        </div>
      </main>
    </div>
  );
}
