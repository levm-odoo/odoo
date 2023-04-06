/** @odoo-module **/

import { AbstractAction } from "@web/legacy/js/chrome/abstract_action";
import * as core from "@web/legacy/js/services/core";
import testUtils from "web.test_utils";
import Widget from "web.Widget";

import { dialogService } from "@web/core/dialog/dialog_service";
import { errorService } from "@web/core/errors/error_service";
import { registry } from "@web/core/registry";
import { getFixture, nextTick, patchWithCleanup } from "@web/../tests/helpers/utils";
import { createWebClient, doAction } from "@web/../tests/webclient/helpers";

QUnit.module('core', {}, function () {

    QUnit.module('mixins');

    QUnit.test('perform a do_action properly', function (assert) {
        assert.expect(3);
        var done = assert.async();

        var widget = new Widget();

        testUtils.mock.intercept(widget, 'do_action', function (event) {
            assert.strictEqual(event.data.action, 'test.some_action_id',
                "should have sent proper action name");
            assert.deepEqual(event.data.options, {clear_breadcrumbs: true},
                "should have sent proper options");
            event.data.on_success();
        });

        widget.do_action('test.some_action_id', {clear_breadcrumbs: true}).then(function () {
            assert.ok(true, 'deferred should have been resolved');
            widget.destroy();
            done();
        });
    });

    QUnit.test('checks that the error generated by a do_action opens one dialog', async function (assert) {
        assert.expect(1);

        window.addEventListener("unhandledrejection", async (ev) => {
            ev.preventDefault();
        });
        patchWithCleanup(QUnit, {
            onUnhandledRejection: () => {},
        });

        const serviceRegistry = registry.category("services");
        serviceRegistry.add("dialog", dialogService);
        serviceRegistry.add("error", errorService);

        const TestAction = AbstractAction.extend({
            on_attach_callback() {
                this.do_action({
                    id: 1,
                    type: "ir.actions.server",
                })
            },
        });
        core.action_registry.add("TestAction", TestAction);

        const mockRPC = (route) => {
            if (route === "/web/action/run") {
                throw new Error("This error should be throw only once");
            }
        };
        const target = getFixture();
        const webClient = await createWebClient({ mockRPC});
        await doAction(webClient, "TestAction");
        await nextTick();
        assert.containsOnce(target, ".o_dialog");
    });
});
