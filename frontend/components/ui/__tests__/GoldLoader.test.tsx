import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import GoldLoader from "../GoldLoader";

describe("GoldLoader", () => {
  it("renders a status region", () => {
    const { container } = render(<GoldLoader />);
    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent("Loading");
    expect(container.querySelector(".sr-only")).not.toBeNull();
  });

  it("renders at sm / md / lg sizes", () => {
    const { rerender, container } = render(<GoldLoader size="sm" />);
    const sm = container.querySelector('[role="status"] span');
    expect(sm).toHaveClass("h-5", "w-5");

    rerender(<GoldLoader size="lg" />);
    const lg = container.querySelector('[role="status"] span');
    expect(lg).toHaveClass("h-12", "w-12");
  });

  it("renders an optional label", () => {
    render(<GoldLoader size="md" label="Scoring model" />);
    expect(screen.getByText("Scoring model")).toBeInTheDocument();
  });
});
