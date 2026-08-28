"use client";

/**
 * Hamburger → "MENU" reveal button (adapted from a Uiverse.io button,
 * recolored onto the design tokens). On hover the three bars slide open into
 * the label; on click it toggles into an X to reflect the drawer's actual
 * open/closed state, so it stays a real control and not just a hover toy.
 */
export default function MenuButton({
  open,
  onClick,
}: {
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={open ? "Close menu" : "Open menu"}
      aria-expanded={open}
      className="tracer-menu-btn relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-md border border-border bg-bg-tertiary text-text-secondary transition-colors hover:border-accent hover:text-accent md:hidden"
    >
      <span className="tracer-menu-bars relative flex h-4 w-5 flex-col justify-between">
        <span
          className="tracer-menu-bar h-[2px] w-full rounded-full bg-current transition-transform duration-300"
          style={open ? { transform: "translateY(7px) rotate(45deg)" } : undefined}
        />
        <span
          className="tracer-menu-bar h-[2px] w-full rounded-full bg-current transition-opacity duration-200"
          style={open ? { opacity: 0 } : undefined}
        />
        <span
          className="tracer-menu-bar h-[2px] w-full rounded-full bg-current transition-transform duration-300"
          style={open ? { transform: "translateY(-7px) rotate(-45deg)" } : undefined}
        />
      </span>
    </button>
  );
}
