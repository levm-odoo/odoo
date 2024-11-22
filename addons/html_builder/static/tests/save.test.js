import { SnippetsMenu } from "@html_builder/builder/snippets_menu";
import { expect, test } from "@odoo/hoot";
import { animationFrame, click } from "@odoo/hoot-dom";
import { contains, onRpc, patchWithCleanup } from "@web/../tests/web_test_helpers";
import {
    defineWebsiteModels,
    exampleWebsiteContent,
    getEditable,
    modifyText,
    setupWebsiteBuilder,
    wrapExample,
} from "./helpers";

defineWebsiteModels();

test("basic save", async () => {
    const resultSave = setupSaveAndReloadIframe();
    const { getEditor } = await setupWebsiteBuilder(getEditable(exampleWebsiteContent));
    expect(":iframe #wrap").not.toHaveClass("o_dirty");
    await modifyText(getEditor());

    await contains(".o-snippets-top-actions button:contains(Save)").click();
    expect(resultSave.length).toBe(1);
    expect(resultSave[0]).toBe(
        '<div id="wrap" data-oe-model="ir.ui.view" data-oe-id="539" data-oe-field="arch"><h1 class="title">H1ello</h1></div>'
    );
    expect(":iframe #wrap").not.toHaveClass("o_dirty");
    expect(":iframe #wrap").not.toHaveClass("o_editable");
    expect(":iframe #wrap .title:contains('H1ello')").toHaveCount(1);
});

test("nothing to save", async () => {
    const resultSave = setupSaveAndReloadIframe();
    const { getEditor } = await setupWebsiteBuilder(getEditable(exampleWebsiteContent));
    await modifyText(getEditor());
    await animationFrame();
    await contains(".o-snippets-menu button.fa-undo").click();
    await contains(".o-snippets-top-actions button:contains(Save)").click();
    expect(resultSave.length).toBe(0);
    expect(":iframe #wrap").not.toHaveClass("o_dirty");
    expect(":iframe #wrap").not.toHaveClass("o_editable");
    expect(":iframe #wrap .title:contains('Hello')").toHaveCount(1);
});

test("discard modified elements", async () => {
    setupSaveAndReloadIframe();
    const { getEditor } = await setupWebsiteBuilder(getEditable(exampleWebsiteContent));
    await modifyText(getEditor());
    await contains(".o-snippets-top-actions button[data-action='cancel']").click();
    await contains(".modal-content button.btn-primary").click();
    expect(":iframe #wrap").not.toHaveClass("o_dirty");
    expect(":iframe #wrap").not.toHaveClass("o_editable");
    expect(":iframe #wrap .title:contains('Hello')").toHaveCount(1);
});

test("discard without any modifications", async () => {
    patchWithCleanup(SnippetsMenu.prototype, {
        async reloadIframeAndCloseEditor() {
            this.props.iframe.contentDocument.body.innerHTML = wrapExample;
            this.props.closeEditor();
        },
    });
    await setupWebsiteBuilder(getEditable(exampleWebsiteContent));
    await contains(".o-snippets-top-actions button[data-action='cancel']").click();
    expect(":iframe #wrap").not.toHaveClass("o_dirty");
    expect(":iframe #wrap").not.toHaveClass("o_editable");
    expect(":iframe #wrap .title:contains('Hello')").toHaveCount(1);
});

test("disable discard button when clicking on save", async () => {
    await setupWebsiteBuilder();
    await click(".o-snippets-top-actions button[data-action='save']");
    expect(".o-snippets-top-actions button[data-action='cancel']").toHaveAttribute("disabled", "");
});

function setupSaveAndReloadIframe() {
    const resultSave = [];
    onRpc("ir.ui.view", "save", ({ args }) => {
        resultSave.push(args[1]);
        return true;
    });
    patchWithCleanup(SnippetsMenu.prototype, {
        async reloadIframeAndCloseEditor() {
            this.props.iframe.contentDocument.body.innerHTML = resultSave.at(-1) || wrapExample;
            this.props.closeEditor();
        },
    });
    return resultSave;
}
