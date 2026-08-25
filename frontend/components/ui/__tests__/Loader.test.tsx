import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Loader from "../Loader";

describe("Loader", () => {
  it("renders a status region", () => {
    const { container } = render(<Loader />);
    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent("Loading");
    expect(container.querySelector(".sr-only")).not.toBeNull();
  });

  it("renders at sm / md / lg sizes", () => {
    const { rerender, container } = render(<Loader size="sm" />);
    const sm = container.querySelector('[role="status"] span');
    expect(sm).toHaveClass("h-5", "w-5");

    rerender(<Loader size="lg" />);
    const lg = container.querySelector('[role="status"] span');
    expect(lg).toHaveClass("h-12", "w-12");
  });

  it("renders an optional label", () => {
    render(<Loader size="md" label="Scoring model" />);
    expect(screen.getByText("Scoring model")).toBeInTheDocument();
  });
});
