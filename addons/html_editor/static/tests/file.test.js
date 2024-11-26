import { beforeEach, describe, expect, test } from "@odoo/hoot";
import { setupEditor } from "./_helpers/editor";
import { EMBEDDED_COMPONENT_PLUGINS, MAIN_PLUGINS } from "@html_editor/plugin_sets";
import { insertText } from "./_helpers/user_actions";
import { onRpc, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { animationFrame, click, press, queryOne, waitFor } from "@odoo/hoot-dom";
import { execCommand } from "./_helpers/userCommands";
import { MAIN_EMBEDDINGS } from "@html_editor/others/embedded_components/embedding_sets";
import { DocumentPlugin } from "@html_editor/others/document_plugin";

const config = {
    Plugins: [...MAIN_PLUGINS, ...EMBEDDED_COMPONENT_PLUGINS],
    resources: { embedded_components: MAIN_EMBEDDINGS },
};

const patchUpload = (editor) => {
    const mockedUploadPromise = new Promise((resolve) => {
        patchWithCleanup(editor.services.uploadLocalFiles, {
            async upload() {
                resolve();
                return [{ id: 1, name: "file.txt" }];
            },
        });
    });
    return mockedUploadPromise;
};

describe("file command", () => {
    test("/file uploads a file via the system's selector, skipping the media dialog", async () => {
        const { editor } = await setupEditor("<p>[]<br></p>", { config });
        const mockedUpload = patchUpload(editor);
        // Open powerbox.
        await insertText(editor, "/file");
        await animationFrame();
        // Select first command ("Upload a file")
        await press("Enter");
        await animationFrame();
        // Check that there's no media dialog.
        expect(".o_select_media_dialog").toHaveCount(0);
        await mockedUpload;
        // Check that file card (embedded component) was inserted in the editable.
        expect('.odoo-editor-editable [data-embedded="file"]').toHaveCount(1);
    });

    test("file card should have inline display, BS alert-info style and no download button", async () => {
        const { editor } = await setupEditor("<p>[]<br></p>", { config });
        patchUpload(editor);
        execCommand(editor, "uploadFile");
        // wait for the embedded component to be mounted
        await waitFor('[data-embedded="file"] .o_file_name:contains("file.txt")');
        // Check that file card has inline display, with alert style.
        const fileCard = queryOne('[data-embedded="file"]');
        expect(fileCard).toHaveStyle({ display: "inline-block" });
        expect(fileCard.firstElementChild).toHaveClass(["alert", "alert-info"]);
        // No download button in file card.
        expect('[data-embedded="file"] .fa-download').toHaveCount(0);
    });
});

describe("document tab in media dialog", () => {
    beforeEach(() =>
        onRpc("/web/dataset/call_kw/ir.attachment/search_read", () => [
            {
                id: 1,
                name: "file.txt",
                mimetype: "text/plain",
                public: true,
                image_src: "",
            },
        ])
    );

    describe("without File nor Document plugin", () => {
        test("Document tab is not available by default", async () => {
            // No File nor Document plugin.
            const { editor } = await setupEditor("<p>[]<br></p>");
            execCommand(editor, "insertMedia");
            await animationFrame();
            expect(".nav-link:contains('Documents')").toHaveCount(0);
        });
    });

    describe("with File plugin (embedded component)", () => {
        test("file upload via media dialog inserts a file card in the editable", async () => {
            const { editor } = await setupEditor("<p>[]<br></p>", { config });
            execCommand(editor, "insertMedia");
            await animationFrame();
            await click(".nav-link:contains('Documents')");
            await animationFrame();
            await click(".o_we_attachment_highlight");
            // wait for the embedded component to be mounted
            await waitFor('[data-embedded="file"] .o_file_name:contains("file.txt")');
            expect('[data-embedded="file"]').toHaveCount(1);
        });
    });

    describe("with Document plugin (no embedded component", () => {
        test("file upload via media dialog inserts a link in the editable", async () => {
            const { editor } = await setupEditor("<p>[]<br></p>", {
                config: { Plugins: [...MAIN_PLUGINS, DocumentPlugin] },
            });
            execCommand(editor, "insertMedia");
            await animationFrame();
            await click(".nav-link:contains('Documents')");
            await animationFrame();
            await click(".o_we_attachment_highlight");
            expect(".odoo-editor-editable a[title='file.txt']").toHaveCount(1);
        });
    });
});

describe("powerbutton", () => {
    test("file powerbutton uploads a file directly via the system's selector", async () => {
        const { editor } = await setupEditor("<p>[]<br></p>", { config });
        const mockedUpload = patchUpload(editor);
        // Click on the upload powerbutton.
        await click(".power_button.fa-upload");
        await animationFrame();
        // Check that there's no media dialog.
        expect(".o_select_media_dialog").toHaveCount(0);
        await mockedUpload;
        // Check that file card (embedded component) was inserted in the editable.
        expect('.odoo-editor-editable [data-embedded="file"]').toHaveCount(1);
    });
});
