/** @odoo-module **/

import { registry } from '@web/core/registry';
import { useService } from '@web/core/utils/hooks';

const { Component, onWillStart, useRef } = owl;

export class WebsitePreview extends Component {
    setup() {
        this.websiteService = useService('website');

        this.iframe = useRef('iframe');

        onWillStart(async () => {
            await this.websiteService.fetchWebsites();
            const encodedPath = encodeURIComponent(this.path);
            this.initialUrl = `/website/force/${this.websiteId}?path=${encodedPath}`;
        });
    }

    get websiteId() {
        let websiteId = this.props.action.context.params && this.props.action.context.params.website_id;
        if (!websiteId) {
            websiteId = this.websiteService.websites[0].id;
        }
        return websiteId;
    }

    get path() {
        let path = this.props.action.context.params && this.props.action.context.params.path;
        if (path) {
            const url = new URL(path, window.location.origin);
            if (this._isTopWindowURL(url)) {
                // If the client action is initialized with a path that
                // should not be opened inside the iframe (= something we
                // would want to open on the top window), we consider that
                // this is not a valid flow. Instead of trying to open it on
                // the top window, we initialize the iframe with the
                // website homepage...
                path = '/';
            } else {
                // ... otherwise, the path still needs to be normalized (as
                // it would be if the given path was used as an href of a
                // <a/> element).
                path = url.pathname + url.search + url.hash;
            }
        } else {
            path = '/';
        }
        return path;
    }

    /**
     * Returns true if the url should be opened in the top
     * window.
     *
     * @param host {string} host of the route.
     * @param pathname {string} path of the route.
     * @private
     */
    _isTopWindowURL({ host, pathname }) {
        const backendRoutes = ['/web', '/web/session/logout'];
        return host !== window.location.host || (pathname && backendRoutes.includes(pathname));
    }

    _onPageLoaded() {
        // This replaces the browser url (/web#action=website...) with
        // the iframe's url (it is clearer for the user).
        this.currentUrl = this.iframe.el.contentDocument.location.href;
        history.replaceState({}, this.props.action.display_name, this.currentUrl);

        // The clicks on the iframe are listened, so that links with external
        // redirections can be opened in the top window.
        this.iframe.el.contentDocument.addEventListener('click', (ev) => {
            const linkEl = ev.target.closest('[href]');
            if (!linkEl) {
                return;
            }

            const { href, target } = linkEl;
            if (href && target !== '_blank' && !this.websiteContext.edition && this._isTopWindowURL(linkEl)) {
                ev.preventDefault();
                ev.stopPropagation();
                window.location.replace(href);
            }
        });
    }
}
WebsitePreview.template = 'website.WebsitePreview';

registry.category('actions').add('website_preview', WebsitePreview);
