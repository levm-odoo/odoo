import { SIZES, MEDIAS_BREAKPOINTS } from "@web/core/ui/ui_service";
import { _t } from "@web/core/l10n/translation";
import { isMediaElement } from "@html_editor/utils/dom_info";

const oeStructureSelector = "#wrapwrap .oe_structure[data-oe-xpath][data-oe-id]";
const oeFieldSelector = "#wrapwrap [data-oe-field]:not([data-oe-sanitize-prevent-edition])";
const OE_RECORD_COVER_SELECTOR = "#wrapwrap .o_record_cover_container[data-res-model]";
const oeCoverSelector = `#wrapwrap .s_cover[data-res-model], ${OE_RECORD_COVER_SELECTOR}`;
export const SAVABLE_SELECTOR = `${oeStructureSelector}, ${oeFieldSelector}, ${oeCoverSelector}`;

/**
 * Checks if the view of the targeted element is mobile.
 *
 * @param {HTMLElement} targetEl - target of the editor
 * @returns {boolean}
 */
export function isMobileView(targetEl) {
    const mobileViewThreshold = MEDIAS_BREAKPOINTS[SIZES.LG].minWidth;
    const clientWidth =
        targetEl.ownerDocument.defaultView?.frameElement?.clientWidth ||
        targetEl.ownerDocument.documentElement.clientWidth;
    return clientWidth && clientWidth < mobileViewThreshold;
}

/**
 * Retrieves the default name corresponding to the edited element (to display it
 * in the sidebar for example).
 *
 * @param {HTMLElement} snippetEl - the edited element
 * @returns {String}
 */
export function getSnippetName(snippetEl) {
    if (snippetEl.dataset.name) {
        return snippetEl.dataset.name;
    }
    if (snippetEl.matches("img")) {
        return _t("Image");
    }
    if (snippetEl.matches(".fa")) {
        return _t("Icon");
    }
    if (snippetEl.matches(".media_iframe_video")) {
        return _t("Video");
    }
    if (snippetEl.parentNode?.matches(".row")) {
        return _t("Column");
    }
    if (snippetEl.matches("#wrapwrap > main")) {
        return _t("Page Options");
    }
    if (snippetEl.matches(".btn")) {
        return _t("Button");
    }
    return _t("Block");
}

export function getContentEditableAreas(editable) {
    const editableZoneEls = [...editable.querySelectorAll(SAVABLE_SELECTOR)]
        .filter(
            (el) =>
                !el.matches(
                    'input, [data-oe-readonly], [data-oe-type="monetary"], [data-oe-many2one-id], [data-oe-field="arch"]:empty'
                )
        )
        .filter(
            (el) =>
                // The whole record cover is considered editable by the editor,
                // which makes it possible to add content (text, images,...)
                // from the text tools. To fix this issue, we need to reduce the
                // editable area to its editable fields only, but first, we need
                // to remove the cover along with its descendants from the
                // initial editable zones.
                !el.closest(".o_not_editable") && !el.closest(OE_RECORD_COVER_SELECTOR)
        );

    // TODO migrate in master. This stable fix restores the possibility to
    // edit the company team snippet images on subsequent editions. Indeed
    // this badly relied on the contenteditable="true" attribute being on
    // those images but it is rightfully lost after the first save. Later,
    // the o_editable_media class system was implemented and the class was
    // added in the snippet template but this did not solve existing
    // snippets in user databases.
    const extraEditableZoneEls = [];
    editableZoneEls.forEach((el) => {
        const extraZoneEls = [...el.querySelectorAll(".s_company_team .o_not_editable *")].filter(
            (extraZoneEl) => isMediaElement(extraZoneEl) || el.tagName === "IMG"
        );
        extraEditableZoneEls.push(...extraZoneEls);
    });

    // Same as above for social media icons.
    editableZoneEls.forEach((el) => {
        const socialMediaIconEls = [...el.querySelectorAll(".s_social_media a > i")];
        extraEditableZoneEls.push(...socialMediaIconEls);
    });

    // TODO find a similar system for texts.
    // grep: SOCIAL_MEDIA_TITLE_CONTENTEDITABLE
    editableZoneEls.forEach((el) => {
        const socialMediaTextEls = [
            ...el.querySelectorAll(".s_social_media .s_social_media_title"),
        ];
        extraEditableZoneEls.push(...socialMediaTextEls);
    });

    // To make sure the selection remains bounded to the active tab,
    // each tab is made non editable while keeping its nested
    // oe_structure editable. This avoids having a selection range span
    // over all further inactive tabs when using Chrome.
    // grep: .s_tabs
    editableZoneEls.forEach((el) => {
        const tabStructureEls = [...el.querySelectorAll(".tab-pane > .oe_structure")];
        extraEditableZoneEls.push(...tabStructureEls);
    });

    const recordCoverEls = [
        ...editable.querySelectorAll(
            `${OE_RECORD_COVER_SELECTOR} [data-oe-field]:not([data-oe-field="arch"])`
        ),
    ];
    extraEditableZoneEls.push(...recordCoverEls);

    // TODO check header ?
    return [...new Set(editableZoneEls).union(new Set(extraEditableZoneEls))];
}
