import fonts from '@web_editor/js/wysiwyg/fonts';
import weUtils from '@web_editor/js/common/utils';
import options from '@web_editor/js/editor/snippets.options';
import { _t } from "@web/core/l10n/translation";
import { ICON_SELECTOR } from "@web_editor/js/editor/odoo-editor/src/utils/utils";
import { renderToElement } from "@web/core/utils/render";

let dbSocialValues;
let dbSocialValuesProm;
let companyId = 1;
let updatedListItems;

const clearDbSocialValuesCache = () => {
    dbSocialValuesProm = undefined;
    dbSocialValues = undefined;
};

const getDbSocialValuesCache = () => dbSocialValues;

options.registry.SocialMedia = options.Class.extend({
    init() {
        this._super(...arguments);
        this.orm = this.bindService("orm");
        this.action = this.bindService("action");
        this.currentCompanyId = companyId;
    },

    start() {
        this.__onSetupBannerClick = this._onSetupBannerClick.bind(this);
        this.$target[0].addEventListener('click', this.__onSetupBannerClick);
        this.entriesNotInDom = [];

        const classlist = this.$target[0].classList;
        for (let className of classlist) {
            if (className.startsWith("o_company_")) {
                companyId = parseInt(className.split("_").pop());
            }
        }
        this.default_sort = companyId;
        updatedListItems = true;

        return this._super(...arguments);
    },

    async onBuilt() {
        await this._fetchSocialMedia(companyId);
        this._initializeSocialMediaLinks();
        this._handleNoMediaAlert();
    },

    destroy() {
        this._super(...arguments);
        this.$target[0].removeEventListener('click', this.__onSetupBannerClick);
    },

    setDefaultSort(previewMode, widgetValue) {
        this.default_sort = widgetValue;
        updatedListItems = false;
        companyId = parseInt(widgetValue);
        this._fetchSocialMedia(companyId);
    },

    redirectToCompany() {
        this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "res.company",
            res_id: companyId,
            views: [[false, "form"]],
        });
    },
    _onSetupBannerClick(ev) {
        if (ev.target.closest('div.css_non_editable_mode_hidden')) {
            this._requestUserValueWidgets('social_media_list')[0].focus();
        }
    },


    async renderListItems(previewMode, widgetValue) {
        const entries = JSON.parse(widgetValue);
        const anchorEls = this.$target[0].querySelectorAll(':scope > a');
        const anchorsToRemoveEls = [];
        this.entriesNotInDom = [];

        for (let i = 0; i < anchorEls.length; i++) {
            if (!entries.find(entry => parseInt(entry.domPosition) === i)) {
                anchorsToRemoveEls.push(anchorEls[i]);
            }
        }
        anchorsToRemoveEls.forEach(el => el.remove());

        for (let listPosition = 0; listPosition < entries.length; listPosition++) {
            const entry = entries[listPosition];
            let anchorEl = anchorEls[entry.domPosition];
            const isDbField = Boolean(entry.media);

            if (isDbField) {
                dbSocialValues[`social_${entry.media}`] = entry.display_name;
            }

            if (entry.selected) {
                if (!anchorEl) {
                    anchorEl = this._createAnchorElement(entry);
                }
                this._updateAnchorElement(anchorEl, entry);
            } else {
                if (anchorEl) {
                    delete entry.domPosition;
                    anchorEl.remove();
                }
                entry.listPosition = listPosition;
                this.entriesNotInDom.push(entry);
                continue;
            }

            if (!isDbField) {
                const href = anchorEl.getAttribute('href');
                if (href !== entry.display_name) {
                    let socialMedia = null;
                    if (this._isValidURL(entry.display_name)) {
                        socialMedia = this._findRelevantSocialMedia(entry.display_name);
                        if (socialMedia) {
                            const iEl = anchorEl.querySelector(ICON_SELECTOR);
                            this._removeSocialMediaClasses(anchorEl);
                            anchorEl.classList.add(`s_social_media_${socialMedia}`);
                            if (iEl) {
                                iEl.classList.add(`fa-${socialMedia}`);
                            }
                        }
                    }
                    anchorEl.setAttribute('href', entry.display_name);
                    this._setAriaLabelOfSocialNetwork(anchorEl, socialMedia, entry.display_name);
                }
            }

            renderToElement(this.$target[0], anchorEl); // Use renderToElement to render anchorEl
        }

        this._restoreWhitespace();
        this._handleNoMediaAlert();
    },

    _initializeSocialMediaLinks() {
        const socialMedias = ["facebook", "twitter", "linkedin", "youtube", "instagram", "github", "tiktok"];
        socialMedias.forEach(media => {
            const href = dbSocialValues[`social_${media}`];
            if (href) {
                let anchorEl = this._createAnchorElement({ media, display_name: href });
                this._updateAnchorElement(anchorEl, { media, display_name: href, selected: true });
                renderToElement('mass_mailing.social_snippet', anchorEl);
            }
        });
    },

    _createAnchorElement(entry) {
        const anchorEl = document.createElement('a');
        anchorEl.setAttribute('target', '_blank');
        const iEl = document.createElement('i');
        iEl.classList.add('fa', 'rounded-circle', 'shadow-sm', 'o_editable_media');
        anchorEl.appendChild(iEl);
        return anchorEl;
    },

    _updateAnchorElement(anchorEl, entry) {
        const isDbField = Boolean(entry.media);
        if (isDbField) {
            anchorEl.href = entry.display_name || dbSocialValues[`social_${entry.media}`];
            anchorEl.classList.add(`s_social_media_${entry.media}`);
        }
        const iEl = anchorEl.querySelector(ICON_SELECTOR);
        if (iEl) {
            iEl.classList.add(isDbField ? `fa-${entry.media}` : 'fa-pencil');
        }
    },
    async _fetchSocialMedia(companyId) {
        dbSocialValuesProm = this.orm.read("res.company", [companyId], [
            "social_facebook",
            "social_twitter",
            "social_linkedin",
            "social_youtube",
            "social_instagram",
            "social_github",
            "social_tiktok",
        ]);
        const values = await dbSocialValuesProm;
        debugger;
        dbSocialValues = values[0];

        // Ensure dbSocialValues is properly formed
        if (!dbSocialValues) {
            throw new Error("dbSocialValues is undefined after ORM read");
        }

        delete dbSocialValues.id;

        // Compare if the company ID has changed
        if (this.currentCompanyId !== companyId) {
            this.currentCompanyId = companyId; // Update current company ID
            this._initializeSocialMediaLinks(); // Update links if company ID changed
        }
    },
    _handleNoMediaAlert() {
        const alertEl = this.$target[0].querySelector('div.css_non_editable_mode_hidden');
        if (this.$target[0].querySelector(':scope > a:not(.d-none)')) {
            if (alertEl) {
                alertEl.remove();
            }
        } else if (!alertEl) {
            const divEl = document.createElement('div');
            divEl.classList.add('alert', 'alert-info', 'css_non_editable_mode_hidden', 'text-center');
            const spanEl = document.createElement('span');
            spanEl.textContent = _t("Click here to setup your social networks");
            renderToElement(this.$target[0], divEl).append(spanEl);
        }
    },
});

export default {
    SocialMedia: options.registry.SocialMedia,
    clearDbSocialValuesCache,
    getDbSocialValuesCache,
};
