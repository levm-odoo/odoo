import { _t } from "@web/core/l10n/translation";
import { pick } from "@web/core/utils/objects";
import options from "@web_editor/js/editor/snippets.options";

/* global FB */

options.registry.facebookPage = options.Class.extend({
    init() {
        this._super(...arguments);
        this.orm = this.bindService("orm");
        this.notification = this.bindService("notification");
    },

    /**
     * Initializes the required facebook page data to create the iframe.
     *
     * @override
     */
    async willStart() {
        await this._super(...arguments);

        const defaults = {
            href: '',
            id: '',
            height: 700,
            width: 500,
            tabs: "timeline",
            small_header: false,
            hide_cover: "true",
        };
        this.fbData = Object.assign({}, defaults, pick(this.$target[0].dataset, ...Object.keys(defaults)));
        if (!this.fbData.href) {
            // Fetches the default url for facebook page from website config
            const res = await this.orm.searchRead("website", [], ["social_facebook"], { limit: 1 });
            if (res && res.length) {
                this.fbData.href = res[0].social_facebook || "";
            }
        }

        await this._markFbElement();
        await this._refreshPublicWidgets();
    },

    /**
     * @override
     */
    onBuilt() {
        this.$target[0].querySelector('.o_facebook_page_preview')?.remove();
    },

    //--------------------------------------------------------------------------
    // Options
    //--------------------------------------------------------------------------

    /**
     * Toggles a checkbox option.
     *
     * @see this.selectClass for parameters
     * @param {String} optionName the name of the option to toggle
     */
    toggleOption: function (previewMode, widgetValue, params) {
        let optionName = params.optionName;
        const fbPageElement = this._getFbPageElement();

        if (optionName.startsWith('tab.')) {
            optionName = optionName.replace('tab.', '');
            if (widgetValue) {
                this.fbData.tabs = this.fbData.tabs
                    .split(',')
                    .filter(t => t !== '')
                    .concat([optionName])
                    .join(',');
                fbPageElement.setAttribute("data-tabs", this.fbData.tabs);
            } else {
                this.fbData.tabs = this.fbData.tabs
                    .split(',')
                    .filter(t => t !== optionName)
                    .join(',');
                fbPageElement.setAttribute("data-tabs", this.fbData.tabs);
            }
        } else {
            if (optionName === 'show_cover') {
                this.fbData.hide_cover = widgetValue ? "false" : "true";
                fbPageElement.setAttribute("data-hide-cover", this.fbData.hide_cover);
            } else {
                this.fbData[optionName] = widgetValue;
                fbPageElement.setAttribute(`data-${optionName}`, widgetValue);
            }
        }
        return this._markFbElement();
    },

    /**
     * Sets the facebook page's URL.
     *
     * @see this.selectClass for parameters
     */
    pageUrl: function (previewMode, widgetValue, params) {
        const fbPageElement = this._getFbPageElement();
        this.fbData.href = widgetValue;
        fbPageElement.setAttribute("data-href", widgetValue);
        return this._markFbElement();
    },

    /**
     * Sets the Facebook page's height.
     * @see this.selectClass for parameters
     */
    setHeight: function (previewMode, widgetValue, params) {
        const height = JSON.parse(widgetValue);
        this.fbData.height = height;
        const fbPageElement = this._getFbPageElement();

        if (fbPageElement) {
            fbPageElement.setAttribute("data-height", height);
        }
        return this._markFbElement();
    },

    /**
     * Sets the Facebook page's width.
     * @see this.selectClass for parameters
     */
    setWidth: function (previewMode, widgetValue, params) {
        const width = JSON.parse(widgetValue);
        this.fbData.width = width;
        const fbPageElement = this._getFbPageElement();

        if (fbPageElement) {
            fbPageElement.setAttribute("data-width", width);
        }
        return this._markFbElement();
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Gets the Facebook page element.
     *
     * @private
     * @returns {Element} The Facebook page element.
     */
    _getFbPageElement() {
        return this.$target[0].querySelector(".fb-page");
    },

    /**
     * Sets the correct dataAttributes on the facebook iframe and refreshes it.
     *
     * @see this.selectClass for parameters
     */
    async _markFbElement() {
        try {
            await this._checkURL();
            // Managing height based on options
            if (this.fbData.tabs) {
                this.setHeight(
                    null,
                    JSON.stringify(this.fbData.tabs === "events" ? 300 : this.fbData.height)
                );
            } else if (JSON.parse(this.fbData.small_header)) {
                this.setHeight(null, JSON.stringify(70));
            }
            for (const [key, value] of Object.entries(this.fbData)) {
                this.$target[0].dataset[key] = value;
            }
            // Initialize the Facebook SDK
            if (typeof FB !== "undefined") {
                FB.XFBML.parse();
            }
        } catch {
            this.notification.add(
                _t(
                    "Something went wrong: Unable to load the social media block. Check your connection or disable blocking extensions."
                ),
                {
                    type: "warning",
                }
            );
        }
    },

    /**
     * @override
     */
    _computeWidgetState: function (methodName, params) {
        const optionName = params.optionName;
        switch (methodName) {
            case 'toggleOption': {
                if (optionName.startsWith('tab.')) {
                    return this.fbData.tabs.split(',').includes(optionName.replace(/^tab./, ''));
                } else {
                    if (optionName === 'show_cover') {
                        return this.fbData.hide_cover === "false";
                    }
                    return this.fbData[optionName];
                }
            }
            case 'pageUrl': {
                return this._checkURL().then(() => this.fbData.href);
            }
            case "setHeight": {
                return this.fbData.height;
            }
            case "setWidth": {
                return this.fbData.width;
            }
        }
        return this._super(...arguments);
    },

    /**
     * @private
     */
    async _checkURL() {
        const defaultURL = 'https://www.facebook.com/Odoo';
        // Patterns matched by the regex (all relate to existing pages,
        // in spite of the URLs containing "profile.php" or "people"):
        // - https://www.facebook.com/<pagewithaname>
        // - http://www.facebook.com/<page.with.a.name>
        // - www.facebook.com/<fbid>
        // - facebook.com/profile.php?id=<fbid>
        // - www.facebook.com/<name>-<fbid>  - NB: the name doesn't matter
        // - www.fb.com/people/<name>/<fbid>  - same
        // - m.facebook.com/p/<name>-<fbid>  - same
        // The regex is kept as a huge one-liner for performance as it is
        // compiled once on script load. The only way to split it on several
        // lines is with the RegExp constructor, which is compiled on runtime.
        const match = this.fbData.href.trim().match(/^(https?:\/\/)?((www\.)?(fb|facebook)|(m\.)?facebook)\.com\/(((profile\.php\?id=|people\/([^/?#]+\/)?|(p\/)?[^/?#]+-)(?<id>[0-9]{12,16}))|(?<nameid>[\w.]+))($|[/?# ])/);
        if (match) {
            // Check if the page exists on Facebook or not
            const pageId = match.groups.nameid || match.groups.id;
            const res = await fetch(`https://graph.facebook.com/${pageId}/picture`);
            if (res.ok) {
                this.fbData.id = pageId;
            } else {
                this.fbData.id = "";
                this.fbData.href = defaultURL;
                this.notification.add(_t("We couldn't find the Facebook page"), {
                    type: "warning",
                });
            }
        } else {
            this.fbData.id = "";
            this.fbData.href = defaultURL;
            this.notification.add(_t("You didn't provide a valid Facebook link"), {
                type: "warning",
            });
        }
    },
});
