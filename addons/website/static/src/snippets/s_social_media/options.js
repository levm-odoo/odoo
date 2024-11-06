import fonts from '@web_editor/js/wysiwyg/fonts';
import weUtils from '@web_editor/js/common/utils';
import options from '@web_editor/js/editor/snippets.options';
import { _t } from "@web/core/l10n/translation";
import { ICON_SELECTOR } from "@web_editor/js/editor/odoo-editor/src/utils/utils";

let dbSocialValues;
const clearDbSocialValuesCache = () => {
    dbSocialValues = undefined;
};
const getDbSocialValuesCache = () => {
    return dbSocialValues;
};

options.registry.SocialMedia = options.Class.extend({
    init() {
        this._super(...arguments);
        this.orm = this.bindService("orm");
    },

    /**
     * @override
     */
    start() {
        // When the alert is clicked, focus the first media input in the editor.
        this.__onSetupBannerClick = this._onSetupBannerClick.bind(this);
        this.$target[0].addEventListener('click', this.__onSetupBannerClick);
        this.entriesNotInDom = [];
        return this._super(...arguments);
    },
    /**
     * @override
     */
    async onBuilt() {
        await this._fetchSocialMedia();
        for (const anchorEl of this.$target[0].querySelectorAll(':scope > a')) {
            const mediaName = this._findRelevantSocialMedia(anchorEl.href);
            if (mediaName && !dbSocialValues[`social_${mediaName}`]) {
                // Delete social media without value in DB.
                anchorEl.remove();
            }
        }
        // Ensure we do not drop a blank block.
        this._handleNoMediaAlert();
    },
    /**
     * @override
     */
    destroy() {
        this._super(...arguments);
        this.$target[0].removeEventListener('click', this.__onSetupBannerClick);
    },

    //--------------------------------------------------------------------------
    // Options
    //--------------------------------------------------------------------------

    /**
     * Applies the we-list on the target and rebuilds the social links.
     *
     * @see this.selectClass for parameters
     */
    async renderListItems(previewMode, widgetValue, params) {
        const ariaLabelsOfSocialNetworks = {
            "facebook": _t("Facebook"),
            "twitter": _t("X"),
            "linkedin": _t("LinkedIn"),
            "youtube": _t("YouTube"),
            "instagram": _t("Instagram"),
            "github": _t("GitHub"),
            "tiktok": _t("TikTok"),
        };
        const setAriaLabelOfSocialNetwork = (el, name, url) => {
            let ariaLabel = ariaLabelsOfSocialNetworks[name];
            if (!ariaLabel) {
                try {
                    // Return the domain of the given url.
                    ariaLabel = new URL(url).hostname.split('.').slice(-2)[0];
                } catch {
                    // Fallback if the url is not valid.
                    ariaLabel = _t("Other social network");
                }
            }
            el.setAttribute("aria-label", ariaLabel);
        };

        const anchorEls = this.$target[0].querySelectorAll(':scope > a');
        let entries = JSON.parse(widgetValue);
        const anchorsToRemoveEls = [];
        for (let i = 0; i < anchorEls.length; i++) {
            // For each position, check if the item that was there before
            // (marked by _computeWidgetState), is still there. Otherwise,
            // remove it. TODO improve ?
            if (!entries.find(entry => parseInt(entry.domPosition) === i)) {
                anchorsToRemoveEls.push(anchorEls[i]);
            }
        }
        for (const el of anchorsToRemoveEls) {
            el.remove();
        }
        this.entriesNotInDom = [];

        for (let listPosition = 0; listPosition < entries.length; listPosition++) {
            const entry = entries[listPosition];
            // Check if the url is valid.
            const url = entry.display_name;
            if (url && !/^(([a-zA-Z]+):|\/)/.test(url)) {
                // We permit every protocol (http:, https:, ftp:, mailto:,...).
                // If none is explicitly specified, we assume it is a https.
                entry.display_name = `https://${url}`;
            }
            const isDbField = Boolean(entry.media);
            if (isDbField) {
                // Handle URL change for DB links.
                dbSocialValues[`social_${entry.media}`] = entry.display_name;
            }

            let anchorEl = anchorEls[entry.domPosition];
            // new socal media
            if (!entry.selected) {
                if (anchorEl) {
                    delete entry.domPosition;
                    anchorEl.remove();
                }
                entry.listPosition = listPosition;
                this.entriesNotInDom.push(entry);
                continue;
            }
            if (!anchorEl) {
                if (anchorEls.length === 0) {
                    // Create a HTML element if no one already exist.
                    anchorEl = document.createElement("a");
                    anchorEl.setAttribute("target", "_blank");
                    const iEl = document.createElement("i");
                    iEl.classList.add("fa", "rounded-circle", "shadow-sm", "o_editable_media");
                    anchorEl.appendChild(iEl);
                } else {
                    // Copy existing style if there is already another link.
                    anchorEl = this.$target[0].querySelector(":scope > a").cloneNode(true);
                    this._removeSocialMediaClasses(anchorEl);
                }
                if (isDbField) {
                    anchorEl.href = dbSocialValues[`social_${encodeURIComponent(entry.media)}`];
                    anchorEl.classList.add(`s_social_media_${entry.media}`);
                }
                setAriaLabelOfSocialNetwork(anchorEl, entry.media, entry.display_name);
            }
            const iEl = anchorEl.querySelector(ICON_SELECTOR);
            if (iEl) {
                const faIcon = isDbField
                    ? entry.media === "youtube"
                        ? `fa-${entry.media}-play`
                        : `fa-${entry.media}`
                    : "fa-pencil";
                iEl.classList.add(faIcon);
            }
            // sets the icon for each social medias.
            const href = anchorEl.getAttribute("href");
            if (href !== entry.display_name) {
                let socialMedia = null;
                if (this._isValidURL(entry.display_name)) {
                    // Propose an icon only for valid URLs (no mailto).
                    socialMedia = this._findRelevantSocialMedia(entry.display_name);
                    if (socialMedia) {
                        this._removeSocialMediaClasses(anchorEl);
                        anchorEl.classList.add(`s_social_media_${socialMedia}`);
                        if (iEl) {
                            socialMedia === "youtube"
                                ? (socialMedia = "youtube-play")
                                : socialMedia;
                            iEl.classList.add(`fa-${socialMedia}`);
                        }
                    }
                }
                anchorEl.setAttribute("href", entry.display_name);
                setAriaLabelOfSocialNetwork(anchorEl, socialMedia, entry.display_name);
            }
            // Place the link at the correct position
            this.$target[0].appendChild(anchorEl);
        }

        // Restore whitespaces around the links
        this.$target[0].normalize();
        const finalLinkEls = this.$target[0].querySelectorAll(':scope > a');
        if (finalLinkEls.length) {
            finalLinkEls[0].previousSibling.textContent = '\n';
            for (const linkEl of finalLinkEls) {
                linkEl.after(document.createTextNode('\n'));
            }
        }

        this._handleNoMediaAlert();
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    async _computeWidgetState(methodName, params) {
        if (methodName !== 'renderListItems') {
            return this._super(methodName, params);
        }
        await this._fetchSocialMedia();
        let listPosition = 0;
        let domPosition = 0;
        // Check the DOM to compute the state of the ListUserValueWidget.
        const targetAs = [...this.$target[0].querySelectorAll(":scope > a")];
        let entries = targetAs.map((el) => {
            const media = dbSocialValues[`social_${this._findRelevantSocialMedia(el.href)}`]
                ? this._findRelevantSocialMedia(el.href)
                : undefined;
            // Avoid a DOM entry and a non-dom entry having the same position.
            while (this.entriesNotInDom.find(entry => entry.listPosition === listPosition)) {
                listPosition++;
            }
            return {
                id: weUtils.generateHTMLId(),
                display_name: el.getAttribute("href"),
                placeholder: `https://${encodeURIComponent(media) || 'example'}.com/yourPage`,
                undeletable: !!media,
                notToggleable: !media,
                selected: true,
                listPosition: listPosition++,
                domPosition: domPosition++,
                media: media,
            };
        });
        // First compare what extra entry that came on this.entriesNotInDom validate it with params.value initially params.val will be
        // undefined so we will accept this.entriesNotInDom as it is. But for the next time we will have to validate it with params.value
        // and remove the extra entry from this.entriesNotInDom such that when we delete the entry from the editor it should not be added again.
        if (params.activeValue) {
            const activeValues = JSON.parse(params.activeValue);
            const activeIds = activeValues.map((entry) => entry.id);
            // Filter entriesNotInDom to exclude those not in activeValues
            this.entriesNotInDom = this.entriesNotInDom.filter((entry) =>
                activeIds.includes(entry.id)
            );
        }
        entries = entries.concat(this.entriesNotInDom);
        entries.sort((a, b) => {
            return a.listPosition - b.listPosition;
        });
        return JSON.stringify(entries);
    },
    /**
     * Fetches the urls of the social networks that are in the database.
     */
    async _fetchSocialMedia() {
        const targetAs = [...this.$target[0].querySelectorAll(":scope > a")];
        dbSocialValues = {};
        targetAs.forEach((el) => {
            const media = this._findRelevantSocialMedia(el.href);
            if (media) {
                dbSocialValues[`social_${media}`] = el.href;
            }
        });
    },
    /**
     * Finds the social network for the given url.
     *
     * @param {String} url
     * @return {String} The social network to which the url leads to.
     */
    _findRelevantSocialMedia(url) {
        // Note that linkedin, twitter, github and tiktok will also work because
        // the url will match the good icon so we don't need a specific regex.
        const supportedSocialMedia = [
            ['facebook', /^(https?:\/\/)(www\.)?(facebook|fb|m\.facebook)\.(com|me).*$/],
            ['youtube', /^(https?:\/\/)(www\.)?(youtube.com|youtu.be).*$/],
            ['instagram', /^(https?:\/\/)(www\.)?(instagram.com|instagr.am|instagr.com).*$/],
        ];
        for (const [socialMedia, regex] of supportedSocialMedia) {
            if (regex.test(url)) {
                return socialMedia;
            }
        }
        // Check if an icon matches the URL domain
        try {
            const domain = new URL(url).hostname.split('.').slice(-2)[0];
            fonts.computeFonts();
            const iconNames = fonts.fontIcons[0].alias;
            const exactIcon = iconNames.find(el => el === `fa-${domain}`);
            return (exactIcon || iconNames.find(el => el.includes(domain))).split('fa-').pop();
        } catch {
            return false;
        }
    },
    /**
     * Adds a warning banner to alert that there are no social networks.
     */
    _handleNoMediaAlert() {
        const alertEl = this.$target[0].querySelector('div.css_non_editable_mode_hidden');
        if (this.$target[0].querySelector(':scope > a:not(.d-none)')) {
            if (alertEl) {
                alertEl.remove();
            }
        } else {
            if (!alertEl) {
                // Create the alert banner.
                const divEl = document.createElement('div');
                const classes = ['alert', 'alert-info', 'css_non_editable_mode_hidden', 'text-center'];
                divEl.classList.add(...classes);
                const spanEl = document.createElement('span');
                spanEl.textContent = _t("Click here to setup your social networks");
                this.$target[0].appendChild(divEl).append(spanEl);
            }
        }
    },
    /**
     * @param  {String} str
     * @returns {boolean} is the string a valid URL.
     */
    _isValidURL(str) {
        let url;
        try {
            url = new URL(str);
        } catch {
            return false;
        }
        return url.protocol.startsWith('http');
    },
    /**
     * Removes social media classes from the given element.
     *
     * @param  {HTMLElement} anchorEl
     */
    _removeSocialMediaClasses(anchorEl) {
        let regx = new RegExp('\\b' + 's_social_media_' + '[^1-9][^ ]*[ ]?\\b');
        anchorEl.className = anchorEl.className.replace(regx, '');
        const iEl = anchorEl.querySelector(ICON_SELECTOR);
        if (iEl) {
            regx = new RegExp('\\b' + 'fa-' + '[^1-9][^ ]*[ ]?\\b');
            // Remove every fa classes except fa-x sizes.
            iEl.className = iEl.className.replace(regx, '');
        }
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Event} ev
     */
    _onSetupBannerClick(ev) {
        if (ev.target.closest('div.css_non_editable_mode_hidden')) {
            // TODO if the options are not already instantiated, this won't
            // work of course
            this._requestUserValueWidgets('social_media_list')[0].focus();
        }
    },
});

export default {
    SocialMedia: options.registry.SocialMedia,
    clearDbSocialValuesCache,
    getDbSocialValuesCache,
};
