"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

import { ErrorState } from "@/components/states";

type AnalysisCardBoundaryProps = {
  children: ReactNode;
  resetKey: string;
};

type AnalysisCardBoundaryState = {
  hasError: boolean;
};

// Keeps an unexpected rendering failure inside one Analysis section. Network and
// validation errors use each card's normal error state; this is the last-resort
// boundary that prevents one optional visualization from taking down the route.
export class AnalysisCardBoundary extends Component<
  AnalysisCardBoundaryProps,
  AnalysisCardBoundaryState
> {
  state: AnalysisCardBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AnalysisCardBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Analysis section failed to render", error, info);
  }

  componentDidUpdate(previous: AnalysisCardBoundaryProps) {
    if (previous.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorState
          title="Section unavailable"
          message="This analysis section could not be displayed. The rest of the repository analysis is still available."
          onRetry={() => this.setState({ hasError: false })}
        />
      );
    }

    return this.props.children;
  }
}
