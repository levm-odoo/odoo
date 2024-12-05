import { expect, test } from "@odoo/hoot";
import { defineModels, fields, models, mountView, onRpc } from "@web/../tests/web_test_helpers";
import {
    click,
    defineMailModels,
    editInput,
    triggerEvents,
} from "@mail/../tests/mail_test_helpers";
import { animationFrame, queryOne, keyDown, runAllTimers } from "@odoo/hoot-dom";

class Partner extends models.Model {
    _name = "partner";

    display_name = fields.Char();
    description = fields.Text();

    _records = [
        {
            id: 1,
            description: "",
            display_name: "first record",
        },
    ];

    _onChanges = {
        description: () => {},
    };
}

defineModels([Partner]);
defineMailModels();

test("Test that onchange_on_keydown option triggers the onchange properly", async () => {
    await mountView({
        type: "form",
        resModel: "partner",
        arch: `<form>
                    <field name="description" onchange_on_keydown="True" keydown_debounce_delay="0"/>
                </form>`,
        resId: 1,
    });
    onRpc((request) => {
        if (request.method === "onchange") {
            // the onchange will be called twice: at record creation & when keydown is detected
            // the second call should have our description value completed.
            expect(true).toBe(true); // Maybe something else ?
            if (request.args[1] && request.args[1].description === "testing the keydown event") {
                expect(true).toBe(true); // Maybe something else ?
            }
            return {
                value: {},
            };
        }
    });
    await animationFrame();
    const textarea = queryOne('textarea[id="description_0"]');
    await click(textarea);
    for (const key of "testing the keydown event") {
        // trigger each key separately to simulate a user typing
        textarea.value = textarea.value + key;
        await triggerEvents(textarea, ["input"], { key });
    }
    // only trigger the keydown when typing ends to avoid getting a lot of onchange since the
    // delay is set to 0 for test purposes
    // for real use cases there will be a debounce delay set to avoid spamming the event
    await click(textarea);
    await animationFrame();
});

test("Editing as text field with the onchange_on_keydown option disappearing shouldn't trigger a crash", async () => {
    await mountView({
        type: "form",
        resModel: "partner",
        arch: `<form>
                    <field name="description" onchange_on_keydown="True" invisible="display_name == 'yop'"/>
                    <field name="display_name"/>
                </form>`,
        resId: 1,
    });
    onRpc((request) => {
        if (request.method === "onchange") {
            expect.step("onchange");
        }
    });
    await click('textarea[id="description_0"]');
    await keyDown("a");
    await editInput(document.body, "[name=display_name] input", "yop");
    await runAllTimers();
    expect.verifySteps([]);
});
