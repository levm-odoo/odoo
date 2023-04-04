/** @odoo-module **/

import { WebsiteEditorComponent } from '@website/components/editor/editor';
import { WebsiteTranslator } from '@website/components/translator/translator';
import { patch } from '@web/legacy/js/core/utils';

patch(WebsiteEditorComponent.prototype, 'website_slides_editor', {
    /**
     * @override
     */
    publicRootReady() {
        const { pathname, search } = this.websiteService.contentWindow.location;
        if (pathname.includes('slides') && search.includes('fullscreen=1')) {
            this.websiteContext.edition = false;
            this.websiteService.goToWebsite({path: `${pathname}?fullscreen=0`, edition: true});
        } else {
            this._super(...arguments);
        }
    }
});

patch(WebsiteTranslator.prototype, 'website_slides_translator', {
    /**
     * When editing translations of a slide in fullscreen mode: force fullscreen off.
     * Indeed, the fullscreen layout is not fit for content edition.
     * @override
     */
    publicRootReady() {
        const { pathname, search, hash } = this.websiteService.contentWindow.location;
        if (pathname.includes('slides') && search.includes('fullscreen=1')) {
            const searchParams = new URLSearchParams(search);
            searchParams.set('edit_translations', '1');
            searchParams.set('fullscreen', '0');
            this.websiteService.goToWebsite({
                path: encodeURI(pathname + `?${searchParams.toString() + hash}`),
                translation: true
            });
        } else {
            this._super(...arguments);
        }
    }
});
