import * as React from 'react'
import type ReactReconciler from 'react-reconciler'

/**
 * Represents a react-internal Fiber node.
 */
export type Fiber<T = any> = Omit<ReactReconciler.Fiber, 'stateNode'> & { stateNode: T }

/**
 * Represents a {@link Fiber} node selector for traversal.
 */
export type FiberSelector<T = any> = (
  /** The current {@link Fiber} node. */
  node: Fiber<T | null>,
) => boolean | void

/**
 * Traverses up or down a {@link Fiber}, return `true` to stop and select a node.
 */
export function traverseFiber<T = any>(
  /** Input {@link Fiber} to traverse. */
  fiber: Fiber,
  /** Whether to ascend and walk up the tree. Will walk down if `false`. */
  ascending: boolean,
  /** A {@link Fiber} node selector, returns the first match when `true` is passed. */
  selector: FiberSelector<T>,
): Fiber<T> | undefined {
  if (selector(fiber) === true) return fiber

  let child = ascending ? fiber.return : fiber.child
  while (child) {
    const match = traverseFiber(child, ascending, selector)
    if (match) return match

    child = child.sibling
  }
}

interface ReactInternal {
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
    ReactCurrentOwner: React.RefObject<Fiber>
  }
}

const { ReactCurrentOwner } = (React as unknown as ReactInternal).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED

/**
 * Returns the current react-internal {@link Fiber}. This is an implementation detail of [react-reconciler](https://github.com/facebook/react/tree/main/packages/react-reconciler).
 */
export function useFiber(): Fiber<null> {
  const [fiber] = React.useState<Fiber<null>>(() => ReactCurrentOwner.current!)
  return fiber
}

/**
 * Represents a react-reconciler container instance.
 */
export interface ContainerInstance<T = any> {
  containerInfo: T
}

/**
 * Returns the current react-reconciler container info passed to {@link ReactReconciler.Reconciler.createContainer}.
 *
 * In react-dom, a container will point to the root DOM element; in react-three-fiber, it will point to the root Zustand store.
 */
export function useContainer<T = any>(): T {
  const fiber = useFiber()
  const root = React.useMemo(
    () => traverseFiber<ContainerInstance<T>>(fiber, true, (node) => node.stateNode?.containerInfo != null),
    [fiber],
  )

  return root!.stateNode.containerInfo
}

/**
 * Returns the nearest react-reconciler child instance or the node created from {@link ReactReconciler.HostConfig.createInstance}.
 *
 * In react-dom, this would be a DOM element; in react-three-fiber this would be an instance descriptor.
 */
export function useNearestChild<T = any>(
  /** An optional element type to filter to. */
  type?: keyof JSX.IntrinsicElements,
): React.MutableRefObject<T | undefined> {
  const fiber = useFiber()
  const childRef = React.useRef<T>()

  React.useLayoutEffect(() => {
    childRef.current = traverseFiber<T>(
      fiber,
      false,
      (node) => typeof node.type === 'string' && (type === undefined || node.type === type),
    )?.stateNode
  }, [fiber])

  return childRef
}

/**
 * Returns the nearest react-reconciler parent instance or the node created from {@link ReactReconciler.HostConfig.createInstance}.
 *
 * In react-dom, this would be a DOM element; in react-three-fiber this would be an instance descriptor.
 */
export function useNearestParent<T = any>(
  /** An optional element type to filter to. */
  type?: keyof JSX.IntrinsicElements,
): React.MutableRefObject<T | undefined> {
  const fiber = useFiber()
  const parentRef = React.useRef<T>()

  React.useLayoutEffect(() => {
    parentRef.current = traverseFiber<T>(
      fiber,
      true,
      (node) => typeof node.type === 'string' && (type === undefined || node.type === type),
    )?.stateNode
  }, [fiber])

  return parentRef
}

/**
 * Represents a react-context bridge provider component.
 */
export type ContextBridge = React.FC<React.PropsWithChildren<{}>>

/**
 * React Context currently cannot be shared across [React renderers](https://reactjs.org/docs/codebase-overview.html#renderers) but explicitly forwarded between providers (see [react#17275](https://github.com/facebook/react/issues/17275)). This hook returns a {@link ContextBridge} of live context providers to pierce Context across renderers.
 *
 * Pass {@link ContextBridge} as a component to a secondary renderer to enable context-sharing within its children.
 */
export function useContextBridge(): ContextBridge {
  const fiber = useFiber()
  const contexts = React.useMemo(() => {
    const unique: React.Context<any>[] = []

    traverseFiber(fiber, true, (node) => {
      const context = node.type?._context
      if (!context || unique.includes(context)) return

      // In development, React will warn about using contexts between renderers because
      // of the above issue. We'll hide the warning because this hook works as expected
      // https://github.com/facebook/react/pull/12779
      Object.defineProperties(context, {
        _currentRenderer: {
          get() {
            return null
          },
          set() {},
        },
        _currentRenderer2: {
          get() {
            return null
          },
          set() {},
        },
      })

      unique.push(context)
    })

    return unique
  }, [fiber])

  return contexts.reduce(
    (Prev, context) => {
      const value = React.useContext(context)
      return (props) => (
        <Prev>
          <context.Provider {...props} value={value} />
        </Prev>
      )
    },
    (props) => <React.Fragment {...props} />,
  )
}
