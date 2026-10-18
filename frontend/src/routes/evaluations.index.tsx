import { createFileRoute } from "@tanstack/react-router";
import { EvaluationsPage } from "@/pages/evaluations";

export const Route = createFileRoute("/evaluations/")({
  head: () => ({
    meta: [
      { title: "Evaluations · TraceGuard AI" },
      { name: "description", content: "Evaluation runs against versioned datasets." },
      { property: "og:title", content: "Evaluations · TraceGuard AI" },
      { property: "og:description", content: "Evaluation runs against versioned datasets." },
    ],
  }),

  component: EvaluationsPage,
});
