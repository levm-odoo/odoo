import { expect, test } from "@odoo/hoot";
import { models, fields, defineModels, mountView } from "@web/../tests/web_test_helpers";
import { defineMailModels, insertText, click } from "@mail/../tests/mail_test_helpers";
import { queryOne } from "@odoo/hoot-dom";

class MailingMailing extends models.Model {
    _name = "mailing.mailing";

    subject = fields.Char({ string: "Subject" });

    _views = {
        form: /* xml */ `
            <form>
                <field name="subject" widget="char_emojis"/>
            </form>
        `,
    };
}

defineModels([MailingMailing]);
defineMailModels();

test("emojis_char_field tests widget: insert emoji at the end of word", async () => {
    await mountView({
        resModel: "mailing.mailing",
        type: "form",
    });
    await insertText("#subject_0", "Hello");
    expect(queryOne("#subject_0").value).toBe("Hello");

    await click(".o_field_char_emojis button");
    await click(".o-Emoji[data-codepoints='😀']");
    expect(queryOne("#subject_0").value).toBe("Hello😀");
});

test("emojis_char_field_tests widget: insert emoji as new word", async () => {
    await mountView({
        resModel: "mailing.mailing",
        type: "form",
    });
    await insertText("#subject_0", "Hello ");
    expect(queryOne("#subject_0").value).toBe("Hello ");

    await click(".o_field_char_emojis button");
    await click(".o-Emoji[data-codepoints='😀']");
    expect(queryOne("#subject_0").value).toBe("Hello 😀");
});
