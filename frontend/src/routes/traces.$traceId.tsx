import { createFileRoute } from "@tanstack/react-router";
import { TraceDetailPage } from "@/pages/trace-detail";

export const Route = createFileRoute("/traces/$traceId")({
  head: () => ({
    meta: [
      { title: "Trace · TraceGuard AI" },
      { name: "description", content: "Execution timeline and step details for an LLM trace." },
      { property: "og:title", content: "Trace · TraceGuard AI" },
      { property: "og:description", content: "Execution timeline and step details for an LLM trace." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { step?: string } => ({ step: typeof s.step === "string" ? s.step : undefined }),
  component: Page,
});

function Page() {
  const { traceId } = Route.useParams();
  const { step } = Route.useSearch();
  return <TraceDetailPage traceId={traceId} stepId={step} />;
}
