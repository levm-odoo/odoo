import { DocumentSelector } from "@html_editor/main/media/media_dialog/document_selector";
import { Plugin } from "@html_editor/plugin";
import { _t } from "@web/core/l10n/translation";
import { renderToElement } from "@web/core/utils/render";

const documentMediaDialogTab = {
    id: "DOCUMENTS",
    title: _t("Documents"),
    Component: DocumentSelector,
    sequence: 15,
};

/**
 * Fallback for the FilePlugin, when embedded components are not available.
 */
export class DocumentPlugin extends Plugin {
    static id = "document";
    static dependencies = ["dom", "history"];
    resources = {
        user_commands: [
            {
                id: "uploadFile2",
                title: _t("Upload a file (non-embedded)"),
                description: _t("Add a download box 2"),
                icon: "fa-upload",
                run: this.uploadAndInsertFiles.bind(this),
                isAvailable: () => !this.config.disableFile,
            },
        ],
        powerbox_items: {
            categoryId: "media",
            commandId: "uploadFile2",
            keywords: ["file"],
        },
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
        // consider adding this to a template that t-calls the template below
        const banner = this.document.createElement("span");
        banner.classList.add("o_file_card");
        banner.contentEditable = false;
        const bannerElement = renderToElement("html_editor.staticFileBanner", {
            fileModel: {
                filename: attachment.name,
                mimetype: attachment.mimetype,
                downloadUrl: url,
            },
        });

        // const bannerElement = parseHTML(
        //     this.document,
        //     `<span class="d-flex align-items-center alert alert-info">
        //         <span class="o_file_image d-flex o_image" data-mimetype="${attachment.mimetype}"></div>
        //         <span class="px-5 d-flex align-items-center" contenteditable="true">
        //             <a href="${url}">${attachment.name}</a>
        //         </span>
        //     </span>`
        // ).childNodes[0];
        banner.append(bannerElement);
        return banner;
    }
}
