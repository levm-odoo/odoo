import {
    busMonitoringservice,
    CONNECTION_STATE,
    STABLE_CONNECTION_TRESHOLD,
} from "@bus/services/bus_monitoring_service";
import { WEBSOCKET_CLOSE_CODES } from "@bus/workers/websocket_worker";
import {
    defineBusModels,
    lockBusServiceStart,
    lockWebsocketConnect,
} from "@bus/../tests/bus_test_helpers";
import { describe, expect, test } from "@odoo/hoot";
import { advanceTime, runAllTimers } from "@odoo/hoot-dom";
import {
    asyncStep,
    makeMockEnv,
    MockServer,
    patchWithCleanup,
    waitForSteps,
} from "@web/../tests/web_test_helpers";
import { browser } from "@web/core/browser/browser";

defineBusModels();
describe.current.tags("desktop");

function stepConnectionStateChanges() {
    patchWithCleanup(busMonitoringservice, {
        start() {
            const api = super.start(...arguments);
            Object.defineProperty(api, "connectionState", {
                get() {
                    return this._connectionState;
                },
                set(value) {
                    if (value === this._connectionState) {
                        return;
                    }
                    this._connectionState = value;
                    asyncStep(value);
                },
                configurable: true,
                enumerable: true,
            });
            return api;
        },
    });
}

test("connection considred as unstable after too many reconnect attempts", async () => {
    stepConnectionStateChanges();
    const unlockBusService = lockBusServiceStart();
    const env = await makeMockEnv();
    env.services.bus_service.addEventListener("connect", () => asyncStep("connect"));
    env.services.bus_service.addEventListener("reconnect", () => asyncStep("reconnect"));
    unlockBusService();
    await env.services.bus_service.start();
    await waitForSteps([CONNECTION_STATE.STABLE, "connect"]);
    const unlockWebsocketConnect = lockWebsocketConnect();
    MockServer.current.env["bus.bus"]._simulateDisconnection(
        WEBSOCKET_CLOSE_CODES.ABNORMAL_CLOSURE
    );
    await waitForSteps([CONNECTION_STATE.UNSTABLE]);
    unlockWebsocketConnect();
    await waitForSteps(["reconnect"]);
    await runAllTimers();
    await waitForSteps([CONNECTION_STATE.STABLE]);
});

test("connection considered as lost when disconnected for too long", async () => {
    stepConnectionStateChanges();
    const unlockBusService = lockBusServiceStart();
    const env = await makeMockEnv();
    env.services.bus_service.addEventListener("connect", () => asyncStep("connect"));
    unlockBusService();
    await env.services.bus_service.start();
    await waitForSteps([CONNECTION_STATE.STABLE, "connect"]);
    lockWebsocketConnect();
    MockServer.current.env["bus.bus"]._simulateDisconnection(
        WEBSOCKET_CLOSE_CODES.ABNORMAL_CLOSURE
    );
    await waitForSteps([CONNECTION_STATE.UNSTABLE]);
    await runAllTimers();
    await waitForSteps([CONNECTION_STATE.LOST]);
});

test("brief disconection not considered as lost neither as unstable", async () => {
    stepConnectionStateChanges();
    const unlockBusService = lockBusServiceStart();
    const env = await makeMockEnv();
    env.services.bus_service.addEventListener("connect", () => asyncStep("connect"));
    env.services.bus_service.addEventListener("reconnect", () => asyncStep("reconnect"));
    unlockBusService();
    await env.services.bus_service.start();
    await waitForSteps([CONNECTION_STATE.STABLE, "connect"]);
    advanceTime(STABLE_CONNECTION_TRESHOLD * 2); // Let the connection live for some time in order for it to be considered stable.
    MockServer.current.env["bus.bus"]._simulateDisconnection(WEBSOCKET_CLOSE_CODES.SESSION_EXPIRED);
    await waitForSteps(["reconnect"]); // Only reconnect step, which means the monitoring state didn't change.
});

test("computer sleep doesn't mark connection as unstable", async () => {
    stepConnectionStateChanges();
    const unlockBusService = lockBusServiceStart();
    const env = await makeMockEnv();
    env.services.bus_service.addEventListener("connect", () => asyncStep("connect"));
    env.services.bus_service.addEventListener("disconnect", () => asyncStep("disconnect"));
    env.services.bus_service.addEventListener("reconnect", () => asyncStep("reconnect"));
    unlockBusService();
    await env.services.bus_service.start();
    await waitForSteps([CONNECTION_STATE.STABLE, "connect"]);
    patchWithCleanup(navigator, { onLine: false });
    browser.dispatchEvent(new Event("offline")); // Offline event is triggered when the computer goes to sleep.
    const unlockWebsocketConnect = lockWebsocketConnect();
    await waitForSteps([null, "disconnect"]);
    patchWithCleanup(navigator, { onLine: true });
    browser.dispatchEvent(new Event("online")); // Online event is triggered when the computer wakes up.
    unlockWebsocketConnect();
    await waitForSteps([CONNECTION_STATE.STABLE, "connect"]);
    expect(env.services.bus_monitoring_service.hasConnectionIssues).toBe(false);
});
