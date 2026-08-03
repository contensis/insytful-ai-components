/**
 * DialogRenderer — builds the dialog DOM structure inside the shadow root.
 *
 * Mirrors the React component tree (SearchPortal > SearchRoot > Title,
 * Description, Messages, Input, Suggestions, Disclaimer) using plain DOM
 * elements with the same BEM class names and Tailwind utility classes so
 * the shared CSS produces an identical visual result.
 */

// Types-only import — adds zero runtime weight to the IIFE bundle.
import type { Cta } from '../api/rag.types';
import { ctaViewModel, CTA_BAR_CLASS, CTA_LABEL_CLASS } from '../shared/cta/view-model';
import {
  executeCta,
  hasCtaHandlerOverride,
  dispatchCtaObservability,
} from '../shared/cta/handlers';

/* ------------------------------------------------------------------ */
/* SVG icon markup                                                      */
/* ------------------------------------------------------------------ */

const SPARKLE_ICON = `<svg focusable="false" aria-hidden="true" role="presentation" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><path fill="var(--insytful-text-default)" d="M10.6 9.6 9 15 7.4 9.6 2 8l5.4-1.6L9 1l1.6 5.4L16 8l-5.4 1.6Zm6.4 4.6 4-2.2-2.2 4 2.2 4-4-2.2-4 2.2 2.2-4-2.2-4 4 2.2ZM10 16l-1.7 3 1.7 3-3-1.7L4 22l1.7-3L4 16l3 1.7 3-1.7Z"/></svg>`;

const SEND_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 16 16"><g clip-path="url(#a)"><path fill="var(--insytful-btn-icon-search-icon)" d="M15.991 8a1.606 1.606 0 0 0-.543-1.2L7.996.24a.96.96 0 0 0-1.267 1.442l5.758 5.067a.166.166 0 0 1 .046.183.167.167 0 0 1-.156.108H.967a.96.96 0 1 0 0 1.92h11.408a.167.167 0 0 1 .11.292l-5.758 5.067a.96.96 0 1 0 1.267 1.44L15.448 9.2A1.606 1.606 0 0 0 15.99 8Z"/></g><defs><clipPath id="a"><path fill="var(--insytful-btn-icon-search-icon)" d="M0 0h16v16H0z"/></clipPath></defs></svg>`;

const CLOSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M18 6 6 18M6 6l12 12"/></svg>`;

/* ------------------------------------------------------------------ */
/* Helper                                                               */
/* ------------------------------------------------------------------ */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      node.setAttribute(k, v);
    }
  }
  return node;
}

/* ------------------------------------------------------------------ */
/* Render result                                                        */
/* ------------------------------------------------------------------ */

export interface DialogElements {
  /** The outermost container appended to the shadow root */
  root: HTMLDivElement;
  /** The dialog overlay — controls visibility via inert/opacity */
  dialogOuter: HTMLDivElement;
  /** The inner content column */
  dialogInner: HTMLDivElement;
  /** Slot for the trigger button (lives in light DOM projection) */
  triggerSlot: HTMLSlotElement;
  /** Slot for logo */
  logoSlot: HTMLSlotElement;
  /** Slot for title (empty-state heading) */
  titleSlot: HTMLSlotElement;
  /** Slot for description (empty-state text) */
  descriptionSlot: HTMLSlotElement;
  /** Slot for disclaimer text */
  disclaimerSlot: HTMLSlotElement;
  /** Container for chat messages (populated by Unit 4) */
  messagesContainer: HTMLDivElement;
  /** Scrolling wrapper inside messages */
  messagesScroll: HTMLDivElement;
  /** The outer wrapper around messagesScroll (controls visibility) */
  messagesOuter: HTMLDivElement;
  /** The <ul> inside messagesContainer that holds message <li> elements */
  messagesList: HTMLUListElement;
  /** Spacer element used for scroll-to-top positioning */
  scrollSpacer: HTMLDivElement;
  /** Scroll hint arrow shown when content overflows */
  scrollHint: HTMLDivElement;
  /** The empty-state wrapper (title + description + suggestions) */
  emptyState: HTMLDivElement;
  /** Container for suggestion chips (populated by Unit 5) */
  suggestionsContainer: HTMLDivElement;
  /** Wrapper around the input card — exposed so `order` can be toggled for suggestions-position="below" */
  inputCardOuter: HTMLDivElement;
  /** Container for the close button; button is appended only when <insytful-close> exists */
  closeButtonContainer: HTMLDivElement;
  /** The input form */
  inputForm: HTMLFormElement;
  /** The textarea element */
  textarea: HTMLTextAreaElement;
  /** The send button */
  sendButton: HTMLButtonElement;
  /** Container for mode switch tabs (populated by Unit 5) */
  modeSwitchContainer: HTMLDivElement;
  /** The input card wrapper (textarea + mode switch) */
  inputCard: HTMLDivElement;
  /** Disclaimer wrapper at the bottom */
  disclaimerWrapper: HTMLDivElement;
  /** Gradient shimmer behind the input card (AI mode, empty state) */
  inputGradient: HTMLDivElement;
}

/**
 * Transition for the dialog overlay's open/close fade.
 *
 * visibility (not just opacity/inert) is required so contrast scanners and
 * the a11y tree treat the closed dialog as hidden. The zero-duration
 * visibility transition is delayed on close so the opacity fade-out plays
 * before the element is hidden; on open it applies immediately.
 */
export function dialogTransition(open: boolean): string {
  return (
    'opacity var(--insytful-search-transition-duration, 200ms) var(--insytful-search-transition-easing, ease), ' +
    `visibility 0s linear ${open ? '0s' : 'var(--insytful-search-transition-duration, 200ms)'}`
  );
}

/* ------------------------------------------------------------------ */
/* Main render function                                                 */
/* ------------------------------------------------------------------ */

export function renderDialog(titleId: string, descriptionId: string): DialogElements {
  // --- Root container (no dialog role — that goes on dialogOuter) ---
  const root = el('div', {}, 'insytful-root');

  // --- Trigger slot (light DOM projection) ---
  const triggerSlot = document.createElement('slot');
  triggerSlot.name = 'trigger';
  root.appendChild(triggerSlot);

  // --- Dialog outer (the full-screen overlay) ---
  // Dialog role lives here (not on root) so it is only exposed to assistive
  // technology when the overlay is visible. The `inert` attribute hides it when closed.
  const dialogOuter = el('div', {
    'id': 'insytful-search-dialog',
    'role': 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': titleId,
    'aria-describedby': descriptionId,
    'inert': '',
  }, 'insytful-search-dialog-outer fixed flex flex-col bg-[var(--insytful-modal-bg)] overflow-hidden pb-0 insytful-search-dialog-closed');

  Object.assign(dialogOuter.style, {
    zIndex: 'var(--insytful-z-index, 999)',
    top: '0px',
    left: '0',
    right: '0',
    bottom: '0',
    opacity: '0',
    visibility: 'hidden',
    pointerEvents: 'none',
    transition: dialogTransition(false),
  });

  // --- Close button container (top-right of dialog) ---
  // Button itself is only appended when the light-DOM child <insytful-close> is present.
  const closeButtonContainer = el('div', { 'data-insytful-close-container': '' });

  // --- Dialog inner ---
  const dialogInner = el('div', {},
    'insytful-search-dialog-inner min-h-[500px] px-4 w-full mx-auto flex flex-col h-full justify-start md:justify-center gap-[24px] md:gap-[32px] pt-[32px]',
  );

  // --- Empty state (title + description) ---
  const emptyState = el('div', {},
    'insytful-search-empty-state flex flex-col items-center gap-[8px] md:gap-[16px] md:mt-auto px-4',
  );

  // Logo slot
  const logoSlot = document.createElement('slot');
  logoSlot.name = 'logo';
  emptyState.appendChild(logoSlot);

  // Title slot — wrapped in an <h1> for semantics
  const titleWrapper = el('h1', { 'id': titleId },
    'insytful-search-empty-state-title text-[var(--insytful-text-default)] text-[24px] leading-[32px] font-bold md:text-[56px] md:leading-[64px] text-center',
  );
  const titleSlot = document.createElement('slot');
  titleSlot.name = 'title';
  titleSlot.textContent = 'How can we help?'; // default fallback
  titleWrapper.appendChild(titleSlot);
  emptyState.appendChild(titleWrapper);

  // Description slot — wrapped in a <p> for semantics
  const descWrapper = el('p', { 'id': descriptionId },
    'insytful-search-empty-state-text text-[var(--insytful-text-default)] text-[14px] leading-[24px] font-normal md:text-[20px] md:leading-[32px] text-center',
  );
  const descriptionSlot = document.createElement('slot');
  descriptionSlot.name = 'description';
  descWrapper.appendChild(descriptionSlot);
  emptyState.appendChild(descWrapper);

  dialogInner.appendChild(emptyState);

  // --- Messages container (Unit 4 populates content) ---
  const messagesOuter = el('div', {},
    'flex-1 min-h-0 relative w-full max-w-full',
  );
  messagesOuter.style.display = 'none'; // hidden until messages exist

  const messagesScroll = el('div', {},
    'overflow-y-auto insytful-search-messages-container-scroll h-full w-full',
  );

  const messagesContainer = el('div', {},
    'insytful-search-messages-outer w-full max-w-[var(--insytful-modal-max-width)] mx-auto',
  );

  const messagesList = el('ul', {
    'aria-live': 'polite',
    'aria-atomic': 'false',
  }, 'insytful-search-messages-inner flex flex-col gap-[32px] max-w-full w-full p-0 m-0');
  messagesList.style.listStyle = 'none';
  messagesContainer.appendChild(messagesList);

  // Scroll spacer: expanded when user sends a follow-up so their message
  // can scroll to the top, collapses when response finishes loading.
  const scrollSpacer = el('div', { 'aria-hidden': 'true' },
    'insytful-search-scroll-spacer',
  );
  scrollSpacer.style.height = '0px';
  messagesContainer.appendChild(scrollSpacer);

  messagesScroll.appendChild(messagesContainer);

  // Scroll hint — shown when content overflows and user hasn't reached bottom
  const scrollHint = el('div', {},
    'w-full max-w-[var(--insytful-modal-max-width)] mx-auto absolute left-1/2 -translate-x-1/2 bottom-0 flex flex-col justify-center items-center',
  );
  scrollHint.style.display = 'none';
  scrollHint.innerHTML = `<div class="insytful-search-messages-icon min-w-[42px] h-[42px] w-[42px] rounded-full border border-gray-200 flex items-center justify-center p-[8px] shadow-[0_2px_8px_0_rgba(0,0,0,0.15)] animate-slide-to-bounce-animate bg-white z-20"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><path stroke="#333" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v14M19 12l-7 7-7-7"/></svg></div>`;

  messagesOuter.appendChild(messagesScroll);
  messagesOuter.appendChild(scrollHint);
  dialogInner.appendChild(messagesOuter);

  // --- Suggestions container (Unit 5 populates chips) ---
  const suggestionsContainer = el('div', {},
    'insytful-search-suggestions-outer w-full overflow-hidden self-stretch',
  );
  suggestionsContainer.style.display = 'none'; // hidden until suggestions exist
  dialogInner.appendChild(suggestionsContainer);

  // --- Input area ---
  const inputCardOuter = el('div', {}, 'px-4 relative group');

  // Gradient shimmer — visible in AI mode empty state only
  const inputGradient = el('div', {},
    'insytful-search-message-input-bg absolute inset-0 h-full w-full max-w-[var(--insytful-modal-max-width)] mx-auto rounded-[var(--insytful-input-card-radius)] group-focus-within:opacity-60',
  );
  const inputGradientInner = el('div', {
    'aria-hidden': 'true',
  }, 'pointer-events-none absolute inset-x-[-2px] top-[2px] -bottom-[10px] rounded-[var(--insytful-input-card-radius)] opacity-50 blur-[14px] transition-opacity z-0 bg-gradient-to-b from-[var(--insytful-semantic-search-field-ai-gradient-start)] to-[var(--insytful-semantic-search-field-ai-gradient-end)]');
  inputGradient.appendChild(inputGradientInner);
  inputCardOuter.appendChild(inputGradient);

  const inputCard = el('div', {},
    'insytful-search-input-card relative z-10 w-full max-w-[var(--insytful-modal-max-width)] mx-auto rounded-[var(--insytful-input-card-radius)] border border-[var(--insytful-input-card-border)] bg-[var(--insytful-input-card-bg)] overflow-hidden px-[12px] pb-[12px] pt-[12px]',
  );

  const inputForm = el('form', {},
    'insytful-search-message-input w-full relative flex',
  );

  // Sparkle icon
  const inputIcon = el('div', {},
    'insytful-search-message-input-icon absolute top-[14px] left-0 z-20',
  );
  inputIcon.innerHTML = SPARKLE_ICON;
  inputForm.appendChild(inputIcon);

  // Textarea
  const textarea = el('textarea', {
    'rows': '1',
    'placeholder': 'Ask a question',
    'aria-label': 'Ask a question',
  }, 'insytful-search-message-input-textarea relative z-10 w-full resize-none bg-[var(--insytful-input-card-bg)] max-h-[240px] overflow-y-auto py-[12px] min-h-[48px] border-0 rounded-none pr-[48px] pl-[32px]');

  inputForm.appendChild(textarea);

  // Send button
  const sendButton = el('button', {
    'type': 'submit',
    'aria-label': 'Send message',
  }, 'insytful-search-message-input-btn z-20 absolute right-0 top-1/2 -translate-y-1/2 w-[40px] h-[40px] rounded-full flex items-center justify-center bg-[var(--insytful-btn-icon-search-bg-default)] text-white border-none cursor-pointer hover:bg-[var(--insytful-btn-icon-search-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50');

  sendButton.innerHTML = SEND_ICON;
  inputForm.appendChild(sendButton);

  inputCard.appendChild(inputForm);

  // Mode switch container (Unit 5 populates tabs)
  const modeSwitchContainer = el('div', {},
    'insytful-search-mode-switch',
  );
  inputCard.appendChild(modeSwitchContainer);

  inputCardOuter.appendChild(inputCard);
  dialogInner.appendChild(inputCardOuter);

  // --- Disclaimer ---
  const disclaimerWrapper = el('div', {},
    'mt-auto pb-[24px] p-4',
  );

  const disclaimerInner = el('div', {},
    'insytful-search-disclaimer-inner text-sm leading-6 font-normal text-center text-[var(--insytful-disclaimer-text)]',
  );

  const disclaimerSlot = document.createElement('slot');
  disclaimerSlot.name = 'disclaimer';
  disclaimerInner.appendChild(disclaimerSlot);
  disclaimerWrapper.appendChild(disclaimerInner);
  dialogInner.appendChild(disclaimerWrapper);

  // --- Assemble ---
  dialogOuter.appendChild(closeButtonContainer);
  dialogOuter.appendChild(dialogInner);
  root.appendChild(dialogOuter);

  return {
    root,
    dialogOuter,
    dialogInner,
    triggerSlot,
    logoSlot,
    titleSlot,
    descriptionSlot,
    disclaimerSlot,
    messagesContainer,
    messagesScroll,
    messagesOuter,
    messagesList,
    scrollSpacer,
    scrollHint,
    emptyState,
    suggestionsContainer,
    inputCardOuter,
    closeButtonContainer,
    inputForm,
    textarea,
    sendButton,
    modeSwitchContainer,
    inputCard,
    disclaimerWrapper,
    inputGradient,
  };
}

/* ------------------------------------------------------------------ */
/* Message rendering helpers                                            */
/* ------------------------------------------------------------------ */

/** Create a wrapper div for an avatar image. */
function createAvatarNode(avatarHTML: string, className: string): HTMLDivElement {
  const node = el('div', {}, className);
  node.innerHTML = avatarHTML;
  return node;
}

/**
 * Create a user message `<li>` element.
 * Matches the React `<Message>` component styling for role === "user".
 */
export function renderUserMessage(content: string): HTMLLIElement {
  // data-role='user' is used to target user messages for scroll-to-top positioning
  const li = el('li', { 'data-role': 'user' },
    'insytful-search-message flex items-start gap-[24px] w-full max-w-full flex-row-reverse',
  );

  const bubble = el('div', {},
    'insytful-search-message-content-outer text-[1em] md:text-[1.25em] leading-[2] rounded-[16px] flex flex-col justify-center items-end px-[16px] py-[12px] gap-[10px] bg-[var(--insytful-btn-prompt-bg-default)] text-[var(--insytful-text-default)]',
  );
  bubble.style.overflowWrap = 'anywhere';
  bubble.style.wordBreak = 'break-word';
  bubble.textContent = content;

  li.appendChild(bubble);
  return li;
}

/**
 * Create an assistant message `<li>` element with an inner content div
 * that can be updated during streaming.
 *
 * Returns both the `<li>` and the content `<div>` so the caller can
 * update `contentDiv.innerHTML` as chunks arrive.
 */
export function renderAssistantMessage(avatarHTML?: string | null): {
  li: HTMLLIElement;
  contentDiv: HTMLDivElement;
} {
  // data-role='assistant' is used to identify assistant messages in the DOM
  const li = el('li', { 'data-role': 'assistant' },
    'insytful-search-message flex items-start gap-[24px] w-full max-w-full flex-row',
  );

  // Desktop avatar — visible md+ as a sibling of the content bubble
  if (avatarHTML) {
    li.appendChild(createAvatarNode(avatarHTML, 'insytful-search-message-logo flex-shrink-0 hidden md:block'));
  }

  const outer = el('div', {},
    'insytful-search-message-content-outer w-full text-[1em] md:text-[1.25em] leading-[2] rounded-[16px] text-[var(--insytful-text-default)]',
  );
  outer.style.overflowWrap = 'anywhere';
  outer.style.wordBreak = 'break-word';

  // Mobile avatar — floated left so first paragraph wraps around it,
  // subsequent content flows full-width once past the avatar height.
  if (avatarHTML) {
    outer.appendChild(createAvatarNode(avatarHTML, 'insytful-search-message-logo flex-shrink-0 md:hidden float-left mr-[12px]'));
  }

  const contentDiv = el('div', {},
    'insytful-search-message-content',
  );

  outer.appendChild(contentDiv);
  li.appendChild(outer);

  return { li, contentDiv };
}

/**
 * Create skeleton body content (just the inner content, no <li> wrapper).
 * Mirrors React's SearchSkeletonBody — renders inside an assistant message slot.
 */
export function renderSkeletonBody(searchingText = 'Generating response...'): HTMLDivElement {
  const content = el('div', {},
    'insytful-search-skeleton-content flex flex-col gap-[8px] w-full',
  );

  const bar1 = el('div', {},
    'insytful-search-skeleton-bar animate-skeleton-shimmer w-full',
  );
  const bar2 = el('div', {},
    'insytful-search-skeleton-bar animate-skeleton-shimmer w-[90%]',
  );
  const bar3 = el('div', {},
    'insytful-search-skeleton-bar animate-skeleton-shimmer w-[70%]',
  );

  content.appendChild(bar1);
  content.appendChild(bar2);
  content.appendChild(bar3);

  const text = document.createElement('span');
  text.className = 'insytful-search-skeleton-text text-[16px] lg:text-[18px] leading-[24px] lg:leading-[26px]';
  text.textContent = searchingText;
  content.appendChild(text);

  return content;
}

/**
 * Create a typing indicator `<li>` with animated dots.
 * Uses the `after:animate-dot-animate` Tailwind utility (dot-animate keyframe).
 */
export function renderTypingIndicator(avatarHTML?: string | null, text = 'Searching'): HTMLLIElement {
  const li = el('li', {},
    'insytful-search-typing-indicator flex items-start gap-[12px] md:gap-[24px]',
  );

  if (avatarHTML) {
    li.appendChild(createAvatarNode(avatarHTML, 'insytful-search-typing-indicator-logo flex-shrink-0'));
  }

  const txt = el('div', {},
    'insytful-search-typing-indicator-txt text-[1em] md:text-[1.25em] leading-[2] text-[var(--insytful-typing-indicator-text)]',
  );

  const span = document.createElement('span');
  span.textContent = text;

  const dots = document.createElement('span');
  dots.className = 'after:animate-dot-animate';

  span.appendChild(dots);
  txt.appendChild(span);
  li.appendChild(txt);

  return li;
}

/**
 * Create a skeleton loader `<li>` with animated shimmer bars.
 * Uses the `animate-skeleton-shimmer` Tailwind utility (skeleton-shimmer keyframe).
 */
export function renderSkeletonLoader(avatarHTML?: string | null): HTMLLIElement {
  const li = el('li', {},
    'insytful-search-skeleton flex items-start gap-[12px] md:gap-[24px]',
  );

  if (avatarHTML) {
    li.appendChild(createAvatarNode(avatarHTML, 'insytful-search-skeleton-logo flex-shrink-0'));
  }

  const content = el('div', {},
    'insytful-search-skeleton-content flex-1 flex flex-col gap-[8px]',
  );

  const bar1 = el('div', {},
    'insytful-search-skeleton-bar animate-skeleton-shimmer w-full',
  );
  const bar2 = el('div', {},
    'insytful-search-skeleton-bar animate-skeleton-shimmer w-[90%]',
  );
  const bar3 = el('div', {},
    'insytful-search-skeleton-bar animate-skeleton-shimmer w-[70%]',
  );

  content.appendChild(bar1);
  content.appendChild(bar2);
  content.appendChild(bar3);

  const text = document.createElement('span');
  text.textContent = 'Generating response...';
  content.appendChild(text);

  li.appendChild(content);

  return li;
}

/* ------------------------------------------------------------------ */
/* Suggestion chip & mode switch helpers                                */
/* ------------------------------------------------------------------ */

/**
 * Create a close-button element. Placed absolutely inside `dialogOuter`, so
 * the focus trap automatically includes it. `innerHTML` is raw markup; the
 * caller is expected to have sanitised (DOMPurify) if the source is untrusted.
 *
 * Passing `null` / empty uses the default ✕ icon.
 */
export function renderCloseButton(
  innerHTML: string | null,
  onClick: () => void,
  ariaLabel = 'Close search',
): HTMLButtonElement {
  const btn = el('button', {
    'type': 'button',
    'aria-label': ariaLabel,
  }, 'insytful-search-close');
  btn.innerHTML = innerHTML && innerHTML.trim() ? innerHTML : CLOSE_ICON;
  btn.addEventListener('click', onClick);
  return btn;
}

/**
 * Create a suggestion chip button.
 * Matches the React `SearchSuggestions` component styling from search-suggestions.tsx.
 */
export function renderSuggestionChip(text: string, onClick: () => void): HTMLLIElement {
  const li = el('li', {}, 'insytful-search-suggestions-item');

  const btn = el('button', { 'type': 'button' },
    'insytful-search-suggestions-item-btn bg-[var(--insytful-btn-prompt-bg-default)] text-[var(--insytful-btn-prompt-text)] whitespace-nowrap transition-colors hover:bg-[var(--insytful-btn-prompt-bg-hover)] py-[8px] px-[8px] md:py-[12px] md:px-[16px] text-[14px] md:text-[18px] leading-[24px] rounded-[var(--insytful-btn-prompt-radius)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--insytful-btn-prompt-focus)]',
  );
  btn.textContent = text;
  btn.addEventListener('click', onClick);

  li.appendChild(btn);
  return li;
}

/**
 * Create mode switch tabs.
 * Matches the React `SwitchModeTabs` styling from the playground app.tsx.
 */
export function renderModeSwitchTabs(
  modes: Array<{ name: string; label: string }>,
  activeMode: string,
  onSwitch: (mode: string) => void,
): HTMLDivElement {
  const wrapper = el('div', {},
    'insytful-search-mode-switch-tabs inline-flex gap-[2px] p-[4px] rounded-[8px] bg-[#F2EFF8]',
  );

  for (const mode of modes) {
    const isActive = mode.name === activeMode;
    const btn = el('button', { 'type': 'button' },
      `insytful-search-mode-tab py-[4px] px-[12px] rounded-[4px] text-[13px] md:text-[14px] transition-colors border cursor-pointer ${
        isActive
          ? 'insytful-search-mode-tab-active border-none bg-white text-[#333] font-medium'
          : 'border-transparent text-gray-500 hover:text-[#333]'
      }`,
    );
    btn.textContent = mode.label;
    btn.addEventListener('click', () => onSwitch(mode.name));

    wrapper.appendChild(btn);
  }

  return wrapper;
}

/* ------------------------------------------------------------------ */
/* Error message helper                                                */
/* ------------------------------------------------------------------ */

/**
 * Create an error callout `<li>` element.
 * Matches the React `SearchErrorCallout` component styling.
 */
export function renderErrorMessage(
  message: string,
  onSwitchClassic?: (() => void) | null,
  opts?: {
    title?: string;
    cta?: { text: string; path: string; target?: string; rel?: string };
  },
): HTMLLIElement {
  const li = el('li', {},
    'insytful-search-message flex items-start gap-[24px] w-full max-w-full flex-row',
  );

  const callout = el('div', {},
    'insytful-search-error-callout-inner flex items-start flex-col gap-[12px] p-[16px] border-l-[4px] border-[var(--insytful-callout-error-border)] bg-[var(--insytful-callout-error-bg)] rounded-r-lg max-w-full w-full',
  );

  const content = el('div', {},
    'insytful-search-error-callout-content flex-1 gap-[8px] flex flex-col',
  );

  const title = el('p', {},
    'insytful-search-error-callout-title font-semibold text-[var(--insytful-callout-error-text)] m-0',
  );
  title.textContent = opts?.title ?? 'Something went wrong';

  const text = el('p', {},
    'insytful-search-error-callout-text text-[var(--insytful-callout-error-text)] m-0',
  );
  text.textContent = message;

  content.appendChild(title);
  content.appendChild(text);
  callout.appendChild(content);

  const btnClass =
    'insytful-search-error-callout-btn underline text-[var(--insytful-callout-error-text)] hover:text-[var(--insytful-callout-error-text)]/80 hover:no-underline text-[14px] font-medium';

  const ctaClass =
    'insytful-search-error-callout-cta inline-flex items-center justify-center rounded-[var(--insytful-callout-error-cta-border-radius)] bg-[var(--insytful-callout-error-cta-bg)] px-[16px] py-[8px] text-[14px] font-medium text-[var(--insytful-callout-error-cta-text)] no-underline transition-opacity hover:opacity-90';

  if (opts?.cta) {
    const cta = opts.cta;
    const target = cta.target ?? (cta.path.startsWith('https://www') ? '_blank' : undefined);
    const isExternal = target === '_blank';
    const rel = cta.rel ?? (isExternal ? 'noopener noreferrer' : undefined);

    const linkAttrs: Record<string, string> = { href: cta.path };
    if (target) linkAttrs.target = target;
    if (rel) linkAttrs.rel = rel;

    const link = el('a', linkAttrs, ctaClass);
    link.textContent = cta.text;
    if (isExternal) {
      const srOnly = el('span', {}, 'insytful-sr-only');
      srOnly.textContent = ' (opens in a new tab)';
      link.appendChild(srOnly);
    }
    callout.appendChild(link);
  } else if (onSwitchClassic) {
    const btn = el('button', { type: 'button' }, btnClass);
    btn.textContent = 'Try classic?';
    btn.addEventListener('click', onSwitchClassic);
    callout.appendChild(btn);
  }

  li.appendChild(callout);

  return li;
}

/* ------------------------------------------------------------------ */
/* CTA quick-actions bar                                                */
/* ------------------------------------------------------------------ */

/* Tailwind utility strings for the CTA markup — kept identical to
   search-ctas.tsx so both flavours emit the same class attributes. They MUST
   also live in this file: the WC Tailwind content glob (tailwind.config.wc.js)
   only scans lib/web-component.ts + lib/web-component/**; classes written in
   lib/shared/ would silently produce no CSS. The stable
   `insytful-search-cta-*` hook classes come from the shared view model so
   React/WC parity is structural. Focus-visible ring, icon sizing, and
   entrance animation live in web-component.css. */

const CTA_LABEL_UTILITIES =
  'text-[13px] leading-[20px] mb-[6px] text-[var(--insytful-cta-label-text)]';

const CTA_BAR_UTILITIES =
  'flex flex-wrap gap-[var(--insytful-cta-bar-gap)] max-w-full';

const CTA_CHIP_BASE_CLASSES =
  'inline-flex items-center gap-[6px] min-h-[44px] max-w-full whitespace-normal ' +
  'py-[10px] px-[18px] text-[14px] leading-[24px] font-medium no-underline ' +
  'cursor-pointer transition-colors rounded-[var(--insytful-cta-radius)] ' +
  'border border-solid';

/** Intent variants — only `primary` gets the solid fill (§9 hierarchy rule). */
const CTA_CHIP_INTENT_CLASSES: Record<Cta['intent'], string> = {
  primary:
    'bg-[var(--insytful-cta-primary-bg-default)] hover:bg-[var(--insytful-cta-primary-bg-hover)] ' +
    'text-[var(--insytful-cta-primary-text)] border-[var(--insytful-cta-primary-border)]',
  secondary:
    'bg-[var(--insytful-cta-secondary-bg-default)] hover:bg-[var(--insytful-cta-secondary-bg-hover)] ' +
    'text-[var(--insytful-cta-secondary-text)] border-[var(--insytful-cta-secondary-border)]',
};

/** Module counter for unique `aria-labelledby` ids (no React.useId here). */
let ctaLabelIdCounter = 0;

/**
 * Create one CTA chip — an `<a>` for call/email/link (native navigation is
 * the default path) or a `<button type="button">` for event CTAs (D7).
 * Mirrors `CtaChip` in search-ctas.tsx.
 */
function renderCtaChip(cta: Cta, onCtaClick: (cta: Cta) => void): HTMLElement {
  const vm = ctaViewModel(cta);
  const chipClass = `${vm.classes.btn} ${CTA_CHIP_BASE_CLASSES} ${CTA_CHIP_INTENT_CLASSES[vm.intent]}`;

  let chip: HTMLAnchorElement | HTMLButtonElement;
  if (vm.element === 'a') {
    const attrs: Record<string, string> = { href: vm.href ?? '' };
    if (vm.newTab) {
      attrs.target = '_blank';
      attrs.rel = 'noopener noreferrer';
    }
    chip = el('a', attrs, chipClass);

    // Anchors (call/email/link): native navigation is the default path — it
    // preserves middle-click, copy-link, long-press, and OS handler choice.
    // A registered override intercepts unmodified left-clicks only (D7).
    chip.addEventListener('click', (e: MouseEvent) => {
      onCtaClick(cta);
      const unmodified =
        e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
      if (unmodified && hasCtaHandlerOverride(cta.type)) {
        e.preventDefault();
        executeCta(cta); // runs the override + dispatches `insytful-cta`
      } else {
        // Native navigation proceeds — fire observability only. Calling
        // executeCta here would trigger a second, JS-driven navigation.
        dispatchCtaObservability(cta);
      }
    });
  } else {
    // `event` CTAs have no native action — executeCta dispatches the
    // CMS-named bus event (or a registered override) plus `insytful-cta`.
    chip = el('button', { type: 'button' }, chipClass);
    chip.addEventListener('click', () => {
      onCtaClick(cta);
      executeCta(cta);
    });
  }

  // Icon SVG strings are our own constants (lib/shared/cta/icons.ts) — never
  // CMS data — so innerHTML is safe here. External-link glyph trails
  // ("leaves this page" grammar); all others lead.
  const iconTrails = vm.iconKey === 'external';
  let iconSpan: HTMLSpanElement | null = null;
  if (vm.iconSvg) {
    iconSpan = el(
      'span',
      { 'aria-hidden': 'true' },
      `insytful-search-cta-icon inline-flex flex-shrink-0 ${iconTrails ? 'mr-[-4px]' : 'ml-[-4px]'}`,
    );
    iconSpan.innerHTML = vm.iconSvg;
  }

  if (iconSpan && !iconTrails) chip.appendChild(iconSpan);

  // Label via textContent ONLY — CMS markup must render literally.
  chip.appendChild(document.createTextNode(vm.label));

  if (vm.srNewTabSuffix) {
    const srOnly = el('span', {}, 'insytful-sr-only');
    srOnly.textContent = ' (opens in a new tab)';
    chip.appendChild(srOnly);
  }

  if (iconSpan && iconTrails) chip.appendChild(iconSpan);

  return chip;
}

/**
 * Create the CTA quick-actions row rendered above an assistant answer.
 * Mirrors `lib/search/search-ctas.tsx` via the shared `ctaViewModel`.
 *
 * A11y (§10):
 * - the wrapper is `aria-live="off"` so the messages list's ancestor
 *   `aria-live="polite"` region never announces interactive content as flat
 *   prose;
 * - availability is announced instead via a one-shot visually-hidden
 *   `role="status"` node ("N quick actions available");
 * - the row is `role="group"` labelled by the visible "Quick actions"
 *   micro-label (`aria-labelledby`, unique id via a module counter);
 * - every chip is a separate tab stop — no roving tabindex.
 *
 * The caller inserts the returned element as a SIBLING of the assistant
 * message's content div (above it), so streaming innerHTML rewrites cannot
 * destroy the row or its keyboard focus.
 */
export function renderCtaBar(
  ctas: Cta[],
  opts: { onCtaClick(cta: Cta): void },
): HTMLElement {
  const wrapper = el('div', { 'aria-live': 'off' }, 'insytful-search-cta-outer mb-[16px]');

  // One-shot availability cue for screen readers (see A11y notes above).
  // The node mounts empty and the text lands on a macrotask, so screen
  // readers see a live-region *change* (mirrors search-ctas.tsx's effect).
  const status = el('div', { role: 'status' }, 'insytful-sr-only');
  wrapper.appendChild(status);
  const announcement = `${ctas.length} quick action${ctas.length === 1 ? '' : 's'} available`;
  setTimeout(() => {
    status.textContent = announcement;
  }, 0);

  const labelId = `insytful-search-cta-label-${++ctaLabelIdCounter}`;
  const label = el('div', { id: labelId }, `${CTA_LABEL_CLASS} ${CTA_LABEL_UTILITIES}`);
  label.textContent = 'Quick actions';
  wrapper.appendChild(label);

  const bar = el('div', {
    'role': 'group',
    'aria-labelledby': labelId,
  }, `${CTA_BAR_CLASS} ${CTA_BAR_UTILITIES}`);

  for (const cta of ctas) {
    bar.appendChild(renderCtaChip(cta, opts.onCtaClick));
  }
  wrapper.appendChild(bar);

  return wrapper;
}
