import { lockWebsocketConnect } from "@bus/../tests/bus_test_helpers";
import { patchWebsocketWorkerWithCleanup } from "@bus/../tests/mock_websocket";
import { describe, expect, test } from "@odoo/hoot";
import { runAllTimers, waitFor, waitUntil } from "@odoo/hoot-dom";
import { mountWithCleanup } from "@web/../tests/web_test_helpers";
import { WebClient } from "@web/webclient/webclient";

describe.current.tags("desktop");

test("show warning when bus connection encounters issues", async () => {
    patchWebsocketWorkerWithCleanup();
    const unlock = await lockWebsocketConnect();
    const { env } = await mountWithCleanup(WebClient);
    await env.services.bus_service.start();
    let alert = await waitFor(".o-bus-ConnectionAlert", { timeout: 2000 });
    expect(alert).toHaveText("Real-time connection is unstable...");
    await runAllTimers();
    alert = await waitFor(".o-bus-ConnectionAlert:contains(Real-time connection lost...)");
    expect(alert).toHaveText("Real-time connection lost...");
    unlock();
    await runAllTimers();
    await waitUntil(() => !document.querySelector(".o-bus-ConnectionAlert"));
});
