import { createFileRoute } from "@tanstack/react-router";
import { DatasetsPage } from "@/pages/datasets";

export const Route = createFileRoute("/datasets/")({
  head: () => ({
    meta: [
      { title: "Datasets · TraceGuard AI" },
      { name: "description", content: "Versioned test-case datasets for LLM evaluation." },
      { property: "og:title", content: "Datasets · TraceGuard AI" },
      { property: "og:description", content: "Versioned test-case datasets for LLM evaluation." },
    ],
  }),

  component: DatasetsPage,
});
