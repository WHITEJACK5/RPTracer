import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import StreamingText from "../StreamingText";

vi.mock("framer-motion", async () => {
  return { useReducedMotion: () => false };
});

describe("StreamingText", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("streams the full text character by character", () => {
    const onDone = vi.fn();
    const { container } = render(
      <StreamingText text="hello world" speed={10} onDone={onDone} />
    );
    // before completion only a prefix is shown
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(container.textContent).toContain("hello");

    // advance past the full stream (11 chars * 10ms) + 500ms cursor fade
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(container).toHaveTextContent("hello world");
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("renders markdown variant through react-markdown", () => {
    const { container } = render(
      <StreamingText text="**bold**" speed={1} markdown />
    );
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(container.querySelector("strong")).not.toBeNull();
  });
});
