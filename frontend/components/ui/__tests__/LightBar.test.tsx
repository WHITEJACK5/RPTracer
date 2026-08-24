import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import LightBar from "../LightBar";

vi.mock("framer-motion", async () => {
  const React = await import("react");
  const motion = new Proxy(
    {},
    {
      get: (_t, tag: string) => {
        const C = React.forwardRef((props: any, ref: any) => {
          const {
            children,
            initial,
            animate,
            exit,
            transition,
            whileHover,
            whileTap,
            whileInView,
            viewport,
            ...dom
          } = props;
          return React.createElement(tag, { ...dom, ref }, children);
        });
        C.displayName = `motion.${tag}`;
        return C;
      },
    }
  );
  return { motion, useReducedMotion: () => false };
});

describe("LightBar", () => {
  it("renders a fixed top accent bar containing a motion element", () => {
    const { container } = render(<LightBar />);
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.className).toContain("fixed");
    expect(bar.className).toContain("top-0");
    expect(bar.className).toContain("h-[3px]");
    expect(bar).toHaveAttribute("aria-hidden", "true");
    // the animated sweep is a nested element rendered by motion.div
    expect(bar.querySelector("div")).not.toBeNull();
  });

  it("accepts an extra className", () => {
    const { container } = render(<LightBar className="opacity-50" />);
    expect((container.firstElementChild as HTMLElement).className).toContain(
      "opacity-50"
    );
  });
});
