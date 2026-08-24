import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GlassForm from "../GlassForm";

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

describe("GlassForm", () => {
  it("renders title, description, children and the submit button", () => {
    render(
      <GlassForm title="Run Detection" description="Score a transaction" submitLabel="Detect">
        <p>child field</p>
      </GlassForm>
    );
    expect(screen.getByText("Run Detection")).toBeInTheDocument();
    expect(screen.getByText("Score a transaction")).toBeInTheDocument();
    expect(screen.getByText("child field")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Detect" })).toBeInTheDocument();
  });

  it("fires onSubmit when the form is submitted", () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <GlassForm onSubmit={onSubmit} submitLabel="Go">
        <input aria-label="field" />
      </GlassForm>
    );
    const form = container.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("shows a working state while submitting", () => {
    render(
      <GlassForm submitting submitLabel="Go">
        <span>x</span>
      </GlassForm>
    );
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent("Working");
  });
});
