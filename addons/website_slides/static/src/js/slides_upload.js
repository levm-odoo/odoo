/** @odoo-module **/

import publicWidget from '@web/legacy/js/public/public_widget';
import { SlideUploadDialog } from "@website_slides/js/public/components/slide_upload_dialog/slide_upload_dialog";

publicWidget.registry.websiteSlidesUpload = publicWidget.Widget.extend({
    selector: '.o_wslides_js_slide_upload',
    events: {
        'click': '_onUploadClick',
    },

    /**
     * Automatically opens the upload dialog if requested from query string.
     * If openModal is defined ( === '' ), opens the category selection dialog.
     * If openModal is a category name, opens the category's upload dialog.
     *
     * @override
     */
    start: function () {
        if ('openModal' in this.el.dataset) {
            this._openDialog(this.el);
            this.el.dataset.openModal = false;
        }
        return this._super.apply(this, arguments);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    _openDialog: function (element) {
        const dataset = element.dataset;
        let moduleToInstall;
        if (dataset.modulesToInstall) {
            moduleToInstall = JSON.parse(dataset.modulesToInstall)
        }
        this.call("dialog", "add", SlideUploadDialog, {
            categoryId: dataset.categoryId,
            channelId: parseInt(dataset.channelId),
            canPublish: dataset.canPublish === "True",
            canUpload: dataset.canUpload === "True",
            modulesToInstall: moduleToInstall || [],
            openModal: dataset.openModal,
        });
    },
    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Event} ev
     */
    _onUploadClick: function (ev) {
        ev.preventDefault();
        this._openDialog(ev.currentTarget);
    },
});

export default {
    websiteSlidesUpload: publicWidget.registry.websiteSlidesUpload
};
