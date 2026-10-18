import { createFileRoute } from "@tanstack/react-router";
import { TracesPage } from "@/pages/traces";

export const Route = createFileRoute("/traces/")({
  head: () => ({
    meta: [
      { title: "Traces · TraceGuard AI" },
      { name: "description", content: "Explore LLM execution traces, tool calls and errors." },
      { property: "og:title", content: "Traces · TraceGuard AI" },
      { property: "og:description", content: "Explore LLM execution traces, tool calls and errors." },
    ],
  }),

  component: TracesPage,
});
