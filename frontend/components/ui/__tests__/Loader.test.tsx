import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Loader from "../Loader";

describe("Loader", () => {
  it("renders a status region with an accessible caption", () => {
    render(<Loader />);
    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent("Loading");
  });

  it("renders at sm / md / lg sizes", () => {
    const { rerender, container } = render(<Loader size="sm" />);
    const sm = container.querySelector('[role="status"] svg');
    expect(sm).toHaveAttribute("width", "44");

    rerender(<Loader size="lg" />);
    const lg = container.querySelector('[role="status"] svg');
    expect(lg).toHaveAttribute("width", "88");
  });

  it("renders an optional label", () => {
    render(<Loader size="md" label="Scoring model" />);
    expect(screen.getByText("Scoring model")).toBeInTheDocument();
  });
});
