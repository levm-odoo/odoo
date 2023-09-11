/* @odoo-module */

import { useState } from "@odoo/owl";

import { useService } from "@web/core/utils/hooks";

function dataUrlToBlob(data, type) {
    const binData = window.atob(data);
    const uiArr = new Uint8Array(binData.length);
    uiArr.forEach((_, index) => (uiArr[index] = binData.charCodeAt(index)));
    return new Blob([uiArr], { type });
}

export class AttachmentUploader {
    constructor(thread, { composer, onFileUploaded } = {}) {
        this.attachmentUploadService = useService("mail.attachment_upload");
        Object.assign(this, { thread, composer });
        this.attachmentUploadService.bus.addEventListener("FILE_UPLOADED", ({ detail: upload }) => {
            if (
                thread.model === upload.data.get("thread_model") &&
                thread.id === upload.data.get("thread_id")
            ) {
                onFileUploaded?.();
            }
        });
    }

    uploadData({ data, name, type }) {
        const file = new File([dataUrlToBlob(data, type)], name, { type });
        return this.uploadFile(file);
    }

    async uploadFile(file, options) {
        return this.attachmentUploadService.uploadFile(this.thread, this.composer, file, options);
    }

    async unlink(attachment) {
        await this.attachmentUploadService.unlink(attachment);
    }
}

/**
 * @param {import("@mail/core/common/thread_model").Thread} thread
 * @param {Object} [param1={}]
 * @param {import("@mail/core/common/composer_model").Composer} [param1.composer]
 * @param {function} [param1.onFileUploaded]
 */
export function useAttachmentUploader(thread, { composer, onFileUploaded } = {}) {
    return useState(new AttachmentUploader(...arguments));
}
