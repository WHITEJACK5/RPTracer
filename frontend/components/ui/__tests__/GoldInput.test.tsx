import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GoldInput, GoldTextarea } from "../GoldInput";

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

describe("GoldInput", () => {
  it("renders a label", () => {
    render(<GoldInput label="Card VPA" />);
    expect(screen.getByText("Card VPA")).toBeInTheDocument();
  });

  it("shows the error message and marks the field invalid", () => {
    render(<GoldInput label="Card VPA" error="Invalid VPA format" />);
    expect(screen.getByText("Invalid VPA format")).toBeInTheDocument();
    const field = screen.getByRole("textbox");
    expect(field).toHaveAttribute("aria-invalid", "true");
  });

  it("shows a hint when there is no error", () => {
    render(<GoldInput hint="optional" />);
    expect(screen.getByText("optional")).toBeInTheDocument();
  });

  it("forwards value and placeholder to the input", () => {
    render(<GoldInput placeholder="vpa@bank" defaultValue="x@y" />);
    const field = screen.getByRole("textbox") as HTMLInputElement;
    expect(field.placeholder).toBe("vpa@bank");
    expect(field.value).toBe("x@y");
  });

  it("GoldTextarea renders a multiline field with label", () => {
    const { container } = render(
      <GoldTextarea label="Notes" error="required" />
    );
    expect(screen.getByText("Notes")).toBeInTheDocument();
    expect(container.querySelector("textarea")).not.toBeNull();
    expect(screen.getByText("required")).toBeInTheDocument();
  });
});
