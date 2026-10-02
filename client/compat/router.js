/** Preserve YApi's extension route contract using the maintained React Router engine. */
import React from 'react';
import { createBrowserRouter, RouterProvider, useLocation, useNavigate, useBlocker, matchPath as modernMatchPath, Link, Navigate } from 'router-modern';
export { Link };
const RouteContext = React.createContext(null);
const RouterContentContext = React.createContext(null);
const ConfirmationContext = React.createContext(null);
function RouterContent() { return React.useContext(RouterContentContext); }
export function BrowserRouter({ children, getUserConfirmation }) {
  const [router] = React.useState(() => createBrowserRouter([{ path: '*', element: <RouterContent /> }]));
  React.useEffect(() => () => router.dispose(), [router]);
  return <ConfirmationContext.Provider value={getUserConfirmation}><RouterContentContext.Provider value={children}><RouterProvider router={router} /></RouterContentContext.Provider></ConfirmationContext.Provider>;
}
export function matchPath(pathname, options = {}) {
  if (typeof options === 'string') options = { path: options };
  const paths = Array.isArray(options.path) ? options.path : [options.path || '*'];
  for (const path of paths) {
    const match = modernMatchPath({ path, end: !!options.exact, caseSensitive: !!options.sensitive }, pathname);
    if (match) return { params: match.params, path, url: match.pathname, isExact: match.pathname.replace(/\/$/, '') === pathname.replace(/\/$/, '') };
  }
  return null;
}
function useLegacyRouter() {
  const location = useLocation();
  const navigate = useNavigate();
  const inherited = React.useContext(RouteContext);
  const ready = React.useRef(false);
  const queued = React.useRef([]);
  React.useLayoutEffect(() => { ready.current = true; for (const operation of queued.current.splice(0)) operation(); return () => { ready.current = false; queued.current = []; }; }, []);
  const move = (...args) => { const operation = () => navigate(...args); if (ready.current) operation(); else queued.current.push(operation); };
  const history = React.useMemo(() => ({
    push: (to, state) => move(to, { state }), replace: (to, state) => move(to, { replace: true, state }),
    go: amount => move(amount), goBack: () => move(-1), goForward: () => move(1), location
  }), [navigate, location]);
  return { history, location, match: inherited || matchPath(location.pathname, { path: '/' }) };
}
export function Route({ path, exact, sensitive, component: Component, render, children, computedMatch }) {
  const router = useLegacyRouter();
  const match = computedMatch || (path ? matchPath(router.location.pathname, { path, exact, sensitive }) : router.match);
  const props = { ...router, match };
  if (!match) return typeof children === 'function' ? children(props) : null;
  return <RouteContext.Provider value={match}>{Component ? <Component {...props} /> : render ? render(props) : typeof children === 'function' ? children(props) : children}</RouteContext.Provider>;
}
export function Switch({ children }) {
  const location = useLocation();
  const candidates = React.Children.toArray(children).filter(React.isValidElement);
  for (const child of candidates) {
    const path = child.props.path || child.props.from;
    const match = path ? matchPath(location.pathname, { ...child.props, path }) : { params: {}, url: location.pathname, path: '*', isExact: true };
    if (match) return React.cloneElement(child, { computedMatch: match });
  }
  return null;
}
export function Redirect({ to, push = false }) { return <Navigate to={to} replace={!push} />; }
export function withRouter(Component) {
  const Wrapped = React.forwardRef((props, ref) => <Component {...props} {...useLegacyRouter()} ref={ref} />);
  Wrapped.displayName = `withRouter(${Component.displayName || Component.name || 'Component'})`;
  return Wrapped;
}
export function Prompt({ when = true, message }) {
  const confirm = React.useContext(ConfirmationContext);
  const blocker = useBlocker(when);
  React.useEffect(() => {
    if (blocker.state !== 'blocked') return;
    const text = typeof message === 'function' ? message(blocker.location) : message;
    if (text === true) { blocker.proceed(); return; }
    if (text === false) { blocker.reset(); return; }
    const done = allowed => allowed ? blocker.proceed() : blocker.reset();
    if (confirm) confirm(text, done); else done(window.confirm(text));
  }, [blocker.state]);
  React.useEffect(() => {
    if (!when) return;
    const handler = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [when]);
  return null;
}
