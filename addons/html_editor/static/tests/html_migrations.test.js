import { describe, expect, test } from "@odoo/hoot";
import { defineModels, fields, models, mountView } from "@web/../tests/web_test_helpers";

class Partner extends models.Model {
    txt = fields.Html({ trim: true });
    name = fields.Char();

    _records = [
        {
            id: 1,
            name: "first",
            txt: `<p>Hello World</p><div data-embedded="draw" data-embedded-props='{"source": "https://excalidraw.com"}'/>`,
        },
    ];
}

defineModels([Partner]);

describe("test the migration process", () => {
    test("In html field", async () => {
        await mountView({
            type: "form",
            resId: 1,
            resModel: "partner",
            arch: `
                <form>
                    <field name="txt" widget="html"/>
                </form>`,
        });
        expect("[data-embedded='draw']").toHaveCount(0);
        expect("a[href='https://excalidraw.com']").toHaveCount(1);
    });
    test("In html viewer", async () => {
        await mountView({
            type: "form",
            resId: 1,
            resModel: "partner",
            arch: `
                <form>
                    <field name="txt" widget="html" readonly="1"/>
                </form>`,
        });
        expect("[data-embedded='draw']").toHaveCount(0);
        expect("a[href='https://excalidraw.com']").toHaveCount(1);
    });
});
