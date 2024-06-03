import { HtmlField } from "@html_editor/fields/html_field";
import { beforeEach, describe, expect, test } from "@odoo/hoot";
import { click, press, queryAll, queryAllTexts, queryOne } from "@odoo/hoot-dom";
import { animationFrame, tick } from "@odoo/hoot-mock";
import {
    contains,
    defineModels,
    fields,
    models,
    mountView,
    onRpc,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { assets } from "@web/core/assets";
import { browser } from "@web/core/browser/browser";
import { setSelection } from "./_helpers/selection";
import { insertText, pasteText } from "./_helpers/user_actions";

class Partner extends models.Model {
    txt = fields.Html({ trim: true });

    _records = [
        { id: 1, txt: "<p>first</p>" },
        { id: 2, txt: "<p>second</p>" },
    ];
}
defineModels([Partner]);

let htmlEditor;
beforeEach(() => {
    patchWithCleanup(HtmlField.prototype, {
        onEditorLoad(editor) {
            htmlEditor = editor;
            return super.onEditorLoad(...arguments);
        },
    });
});

test("html field in readonly", async () => {
    await mountView({
        type: "form",
        resId: 1,
        resIds: [1, 2],
        resModel: "partner",
        arch: `
            <form>
                <field name="txt" widget="html" readonly="1"/>
            </form>`,
    });
    expect(".odoo-editor-editable").toHaveCount(0);
    expect(`[name="txt"] .o_readonly`).toHaveCount(1);
    expect(`[name="txt"] .o_readonly`).toHaveInnerHTML("<p>first</p>");
});

test("links should open on a new tab in readonly", async () => {
    Partner._records = [
        {
            id: 1,
            txt: `
            <body>
                <a href="/contactus">Relative link</a>
                <a href="${browser.location.origin}/contactus">Internal link</a>
                <a href="https://google.com">External link</a>
            </body>`,
        },
    ];
    await mountView({
        type: "form",
        resId: 1,
        resModel: "partner",
        arch: `
            <form>
                <field name="txt" widget="html" readonly="1"/>
            </form>`,
    });

    for (const link of queryAll("a")) {
        expect(link.getAttribute("target")).toBe("_blank");
        expect(link.getAttribute("rel")).toBe("noreferrer");
    }
});

test("edit and save a html field", async () => {
    onRpc("web_save", ({ args }) => {
        expect(args[1]).toEqual({
            txt: "<p>testfirst</p>",
        });
        expect.step("web_save");
    });

    await mountView({
        type: "form",
        resId: 1,
        resIds: [1, 2],
        resModel: "partner",
        arch: `
            <form>
                <field name="txt" widget="html"/>
            </form>`,
    });
    expect(".odoo-editor-editable p").toHaveText("first");
    expect(`.o_form_button_save`).not.toBeVisible();

    const anchorNode = queryOne(".odoo-editor-editable p");
    setSelection({ anchorNode, anchorOffset: 0 });
    insertText(htmlEditor, "test");
    await animationFrame();
    expect(".odoo-editor-editable p").toHaveText("testfirst");
    expect(".o_form_button_save").toBeVisible();

    await contains(".o_form_button_save").click();
    expect(["web_save"]).toVerifySteps();
    expect(".odoo-editor-editable p").toHaveText("testfirst");
    expect(`.o_form_button_save`).not.toBeVisible();
});

test("click on next/previous page", async () => {
    await mountView({
        type: "form",
        resId: 1,
        resIds: [1, 2],
        resModel: "partner",
        arch: `
            <form>
                <field name="txt" widget="html"/>
            </form>`,
    });
    expect(".odoo-editor-editable p:contains(first)").toHaveCount(1);

    await contains(`.o_pager_next`).click();
    expect(".odoo-editor-editable p:contains(second)").toHaveCount(1);

    await contains(`.o_pager_previous`).click();
    expect(".odoo-editor-editable p:contains(first)").toHaveCount(1);
});

test("edit and switch page", async () => {
    onRpc("web_save", ({ args }) => {
        expect(args[1]).toEqual({
            txt: "<p>testfirst</p>",
        });
        expect.step("web_save");
    });
    await mountView({
        type: "form",
        resId: 1,
        resIds: [1, 2],
        resModel: "partner",
        arch: `
            <form>
                <field name="txt" widget="html"/>
            </form>`,
    });
    expect(".odoo-editor-editable p").toHaveText("first");
    expect(`.o_form_button_save`).not.toBeVisible();

    const anchorNode = queryOne(".odoo-editor-editable p");
    setSelection({ anchorNode, anchorOffset: 0 });
    insertText(htmlEditor, "test");
    await animationFrame();
    expect(".odoo-editor-editable p").toHaveText("testfirst");
    expect(`.o_form_button_save`).toBeVisible();

    await contains(`.o_pager_next`).click();
    await animationFrame();
    expect(".odoo-editor-editable p").toHaveText("second");
    expect(`.o_form_button_save`).not.toBeVisible();
    expect(["web_save"]).toVerifySteps();

    await contains(`.o_pager_previous`).click();
    expect(".odoo-editor-editable p").toHaveText("testfirst");
    expect(`.o_form_button_save`).not.toBeVisible();
});

test("discard changes in html field in form", async () => {
    await mountView({
        type: "form",
        resId: 1,
        resIds: [1, 2],
        resModel: "partner",
        arch: `
            <form>
                <field name="txt" widget="html"/>
            </form>`,
    });
    expect(".odoo-editor-editable p").toHaveText("first");
    expect(`.o_form_button_save`).not.toBeVisible();

    // move the hoot focus in the editor
    click(".odoo-editor-editable");
    const anchorNode = queryOne(".odoo-editor-editable p");
    setSelection({ anchorNode, anchorOffset: 0 });
    insertText(htmlEditor, "test");
    await animationFrame();
    expect(".odoo-editor-editable p").toHaveText("testfirst");
    expect(`.o_form_button_cancel`).toBeVisible();

    await contains(`.o_form_button_cancel`).click();
    await animationFrame();
    expect(".odoo-editor-editable p").toHaveText("first");
    expect(`.o_form_button_cancel`).not.toBeVisible();
});

test("undo after discard html field changes in form", async () => {
    await mountView({
        type: "form",
        resId: 1,
        resIds: [1, 2],
        resModel: "partner",
        arch: `
            <form>
                <field name="txt" widget="html"/>
            </form>`,
    });
    expect(".odoo-editor-editable p").toHaveText("first");
    expect(`.o_form_button_save`).not.toBeVisible();

    // move the hoot focus in the editor
    click(".odoo-editor-editable");
    const anchorNode = queryOne(".odoo-editor-editable p");
    setSelection({ anchorNode, anchorOffset: 0 });
    insertText(htmlEditor, "test");
    await animationFrame();
    expect(".odoo-editor-editable p").toHaveText("testfirst");
    expect(`.o_form_button_cancel`).toBeVisible();

    press(["ctrl", "z"]);
    expect(".odoo-editor-editable p").toHaveText("tesfirst");
    expect(`.o_form_button_cancel`).toBeVisible();

    await contains(`.o_form_button_cancel`).click();
    await animationFrame();
    expect(".odoo-editor-editable p").toHaveText("first");
    expect(`.o_form_button_cancel`).not.toBeVisible();

    press(["ctrl", "z"]);
    expect(".odoo-editor-editable p").toHaveText("first");
    expect(`.o_form_button_cancel`).not.toBeVisible();
});

test.todo(
    "A new MediaDialog after switching record in a Form view should have the correct resId",
    async () => {
        Partner._records = [
            { id: 1, txt: "<p>first</p>" },
            { id: 2, txt: "<p>second</p>" },
        ];

        await mountView({
            type: "form",
            resId: 1,
            resIds: [1, 2],
            resModel: "partner",
            arch: `
                <form>
                    <field name="txt" widget="html"/>
                </form>`,
        });
        expect(".odoo-editor-editable p:contains(first)").toHaveCount();

        await contains(`.o_pager_next`).click();
        expect(".odoo-editor-editable p:contains(second)").toHaveCount();

        const paragrah = queryOne(".odoo-editor-editable p");
        setSelection({ anchorNode: paragrah, anchorOffset: 0 });
        insertText("/Image");
        // press("Enter")

        await tick();
    }
);

test("Embed video by pasting video URL", async () => {
    Partner._records = [
        {
            id: 1,
            txt: "<p><br></p>",
        },
    ];

    onRpc("/html_editor/video_url/data", async () => {
        return {
            platform: "youtube",
            embed_url: "//www.youtube.com/embed/qxb74CMR748?rel=0&autoplay=0",
        };
    });

    await mountView({
        type: "form",
        resId: 1,
        resModel: "partner",
        arch: `
            <form>
                <field name="txt" widget="html" options="{'allowCommandVideo': true}"/>
            </form>`,
    });

    const anchorNode = queryOne(".odoo-editor-editable p");
    setSelection({ anchorNode, anchorOffset: 0 });

    // Paste a video URL.
    pasteText(htmlEditor, "https://www.youtube.com/watch?v=qxb74CMR748");
    await animationFrame();
    expect(anchorNode.outerHTML).toBe("<p>https://www.youtube.com/watch?v=qxb74CMR748<br></p>");
    expect(".o-we-powerbox").toHaveCount(1);
    expect(queryAllTexts(".o-we-command-name")).toEqual(["Embed Youtube Video", "Paste as URL"]);

    // Press Enter to select first option in the powerbox ("Embed Youtube Video").
    press("Enter");
    await animationFrame();
    expect(anchorNode.outerHTML).toBe("<p></p>");
    expect(
        'div.media_iframe_video iframe[src="//www.youtube.com/embed/qxb74CMR748?rel=0&autoplay=0"]'
    ).toHaveCount(1);
});

describe("sandbox", () => {
    const recordWithComplexHTML = {
        id: 1,
        txt: `
    <!DOCTYPE HTML>
    <html xml:lang="en" lang="en">
        <head>
            <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
            <meta name="format-detection" content="telephone=no"/>
            <style type="text/css">
                body {
                    color: blue;
                }
            </style>
        </head>
        <body>
            Hello
        </body>
    </html>
    `,
    };
    test("complex html is automatically in sandboxed preview mode", async () => {
        Partner._records = [recordWithComplexHTML];
        await mountView({
            type: "form",
            resId: 1,
            resModel: "partner",
            arch: `
                <form>
                    <field name="txt" widget="html"/>
                </form>`,
        });
        expect(
            `.o_field_html[name="txt"] iframe[sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"]`
        ).toHaveCount(1);
    });

    test("readonly sandboxed preview", async () => {
        Partner._records = [recordWithComplexHTML];
        await mountView({
            type: "form",
            resId: 1,
            resModel: "partner",
            arch: `
                <form string="Partner">
                    <field name="txt" widget="html" readonly="1" options="{'sandboxedPreview': true}"/>
                </form>`,
        });

        const readonlyIframe = queryOne(
            '.o_field_html[name="txt"] iframe[sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"]'
        );
        expect(readonlyIframe.contentDocument.body).toHaveText("Hello");
        expect(
            readonlyIframe.contentWindow.getComputedStyle(readonlyIframe.contentDocument.body).color
        ).toBe("rgb(0, 0, 255)");
        expect("#codeview-btn-group > button").toHaveCount(0, {
            message: "Codeview toggle should not be possible in readonly mode.",
        });
    });

    test("links should open on a new tab in sandboxedPreview", async () => {
        Partner._records = [
            {
                id: 1,
                txt: `
                <body>
                    <a href="/contactus">Relative link</a>
                    <a href="${browser.location.origin}/contactus">Internal link</a>
                    <a href="https://google.com">External link</a>
                </body>`,
            },
        ];
        await mountView({
            type: "form",
            resId: 1,
            resModel: "partner",
            arch: `
                <form>
                    <field name="txt" widget="html" readonly="1" options="{'sandboxedPreview': true}"/>
                </form>`,
        });

        const readonlyIframe = queryOne('.o_field_html[name="txt"] iframe');
        for (const link of readonlyIframe.contentDocument.body.querySelectorAll("a")) {
            expect(link.getAttribute("target")).toBe("_blank");
            expect(link.getAttribute("rel")).toBe("noreferrer");
        }
    });

    test("readonly with cssReadonly", async () => {
        Partner._records = [
            {
                id: 1,
                txt: `<p>Hello</p>
        `,
            },
        ];

        patchWithCleanup(assets, {
            getBundle: (name) => {
                expect.step(name);
                return {
                    jsLibs: [],
                    cssLibs: ["testCSS"],
                };
            },
        });

        await mountView({
            type: "form",
            resId: 1,
            resModel: "partner",
            arch: `
                <form string="Partner">
                    <field name="txt" widget="html" readonly="1" options="{'cssReadonly': 'template.assets'}"/>
                </form>`,
        });

        const readonlyIframe = queryOne('.o_field_html[name="txt"] iframe');
        expect(
            readonlyIframe.contentDocument.head.querySelector(`link[href='testCSS']`)
        ).toHaveCount(1);
        expect(readonlyIframe.contentDocument.body).toHaveInnerHTML(
            `<div id="iframe_target"> <p> Hello </p> </div>`
        );
        expect(["template.assets"]).toVerifySteps();
    });
});

// test("link preview in Link Dialog", async () => {
//     Partner._records = [
//         {
//             id: 1,
//             txt: "<p class='test_target'><a href='/test'>This website</a></p>",
//         },
//     ];
//     await mountView({
//         type: "form",
//         resId: 1,
//         resModel: "partner",
//         arch: `
//             <form>
//                 <field name="txt" widget="html"/>
//             </form>`,
//     });

//     // Test the popover option to edit the link
//     click(".test_target a")
//     const a = document.querySelector(".test_target a");
//     // Wait for the popover to appear
//     await nextTick();
//     a.click();
//     await nextTick();
//     // Click on the edit link icon
//     document.querySelector("a.mx-1.o_we_edit_link.text-dark").click();
//     // Make sure popover is closed
//     await new Promise((resolve) => $(a).on("hidden.bs.popover.link_popover", resolve));
//     let labelInputField = document.querySelector(".modal input#o_link_dialog_label_input");
//     let linkPreview = document.querySelector(".modal a#link-preview");
//     assert.strictEqual(
//         labelInputField.value,
//         "This website",
//         "The label input field should match the link's content"
//     );
//     assert.strictEqual(
//         linkPreview.innerText.replaceAll("\u200B", ""),
//         "This website",
//         "Link label in preview should match label input field"
//     );

//     // Click on discard
//     await click(document, ".modal .modal-footer button.btn-secondary");

//     const p = document.querySelector(".test_target");
//     // Select link label to open the floating toolbar.
//     setSelection(p, 0, p, 1);
//     await nextTick();
//     // Click on create-link button to open the Link Dialog.
//     document.querySelector("#toolbar #create-link").click();
//     await nextTick();

//     labelInputField = document.querySelector(".modal input#o_link_dialog_label_input");
//     linkPreview = document.querySelector(".modal a#link-preview");
//     assert.strictEqual(
//         labelInputField.value,
//         "This website",
//         "The label input field should match the link's content"
//     );
//     assert.strictEqual(
//         linkPreview.innerText,
//         "This website",
//         "Link label in preview should match label input field"
//     );

//     // Edit link label.
//     await editInput(labelInputField, null, "New label");
//     assert.strictEqual(
//         linkPreview.innerText,
//         "New label",
//         "Preview should be updated on label input field change"
//     );
//     // Click "Save".
//     await click(document, ".modal .modal-footer button.btn-primary");
//     assert.strictEqual(
//         p.innerText.replaceAll("\u200B", ""),
//         "New label",
//         "The link's label should be updated"
//     );
// });
