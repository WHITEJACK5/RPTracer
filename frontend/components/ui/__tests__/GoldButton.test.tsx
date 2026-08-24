import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GoldButton from "../GoldButton";

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

describe("GoldButton", () => {
  it("renders children and fires onClick (button variant)", () => {
    const onClick = vi.fn();
    render(<GoldButton onClick={onClick}>Run Detection</GoldButton>);
    const btn = screen.getByRole("button", { name: "Run Detection" });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders an anchor when href is provided", () => {
    render(
      <GoldButton href="/dashboard" variant="secondary">
        Open Dashboard
      </GoldButton>
    );
    const link = screen.getByRole("link", { name: "Open Dashboard" });
    expect(link).toHaveAttribute("href", "/dashboard");
  });

  it("applies variant + size without crashing", () => {
    render(
      <GoldButton variant="ghost" size="lg">
        Ghost
      </GoldButton>
    );
    expect(screen.getByRole("button", { name: "Ghost" })).toBeInTheDocument();
  });

  it("honors the disabled prop", () => {
    const onClick = vi.fn();
    render(
      <GoldButton disabled onClick={onClick}>
        Disabled
      </GoldButton>
    );
    const btn = screen.getByRole("button", { name: "Disabled" });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});
