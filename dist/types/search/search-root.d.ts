import { default as React } from 'react';
import { Cta } from '../api/rag.types';
export type SearchRootProps = {
    children: React.ReactNode;
    options: {
        config: string;
        baseUrl: string;
        /**
         * Optional reCAPTCHA site key for human verification.
         * If provided, the search modal will require a successful reCAPTCHA challenge
         * before sending any queries to the backend. This can help prevent abuse or
         * spam in public-facing applications.
         */
        recaptchaSiteKey?: string;
    };
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    theme?: string;
    renderMarkdown?: (markdown: string) => React.ReactNode;
    logo?: React.ReactNode;
    isDevMode?: boolean;
    /**
     * Observability callback fired with the full CTA whenever a quick-action
     * chip is clicked (anchor or button, default action or override). Pair it
     * with the `insytful-cta` bus event for non-React listeners.
     */
    onCtaClick?: (cta: Cta) => void;
    offsets?: {
        top?: number | string;
        left?: number | string;
        right?: number | string;
    };
};
/**
 * Search.Root — provides context to all descendants.
 *
 * Children render in the normal React tree, so Search.Trigger works
 * anywhere in the consumer's DOM. Use Search.Portal to render content
 * inside the Shadow DOM dialog.
 */
export declare function SearchRoot({ children, options, open: openProp, defaultOpen, onOpenChange, theme, renderMarkdown, logo, isDevMode, offsets, onCtaClick, }: SearchRootProps): React.JSX.Element;
export declare namespace SearchRoot {
    var displayName: string;
}
export type SearchPortalProps = {
    children: React.ReactNode;
};
/**
 * Search.Portal — renders children into a Shadow DOM dialog on document.body.
 *
 * Uses ReactDOM.createPortal to preserve React context across the boundary.
 * Must be a descendant of Search.Root.
 */
export declare function SearchPortal({ children }: SearchPortalProps): React.ReactPortal | null;
export declare namespace SearchPortal {
    var displayName: string;
}
