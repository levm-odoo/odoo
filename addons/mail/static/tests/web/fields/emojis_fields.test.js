import { expect, test } from "@odoo/hoot";
import {
    models,
    fields,
    defineModels,
    mountView,
    makeMockServer,
} from "@web/../tests/web_test_helpers";
import { defineMailModels, contains, click } from "@mail/../tests/mail_test_helpers";
import { animationFrame, queryFirst, queryOne } from "@odoo/hoot-dom";

/**
 * Check that the emoji button is visible
 *
 * @param {object} assert the assert object passed by QUnit
 * @param {string} emojiComponentSelector unique selector to get the component template root (e.g. "o_field_text_emojis")
 */
async function testEmojiButtonVisible(selector) {
    await contains(".o_form_editable");
    await animationFrame();
    await contains(selector);
    await contains(`${selector} button`);
    await contains(`${selector} button .oi-smile-add`);
}

/**
 * Quick test to make sure basic functionalities work for fields that use emoji_text_field_view.
 *
 * @param {object} assert the assert object passed by QUnit
 * @param {HTMLElement} input a reference to the input element (input[type="text"], textarea, ...)
 * @param {HTMLElement} button a reference to the trigger button element
 */
async function testEmojiButton(input, button) {
    // emoji picker opens
    await click(button);
    await contains(".o-EmojiPicker");
    // clicking an emoji adds it to the input field
    const emoji_1 = queryFirst(".o-EmojiPicker-content .o-Emoji");
    const emojiChar_1 = emoji_1.textContent;
    await click(emoji_1);
    // assert.ok(input.value.endsWith(emojiChar_1));
    expect(input.value).toInclude(emojiChar_1);
    // add some text at the start and select from the second half of the word to right before the emoji we just inserted
    input.value = "test" + input.value;
    input.setSelectionRange(2, input.value.length - emojiChar_1.length);
    // pick an emoji while the text is selected
    await click(button);
    const emoji_2 = queryFirst(".o-EmojiPicker-content .o-Emoji");
    const emojiChar_2 = emoji_2.textContent;
    await click(emoji_2);
    // the selected region is replaced and the rest stays in place
    expect(input.value).toBe("te" + emojiChar_2 + emojiChar_1);
}

class FieldsCharEmojisUser extends models.Model {
    _name = "fields.char.emojis.user";

    foo = fields.Char({});

    _views = {
        form: /* xml */ `
            <form>
                <field name="foo" widget="char_emojis"/>
            </form>
        `,
    };
}

class FieldsTextEmojisUser extends models.Model {
    _name = "fields.text.emojis.user";

    foo = fields.Char({});

    _views = {
        form: /* xml */ `
            <form>
                <field name="foo" widget="text_emojis"/>
            </form>
        `,
    };
}

defineModels([FieldsCharEmojisUser, FieldsTextEmojisUser]);
defineMailModels();

async function openTestView(model) {
    const { env: pyEnv } = await makeMockServer();
    const recordId = pyEnv[model].create({
        display_name: "test record",
        foo: "test",
    });
    const openViewArgs = {
        resId: recordId,
        resModel: model,
        type: "form",
    };
    await mountView(openViewArgs);
}

test("Field char emoji: emojis button is shown", async () => {
    await openTestView("fields.char.emojis.user");
    await testEmojiButtonVisible(".o_field_char_emojis");
});

test("Field char emoji: emojis button works", async (assert) => {
    await openTestView("fields.char.emojis.user");
    const input = queryOne(".o_field_char_emojis input[type='text']");
    const emojiButton = queryOne(".o_field_char_emojis button");
    await testEmojiButton(input, emojiButton);
});

test("Field text emojis: emojis button is shown", async () => {
    await openTestView("fields.text.emojis.user");
    await testEmojiButtonVisible(".o_field_text_emojis");
});

test("Field text emojis: emojis button works", async (assert) => {
    await openTestView("fields.text.emojis.user");
    const input = queryOne(".o_field_text_emojis textarea");
    const emojiButton = queryOne(".o_field_text_emojis button");
    await testEmojiButton(input, emojiButton);
});
