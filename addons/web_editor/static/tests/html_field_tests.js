/** @odoo-module **/

import { click, editInput, getFixture, makeDeferred, mockSendBeacon, nextTick, patchWithCleanup } from "@web/../tests/helpers/utils";
import { makeView, setupViewRegistries } from "@web/../tests/views/helpers";
import { FormController } from '@web/views/form/form_controller';
import { HtmlField } from "@web_editor/js/backend/html_field";
import { MediaDialog } from "@web_editor/components/media_dialog/media_dialog";
import { parseHTML, setSelection } from "@web_editor/js/editor/odoo-editor/src/utils/utils";
import { onRendered } from "@odoo/owl";
import { wysiwygData } from "web_editor.test_utils";
import { Wysiwyg } from "@web_editor/js/wysiwyg/wysiwyg";
import { insertText } from '@web_editor/js/editor/odoo-editor/test/utils';

// Legacy
import legacyEnv from 'web.commonEnv';

async function iframeReady(iframe) {
    const iframeLoadPromise = makeDeferred();
    iframe.addEventListener("load", function () {
        iframeLoadPromise.resolve();
    });
    if (!iframe.contentDocument.body) {
        await iframeLoadPromise;
    }
    await nextTick(); // ensure document is loaded
}

QUnit.module("WebEditor.HtmlField", ({ beforeEach }) => {
    let serverData;
    let target;

    beforeEach(() => {
        serverData = {
            models: {
                partner: {
                    fields: {
                        txt: { string: "txt", type: "html", trim: true },
                    },
                    records: [],
                },
            },
        };
        target = getFixture();

        setupViewRegistries();
    });

    QUnit.module("Form view interactions with the HtmlField");

    QUnit.test("A new MediaDialog after switching record in a Form view should have the correct resId", async (assert) => {
        serverData.models.partner.records = [
            {id: 1, txt: "<p>first</p>"},
            {id: 2, txt: "<p>second</p>"},
        ];
        let wysiwyg, mediaDialog;
        const wysiwygPromise = makeDeferred();
        const mediaDialogPromise = makeDeferred();
        patchWithCleanup(HtmlField.prototype, {
            async startWysiwyg() {
                await this._super(...arguments);
                wysiwyg = this.wysiwyg;
                wysiwygPromise.resolve();
            }
        });
        patchWithCleanup(MediaDialog.prototype, {
            setup() {
                mediaDialog = this;
                mediaDialogPromise.resolve();
                this.size = 'xl';
                this.contentClass = 'o_select_media_dialog';
                this.title = "TEST";
                this.tabs = [];
                this.state = {};
                // no call to super to avoid services dependencies
                // this test only cares about the props given to the dialog
            }
        });
        await makeView({
            type: "form",
            resId: 1,
            resIds: [1, 2],
            resModel: "partner",
            serverData,
            arch: `
                <form>
                    <field name="txt" widget="html"/>
                </form>`,
        });
        await wysiwygPromise;

        assert.containsOnce(target, ".odoo-editor-editable p:contains(first)");

        // click on the pager to switch to the next record
        await click(target.querySelector(".o_pager_next"));

        assert.containsOnce(target, ".odoo-editor-editable p:contains(second)");
        const paragraph = target.querySelector(".odoo-editor-editable p");
        setSelection(paragraph, 0, paragraph, 0);

        wysiwyg.openMediaDialog();
        await mediaDialogPromise;

        assert.equal(mediaDialog.props.resId, 2);
    });

    QUnit.test("discard html field changes in form", async (assert) => {
        serverData.models.partner.records = [{ id: 1, txt: "<p>first</p>" }];
        let wysiwyg;
        const wysiwygPromise = makeDeferred();
        patchWithCleanup(HtmlField.prototype, {
            async startWysiwyg() {
                await this._super(...arguments);
                wysiwyg = this.wysiwyg;
                wysiwygPromise.resolve();
            },
        });
        await makeView({
            type: "form",
            resId: 1,
            resModel: "partner",
            serverData,
            arch: `
                <form>
                    <field name="txt" widget="html" options="{'style-inline' : true}"/>
                </form>`,
        });
        await wysiwygPromise;
        const editor = wysiwyg.odooEditor;
        const editable = editor.editable;
        editor.testMode = true;
        assert.strictEqual(editable.innerHTML, `<p>first</p>`);
        const paragraph = editable.querySelector("p");
        await setSelection(paragraph, 0);
        await insertText(editor, "a");
        assert.strictEqual(editable.innerHTML, `<p>afirst</p>`);
        // For blur event here to call _onWysiwygBlur function in html_field
        await editable.dispatchEvent(new Event("blur", { bubbles: true, cancelable: true }));
        // Wait for the updates to be saved , if we don't wait the update of the value will
        // be done after the call for discardChanges since it uses some async functions.
        await new Promise((r) => setTimeout(r, 100));
        const discardButton = target.querySelector(".o_form_button_cancel");
        assert.ok(discardButton);
        await click(discardButton);
        assert.strictEqual(editable.innerHTML, `<p>first</p>`);
    });

    QUnit.module('Sandboxed Preview');

    QUnit.test("complex html is automatically in sandboxed preview mode", async (assert) => {
        serverData.models.partner.records = [{
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
        }];
        await makeView({
            type: "form",
            resId: 1,
            resModel: "partner",
            serverData,
            arch: `
                <form>
                    <field name="txt" widget="html"/>
                </form>`,
        });

        assert.containsOnce(target, '.o_field_html[name="txt"] iframe[sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"]');
    });

    QUnit.test("readonly sandboxed preview", async (assert) => {
        serverData.models.partner.records = [{
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
            </html>`,
        }];
        await makeView({
            type: "form",
            resId: 1,
            resModel: "partner",
            serverData,
            arch: `
                <form string="Partner">
                    <field name="txt" widget="html" readonly="1" options="{'sandboxedPreview': true}"/>
                </form>`,
        });

        const readonlyIframe = target.querySelector('.o_field_html[name="txt"] iframe[sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"]');
        assert.ok(readonlyIframe);
        await iframeReady(readonlyIframe);
        assert.strictEqual(readonlyIframe.contentDocument.body.innerText, 'Hello');
        assert.strictEqual(readonlyIframe.contentWindow.getComputedStyle(readonlyIframe.contentDocument.body).color, 'rgb(0, 0, 255)');

        assert.containsN(target, '#codeview-btn-group > button', 0, 'Codeview toggle should not be possible in readonly mode.');
    });

    QUnit.test("sandboxed preview display and editing", async (assert) => {
        let codeViewState = false;
        const togglePromises = [makeDeferred(), makeDeferred()];
        let togglePromiseId = 0;
        const writePromise = makeDeferred();
        patchWithCleanup(HtmlField.prototype, {
            setup: function () {
                this._super(...arguments);
                onRendered(() => {
                    if (codeViewState !== this.state.showCodeView) {
                        togglePromises[togglePromiseId].resolve();
                    }
                    codeViewState = this.state.showCodeView;
                });
            },
        });
        const htmlDocumentTextTemplate = (text, color) => `
        <html>
            <head>
                <style>
                    body {
                        color: ${color};
                    }
                </style>
            </head>
            <body>
                ${text}
            </body>
        </html>
        `;
        serverData.models.partner.records = [{
            id: 1,
            txt: htmlDocumentTextTemplate('Hello', 'red'),
        }];
        await makeView({
            type: "form",
            resId: 1,
            resModel: "partner",
            serverData,
            arch: `
                <form>
                    <sheet>
                        <notebook>
                                <page string="Body" name="body">
                                    <field name="txt" widget="html" options="{'sandboxedPreview': true}"/>
                                </page>
                        </notebook>
                    </sheet>
                </form>`,
            mockRPC(route, args) {
                if (args.method === "write" && args.model === 'partner') {
                    assert.equal(args.args[1].txt, htmlDocumentTextTemplate('Hi', 'blue'));
                    writePromise.resolve();
                }
            }
        });

        // check original displayed content
        let iframe = target.querySelector('.o_field_html[name="txt"] iframe[sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"]');
        assert.ok(iframe, 'Should use a sanboxed iframe');
        await iframeReady(iframe);
        assert.strictEqual(iframe.contentDocument.body.textContent.trim(), 'Hello');
        assert.strictEqual(iframe.contentDocument.head.querySelector('style').textContent.trim().replace(/\s/g, ''),
                           'body{color:red;}', 'Head nodes should remain unaltered in the head');
        assert.equal(iframe.contentWindow.getComputedStyle(iframe.contentDocument.body).color, 'rgb(255, 0, 0)');
        // check button is there
        assert.containsOnce(target, '#codeview-btn-group > button');
        // edit in xml editor
        await click(target, '#codeview-btn-group > button');
        await togglePromises[togglePromiseId];
        togglePromiseId++;
        assert.containsOnce(target, '.o_field_html[name="txt"] textarea');
        await editInput(target, '.o_field_html[name="txt"] textarea', htmlDocumentTextTemplate('Hi', 'blue'));
        await click(target, '#codeview-btn-group > button');
        await togglePromises[togglePromiseId];
        // check dispayed content after edit
        iframe = target.querySelector('.o_field_html[name="txt"] iframe[sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"]');
        await iframeReady(iframe);
        assert.strictEqual(iframe.contentDocument.body.textContent.trim(), 'Hi');
        assert.strictEqual(iframe.contentDocument.head.querySelector('style').textContent.trim().replace(/\s/g, ''),
                          'body{color:blue;}', 'Head nodes should remain unaltered in the head');
        assert.equal(iframe.contentWindow.getComputedStyle(iframe.contentDocument.body).color, 'rgb(0, 0, 255)',
                     'Style should be applied inside the iframe.');

        const saveButton = target.querySelector('.o_form_button_save');
        assert.ok(saveButton);
        await click(saveButton);
        await writePromise;
    });


    QUnit.test("sanboxed preview mode not automatically enabled for regular values", async (assert) => {
        serverData.models.partner.records = [{
            id: 1,
            txt: `
                <body>
                    <p>Hello</p>
                </body>
            `,
        }];
        await makeView({
            type: "form",
            resId: 1,
            resModel: "partner",
            serverData,
            arch: `
                <form>
                    <field name="txt" widget="html"/>
                </form>`,
        });

        assert.containsN(target, '.o_field_html[name="txt"] iframe[sandbox]', 0);
        assert.containsN(target, '.o_field_html[name="txt"] textarea', 0);
    });

    QUnit.test("sandboxed preview option applies even for simple text", async (assert) => {
        serverData.models.partner.records = [{
            id: 1,
            txt: `
                Hello
            `,
        }];
        await makeView({
            type: "form",
            resId: 1,
            resModel: "partner",
            serverData,
            arch: `
                <form>
                    <field name="txt" widget="html" options="{'sandboxedPreview': true}"/>
                </form>`,
        });

        assert.containsOnce(target, '.o_field_html[name="txt"] iframe[sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"]');
    });

    QUnit.module('Readonly mode');

    QUnit.test("Links should open on a new tab", async (assert) => {
        assert.expect(6);
        serverData.models.partner.records = [{
            id: 1,
            txt: `
                <body>
                    <a href="/contactus">Relative link</a>
                    <a href="${location.origin}/contactus">Internal link</a>
                    <a href="https://google.com">External link</a>
                </body>`,
        }];
        await makeView({
            type: "form",
            resId: 1,
            resModel: "partner",
            serverData,
            arch: `
                <form>
                    <field name="txt" widget="html" readonly="1"/>
                </form>`,
        });

        for (const link of target.querySelectorAll('a')) {
            assert.strictEqual(link.getAttribute('target'), '_blank');
            assert.strictEqual(link.getAttribute('rel'), 'noreferrer');
        }
    });

    QUnit.module('Save scenarios');

    QUnit.test("Ensure that urgentSave works even with modified image to save", async (assert) => {
        assert.expect(5);

        let sendBeaconDef;
        mockSendBeacon((route, blob) => {
            blob.text().then((r) => {
                const { params } = JSON.parse(r);
                const { args, model } = params;
                if (route === '/web/dataset/call_kw/partner/write' && model === 'partner') {
                    if (writeCount === 0) {
                        // Save normal value without image.
                        assert.equal(args[1].txt, `<p class="test_target"><br></p>`);
                    } else if (writeCount === 1) {
                        // Save image with unfinished modification changes.
                        assert.equal(args[1].txt, imageContainerHTML);
                    } else if (writeCount === 2) {
                        // Save the modified image.
                        assert.equal(args[1].txt, getImageContainerHTML(newImageSrc, false));
                    } else {
                        // Fail the test if too many write are called.
                        assert.ok(writeCount === 2, "Write should only be called 3 times during this test");
                    }
                    writeCount += 1;
                }
                sendBeaconDef.resolve();
            });
            return true;
        });

        let formController;
        // Patch to get the controller instance.
        patchWithCleanup(FormController.prototype, {
            setup() {
                this._super(...arguments);
                formController = this;
            }
        });
        // Patch to get a promise to get the htmlField component instance when
        // the wysiwyg is instancied.
        const htmlFieldPromise = makeDeferred();
        patchWithCleanup(HtmlField.prototype, {
            async startWysiwyg() {
                await this._super(...arguments);
                await nextTick();
                htmlFieldPromise.resolve(this);
            }
        });
        // Add a partner record and ir.attachments model and record.
        serverData.models.partner.records.push({
            id: 1,
            txt: "<p class='test_target'><br></p>",
        });
        serverData.models["ir.attachment"] = wysiwygData({})["ir.attachment"];
        const imageRecord = serverData.models["ir.attachment"].records[0];
        // Method to get the html of a cropped image.
        // Use `data-src` instead of `src` when the SRC is an URL that would
        // make a call to the server.
        const getImageContainerHTML = (src, isModified) => {
            return `
                <p>
                    <img
                        class="img img-fluid o_we_custom_image o_we_image_cropped${isModified ? ' o_modified_image_to_save' : ''}"
                        data-original-id="${imageRecord.id}"
                        data-original-src="${imageRecord.image_src}"
                        data-mimetype="image/png"
                        data-width="50"
                        data-height="50"
                        data-scale-x="1"
                        data-scale-y="1"
                        data-aspect-ratio="0/0"
                        ${src.startsWith("/web") ? 'data-src="' : 'src="'}${src}"
                    >
                    <br>
                </p>
            `.replace(/(?:\s|(?:\r\n))+/g, ' ')
             .replace(/\s?(<|>)\s?/g, '$1');
        };
        // Promise to resolve when we want the response of the modify_image RPC.
        const modifyImagePromise = makeDeferred();
        let writeCount = 0;
        let modifyImageCount = 0;
        // Valid base64 encoded image in its transitory modified state.
        const imageContainerHTML = getImageContainerHTML(
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII",
            true
        );
        // New src URL to assign to the image when the modification is
        // "registered".
        const newImageSrc = "/web/image/1234/cropped_transparent.png";
        const mockRPC = async function (route, args) {
            if (
                route === '/web/dataset/call_kw/partner/write' &&
                args.model === 'partner'
            ) {
                assert.ok(false, "write should only be called through sendBeacon");
            } else if (
                route === `/web_editor/modify_image/${imageRecord.id}`
            ) {
                if (modifyImageCount === 0) {
                    assert.equal(args.res_model, 'partner');
                    assert.equal(args.res_id, 1);
                    await modifyImagePromise;
                    return newImageSrc;
                } else {
                    // Fail the test if too many modify_image are called.
                    assert.ok(modifyImageCount === 0, "The image should only have been modified once during this test");
                }
                modifyImageCount += 1;
            }
        };
        // Add the ajax service (legacy), because wysiwyg RPCs use it.
        patchWithCleanup(legacyEnv, {
            services: {
                ...legacyEnv.services,
                ajax: {
                    rpc: mockRPC,
                },
            }
        });
        await makeView({
            type: "form",
            resId: 1,
            resModel: "partner",
            serverData,
            arch: `
                <form>
                    <field name="txt" widget="html"/>
                </form>`,
            mockRPC: mockRPC,
        });
        // Let the htmlField be mounted and recover the Component instance.
        const htmlField = await htmlFieldPromise;
        const editor = htmlField.wysiwyg.odooEditor;

        // Simulate an urgent save without any image in the content.
        sendBeaconDef = makeDeferred();
        await formController.beforeUnload();
        await sendBeaconDef;

        // Replace the empty paragraph with a paragrah containing an unsaved
        // modified image
        const imageContainerElement = parseHTML(imageContainerHTML).firstChild;
        let paragraph = editor.editable.querySelector(".test_target");
        editor.editable.replaceChild(imageContainerElement, paragraph);
        editor.historyStep();

        // Simulate an urgent save before the end of the RPC roundtrip for the
        // image.
        sendBeaconDef = makeDeferred();
        await formController.beforeUnload();
        await sendBeaconDef;

        // Resolve the image modification (simulate end of RPC roundtrip).
        modifyImagePromise.resolve();
        await modifyImagePromise;
        await nextTick();

        // Simulate the last urgent save, with the modified image.
        sendBeaconDef = makeDeferred();
        await formController.beforeUnload();
        await sendBeaconDef;
    });

    QUnit.test("Pasted/dropped images are converted to attachments on save", async (assert) => {
        assert.expect(6);

        // Patch to get a promise to get the htmlField component instance when
        // the wysiwyg is instancied.
        const htmlFieldPromise = makeDeferred();
        patchWithCleanup(HtmlField.prototype, {
            async startWysiwyg() {
                await this._super(...arguments);
                await nextTick();
                htmlFieldPromise.resolve(this);
            }
        });
        // Add a partner record
        serverData.models.partner.records.push({
            id: 1,
            txt: "<p class='test_target'><br></p>",
        });

        const mockRPC = async function (route, args) {
            if (route === '/web_editor/attachment/add_data') {
                // Check that the correct record model and id were sent.
                assert.equal(args.res_model, 'partner');
                assert.equal(args.res_id, 1);
                return {
                    image_src: '/test_image_url.png',
                    access_token: '1234',
                    public: false,
                }
            }
        };

        const pasteImage = async (editor) => {
            // Create image file.
            const base64ImageData = "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII"
            const binaryImageData = atob(base64ImageData);
            const uint8Array = new Uint8Array(binaryImageData.length);
            for (let i = 0; i < binaryImageData.length; i++) {
                uint8Array[i] = binaryImageData.charCodeAt(i);
            }
            const file = new File([uint8Array], "test_image.png", { type: 'image/png' });

            // Create a promise to get the created img elements
            const pasteImagePromise = makeDeferred();
            const observer = new MutationObserver(mutations => {
                mutations
                    .filter(mutation => mutation.type === 'childList')
                    .forEach(mutation => {
                        mutation.addedNodes.forEach(node => {
                            if (node instanceof HTMLElement) {
                                pasteImagePromise.resolve(node);
                            }
                        });
                    });
            });
            observer.observe(editor.editable, { subtree: true, childList: true });

            // Simulate paste.
            editor._onPaste({
                preventDefault() {},
                clipboardData: {
                    getData() {},
                    items: [{
                        kind: 'file',
                        type: 'image/png',
                        getAsFile: () => file,
                    }],
                },
            });

            const img = await pasteImagePromise;
            observer.disconnect();
            return img;
        }

        // Add the ajax service (legacy), because wysiwyg RPCs use it.
        patchWithCleanup(legacyEnv, {
            services: {
                ...legacyEnv.services,
                ajax: {
                    rpc: mockRPC,
                },
            }
        });
        await makeView({
            type: "form",
            resId: 1,
            resModel: "partner",
            serverData,
            arch: `
                <form>
                    <field name="txt" widget="html"/>
                </form>`,
            mockRPC: mockRPC,
        });
        // Let the htmlField be mounted and recover the Component instance.
        const htmlField = await htmlFieldPromise;
        const editor = htmlField.wysiwyg.odooEditor;

        const paragraph = editor.editable.querySelector(".test_target");
        Wysiwyg.setRange(paragraph);

        // Paste image.
        const img = await pasteImage(editor);
        // Test environment replaces 'src' by 'data-src'.
        assert.ok(/^data:image\/png;base64,/.test(img.dataset['src']));
        assert.ok(img.classList.contains('o_b64_image_to_save'));

        // Save changes.
        // Restore 'src' attribute so that SavePendingImages can do its job.
        img.src = img.dataset['src'];
        await htmlField.commitChanges();
        assert.equal(img.dataset['src'], '/test_image_url.png?access_token=1234');
        assert.ok(!img.classList.contains('o_b64_image_to_save'));
    });

    QUnit.module('Paste');

    QUnit.test("Embed video by pasting video URL", async (assert) => {
        assert.expect(4);

        serverData.models.partner.records.push({
            id: 1,
            txt: "<p><br></p>",
        });

        const mockRPC = async function (route, args) {
            if (route === '/web_editor/video_url/data') {
                return Promise.resolve({
                    platform: "youtube",
                    embed_url: "//www.youtube.com/embed/qxb74CMR748?rel=0&autoplay=0",
                });
            }
        };

        // Add the ajax service (legacy), because wysiwyg RPCs use it.
        patchWithCleanup(legacyEnv, {
            services: {
                ...legacyEnv.services,
                ajax: {
                    rpc: mockRPC,
                },
            }
        });
        await makeView({
            type: "form",
            resId: 1,
            resModel: "partner",
            serverData,
            arch: `
                <form>
                    <field name="txt" widget="html" options="{'allowCommandVideo': true}"/>
                </form>`,
            mockRPC: mockRPC,
        });

        const editable = document.querySelector(".odoo-editor-editable");
        const p = editable.firstElementChild;
        Wysiwyg.setRange(p);

        // Paste a video URL.
        const clipboardData = new DataTransfer();
        clipboardData.setData('text/plain', 'https://www.youtube.com/watch?v=qxb74CMR748');
        p.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true }));
        assert.strictEqual(p.outerHTML, '<p>https://www.youtube.com/watch?v=qxb74CMR748<br></p>',
            "The URL should be inserted as text");
        assert.isVisible($('.oe-powerbox-wrapper:contains("Embed Youtube Video")'),
            "The powerbox should be opened");

        // Press Enter to select first option in the powerbox ("Embed Youtube Video").
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        await nextTick();
        assert.strictEqual(p.outerHTML, '<p></p>', "URL insertion should be reverted");
        assert.containsOnce(
            editable,
            'div.media_iframe_video iframe[data-src="//www.youtube.com/embed/qxb74CMR748?rel=0&autoplay=0"]',
            "The video should be embedded as an iframe"
        );
    });

    QUnit.module("Link");

    QUnit.test("link preview in Link Dialog", async (assert) => {
        assert.expect(6);

        serverData.models.partner.records.push({
            id: 1,
            txt: "<p class='test_target'><a href='/test'>This website</a></p>",
        });
        await makeView({
            type: "form",
            resId: 1,
            resModel: "partner",
            serverData,
            arch: `
                <form>
                    <field name="txt" widget="html"/>
                </form>`,
        });

        // Test the popover option to edit the link
        const a = document.querySelector(".test_target a");
        // Wait for the popover to appear
        await nextTick();
        a.click();
        await nextTick();
        // Click on the edit link icon
        document.querySelector("a.mx-1.o_we_edit_link.text-dark").click();
        // Make sure popover is closed
        await new Promise(resolve => $(a).on('hidden.bs.popover.link_popover', resolve));
        let labelInputField = document.querySelector(".modal input#o_link_dialog_label_input");
        let linkPreview = document.querySelector(".modal a#link-preview");
        assert.strictEqual(labelInputField.value, 'This website',
            "The label input field should match the link's content");
        assert.strictEqual(linkPreview.innerText.replaceAll("\u200B", ""), "This website",
            "Link label in preview should match label input field");

        // Click on discard
        await click(document, ".modal .modal-footer button.btn-secondary");

        const p = document.querySelector(".test_target");
        // Select link label to open the floating toolbar.
        setSelection(p, 0, p, 1);
        await nextTick();
        // Click on create-link button to open the Link Dialog.
        document.querySelector("#toolbar #create-link").click();
        await nextTick();

        labelInputField = document.querySelector(".modal input#o_link_dialog_label_input");
        linkPreview = document.querySelector(".modal a#link-preview");
        assert.strictEqual(labelInputField.value, 'This website',
            "The label input field should match the link's content");
        assert.strictEqual(linkPreview.innerText, 'This website',
            "Link label in preview should match label input field");

        // Edit link label.
        await editInput(labelInputField, null, "New label");
        assert.strictEqual(linkPreview.innerText, "New label",
            "Preview should be updated on label input field change");
        // Click "Save".
        await click(document, ".modal .modal-footer button.btn-primary");
        assert.strictEqual(p.innerText.replaceAll('\u200B', ''), 'New label',
            "The link's label should be updated");
    });

    QUnit.module("Dropdown");

    QUnit.test('Close dropdown on colorpicker hide', async function (assert) {
        assert.expect(4);
        serverData.models.partner.records = [{ id: 1, txt: "<p>first</p>" }];
        const mockRPC = async function (route, args) {};
        // Add the ajax service (legacy), because wysiwyg RPCs use it.
        patchWithCleanup(legacyEnv, {
            services: {
                ...legacyEnv.services,
                ajax: {
                    rpc: mockRPC,
                },
            }
        });
        let wysiwyg;
        const wysiwygPromise = makeDeferred();
        patchWithCleanup(HtmlField.prototype, {
            async startWysiwyg() {
                await this._super(...arguments);
                wysiwyg = this.wysiwyg;
                wysiwygPromise.resolve();
            },
        });

        await makeView({
            type: 'form',
            resId: 1,
            resModel: 'partner',
            serverData,
            arch: '<form>' +
                    '<field name="txt" widget="html" />' +
                '</form>',
        });
        await wysiwygPromise;
        const editor = wysiwyg.odooEditor;
        const editable = editor.editable;
        const paragrah = editable.querySelector("p");
        const pText = paragrah.childNodes[0];
        const toolbar = document.querySelector("#toolbar");
        Wysiwyg.setRange(pText, 1, pText, 3);

        await new Promise(resolve => setTimeout(resolve, 50));
        assert.ok(toolbar.style.visibility === "visible");

        const colorpicker = toolbar.querySelector('#toolbar .note-back-color-preview');
        await click(colorpicker, '.dropdown-toggle', true);
        await new Promise(resolve => setTimeout(resolve, 50));
        assert.ok(toolbar.querySelector('.note-back-color-preview .dropdown-menu').classList.contains('show'),
            "should display the color picker");

        Wysiwyg.setRange(pText, 1, pText, 1);
        await new Promise(resolve => setTimeout(resolve, 50));
        assert.ok(toolbar.style.visibility === 'hidden', "toolbar should be hidden");
        assert.notOk(toolbar.querySelector(".dropdown-menu.show"), "all dropdowns should be closed");
    });
});
