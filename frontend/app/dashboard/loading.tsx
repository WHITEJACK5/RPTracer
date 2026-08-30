import Loader from "@/components/ui/Loader";

export default function DashboardLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader label="loading dashboard…" />
    </div>
  );
}
