/*
 * Dichiarazioni minime di React usate da questo progetto.
 * Sostituiscono il pacchetto @types/react per mantenere le dipendenze al minimo:
 * coprono solo le API effettivamente utilizzate nel codice.
 */
declare module 'react' {
  export type Key = string | number | bigint;
  export interface ReactElement { type: unknown; props: unknown; key: string | null }
  export type ReactNode = ReactElement | string | number | bigint | boolean | null | undefined | Iterable<ReactNode>;
  export type SetStateAction<S> = S | ((prev: S) => S);
  export type Dispatch<A> = (value: A) => void;
  export function useState<S>(initial: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useLayoutEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useDeferredValue<T>(value: T): T;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export function useCallback<T extends (...args: never[]) => unknown>(cb: T, deps: readonly unknown[]): T;
  export interface RefObject<T> { current: T }
  export function useRef<T>(initial: T): RefObject<T>;
  export function useId(): string;
  export interface Context<T> { Provider: (props: { value: T; children?: ReactNode }) => ReactNode }
  export function createContext<T>(defaultValue: T): Context<T>;
  export function useContext<T>(c: Context<T>): T;
  export const Fragment: (props: { children?: ReactNode }) => ReactNode;
  export const StrictMode: (props: { children?: ReactNode }) => ReactNode;
  export function startTransition(cb: () => void): void;

  interface BaseEvent<T> {
    currentTarget: T; target: EventTarget & T;
    preventDefault(): void; stopPropagation(): void;
  }
  export interface SyntheticEvent<T = Element> extends BaseEvent<T> {}
  export interface ChangeEvent<T = Element> extends BaseEvent<T> {}
  export interface FormEvent<T = Element> extends BaseEvent<T> {}
  export interface FocusEvent<T = Element> extends BaseEvent<T> { relatedTarget: EventTarget | null }
  export interface KeyboardEvent<T = Element> extends BaseEvent<T> {
    key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean;
  }
  export interface MouseEvent<T = Element> extends BaseEvent<T> { clientX: number; clientY: number; button: number }
  export interface DragEvent<T = Element> extends MouseEvent<T> { dataTransfer: DataTransfer }

  /** Proprietà degli elementi HTML/SVG: gestori di eventi tipizzati, altri attributi liberi. */
  export interface DOMProps<T> {
    [attributo: string]: unknown;
    onChange?(e: ChangeEvent<T>): void;
    onInput?(e: ChangeEvent<T>): void;
    onClick?(e: MouseEvent<T>): void;
    onMouseDown?(e: MouseEvent<T>): void;
    onMouseEnter?(e: MouseEvent<T>): void;
    onMouseLeave?(e: MouseEvent<T>): void;
    onKeyDown?(e: KeyboardEvent<T>): void;
    onSubmit?(e: FormEvent<T>): void;
    onFocus?(e: FocusEvent<T>): void;
    onBlur?(e: FocusEvent<T>): void;
    onDragOver?(e: DragEvent<T>): void;
    onDrop?(e: DragEvent<T>): void;
  }
}

declare module 'react-dom/client' {
  export function createRoot(el: Element): { render(node: import('react').ReactNode): void };
}

declare module 'react/jsx-runtime' {
  export namespace JSX {
    type Element = import('react').ReactElement;
    type ElementType = string | ((props: any) => import('react').ReactNode);
    interface IntrinsicElements {
      [tag: string]: import('react').DOMProps<HTMLElement>;
      input: import('react').DOMProps<HTMLInputElement>;
      select: import('react').DOMProps<HTMLSelectElement>;
      textarea: import('react').DOMProps<HTMLTextAreaElement>;
      form: import('react').DOMProps<HTMLFormElement>;
      button: import('react').DOMProps<HTMLButtonElement>;
    }
    interface IntrinsicAttributes { key?: import('react').Key | null }
    interface ElementChildrenAttribute { children: {} }
  }
  export const jsx: unknown;
  export const jsxs: unknown;
  export const Fragment: unknown;
}

declare module 'react-icons/lu' {
  type Icon = (props: { className?: string; size?: number | string; 'aria-hidden'?: boolean; title?: string }) => import('react').ReactNode;
  export const LuLayoutDashboard: Icon; export const LuArrowRightLeft: Icon; export const LuUndo2: Icon;
  export const LuHistory: Icon; export const LuStore: Icon; export const LuGift: Icon; export const LuChartColumn: Icon;
  export const LuDownload: Icon; export const LuSettings: Icon; export const LuRefreshCw: Icon; export const LuPlus: Icon;
  export const LuSearch: Icon; export const LuX: Icon; export const LuCheck: Icon; export const LuPencil: Icon;
  export const LuBan: Icon; export const LuRotateCcw: Icon; export const LuUpload: Icon; export const LuFileDown: Icon;
  export const LuTriangleAlert: Icon; export const LuInfo: Icon; export const LuChevronDown: Icon; export const LuChevronUp: Icon;
  export const LuChevronLeft: Icon; export const LuChevronRight: Icon; export const LuArrowUpDown: Icon; export const LuLoader: Icon;
  export const LuDatabaseBackup: Icon; export const LuCloudUpload: Icon; export const LuLink: Icon; export const LuMail: Icon;
  export const LuEraser: Icon; export const LuPackage: Icon; export const LuPackagePlus: Icon; export const LuWarehouse: Icon; export const LuCircleCheck: Icon; export const LuCircleAlert: Icon;
  export const LuArrowLeftRight: Icon; export const LuFilter: Icon; export const LuExternalLink: Icon;
  export const LuCopy: Icon; export const LuFileSpreadsheet: Icon; export const LuSearchCheck: Icon; export const LuMenu: Icon;
}

declare const __APP_VERSION__: string;
