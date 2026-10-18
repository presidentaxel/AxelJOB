import { Component } from 'react';
import { ServerErrorPage } from './ErrorPages';
import { captureSentryException } from '../lib/sentry.js';
import { isChunkLoadError } from '../lib/lazyChunkReload.js';

/**
 * Capture les erreurs de rendu / lifecycle dans l’arbre React sous-jacent.
 * Affiche une page type 500 avec possibilité de réinitialiser l’état du boundary.
 */
export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, chunk: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, chunk: isChunkLoadError(error) };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[AppErrorBoundary]', error, errorInfo);
    captureSentryException(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, chunk: false });
  };

  render() {
    if (this.state.hasError) {
      return <ServerErrorPage onRetry={this.handleRetry} chunk={this.state.chunk} />;
    }
    return this.props.children;
  }
}
