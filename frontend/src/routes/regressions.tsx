import { createFileRoute } from "@tanstack/react-router";
import { RegressionsPage } from "@/pages/regressions";
import type { RegressionSearch } from "@/pages/regressions";
export const Route = createFileRoute("/regressions")({
  head: () => ({
    meta: [
      { title: "Regression Tests · TraceGuard AI" },
      { name: "description", content: "Regression tests created from known LLM failures." },
      { property: "og:title", content: "Regression Tests · TraceGuard AI" },
      { property: "og:description", content: "Regression tests created from known LLM failures." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): RegressionSearch => ({
    fromTrace: typeof s.fromTrace === "string" ? s.fromTrace : undefined,
    step: typeof s.step === "string" ? s.step : undefined,
    fromRun: typeof s.fromRun === "string" ? s.fromRun : undefined,
    caseId: typeof s.caseId === "string" ? s.caseId : undefined,
  }),
  component: Page,
});

function Page() {
  return <RegressionsPage search={Route.useSearch()} />;
}
