import { DocumentSelector } from "@html_editor/main/media/media_dialog/document_selector";
import { Plugin } from "@html_editor/plugin";
import { withSequence } from "@html_editor/utils/resource";
import { _t } from "@web/core/l10n/translation";
import { renderStaticFileCard } from "./render_static_file_card";

const documentMediaDialogTab = {
    id: "DOCUMENTS",
    title: _t("Documents"),
    Component: DocumentSelector,
    sequence: 15,
};

export class DocumentPlugin extends Plugin {
    static id = "document";
    static dependencies = ["dom", "history"];
    resources = {
        user_commands: {
            id: "uploadFile",
            title: _t("Upload a file"),
            description: _t("Add a download box"),
            icon: "fa-upload",
            run: this.uploadAndInsertFiles.bind(this),
            isAvailable: () => !this.config.disableFile,
        },
        powerbox_items: {
            categoryId: "media",
            commandId: "uploadFile",
            keywords: ["file"],
        },
        power_buttons: withSequence(5, { commandId: "uploadFile" }),
        media_dialog_tabs_providers: () =>
            this.config.disableFile ? [] : [documentMediaDialogTab],
        selectors_for_feff_providers: () => ".o_file_card",
    };

    get recordInfo() {
        return this.config.getRecordInfo?.() || {};
    }

    async uploadAndInsertFiles() {
        // Upload
        const attachments = await this.services.uploadLocalFiles.upload(this.recordInfo, {
            multiple: true,
            accessToken: true,
        });
        if (!attachments.length) {
            // No files selected or error during upload
            this.editable.focus();
            return;
        }
        if (this.config.onAttachmentChange) {
            attachments.forEach(this.config.onAttachmentChange);
        }
        // Render
        const fileCards = attachments.map(this.renderFileBanner.bind(this));
        // Insert
        fileCards.forEach(this.dependencies.dom.insert);
        this.dependencies.history.addStep();
    }

    renderFileBanner(attachment) {
        // TODO: prepend host to URL
        const url = this.services.uploadLocalFiles.getURL(attachment, {
            download: true,
            unique: true,
            accessToken: true,
        });
        const { name: filename, mimetype } = attachment;
        return renderStaticFileCard(filename, mimetype, url);
    }
}
