/** @odoo-module **/

import { createWebClient, doAction, getActionManagerServerData } from "./../helpers";
import { session } from "@web/session";

let serverData;

QUnit.module("ActionManager", (hooks) => {
    hooks.beforeEach(() => {
        serverData = getActionManagerServerData();
    });

    QUnit.module("Server actions");

    QUnit.test("can execute server actions from db ID", async function (assert) {
        assert.expect(13);
        const mockRPC = async (route, args) => {
            assert.step((args && args.method) || route);
            if (route === "/web/action/run") {
                assert.strictEqual(args.context.lang, session.user_context.lang);
                assert.strictEqual(args.context.tz, session.user_context.tz);
                assert.strictEqual(args.context.uid, session.uid);
                assert.strictEqual(args.action_id, 2, "should call the correct server action");
                return Promise.resolve(1); // execute action 1
            }
        };
        const webClient = await createWebClient({ serverData, mockRPC });
        await doAction(webClient, 2);
        assert.containsOnce(webClient, ".o_control_panel", "should have rendered a control panel");
        assert.containsOnce(webClient, ".o_kanban_view", "should have rendered a kanban view");
        assert.verifySteps([
            "/web/webclient/load_menus",
            "/web/action/load",
            "/web/action/run",
            "/web/action/load",
            "load_views",
            "/web/dataset/search_read",
        ]);
    });

    QUnit.test("handle server actions returning false", async function (assert) {
        assert.expect(10);
        const mockRPC = async (route, args) => {
            assert.step((args && args.method) || route);
            if (route === "/web/action/run") {
                return Promise.resolve(false);
            }
        };
        const webClient = await createWebClient({ serverData, mockRPC });
        // execute an action in target="new"
        function onClose() {
            assert.step("close handler");
        }
        await doAction(webClient, 5, { onClose });
        assert.containsOnce(
            document.body,
            ".o_technical_modal .o_form_view",
            "should have rendered a form view in a modal"
        );
        // execute a server action that returns false
        await doAction(webClient, 2);
        assert.containsNone(document.body, ".o_technical_modal", "should have closed the modal");
        assert.verifySteps([
            "/web/webclient/load_menus",
            "/web/action/load",
            "load_views",
            "onchange",
            "/web/action/load",
            "/web/action/run",
            "close handler",
        ]);
    });
});
