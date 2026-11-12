// Each scenario has a fresh Vitest fork: Next caches renderers for a process lifetime.
import { registerLoginScenario } from "../helpers/test-login-scenarios";
registerLoginScenario(0);
