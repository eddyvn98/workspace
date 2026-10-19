export const SLIDE_TRANSITIONS = ["none", "fade", "slide", "zoom"] as const;
export const SLIDE_ANIMATIONS = ["none", "fade", "rise", "reveal"] as const;
export type SlideTransition = typeof SLIDE_TRANSITIONS[number];
export type SlideAnimation = typeof SLIDE_ANIMATIONS[number];

export function validSlideMotion(value: unknown, choices: readonly string[]): boolean {
  return typeof value === "string" && choices.includes(value);
}

export function animateSlide(surface: HTMLElement, transition: SlideTransition, animation: SlideAnimation): () => void {
  if (typeof surface.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return () => {};
  const running: Animation[] = [];
  if (transition !== "none") {
    const from = transition === "slide" ? "translateX(5%)" : transition === "zoom" ? "scale(.94)" : "none";
    running.push(surface.animate([{ opacity: 0, transform: from }, { opacity: 1, transform: "none" }], { duration: 320, easing: "ease-out" }));
  }
  if (animation !== "none") {
    const body = surface.querySelector(".slide-html");
    const targets = animation === "reveal" ? body?.querySelectorAll("h1,h2,h3,p,li,table,img") : body?.children;
    Array.from(targets ?? []).filter((el) => animation !== "reveal" || !el.parentElement?.closest("li,table")).forEach((el, index) => {
      running.push(el.animate([
        { opacity: 0, transform: animation === "rise" ? "translateY(16px)" : "none" },
        { opacity: 1, transform: "none" },
      ], { duration: 350, delay: Math.min(index, 12) * 90, fill: "backwards", easing: "ease-out" }));
    });
  }
  let sequenceEnd = 0;
  surface.querySelectorAll<HTMLElement>("[data-scene-object]").forEach(el => {
    const kind = el.dataset.motion || "none";
    if (kind === "none" || el.dataset.trigger === "on-click") return;
    const duration = Math.max(100, Math.min(5000, Number(el.dataset.duration) || 450));
    const ownDelay = Math.max(0, Math.min(10000, Number(el.dataset.delay) || 0));
    const delay = (el.dataset.trigger === "after-previous" ? sequenceEnd : 0) + ownDelay;
    sequenceEnd = Math.max(sequenceEnd, delay + duration);
    const transform = kind === "rise" ? "translateY(24px)" : kind === "slide" ? "translateX(50px)" : kind === "zoom" ? "scale(.8)" : "none";
    running.push(el.animate([{opacity:0,transform},{opacity:1,transform:"none"}],{duration,delay,fill:"backwards",easing:"ease-out"}));
  });
  return () => running.forEach((item) => item.cancel());
}
