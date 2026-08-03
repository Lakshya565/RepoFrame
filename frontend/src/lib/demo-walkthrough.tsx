"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useReducedMotion } from "motion/react";

import {
  INITIAL_DEMO_WALKTHROUGH_STATE,
  reduceDemoWalkthrough,
  type DemoGenerationKind,
  type DemoWalkthroughEvent,
  type DemoWalkthroughState,
} from "@/lib/demo-walkthrough-state";

export type DemoWalkthroughTarget =
  | "commit-activity"
  | "generate-tab"
  | "context-actions"
  | "generation-actions"
  | "audit-run"
  | "history-tab"
  | "history-content";

const TARGET_ROUTES: Record<DemoWalkthroughTarget, string> = {
  "commit-activity": "/demo",
  "generate-tab": "/demo",
  "context-actions": "/demo/generate",
  "generation-actions": "/demo/generate",
  "audit-run": "/demo/generate",
  "history-tab": "/demo/generate",
  "history-content": "/demo/history",
};

type DemoWalkthroughContextValue = {
  state: DemoWalkthroughState;
  dispatch: (event: DemoWalkthroughEvent) => void;
  showTarget: (target: DemoWalkthroughTarget) => void;
  restart: () => void;
};

const EMPTY_STATE: DemoWalkthroughState = {
  ...INITIAL_DEMO_WALKTHROUGH_STATE,
  display: "finished",
};

const DemoWalkthroughContext = createContext<DemoWalkthroughContextValue>({
  state: EMPTY_STATE,
  dispatch: () => undefined,
  showTarget: () => undefined,
  restart: () => undefined,
});

function selectorFor(target: DemoWalkthroughTarget): string {
  return `[data-demo-target="${target}"]`;
}

function interactiveElement(element: Element): HTMLElement | null {
  if (element.matches("button, a, input, textarea, select, [tabindex]")) {
    return element as HTMLElement;
  }
  return element.querySelector<HTMLElement>(
    "button, a, input, textarea, select, [tabindex]",
  );
}

export function currentDemoWalkthroughTarget(
  state: DemoWalkthroughState,
): DemoWalkthroughTarget {
  if (state.step === 1) {
    return state.analysisTargetViewed ? "generate-tab" : "commit-activity";
  }
  if (state.step === 2) return "context-actions";
  if (state.step === 3) return "generation-actions";
  if (state.step === 4) return "audit-run";
  return state.historyOpened ? "history-content" : "history-tab";
}

// Owns the demo-only walkthrough session. It survives route changes because it
// sits in /demo/layout, but unmounting that route tree resets the whole session.
export function DemoWalkthroughProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    reduceDemoWalkthrough,
    INITIAL_DEMO_WALKTHROUGH_STATE,
  );
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const pendingTarget = useRef<DemoWalkthroughTarget | null>(null);

  const revealTarget = useCallback(
    (target: DemoWalkthroughTarget) => {
      const element = document.querySelector(selectorFor(target));
      if (!element) return;
      element.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
        inline: "nearest",
      });
      interactiveElement(element)?.focus({ preventScroll: true });
    },
    [reduceMotion],
  );

  const showTarget = useCallback(
    (target: DemoWalkthroughTarget) => {
      const targetRoute = TARGET_ROUTES[target];
      if (pathname !== targetRoute && target !== "generate-tab" && target !== "history-tab") {
        pendingTarget.current = target;
        router.push(targetRoute);
        return;
      }
      revealTarget(target);
    },
    [pathname, revealTarget, router],
  );

  // Complete a cross-route target request after the destination DOM commits.
  useEffect(() => {
    const target = pendingTarget.current;
    if (!target || pathname !== TARGET_ROUTES[target]) return;
    pendingTarget.current = null;
    const frame = window.requestAnimationFrame(() => revealTarget(target));
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, revealTarget]);

  // The current target receives a quiet outline. DOM attributes avoid threading
  // walkthrough props through every shared live-app component.
  useEffect(() => {
    if (state.display !== "open") return;
    const target = currentDemoWalkthroughTarget(state);
    const elements = document.querySelectorAll(selectorFor(target));
    elements.forEach((element) => element.setAttribute("data-demo-active", "true"));
    return () => {
      elements.forEach((element) => element.removeAttribute("data-demo-active"));
    };
  }, [pathname, state]);

  const restart = useCallback(() => {
    dispatch({ type: "restart" });
    window.location.assign("/demo");
  }, []);

  const value = useMemo(
    () => ({ state, dispatch, showTarget, restart }),
    [restart, showTarget, state],
  );

  return (
    <DemoWalkthroughContext.Provider value={value}>
      {children}
    </DemoWalkthroughContext.Provider>
  );
}

// Safe in shared components: outside /demo every method is a no-op.
export function useDemoWalkthrough(): DemoWalkthroughContextValue {
  return useContext(DemoWalkthroughContext);
}

export function generationWalkthroughEvent(
  kind: DemoGenerationKind,
  succeeded: boolean,
): DemoWalkthroughEvent {
  return { type: "generation_finished", kind, succeeded };
}
