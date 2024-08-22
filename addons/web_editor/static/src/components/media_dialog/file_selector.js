/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";
import { useService } from '@web/core/utils/hooks';
import { ConfirmationDialog } from '@web/core/confirmation_dialog/confirmation_dialog';
import { Dialog } from '@web/core/dialog/dialog';
import { KeepLast } from "@web/core/utils/concurrency";
import { useDebounced } from "@web/core/utils/timing";
import { SearchMedia } from './search_media';

import { Component, xml, useState, useRef, onWillStart, useEffect } from "@odoo/owl";

export const IMAGE_MIMETYPES = ['image/jpg', 'image/jpeg', 'image/jpe', 'image/png', 'image/svg+xml', 'image/gif', 'image/webp'];
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.jpe', '.png', '.svg', '.gif', '.webp'];

class RemoveButton extends Component {
    static template = xml`<i class="fa fa-trash o_existing_attachment_remove position-absolute top-0 end-0 p-2 bg-white-25 cursor-pointer opacity-0 opacity-100-hover z-1 transition-base" t-att-title="removeTitle" role="img" t-att-aria-label="removeTitle" t-on-click="this.remove"/>`;
    static props = ["model?", "remove"];
    setup() {
        this.removeTitle = _t("This file is attached to the current record.");
        if (this.props.model === 'ir.ui.view') {
            this.removeTitle = _t("This file is a public view attachment.");
        }
    }

    remove(ev) {
        ev.stopPropagation();
        this.props.remove();
    }
}

export class AttachmentError extends Component {
    static components = { Dialog };
    static template = xml`
        <Dialog title="title">
            <div class="form-text">
                <p>The image could not be deleted because it is used in the
                    following pages or views:</p>
                <ul t-foreach="props.views"  t-as="view" t-key="view.id">
                    <li>
                        <a t-att-href="'/odoo/ir.ui.view/' + window.encodeURIComponent(view.id)">
                            <t t-esc="view.name"/>
                        </a>
                    </li>
                </ul>
            </div>
            <t t-set-slot="footer">
                <button class="btn btn-primary" t-on-click="() => this.props.close()">
                    Ok
                </button>
            </t>
        </Dialog>`;
    static props = ["views", "close"];
    setup() {
        this.title = _t("Alert");
    }
}

export class Attachment extends Component {
    static template = "";
    static components = {
        RemoveButton,
    };
    static props = ["*"];
    setup() {
        this.dialogs = useService('dialog');
    }

    remove() {
        this.dialogs.add(ConfirmationDialog, {
            body: _t("Are you sure you want to delete this file?"),
            confirm: async () => {
                const prevented = await rpc('/web_editor/attachment/remove', {
                    ids: [this.props.id],
                });
                if (!Object.keys(prevented).length) {
                    this.props.onRemoved(this.props.id);
                } else {
                    this.dialogs.add(AttachmentError, {
                        views: prevented[this.props.id],
                    });
                }
            },
        });
    }
}

export class FileSelectorControlPanel extends Component {
    static template = "web_editor.FileSelectorControlPanel";
    static components = {
        SearchMedia,
    };
    static props = {
        uploadUrl: Function,
        validateUrl: Function,
        uploadFiles: Function,
        changeSearchService: Function,
        search: Function,
        accept: {type: String, optional: true},
        addText: {type: String, optional: true},
        multiSelect: {type: true, optional: true},
        needle: {type: String, optional: true},
        searchPlaceholder: {type: String, optional: true},
        searchService: {type: String, optional: true},
        uploadText: {type: String, optional: true},
        urlPlaceholder: {type: String, optional: true},
        urlWarningTitle: {type: String, optional: true},
        useMediaLibrary: {type: Boolean, optional: true},
        useUnsplash: {type: Boolean, optional: true},
    };
    setup() {
        this.state = useState({
            showUrlInput: false,
            urlInput: '',
            isValidUrl: false,
            isValidFileFormat: false,
            isValidatingUrl: false,
        });
        this.debouncedValidateUrl = useDebounced(this.props.validateUrl, 500);

        this.fileInput = useRef('file-input');
    }

    get showSearchServiceSelect() {
        return this.props.searchService && this.props.needle;
    }

    get enableUrlUploadClick() {
        return !this.state.showUrlInput || (this.state.urlInput && this.state.isValidUrl && this.state.isValidFileFormat);
    }

    async onUrlUploadClick() {
        if (!this.state.showUrlInput) {
            this.state.showUrlInput = true;
        } else {
            await this.props.uploadUrl(this.state.urlInput);
            this.state.urlInput = '';
        }
    }

    async onUrlInput(ev) {
        this.state.isValidatingUrl = true;
        const { isValidUrl, isValidFileFormat } = await this.debouncedValidateUrl(ev.target.value);
        this.state.isValidFileFormat = isValidFileFormat;
        this.state.isValidUrl = isValidUrl;
        this.state.isValidatingUrl = false;
    }

    onClickUpload() {
        this.fileInput.el.click();
    }

    async onChangeFileInput() {
        const inputFiles = this.fileInput.el.files;
        if (!inputFiles.length) {
            return;
        }
        await this.props.uploadFiles(inputFiles);
        this.fileInput.el.value = '';
    }
}

export class FileSelector extends Component {
    static template = "web_editor.FileSelector";
    static components = {
        FileSelectorControlPanel,
    };
    static props = ["*"];

    setup() {
        this.notificationService = useService("notification");
        this.orm = useService('orm');
        this.uploadService = useService('upload');
        this.keepLast = new KeepLast();

        this.loadMoreButtonRef = useRef('load-more-button');
        this.existingAttachmentsRef = useRef("existing-attachments");

        this.state = useState({
            attachments: [],
            canScrollAttachments: false,
            canLoadMoreAttachments: false,
            isFetchingAttachments: false,
            needle: '',
        });

        this.NUMBER_OF_ATTACHMENTS_TO_DISPLAY = 30;

        onWillStart(async () => {
            this.state.attachments = await this.fetchAttachments(this.NUMBER_OF_ATTACHMENTS_TO_DISPLAY, 0);
        });

        this.debouncedOnScroll = useDebounced(this.updateScroll, 15);
        this.debouncedScrollUpdate = useDebounced(this.updateScroll, 500);

        useEffect(
            (modalEl) => {
                if (modalEl) {
                    modalEl.addEventListener("scroll", this.debouncedOnScroll);
                    return () => {
                        modalEl.removeEventListener("scroll", this.debouncedOnScroll);
                    };
                }
            },
            () => [this.props.modalRef.el?.querySelector("main.modal-body")]
        );

        useEffect(
            () => {
                // Updating the scroll button each time the attachments change.
                // Hiding the "Load more" button to prevent it from flickering.
                this.loadMoreButtonRef.el.classList.add("o_hide_loading");
                this.state.canScrollAttachments = false;
                this.debouncedScrollUpdate();
            },
            () => [this.allAttachments.length]);
    }

    get canLoadMore() {
        return this.state.canLoadMoreAttachments;
    }

    get hasContent() {
        return this.state.attachments.length;
    }

    get isFetching() {
        return this.state.isFetchingAttachments;
    }

    get selectedAttachmentIds() {
        return this.props.selectedMedia[this.props.id].filter(media => media.mediaType === 'attachment').map(({ id }) => id);
    }

    get mediaDomain() {
        return [
            "|", ["public", "=", true],
                 "&", ["res_model", "in", [false, this.props.resModel]],
                      ["res_id", "in", [0, this.props.resId]],
            ["name", "ilike", this.state.needle],
        ];
    }

    get attachmentsDomain() {
        return [
            // We check more than just res_field == "media_content" because the
            // link to the media may have been removed while the m2o
            // relationship still exists (e.g.: website logo). The mediaDomain
            // already ensures that attachments are related to a media anyway.
            ["res_field", "!=", false],
        ];
    }

    get allAttachments() {
        return this.state.attachments;
    }

    validateUrl(url) {
        const path = url.split('?')[0];
        const isValidUrl = /^.+\..+$/.test(path); // TODO improve
        const isValidFileFormat = true;
        return { isValidUrl, isValidFileFormat, path };
    }

    async fetchAttachments(limit, offset) {
        this.state.isFetchingAttachments = true;
        let attachments = [];
        try {
            attachments = (await this.orm.webSearchRead(
                "html_editor.media",
                [
                    ...this.mediaDomain,
                    ["attachment_id", "any", this.attachmentsDomain],
                ],
                {
                    specification: {
                        id: {},
                        name: {},
                        res_model: {},
                        res_id: {},
                        url: {},
                        public: {},
                        attachment_id: {
                            fields: {
                                description: {},
                                mimetype: {},
                                checksum: {},
                                type: {},
                                access_token: {},
                                original_id: {},
                                image_src: {},
                                image_width: {},
                                image_height: {},
                            },
                        },
                    },
                    order: "id desc",
                    offset,
                    limit,
                }
            )).records;
            attachments.forEach(attachment => {
                const attachmentId = attachment.attachment_id.id;
                delete attachment.attachment_id.id;
                Object.assign(attachment, attachment.attachment_id);
                attachment.attachment_id = attachmentId;
                attachment.mediaType = "attachment";
            });
        } catch (e) {
            // Reading attachments as a portal user is not permitted and will raise
            // an access error so we catch the error silently and don't return any
            // attachment so he can still use the wizard and upload an attachment
            if (e.exceptionName !== 'odoo.exceptions.AccessError') {
                throw e;
            }
        }
        this.state.canLoadMoreAttachments = attachments.length >= this.NUMBER_OF_ATTACHMENTS_TO_DISPLAY;
        this.state.isFetchingAttachments = false;
        return attachments;
    }

    async handleLoadMore() {
        await this.loadMore();
    }

    async loadMore() {
        return this.keepLast.add(this.fetchAttachments(this.NUMBER_OF_ATTACHMENTS_TO_DISPLAY, this.state.attachments.length)).then((newAttachments) => {
            // This is never reached if another search or loadMore occurred.
            this.state.attachments.push(...newAttachments);
        });
    }

    async handleSearch(needle) {
        await this.search(needle);
    }

    async search(needle) {
        // Prepare in case loadMore results are obtained instead.
        this.state.attachments = [];
        // Fetch attachments relies on the state's needle.
        this.state.needle = needle;
        return this.keepLast.add(this.fetchAttachments(this.NUMBER_OF_ATTACHMENTS_TO_DISPLAY, 0)).then((attachments) => {
            // This is never reached if a new search occurred.
            this.state.attachments = attachments;
        });
    }

    async uploadFiles(files) {
        await this.uploadService.uploadFiles(files, { resModel: this.props.resModel, resId: this.props.resId }, attachment => this.onUploaded(attachment));
    }

    async uploadUrl(url) {
        await this.uploadService.uploadUrl(url, {
            resModel: this.props.resModel,
            resId: this.props.resId,
        }, attachment => this.onUploaded(attachment));
    }

    async onUploaded(attachment) {
        this.state.attachments = [attachment, ...this.state.attachments.filter(attach => attach.id !== attachment.id)];
        this.selectAttachment(attachment);
        if (!this.props.multiSelect) {
            await this.props.save();
        }
        if (this.props.onAttachmentChange) {
            this.props.onAttachmentChange(attachment);
        }
    }

    onRemoved(attachmentId) {
        this.state.attachments = this.state.attachments.filter(attachment => attachment.id !== attachmentId);
    }

    selectAttachment(attachment) {
        this.props.selectMedia({ ...attachment, mediaType: 'attachment' });
    }

    selectInitialMedia() {
        return this.props.media
            && this.constructor.tagNames.includes(this.props.media.tagName)
            && !this.selectedAttachmentIds.length;
    }

    /**
     * Updates the scroll button, depending on whether the "Load more" button is
     * fully visible or not.
     */
    updateScroll() {
        const loadMoreTop = this.loadMoreButtonRef.el.getBoundingClientRect().top;
        const modalEl = this.props.modalRef.el.querySelector("main.modal-body");
        const modalBottom = modalEl.getBoundingClientRect().bottom;
        this.state.canScrollAttachments = loadMoreTop >= modalBottom;
        this.loadMoreButtonRef.el.classList.remove("o_hide_loading");
    }

    /**
     * Checks if the attachment is (partially) hidden.
     *
     * @param {Element} attachmentEl the attachment "container"
     * @returns {Boolean} true if the attachment is hidden, false otherwise.
     */
    isAttachmentHidden(attachmentEl) {
        const attachmentBottom = Math.round(attachmentEl.getBoundingClientRect().bottom);
        const modalEl = this.props.modalRef.el.querySelector("main.modal-body");
        const modalBottom = modalEl.getBoundingClientRect().bottom;
        return attachmentBottom > modalBottom;
    }

    /**
     * Scrolls two attachments rows at a time. If there are not enough rows,
     * scrolls to the "Load more" button.
     */
    handleScrollAttachments() {
        let scrollToEl = this.loadMoreButtonRef.el;
        const attachmentEls = [...this.existingAttachmentsRef.el.querySelectorAll(".o_existing_attachment_cell")];
        const firstHiddenAttachmentEl = attachmentEls.find(el => this.isAttachmentHidden(el));
        if (firstHiddenAttachmentEl) {
            const attachmentBottom = firstHiddenAttachmentEl.getBoundingClientRect().bottom;
            const attachmentIndex = attachmentEls.indexOf(firstHiddenAttachmentEl);
            const firstNextRowAttachmentEl = attachmentEls.slice(attachmentIndex).find(el => {
                return el.getBoundingClientRect().bottom > attachmentBottom;
            })
            scrollToEl = firstNextRowAttachmentEl || scrollToEl;
        }
        scrollToEl.scrollIntoView({ block: "end", inline: "nearest", behavior: "smooth" });
    }
}
