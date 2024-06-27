import { expect, test } from "@odoo/hoot";
import { click, press, waitFor } from "@odoo/hoot-dom";
import { loadBundle } from "@web/core/assets";
import { setupEditor } from "./_helpers/editor";
import { getContent } from "./_helpers/selection";
import { insertText, undo } from "./_helpers/user_actions";

test("add an emoji with powerbox", async () => {
    const { el, editor } = await setupEditor("<p>ab[]</p>");
    await loadBundle("web.assets_emoji");

    expect(".o-EmojiPicker").toHaveCount(0);
    expect(getContent(el)).toBe("<p>ab[]</p>");

    insertText(editor, "/emoji");
    press("enter");
    await waitFor(".o-EmojiPicker");
    expect(".o-EmojiPicker").toHaveCount(1);

    await click(".o-EmojiPicker .o-Emoji");
    expect(getContent(el)).toBe("<p>ab😀[]</p>");
});

test("undo an emoji", async () => {
    const { el, editor } = await setupEditor("<p>ab[]</p>");
    await loadBundle("web.assets_emoji");
    expect(getContent(el)).toBe("<p>ab[]</p>");

    insertText(editor, "test");
    insertText(editor, "/emoji");
    press("enter");
    await waitFor(".o-EmojiPicker");
    await click(".o-EmojiPicker .o-Emoji");
    expect(getContent(el)).toBe("<p>abtest😀[]</p>");

    undo(editor);
    expect(getContent(el)).toBe("<p>abtest[]</p>");
});
