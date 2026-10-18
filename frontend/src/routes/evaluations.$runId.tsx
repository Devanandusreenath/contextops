import { createFileRoute } from "@tanstack/react-router";
import { EvaluationDetailPage } from "@/pages/evaluation-detail";

export const Route = createFileRoute("/evaluations/$runId")({
  head: () => ({
    meta: [
      { title: "Evaluation run · TraceGuard AI" },
      { name: "description", content: "Evaluation run results, failures and comparisons." },
      { property: "og:title", content: "Evaluation run · TraceGuard AI" },
      { property: "og:description", content: "Evaluation run results, failures and comparisons." },
    ],
  }),

  component: Page,
});

function Page() {
  const { runId } = Route.useParams();
  return <EvaluationDetailPage runId={runId} />;
}
