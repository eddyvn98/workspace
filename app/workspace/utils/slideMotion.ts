export const SLIDE_TRANSITIONS = ["none", "fade", "slide", "zoom", "wipe"] as const;
export const SLIDE_ANIMATIONS = ["none", "fade", "rise", "reveal", "slide", "zoom", "wipe"] as const;
export type SlideTransition = typeof SLIDE_TRANSITIONS[number];
export type SlideAnimation = typeof SLIDE_ANIMATIONS[number];

export function validSlideMotion(value: unknown, choices: readonly string[]): boolean {
  return typeof value === "string" && choices.includes(value);
}

/** Slide transitions and legacy HTML builds. Scene V2 owns its per-object click schedule. */
export function animateSlide(surface: HTMLElement, transition: SlideTransition, animation: SlideAnimation): () => void {
  if (typeof surface.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return () => {};
  const running: Animation[] = [];
  if (transition !== "none") {
    const from = transition === "slide" ? "translateX(5%)" : transition === "zoom" ? "scale(.94)" : "none";
    running.push(surface.animate([{ opacity: 0, transform: from, clipPath: transition === "wipe" ? "inset(0 100% 0 0)" : "inset(0)" }, { opacity: 1, transform: "none", clipPath: "inset(0)" }], { duration: 320, easing: "ease-out" }));
  }
  if (animation !== "none") {
    const body = surface.querySelector(".slide-html");
    const targets = animation === "reveal" ? body?.querySelectorAll("h1,h2,h3,p,li,table,img") : body?.children;
    Array.from(targets ?? []).filter((el) => animation !== "reveal" || !el.parentElement?.closest("li,table")).forEach((el, index) => {
      running.push(el.animate([
        { opacity: 0, transform: animation === "rise" ? "translateY(16px)" : animation === "slide" ? "translateX(20px)" : animation === "zoom" ? "scale(.8)" : "none", clipPath: animation === "wipe" ? "inset(0 100% 0 0)" : "inset(0)" },
        { opacity: 1, transform: "none", clipPath: "inset(0)" },
      ], { duration: 350, delay: Math.min(index, 12) * 90, fill: "backwards", easing: "ease-out" }));
    });
  }
  return () => running.forEach((item) => item.cancel());
}
