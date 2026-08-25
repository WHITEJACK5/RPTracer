import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import DotBackground from "../DotBackground";

vi.mock("framer-motion", async () => {
  return { useReducedMotion: () => false };
});

describe("DotBackground", () => {
  beforeEach(() => {
    // jsdom does not implement canvas 2d context; force the safe null path.
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as any;
  });

  it("renders an aria-hidden canvas background", () => {
    const { container } = render(<DotBackground />);
    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas).toHaveAttribute("aria-hidden", "true");
  });

  it("accepts an extra className", () => {
    const { container } = render(<DotBackground className="my-bg" />);
    expect((container.querySelector("canvas") as HTMLElement).className).toContain(
      "my-bg"
    );
  });
});
