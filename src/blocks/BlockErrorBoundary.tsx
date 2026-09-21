import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

/**
 * Keeps one broken block from taking down the page it sits on.
 *
 * Without this, anything that throws while rendering bubbles all the way up to
 * the router, which clears the screen and shows "Unexpected Application Error".
 * A leader looking for the group info lost the whole page — the text, the
 * schedule, the links — because one block underneath it failed.
 *
 * That is what happened with the PDF block on older iPhones. The cause is fixed
 * (src/lib/polyfills.ts), but the shape of the failure is worth closing off: a
 * block that can't render should be a small apology in the space it occupies,
 * with the rest of the page still there.
 */
interface Props {
  children: ReactNode;
  /** Shown in place of the block. Gets the error, for an "Open it directly" escape hatch. */
  fallback: (error: Error) => ReactNode;
}

export class BlockErrorBoundary extends Component<Props, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No error reporting service here, so the console is the only record. Worth
    // having: it's what turns "it just went white" into something answerable.
    console.error('Block failed to render:', error, info.componentStack);
  }

  render() {
    if (this.state.error) return this.props.fallback(this.state.error);
    return this.props.children;
  }
}
