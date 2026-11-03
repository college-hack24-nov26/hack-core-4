import { useTwinStore } from './useTwinStore';
import { scenarioService, validateParams } from '../services/scenarioService';

const DEBOUNCE_MS = 250;

/**
 * Keeps `activeResult` in sync with the scenario parameters: re-runs the scenario (debounced) whenever the
 * parameters or the base state change. Invalid parameters do not run; their errors are exposed as `paramErrors`.
 */
export function startLiveScenario(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let token = 0;

  const run = async () => {
    const { base, params } = useTwinStore.getState();
    if (!base) return;
    const errors = validateParams(params);
    useTwinStore.setState({ paramErrors: errors });
    if (errors.length > 0) return;
    const mine = ++token;
    try {
      const result = await scenarioService.run(base, params);
      if (mine === token) useTwinStore.setState({ activeResult: result });
    } catch (e) {
      if (mine === token) {
        useTwinStore.setState({
          paramErrors: [e instanceof Error ? e.message : 'The scenario could not be run.'],
        });
      }
    }
  };

  const unsubscribe = useTwinStore.subscribe((s, prev) => {
    if (s.runNonce !== prev.runNonce) {
      clearTimeout(timer);
      void run();
    } else if (s.params !== prev.params || s.base !== prev.base) {
      clearTimeout(timer);
      timer = setTimeout(() => void run(), DEBOUNCE_MS);
    }
  });

  // First run for whatever is already loaded.
  if (useTwinStore.getState().base) void run();

  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}
