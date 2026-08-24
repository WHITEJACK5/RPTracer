import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import LumaDotBackground from "../LumaDotBackground";

vi.mock("framer-motion", async () => {
  return { useReducedMotion: () => false };
});

describe("LumaDotBackground", () => {
  beforeEach(() => {
    // jsdom does not implement canvas 2d context; force the safe null path.
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as any;
  });

  it("renders an aria-hidden canvas background", () => {
    const { container } = render(<LumaDotBackground />);
    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas).toHaveAttribute("aria-hidden", "true");
  });

  it("accepts an extra className", () => {
    const { container } = render(<LumaDotBackground className="my-bg" />);
    expect((container.querySelector("canvas") as HTMLElement).className).toContain(
      "my-bg"
    );
  });
});
