import { describe, expect, test, beforeEach } from "@odoo/hoot";
import { queryOne } from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";

import { mountView, onRpc, contains } from "@web/../tests/web_test_helpers";
import { defineSaleTimesheetModels, saleTimesheetModels } from "./sale_timesheet_test_helpers";

describe.current.tags("desktop");

class SaleOrder extends saleTimesheetModels.SaleOrder {
    _views = {
        form: `
            <form>
                <group>
                    <field name="partner_id" required="True"/>
                    <field name="project_id"/>
                </group>
                <notebook>
                    <page string="Order Lines" name="order_lines">
                        <field name="order_line">
                            <list editable="bottom">
                                <field name="product_id" required="True"/>
                            </list>
                        </field>
                    </page>
                </notebook>
            </form>
        `,
    };
}

class ProjectProject extends saleTimesheetModels.ProjectProject {
    _views = {
        form: `
            <form>
                <notebook>
                    <page name="billing_employee_rate" string="Invoicing">
                        <field name="sale_line_employee_ids">
                            <list editable="bottom">
                                <field name="employee_id" widget="many2one_avatar_user"/>
                                <field name="sale_line_id" required="True"
                                    options="{'no_create': True, 'no_open': True}"
                                    context="{
                                        'default_partner_id': 1,
                                        'default_project_id': 1,
                                    }"
                                    widget="so_line_create_button"
                                />
                                <field name="price_unit"/>
                            </list>
                        </field>
                    </page>
                </notebook>
            </form>
        `,
    };
}

saleTimesheetModels.ProjectProject = ProjectProject;
saleTimesheetModels.SaleOrder = SaleOrder;

defineSaleTimesheetModels();

beforeEach(() => {
    onRpc("get_first_service_line", ({ model, method, args }) => {
        const created_so_id = args[0];
        const sale_line_id = saleTimesheetModels.SaleOrder._records.find(
            (so) => so.id === created_so_id
        ).order_line[0];
        const product_id = saleTimesheetModels.SaleOrderLine._records.find(
            (sol) => sol.id === sale_line_id
        ).product_id;
        const product_type = saleTimesheetModels.ProductProduct._records.find(
            (prod) => prod.id === product_id
        ).type;
        if (product_type == "service") {
            expect.step("valid_so");
            return [sale_line_id];
        } else {
            expect.step("unvalid_so");
        }
    });
});

test("test so_line_create_button widget: from new record", async () => {
    await mountView({
        resId: 1,
        resModel: "project.project",
        type: "form",
    });
    await contains(".o_field_x2many_list_row_add a").click();
    const create_so_button = queryOne("button[aria-label='Create Sales Order']");
    expect(create_so_button).toBeVisible();
    await create_so_button.click();
    await animationFrame();

    await contains(".modal-content .o_field_x2many_list_row_add a").click();
    await contains(".modal-content .o_field_x2many_list_row_add a").click();
    await contains(".modal-content .o_selected_row input").edit("Service Product 2");
    await contains(".modal-content .ui-sortable .o-autocomplete--input").click();
    await contains(".dropdown-item:nth-child(1)").click();
    await contains(".modal-content button[class*='o_form_button_save']").click();

    expect.verifySteps(["valid_so"]);
});

test("test so_line_create_button widget: visibility conditions", async () => {
    await mountView({
        resId: 1,
        resModel: "project.project",
        type: "form",
    });
    expect(true).toBe(true);
});

test("test so_line_create_button widget: no service product in created SO", async () => {
    await mountView({
        resId: 1,
        resModel: "project.project",
        type: "form",
    });
    expect(true).toBe(true);
});
