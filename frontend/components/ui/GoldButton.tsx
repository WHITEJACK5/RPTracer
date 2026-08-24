"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { motion, useReducedMotion } from "framer-motion";
import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 rounded-md font-grotesk text-sm font-bold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-green focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary disabled:opacity-60 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary:
          "text-black bg-gradient-to-r from-gold-400 via-gold-500 to-neon-green shadow-gold hover:shadow-neon",
        secondary:
          "text-text-primary border border-border-strong bg-surface hover:border-gold-500",
        ghost: "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary",
      },
      size: {
        sm: "px-3 py-1.5 text-xs",
        md: "px-5 py-2.5",
        lg: "px-7 py-3 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

/** framer-motion redefines these DOM handlers, so omit them from the props. */
type OmitMotion<T> = Omit<
  T,
  | "onAnimationStart"
  | "onAnimationEnd"
  | "onAnimationIteration"
  | "onDrag"
  | "onDragStart"
  | "onDragEnd"
  | "onDragEnter"
  | "onDragExit"
  | "onDragLeave"
  | "onDragOver"
  | "onDrop"
>;

type ButtonProps = OmitMotion<ButtonHTMLAttributes<HTMLButtonElement>> &
  VariantProps<typeof buttonVariants>;
type AnchorProps = OmitMotion<AnchorHTMLAttributes<HTMLAnchorElement>> &
  VariantProps<typeof buttonVariants> & { href: string };

/**
 * Primary action button. 3D-style gradient (gold-400 → gold-500 → neon-green)
 * lifts on hover, depresses to scale-0.95 on press, and shows a neon-green
 * focus ring. `variant`/`size` come from class-variance-authority. When `href`
 * is provided it renders an accessible <a>. Honors `prefers-reduced-motion`.
 */
const GoldButton = forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  ButtonProps | AnchorProps
>((props, ref) => {
  const reduced = useReducedMotion();
  const classes = cn(buttonVariants({ variant: props.variant, size: props.size }), props.className);
  const motionProps = reduced ? {} : { whileHover: { y: -2 }, whileTap: { scale: 0.95 } };

  if ("href" in props && props.href) {
    const { href, variant: _v, size: _s, className: _c, ...aRest } = props;
    return (
      <motion.a
        ref={ref as React.Ref<HTMLAnchorElement>}
        href={href}
        className={classes}
        {...motionProps}
        {...aRest}
      >
        {props.children}
      </motion.a>
    );
  }

  const { variant: _v, size: _s, className: _c, ...bRest } = props as ButtonProps;
  return (
    <motion.button
      ref={ref as React.Ref<HTMLButtonElement>}
      className={classes}
      {...motionProps}
      {...bRest}
    >
      {props.children}
    </motion.button>
  );
});
GoldButton.displayName = "GoldButton";

export default GoldButton;
export { buttonVariants };
