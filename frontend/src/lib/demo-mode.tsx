"use client";

import { createContext, useContext, type ReactNode } from "react";

// Marks the subtree as the signed-out product demo (the `/demo` route tree). It
// defaults to FALSE with no provider, so the real analysis routes are completely
// unaffected: every demo-aware component (analysis cards, guess seeding, the
// generation handlers, the context form, instruction boxes) reads this and only
// swaps to hardcoded fixtures + login gates when it is true. Nothing here touches
// the network, so the demo spends zero GitHub calls and zero OpenAI tokens.
const DemoModeContext = createContext(false);

export function DemoModeProvider({ children }: { children: ReactNode }) {
  return (
    <DemoModeContext.Provider value={true}>{children}</DemoModeContext.Provider>
  );
}

// True only inside the demo route tree. Safe to call anywhere — with no provider
// it returns false, so a component using it renders its normal, live behavior.
export function useDemo(): boolean {
  return useContext(DemoModeContext);
}
