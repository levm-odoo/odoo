import { expect, test } from "@odoo/hoot";
import { queryAll } from "@odoo/hoot-dom";
import { contains } from "@web/../tests/web_test_helpers";
import { defineWebsiteModels, setupWebsiteBuilder } from "../helpers";
import { insertStructureSnippet } from "./helpers";

defineWebsiteModels();

test("toggle price list description items", async () => {
    const { getEditor } = await setupWebsiteBuilder("<div></div>");
    const editor = getEditor();
    await insertStructureSnippet(editor, "s_pricelist_boxed");
    await contains(":iframe .s_pricelist_boxed_section").click();
    expect(
        "[data-action-id='togglePriceListDescription'] .o-checkbox .form-check-input:checked"
    ).toHaveCount(1);
    expect(
        queryAll(":iframe .s_pricelist_boxed .s_pricelist_boxed_item_description").some(
            (description) => description.classList.contains("d-none")
        )
    ).toBe(false);

    await contains("[data-action-id='togglePriceListDescription'] .o-checkbox").click();
    expect(
        "[data-action-id='togglePriceListDescription'] .o-checkbox .form-check-input:checked"
    ).toHaveCount(0);
    expect(
        queryAll(":iframe .s_pricelist_boxed .s_pricelist_boxed_item_description").every(
            (description) => description.classList.contains("d-none")
        )
    ).toBe(true);
});
