/** @odoo-module **/

import { NavBar } from '@web/webclient/navbar/navbar';
import { useService, useBus } from '@web/core/utils/hooks';
import { registry } from "@web/core/registry";
import { patch } from 'web.utils';
import { EditMenuDialog } from '@website/components/dialog/edit_menu';

const websiteSystrayRegistry = registry.category('website_systray');

patch(NavBar.prototype, 'website_navbar', {
    setup() {
        this._super();
        this.websiteService = useService('website');
        this.dialogService = useService('dialog');

        // The navbar is rerendered with an event, as it can not naturally be
        // with props/state (the WebsitePreview client action and the navbar
        // are not related).
        useBus(websiteSystrayRegistry, 'EDIT-WEBSITE', () => this.render(true));
        useBus(websiteSystrayRegistry, 'CONTENT-UPDATED', () => this.render(true));

        this.websiteDialogMenus = {
            'website.menu_edit_menu': EditMenuDialog,
        };
    },

    filterWebsiteMenus(sections) {
        const filteredSections = [];
        for (const section of sections) {
            if (!this.websiteDialogMenus[section.xmlid]) {
                let subSections = [];
                if (section.childrenTree.length) {
                    subSections = this.filterWebsiteMenus(section.childrenTree);
                }
                filteredSections.push(Object.assign({}, section, {childrenTree: subSections}));
            }
        }
        return filteredSections;
    },

    /**
     * @override
     */
    get systrayItems() {
        if (this.websiteService.currentWebsite) {
            return websiteSystrayRegistry
                .getEntries()
                .map(([key, value]) => ({ key, ...value }))
                .filter((item) => ('isDisplayed' in item ? item.isDisplayed(this.env) : true))
                .reverse();
        }
        return this._super();
    },

    /**
     * @override
     */
    get currentAppSections() {
        const currentAppSections = this._super();
        if (this.currentApp && this.currentApp.xmlid === 'website.menu_website_configuration' && !this.websiteService.currentWebsite) {
            return this.filterWebsiteMenus(currentAppSections).filter(section => section.childrenTree.length);
        }
        return currentAppSections;
    },

    /**
     * @override
     */
    onNavBarDropdownItemSelection(menu) {
        if (this.websiteDialogMenus[menu.xmlid]) {
            return this.dialogService.add(this.websiteDialogMenus[menu.xmlid]);
        }
        return this._super(menu);
    }
});
