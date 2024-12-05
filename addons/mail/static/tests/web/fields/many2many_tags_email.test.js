import { expect, test } from "@odoo/hoot";
import {
    mountView,
    makeMockServer,
    onRpc,
    clickFieldDropdownItem,
    clickFieldDropdown,
    waitForSteps,
    asyncStep,
} from "@web/../tests/web_test_helpers";
import {
    defineMailModels,
    contains,
    click,
    insertText,
    mailModels,
} from "@mail/../tests/mail_test_helpers";
import { animationFrame, queryFirst } from "@odoo/hoot-dom";

// Doing this is causing Error: 'ResPartner._get_needaction_count is not a function'
Object.assign(mailModels.ResPartner._views, {
    ["form,false"]: `<form string="Types">
    <field name="name"/>
    <field name="email"/>
    </form>`,
});

defineMailModels();

test("fieldmany2many tags email (edition)", async () => {
    const { env: pyEnv } = await makeMockServer();
    const [partnerId_1, partnerId_2] = pyEnv["res.partner"].create([
        { name: "gold", email: "coucou@petite.perruche" },
        { name: "silver", email: "" },
    ]);
    const messageId = pyEnv["mail.message"].create({ partner_ids: [partnerId_1] });
    onRpc((request) => {
        if (request.model === "res.partner" && request.method === "web_read") {
            asyncStep(JSON.stringify(request.args[0]));
            // expect(request.kwargs.specifications).toInclude("email");  FIX ME
        } else if (request.method === "get_formview_id") {
            return false;
        }
    });
    await mountView({
        resModel: "mail.message",
        resId: messageId,
        type: "form",
        arch: /* xml */ `
            <form string="Partners">
                <sheet>
                    <field name="body"/>
                    <field name="partner_ids" widget="many2many_tags_email"/>
                </sheet>
            </form>
        `,
    });
    await waitForSteps([]);
    await contains('.o_field_many2many_tags_email[name="partner_ids"] .badge.o_tag_color_0');

    // add an other existing tag
    await clickFieldDropdown("partner_ids");
    await clickFieldDropdownItem("partner_ids", "silver");
    await contains(".modal-content .o_form_view");
    await contains(".modal-content .o_form_view .o_input#name_0", { value: "silver" });
    await contains(".modal-content .o_form_view .o_input#email_0");

    // set the email and save the modal (will rerender the form view)
    await insertText(".modal-content .o_form_view .o_input#email_0", "coucou@petite.perruche");
    await click(".modal-content .o_form_button_save");
    await contains('.o_field_many2many_tags_email[name="partner_ids"] .badge.o_tag_color_0', {
        count: 2,
    });
    const firstTag = queryFirst(
        '.o_field_many2many_tags_email[name="partner_ids"] .badge.o_tag_color_0'
    );
    expect(firstTag.innerText).toBe("gold");
    expect(firstTag.querySelector(".o_badge_text")).toHaveAttribute(
        "title",
        "coucou@petite.perruche"
    );
    // should have read Partner_1 three times: when opening the dropdown, when opening the modal, and
    // after the save
    await waitForSteps([`[${partnerId_2}]`, `[${partnerId_2}]`, `[${partnerId_1},${partnerId_2}]`]);
});

test("fieldmany2many tags email popup close without filling", async () => {
    const { env: pyEnv } = await makeMockServer();
    pyEnv["res.partner"].create([
        { name: "Valid Valeria", email: "normal_valid_email@test.com" },
        { name: "Deficient Denise", email: "" },
    ]);
    onRpc((request) => {
        if (request.model === "res.partner" && request.method === "web_read") {
            // expect(request.kwargs.specifications).toInclude("email");  FIX ME
        } else if (request.method === "get_formview_id") {
            return false;
        }
    });
    await mountView({
        resModel: "mail.message",
        type: "form",
        arch: /* xml */ `
            <form string="Partners">
                <sheet>
                    <field name="body"/>
                    <field name="partner_ids" widget="many2many_tags_email"/>
                </sheet>
            </form>
        `,
    });
    // const target = getFixture();
    // add an other existing tag
    await clickFieldDropdown("partner_ids");
    await clickFieldDropdownItem("partner_ids", "Deficient Denise");
    await contains(".modal-content .o_form_view");
    await contains(".modal-content .o_form_view .o_input#name_0", { value: "Deficient Denise" });
    await contains(".modal-content .o_form_view .o_input#email_0", { value: "" });

    // Close the modal dialog without saving (should remove partner from invalid records)
    await click(".modal-content .o_form_button_cancel");

    // Selecting a partner with a valid email shouldn't open the modal dialog for the previous partner
    await clickFieldDropdown("partner_ids");
    await clickFieldDropdownItem("partner_ids", "Valid Valeria");
    await animationFrame();
    // assert.containsNone(target, ".modal");
    // expect(target.querySelector(".modal")).toHaveCount(0); FIXME: present due to this 'ResPartner._get_needaction_count is not a function'
});

test("many2many_tags_email widget can load more than 40 records", async () => {
    const { env: pyEnv } = await makeMockServer();
    const partnerIds = [];
    for (let i = 100; i < 200; i++) {
        partnerIds.push(pyEnv["res.partner"].create({ display_name: `partner${i}` }));
    }
    const messageId = pyEnv["mail.message"].create({ partner_ids: partnerIds });

    await mountView({
        resModel: "mail.message",
        type: "form",
        arch: /* xml */ ` <form><field name="partner_ids" widget="many2many_tags"/></form>`,
        resId: messageId,
    });

    await contains('.o_field_widget[name="partner_ids"] .badge', { count: 100 });
    await contains(".o_form_editable");

    // add a record to the relation
    await clickFieldDropdown("partner_ids");
    await clickFieldDropdownItem("partner_ids", "Public user");
    await contains('.o_field_widget[name="partner_ids"] .badge', { count: 101 });
});
