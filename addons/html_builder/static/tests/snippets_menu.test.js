import { WebsiteBuilder } from "@html_builder/website_builder_action";
import { setContent } from "@html_editor/../tests/_helpers/selection";
import { insertText } from "@html_editor/../tests/_helpers/user_actions";
import { expect, test } from "@odoo/hoot";
import { animationFrame, click, queryAllTexts, queryOne } from "@odoo/hoot-dom";
import { contains, onRpc, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { defineWebsiteModels, getEditable, openSnippetsMenu, setupWebsiteBuilder } from "./helpers";

defineWebsiteModels();

test("open SnippetsMenu and discard", async () => {
    let websiteBuilder;
    patchWithCleanup(WebsiteBuilder.prototype, {
        setup() {
            websiteBuilder = this;
            super.setup();
        },
    });
    await setupWebsiteBuilder(`<h1> Homepage </h1>`, { openEditor: false });
    expect(".o_menu_systray .o-website-btn-custo-primary").toHaveCount(1);
    await openSnippetsMenu();
    expect(".o_menu_systray .o-website-btn-custo-primary").toHaveCount(0);
    await click(".o-snippets-top-actions button:contains(Discard)");
    await websiteBuilder.iframeLoaded;
    await animationFrame();
    expect(".o_menu_systray .o-website-btn-custo-primary").toHaveCount(1);
});

test("navigate between builder tab don't fetch snippet description again", async () => {
    onRpc("render_public_asset", () => {
        expect.step("render_public_asset");
    });
    await setupWebsiteBuilder(`<h1> Homepage </h1>`);
    expect(queryAllTexts(".o-website-snippetsmenu .o-snippets-tabs span")).toEqual([
        "BLOCKS",
        "CUSTOMIZE",
        "THEME",
    ]);
    expect(queryOne(".o-website-snippetsmenu .o-snippets-tabs button.active")).toHaveText("BLOCKS");
    expect.verifySteps(["render_public_asset"]);

    await contains(".o-website-snippetsmenu .o-snippets-tabs span:contains(THEME)").click();
    expect(queryOne(".o-website-snippetsmenu .o-snippets-tabs button.active")).toHaveText("THEME");

    await contains(".o-website-snippetsmenu .o-snippets-tabs span:contains(BLOCK)").click();
    expect(queryOne(".o-website-snippetsmenu .o-snippets-tabs button.active")).toHaveText("BLOCKS");
    expect.verifySteps([]);
});

test("undo and redo buttons", async () => {
    const { getEditor } = await setupWebsiteBuilder(getEditable("<p> Text </p>"), {
        openEditor: false,
    });
    expect(".o_menu_systray .o-website-btn-custo-primary").toHaveCount(1);
    await openSnippetsMenu();
    expect(":iframe #wrap").not.toHaveClass("o_dirty");
    expect(":iframe #wrap").toHaveClass("o_editable");
    const editor = getEditor();
    setContent(
        editor.editable,
        getEditable(
            '<div id="wrap" class="o_editable" data-oe-model="ir.ui.view" data-oe-id="539" data-oe-field="arch"><p> Text[] </p></div>'
        )
    );
    await insertText(editor, "a");
    expect(editor.editable).toHaveInnerHTML(
        '<div id="wrap" data-oe-model="ir.ui.view" data-oe-id="539" data-oe-field="arch"> <div id="wrap" class="o_editable o_dirty" data-oe-model="ir.ui.view" data-oe-id="539" data-oe-field="arch"> <p> Texta </p> </div> </div>'
    );
    await animationFrame();
    await click(".o-snippets-menu button.fa-undo");
    await animationFrame();
    expect(editor.editable).toHaveInnerHTML(
        '<div id="wrap" data-oe-model="ir.ui.view" data-oe-id="539" data-oe-field="arch" class="o_editable"> <p> Text </p> </div>'
    );
    await click(".o-snippets-menu button.fa-repeat");
    expect(editor.editable).toHaveInnerHTML(
        '<div id="wrap" data-oe-model="ir.ui.view" data-oe-id="539" data-oe-field="arch"> <div id="wrap" class="o_editable o_dirty" data-oe-model="ir.ui.view" data-oe-id="539" data-oe-field="arch"> <p> Texta </p> </div> </div>'
    );
});

test("activate customize tab without any selection", async () => {
    await setupWebsiteBuilder("<h1> Homepage </h1>");
    expect(queryOne(".o-website-snippetsmenu .o-snippets-tabs button.active")).toHaveText("BLOCKS");
    await contains(".o-website-snippetsmenu .o-snippets-tabs button:contains(CUSTOMIZE)").click();
    expect(queryOne(".o-website-snippetsmenu .o-snippets-tabs button.active")).toHaveText(
        "CUSTOMIZE"
    );
});
