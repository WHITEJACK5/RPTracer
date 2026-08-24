import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AvatarList from "../AvatarList";
import type { Analyst } from "@/lib/types";

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

const analysts: Analyst[] = [
  { id: "a1", name: "Ada Lovelace", role: "Lead Investigator", status: "online" },
  { id: "a2", name: "Alan Turing", role: "Risk Analyst", status: "investigating" },
  { id: "a3", name: "Grace Hopper", role: "Reviewer", status: "offline" },
];

describe("AvatarList", () => {
  it("renders each analyst's initials", () => {
    render(<AvatarList analysts={analysts} />);
    expect(screen.getByText("AL")).toBeInTheDocument();
    expect(screen.getByText("AT")).toBeInTheDocument();
    expect(screen.getByText("GH")).toBeInTheDocument();
  });

  it("reveals a tooltip on hover", () => {
    render(<AvatarList analysts={analysts} />);
    expect(screen.queryByRole("tooltip")).toBeNull();

    const wrapper = screen.getByText("AL").parentElement as HTMLElement;
    fireEvent.mouseEnter(wrapper);

    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("Ada Lovelace");
    expect(tip).toHaveTextContent("Lead Investigator");
  });

  it("truncates overflow with a +N pill", () => {
    render(<AvatarList analysts={analysts} max={2} />);
    expect(screen.getByText("+1")).toBeInTheDocument();
  });
});
