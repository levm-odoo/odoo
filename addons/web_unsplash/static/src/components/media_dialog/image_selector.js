/** @odoo-module **/

import { patch } from 'web.utils';
import { MediaDialog, TABS } from '@web_editor/components/media_dialog/media_dialog';
import { ImageSelector } from '@web_editor/components/media_dialog/image_selector';
import { useService } from '@web/core/utils/hooks';
import { uploadService, AUTOCLOSE_DELAY } from '@web_editor/components/upload_progress_toast/upload_service';

const { useState, Component } = owl;

class UnsplashCredentials extends Component {
    setup() {
        this.state = useState({
            key: '',
            appId: '',
            hasKeyError: this.props.hasCredentialsError,
            hasAppIdError: this.props.hasCredentialsError,
        });
    }

    submitCredentials() {
        if (this.state.key === '') {
            this.state.hasKeyError = true;
        } else if (this.state.appId === '') {
            this.state.hasAppIdError = true;
        } else {
            this.props.submitCredentials(this.state.key, this.state.appId);
        }
    }
}
UnsplashCredentials.template = 'web_unsplash.UnsplashCredentials';

class UnsplashError extends Component {}
UnsplashError.template = 'web_unsplash.UnsplashError';
UnsplashError.components = {
    UnsplashCredentials,
};

patch(ImageSelector.prototype, 'image_selector_unsplash', {
    setup() {
        this._super();
        this.unsplash = useService('unsplash');

        this.state.unsplashRecords = [];
        this.state.isFetchingUnsplash = false;
        this.state.isMaxed = false;
        this.state.unsplashError = null;
    },

    get canLoadMore() {
        if (this.state.searchService === 'all') {
            return this._super() || this.state.needle && !this.state.isMaxed && !this.state.unsplashError;
        } else if (this.state.searchService === 'unsplash') {
            return this.state.needle && !this.state.isMaxed && !this.state.unsplashError;
        }
        return this._super();
    },

    get hasContent() {
        if (this.state.searchService === 'all') {
            return this._super() || !!this.state.unsplashRecords.length;
        } else if (this.state.searchService === 'unsplash') {
            return !!this.state.unsplashRecords.length;
        }
        return this._super();
    },

    get errorTitle() {
        switch (this.state.unsplashError) {
            case 'key_not_found':
                return this.env._t("Setup Unsplash to access royalty free photos.");
            case 401:
                return this.env._t("Unauthorized Key");
            case 403:
                return this.env._t("Search is temporarily unavailable");
            default:
                return this.env._t("Something went wrong");
        }
    },

    get errorSubtitle() {
        switch (this.state.unsplashError) {
            case 'key_not_found':
                return "";
            case 401:
                return this.env._t("Please check your Unsplash access key and application ID.");
            case 403:
                return this.env._t("The max number of searches is exceeded. Please retry in an hour or extend to a better account.");
            default:
                return this.env._t("Please check your internet connection or contact administrator.");
        }
    },

    get selectedRecordIds() {
        return this.props.selectedMedia[this.props.id].filter(media => media.mediaType === 'unsplashRecord').map(({ id }) => id);
    },

    // It seems that setters are mandatory when patching a component that
    // extends another component.
    set canLoadMore(_) {},
    set hasContent(_) {},
    set isFetching(_) {},
    set selectedMediaIds(_) {},
    set attachmentsDomain(_) {},
    set errorTitle(_) {},
    set errorSubtitle(_) {},
    set selectedRecordIds(_) {},

    async fetchUnsplashRecords(offset) {
        this.state.isFetchingUnsplash = true;
        if (!this.state.needle) {
            return { records: [], isMaxed: false };
        }
        try {
            const { isMaxed, images } = await this.unsplash.getImages(this.state.needle, offset, this.NUMBER_OF_ATTACHMENTS_TO_DISPLAY);
            this.state.isFetchingUnsplash = false;
            this.state.unsplashError = false;
            const records = images.map(record => {
                const url = new URL(record.urls.regular);
                // In small windows, row height could get quite a bit larger than the min, so we keep some leeway.
                url.searchParams.set('h', 2 * this.MIN_ROW_HEIGHT);
                url.searchParams.delete('w');
                return Object.assign({}, record, {
                    url: url.toString(),
                });
            });
            return { isMaxed, records };
        } catch (e) {
            this.state.isFetchingUnsplash = false;
            this.state.unsplashError = e;
            return { records: [], isMaxed: false };
        }
    },

    async loadMore(...args) {
        await this._super(...args);
        const { records, isMaxed } = await this.fetchUnsplashRecords(this.state.unsplashRecords.length);
        this.state.unsplashRecords.push(...records);
        this.state.isMaxed = isMaxed;
    },

    async search(...args) {
        await this._super(...args);
        await this.searchUnsplash();
    },

    async searchUnsplash() {
        if (!this.state.needle) {
            this.state.unsplashError = false;
            this.state.unsplashRecords = [];
            this.state.isMaxed = false;
        }
        const { records, isMaxed } = await this.fetchUnsplashRecords(0);
        this.state.unsplashRecords = records;
        this.state.isMaxed = isMaxed;
    },

    async onClickRecord(media) {
        this.props.selectMedia({ ...media, mediaType: 'unsplashRecord', query: this.state.needle });
        if (!this.props.multiSelect) {
            await this.props.save();
        }
    },

    async submitCredentials(key, appId) {
        this.state.unsplashError = null;
        await this.rpc('/web_unsplash/save_unsplash', { key, appId });
        await this.searchUnsplash();
    },
});
ImageSelector.components = {
    ...ImageSelector.components,
    UnsplashError,
};

patch(MediaDialog.prototype, 'media_dialog_unsplash', {
    setup() {
        this._super();

        this.uploadService = useService('upload');
    },

    async save() {
        const _super = this._super.bind(this);
        const selectedImages = this.selectedMedia[TABS.IMAGES.id];
        if (selectedImages) {
            const unsplashRecords = selectedImages.filter(media => media.mediaType === 'unsplashRecord');
            if (unsplashRecords.length) {
                await this.uploadService.uploadUnsplashRecords(unsplashRecords, { resModel: this.props.resModel, resId: this.props.resId }, (attachments) => {
                    this.selectedMedia[TABS.IMAGES.id] = this.selectedMedia[TABS.IMAGES.id].filter(media => media.mediaType !== 'unsplashRecord');
                    this.selectedMedia[TABS.IMAGES.id] = this.selectedMedia[TABS.IMAGES.id].concat(attachments.map(attachment => ({...attachment, mediaType: 'attachment'})));
                });
            }
        }
        return _super(...arguments);
    },
});

patch(uploadService, 'upload_service_unsplash', {
    start(env, { rpc }) {
        const service = this._super(...arguments);
        return {
            ...service,
            async uploadUnsplashRecords(records, { resModel, resId }, onUploaded) {
                service.incrementId();
                const file = service.addFile({
                    id: service.fileId,
                    name: records.length > 1 ?
                    _.str.sprintf(env._t("Uploading %s '%s' images."), records.length, records[0].query) :
                    _.str.sprintf(env._t("Uploading '%s' image."), records[0].query),
                    size: null,
                    progress: 0,
                });

                try {
                    const urls = {};
                    for (const record of records) {
                        const _1920Url = new URL(record.urls.regular);
                        _1920Url.searchParams.set('w', '1920');
                        urls[record.id] = {
                            url: _1920Url.href,
                            download_url: record.links.download_location,
                            description: record.alt_description,
                        };
                    }

                    const xhr = new XMLHttpRequest();
                    xhr.upload.addEventListener('progress', ev => {
                        const rpcComplete = ev.loaded / ev.total * 100;
                        file.progress = rpcComplete;
                    });
                    xhr.upload.addEventListener('load', function () {
                        // Don't show yet success as backend code only starts now
                        file.progress = 100;
                    });
                    const attachments = await rpc('/web_unsplash/attachment/add', {
                        'res_id': resId,
                        'res_model': resModel,
                        'unsplashurls': urls,
                        'query': records[0].query,
                    }, {xhr});

                    if (attachments.error) {
                        file.hasError = true;
                        file.errorMessage = attachments.error;
                    } else {
                        file.uploaded = true;
                        await onUploaded(attachments);
                    }
                    setTimeout(() => service.deleteFile(file.id), AUTOCLOSE_DELAY);
                } catch (error) {
                    file.hasError = true;
                    setTimeout(() => service.deleteFile(file.id), AUTOCLOSE_DELAY);
                    throw error;
                }
            }
        };
    }
});
