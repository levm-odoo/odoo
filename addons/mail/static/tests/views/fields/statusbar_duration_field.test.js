import { expect, test } from "@odoo/hoot";
import { models, fields, defineModels, mountView } from "@web/../tests/web_test_helpers";
import { defineMailModels } from "@mail/../tests/mail_test_helpers";
import { queryOne, queryAll } from "@odoo/hoot-dom";

class Stage extends models.Model {
    _name = "stage_model";

    name = fields.Char({ string: "Stage name" });

    _records = [
        { id: 10, display_name: "New" },
        { id: 20, display_name: "Qualified" },
        { id: 30, display_name: "Proposition" },
        { id: 40, display_name: "Won" },
    ];
}

class Partner extends models.Model {
    _name = "partner";

    display_name = fields.Char({ string: "Disply Name" });
    stage_id = fields.Many2one({ string: "Stage", relation: "stage_model" });
    duration_tracking = fields.Char({
        string: "Time per stage",
        default: "{}",
    });
    _records = [
        {
            id: 1,
            display_name: "first record",
            stage_id: 30,
            duration_tracking: {
                10: 7 * 24 * 60 * 60 + 30 * 60,
                20: 3 * 60 * 60,
                40: 24 * 2 * 60 * 60 + 5 * 60 * 60,
            },
        },
    ];
}

defineMailModels();
defineModels([Stage, Partner]);

test("StatusBarDurationField in a form view", async () => {
    await mountView({
        resModel: "partner",
        type: "form",
        resId: 1,
        arch: /* xml */ `
                <form>
                    <header>
                        <field name="stage_id" widget="statusbar_duration" />
                    </header>
                </form>
        `,
    });

    expect(queryOne("button[data-value='10'").innerText).toBe("New7d");
    expect(queryAll("button[data-value='10' span")[1].title).toBe("7 days, 30 minutes");

    expect(queryOne("button[data-value='20']").innerText).toBe("Qualified3h");
    expect(queryAll("button[data-value='20' span")[1].title).toBe("3 hours");

    expect(queryOne("button[data-value='30'").innerText).toBe("Proposition");
    expect(queryAll("button[data-value='30' span")[1].title).toBe("");

    expect(queryOne("button[data-value='40'").innerText).toBe("Won2d");
    expect(queryAll("button[data-value='40' span")[1].title).toBe("2 days, 5 hours");
});
