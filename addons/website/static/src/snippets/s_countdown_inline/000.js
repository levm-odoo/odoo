import publicWidget from "@web/legacy/js/public/public_widget";
import { _t } from "@web/core/l10n/translation";
import { renderToElement } from "@web/core/utils/render";

const CountdownInlineWidget = publicWidget.Widget.extend({
    selector: ".s_countdown_inline",
    disabledInEditableMode: false,

    /**
     * @override
     */
    start() {
        this.hereBeforeTimerEnds = false;
        this.endAction = this.el.dataset.endAction;
        this.endTime = parseInt(this.el.dataset.endTime);
        this.display = this.el.dataset.display;
        this.onlyOneUnit = this.display === "d";
        this._initTimeDiff();
        this._render();
        this.setInterval = setInterval(this._render.bind(this), 1000);
        return this._super(...arguments);
    },
    /**
     * @override
     */
    destroy() {
        this.$target[0].querySelector(".s_countdown_inline_end_redirect_message")?.remove();
        this.$target[0].querySelector(".s_countdown_inline_end_message")?.classList.add('d-none');
        clearInterval(this.setInterval);
        this._super(...arguments);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Gets the time difference in seconds between now and countdown due date.
     *
     * @private
     */
    _getDelta() {
        const currentTimestamp = Date.now() / 1000;
        return this.endTime - currentTimestamp;
    },
    /**
     * Handles the action that should be executed once the countdown ends.
     *
     * @private
     */
    _handleEndCountdownAction() {
        const redirectMessageEl = this.$target[0].querySelector(".s_countdown_inline_end_redirect_message");
        const endMessageEl = this.$target[0].querySelector(".s_countdown_inline_end_message");
        const wrapperEl = this.$target[0].querySelector(".s_countdown_inline_wrapper");
        if (this.endAction === "redirect") {
            const redirectUrl = this.el.dataset.redirectUrl || "/";
            if (this.hereBeforeTimerEnds) {
                // Wait a bit, if the landing page has the same publish date
                setTimeout(() => window.location = redirectUrl, 500);
            } else {
                // Show (non editable) msg when user lands on already finished countdown
                if (!redirectMessageEl) {
                    wrapperEl.appendChild(
                        renderToElement("website.s_countdown_inline.end_redirect_message", {
                            redirectUrl: redirectUrl,
                        })
                    );
                }
            }
        } else if (this.endAction === "message" || this.endAction === "message_no_countdown") {
            endMessageEl.classList.remove("d-none");
        }
    },
    /**
    * Isolate the first label letter to style correctly the "Compact" label style
    *
    * @private
    */
    _wrapFirstLetter(string) {
        const firstLetter = string[0];
        const restOfString = string.slice(1);
        return `<span class="o_first_letter">${firstLetter}</span><span class="o_other_letters">${restOfString}</span>`;
    },
    /**
     * Initializes the `diff` object. It will contains every visible time unit
     * which will each contain its related canvas, total step, label..
     *
     * @private
     */
    _initTimeDiff() {
        const delta = this._getDelta();
        this.diff = [];
        if (this._isUnitVisible("d") && !(this.onlyOneUnit && delta < 86400)) {
            this.diff.push({
                total: 15,
                label: this._wrapFirstLetter(_t("Days")),
                nbSeconds: 86400,
            });
        }
        if (this._isUnitVisible("h") || (this.onlyOneUnit && delta < 86400 && delta > 3600)) {
            this.diff.push({
                total: 24,
                label: this._wrapFirstLetter(_t("Hours")),
                nbSeconds: 3600,
            });
        }
        if (this._isUnitVisible("m") || (this.onlyOneUnit && delta < 3600 && delta > 60)) {
            this.diff.push({
                total: 60,
                label: this._wrapFirstLetter(_t("Minutes")),
                nbSeconds: 60,
            });
        }
        if (this._isUnitVisible("s") || (this.onlyOneUnit && delta < 60)) {
            this.diff.push({
                total: 60,
                label: this._wrapFirstLetter(_t("Seconds")),
                nbSeconds: 1,
            });
        }
    },
    /**
     * Returns weither or not the countdown should be displayed for the given
     * unit (days, sec..).
     *
     * @private
     * @param {string} unit - either 'd', 'm', 'h', or 's'
     * @returns {boolean}
     */
    _isUnitVisible(unit) {
        return this.display.includes(unit);
    },
    /**
     * Draws the whole countdown, including one countdown for each time unit.
     *
     * @private
     */
    _render() {
        // If only one unit mode, restart widget on unit change to populate diff
        if (this.onlyOneUnit && this._getDelta() < this.diff[0].nbSeconds) {
            this._initTimeDiff();
        }
        this._updateTimeDiff();
        const hideCountdown = this.isFinished && !this.editableMode && this.$target[0].classList.contains("hide-countdown");
        const countItemEls = this.$target[0].querySelectorAll('.o_count_item');
        const countItemNbsEls = this.$target[0].querySelectorAll('.o_count_item_nbs');
        const countItemNbEls = this.$target[0].querySelectorAll('.o_count_item_nb');
        const countItemlabelEls = this.$target[0].querySelectorAll('.o_count_item_label');
        // Clean each item
        countItemEls.forEach((item, i) => {
            countItemEls[i].classList.add('d-none');
        });
        this.diff.forEach((item, i) => {
            // Force to always have 2 numbers by metric
            item.nb = String(item.nb).padStart(2, '0');
            // If the selected template have inner Element, wrap each number in each el
            if (countItemNbEls.length > 0) {
                item.nb.split("").forEach((number, index) => {
                    countItemNbsEls[i].querySelectorAll('span')[index].innerHTML = number;
                });
            } else {
                countItemNbsEls[i].innerHTML = String(item.nb).padStart(2, '0');
            }
            countItemlabelEls[i].innerHTML = item.label;
            countItemEls[i].classList.remove('d-none');
        });
        this.$target[0].querySelector(".s_countdown_inline_wrapper > div").classList.toggle("d-none", hideCountdown);
        if (this.isFinished) {
            clearInterval(this.setInterval);
            if (!this.editableMode) {
                this._handleEndCountdownAction();
            }
        }
    },
    /**
     * Updates the remaining units into the `diff` object.
     *
     * @private
     */
    _updateTimeDiff() {
        let delta = this._getDelta();
        this.isFinished = delta < 0;
        if (this.isFinished) {
            for (const unitData of this.diff) {
                unitData.nb = 0;
            }
            return;
        }
        this.hereBeforeTimerEnds = true;
        for (const unitData of this.diff) {
            unitData.nb = Math.floor(delta / unitData.nbSeconds);
            delta -= unitData.nb * unitData.nbSeconds;
        }
    },
});

publicWidget.registry.countdownInline = CountdownInlineWidget;

export default CountdownInlineWidget;
