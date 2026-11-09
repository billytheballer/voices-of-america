import { Component, type ErrorInfo, type ReactNode } from 'react';
import { gameStore } from '@/store/gameStore';

/**
 * Last line of defense: a rendering bug shows a recovery screen instead of a
 * blank page. The autosave from the last completed turn is still on disk.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Voices of America crashed:', error, info.componentStack);
  }

  private recover = () => {
    gameStore.getState().quit();
    this.setState({ error: null });
  };

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <main id="main" role="alert" className="mx-auto max-w-xl px-6 py-24">
        <h1 className="font-serif text-4xl font-black">Something broke on this screen</h1>
        <p className="mt-4 text-ink-2">
          The game hit an unexpected error. Your autosave from the last completed quarter is safe: return to the main menu and
          continue from it.
        </p>
        <pre className="mt-4 overflow-auto rounded bg-panel p-3 text-xs text-ink-2 ring-1 ring-rule">{this.state.error.message}</pre>
        <button type="button" onClick={this.recover} className="mt-6 rounded-md bg-brass px-4 py-2 font-semibold text-white">
          Back to the main menu
        </button>
      </main>
    );
  }
}
