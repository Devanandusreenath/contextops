import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states";
import { ApiError } from "@/services/http";

describe("connection states", () => {
  it("shows a disconnected message with a retry action", () => {
    const retry = vi.fn();
    render(<ErrorState error={new ApiError("network", "Cannot reach the backend at http://localhost:8000.")} onRetry={retry} />);
    expect(screen.getByRole("alert").textContent).toContain("Backend disconnected");
    expect(screen.getByRole("alert").textContent).toContain("No mock data is shown");
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("distinguishes HTTP errors from disconnection", () => {
    render(<ErrorState error={new ApiError("http", "FalkorDB is not reachable.", { status: 503, code: "graph_unavailable" })} />);
    expect(screen.getByRole("alert").textContent).toContain("Request failed");
    expect(screen.getByRole("alert").textContent).toContain("graph_unavailable");
  });

  it("renders loading and empty states", () => {
    render(
      <>
        <LoadingState label="Loading graph…" />
        <EmptyState title="No investigation yet" />
      </>,
    );
    expect(screen.getByRole("status").textContent).toContain("Loading graph");
    expect(screen.getByText("No investigation yet")).toBeTruthy();
  });
});
