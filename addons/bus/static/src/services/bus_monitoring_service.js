import { WORKER_STATE } from "@bus/workers/websocket_worker";
import { reactive } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { registry } from "@web/core/registry";

const { DateTime } = luxon;

export const CONNECTION_STATE = Object.freeze({
    LOST: "LOST",
    STABLE: "STABLE",
    UNSTABLE: "UNSTABLE",
});
// 5 seconds -- Duration before considering the connection as lost.
export const CONNECTION_LOST_THRESHOLD = 5000;
// 2 minutes -- Minimum time a connection must be kept to be considered stable.
export const STABLE_CONNECTION_TRESHOLD = 120_000;

/**
 * Monitor the communication bus health. Track connection stability and detect
 * lost connections. The bus connection is considered:
 *
 * - `LOST` if no connection could be established for more than
 *   `CONNECTION_LOST_THRESHOLD` following a reconnect attempt.
 * - `UNSTABLE` if the two last connections were shorter than
 *   `STABLE_CONNECTION_TRESHOLD`.
 * - `STABLE` once a connection reaches the `STABLE_CONNECTION_TRESHOLD`.
 */
export class BusMonitoringService {
    connectionState = null;
    lastConnectionDuration = null;
    prevConnectionDuration = null;
    connectionLostTimeout = null;
    connectionStableTimeout = null;

    constructor(env, services) {
        const reactiveThis = reactive(this);
        reactiveThis.setup(env, services);
        return reactiveThis;
    }

    /**
     * @param {import("@web/env").OdooEnv} env
     * @param {Partial<import("services").Services>} services
     */
    setup(env, { bus_service }) {
        bus_service.addEventListener("worker_state_updated", ({ detail }) =>
            this.workerStateOnChange(detail)
        );
        browser.addEventListener("offline", () => {
            // Reseting state when going offline to prevent false positive when
            // waking up from sleep.
            clearTimeout(this.connectionLostTimeout);
            clearTimeout(this.connectionStableTimeout);
            this.connectionLostTimeout = null;
            this.connectionStableTimeout = null;
            this.lastConnectionDuration = null;
            this.prevConnectionDuration = null;
            this.connectionState = null;
        });
    }

    /**
     * Handle state changes for the WebSocket worker.
     *
     * @param {keyof typeof WORKER_STATE} state
     */
    workerStateOnChange(state) {
        if (!navigator.onLine) {
            return;
        }
        switch (state) {
            case WORKER_STATE.CONNECTING: {
                this.connectionLostTimeout ??= browser.setTimeout(
                    () => (this.connectionState = CONNECTION_STATE.LOST),
                    CONNECTION_LOST_THRESHOLD
                );
                break;
            }
            case WORKER_STATE.CONNECTED: {
                browser.clearTimeout(this.connectionLostTimeout);
                browser.clearTimeout(this.connectionStableTimeout);
                this.connectionLostTimeout = null;
                this.connectionStableTimeout = null;
                const unstable =
                    this.prevConnectionDuration >= STABLE_CONNECTION_TRESHOLD &&
                    this.lastConnectionDuration >= STABLE_CONNECTION_TRESHOLD;
                this.connectionState = unstable
                    ? CONNECTION_STATE.STABLE
                    : CONNECTION_STATE.UNSTABLE;
                if (this.connectionState === CONNECTION_STATE.UNSTABLE) {
                    this.connectionStableTimeout = browser.setTimeout(
                        () => (this.connectionState = CONNECTION_STATE.STABLE),
                        STABLE_CONNECTION_TRESHOLD
                    );
                }
                break;
            }
            case WORKER_STATE.DISCONNECTED: {
                this.prevConnectionDuration = this.lastConnectionDuration;
                this.lastConnectionDuration = DateTime.now().toMillis() - this.lastConnectTs;
                break;
            }
        }
    }

    get hasConnectionIssues() {
        return [CONNECTION_STATE.LOST, CONNECTION_STATE.UNSTABLE].includes(this.connectionState);
    }
}

export const busMonitoringservice = {
    dependencies: ["bus_service"],
    start(env, services) {
        return new BusMonitoringService(env, services);
    },
};

registry.category("services").add("bus_monitoring_service", busMonitoringservice);
