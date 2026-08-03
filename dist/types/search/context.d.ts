import { default as React } from 'react';
import { Cta, RAGMessage } from '../api/rag.types';
/**
 * Creates a scoped context with a hook that throws if used outside the provider.
 * Follows the Radix UI pattern for compound component context.
 */
export declare function createCompoundContext<T>(componentName: string): readonly [React.Provider<T | null>, (consumerName: string) => T, () => T | null];
export type SearchContextValue = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    titleId: string;
    descriptionId: string;
    options: {
        config: string;
        baseUrl: string;
    };
    messages: RAGMessage[];
    loading: boolean;
    elapsed: number;
    error?: string | null;
    onSend: (msg: string) => Promise<void>;
    /** Observability: fired with the full CTA on every CTA chip click (D8). */
    onCtaClick?: (cta: Cta) => void;
    renderMarkdown?: (markdown: string) => React.ReactNode;
    logo?: React.ReactNode;
    isDevMode: boolean;
    theme?: string;
    offsets?: {
        top?: number | string;
        left?: number | string;
        right?: number | string;
    };
    /** Computed height from data-insytful-modal-offset elements */
    computedOffsetHeight: number;
};
export declare const SearchProvider: React.Provider<SearchContextValue | null>, useSearchContext: (consumerName: string) => SearchContextValue;
export type ModeContextValue = {
    mode: string;
    onSwitchMode: (mode: string) => void;
};
export declare const ModeProvider: React.Provider<ModeContextValue | null>, useModeContext: (consumerName: string) => ModeContextValue, useModeContextSafe: () => ModeContextValue | null;
