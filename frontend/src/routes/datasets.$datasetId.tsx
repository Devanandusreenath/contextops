import { createFileRoute } from "@tanstack/react-router";
import { DatasetDetailPage } from "@/pages/dataset-detail";

export const Route = createFileRoute("/datasets/$datasetId")({
  head: () => ({
    meta: [
      { title: "Dataset · TraceGuard AI" },
      { name: "description", content: "Dataset test cases, versions and schema validation." },
      { property: "og:title", content: "Dataset · TraceGuard AI" },
      { property: "og:description", content: "Dataset test cases, versions and schema validation." },
    ],
  }),

  component: Page,
});

function Page() {
  const { datasetId } = Route.useParams();
  return <DatasetDetailPage datasetId={datasetId} />;
}
