import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import TextReveal from "../TextReveal";

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
  return {
    motion,
    useReducedMotion: () => false,
    useInView: () => true,
  };
});

describe("TextReveal", () => {
  it("renders the provided text (char split, with aria-label)", () => {
    const text = "Mule rings don't hide";
    const { container } = render(<TextReveal text={text} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.getAttribute("aria-label")).toBe(text);
    expect(el.textContent).toBe(text);
  });

  it("respects the `as` element and `by=word` splitting", () => {
    const { container } = render(
      <TextReveal text="topology matters" by="word" as="h2" />
    );
    const heading = container.querySelector("h2");
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toBe("topology matters");
  });
});
