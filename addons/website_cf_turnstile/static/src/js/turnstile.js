import "@website/snippets/s_website_form/000";  // force deps
import { loadJS } from "@web/core/assets";
import { uniqueId } from "@web/core/utils/functions";
import publicWidget from '@web/legacy/js/public/public_widget';
import { session } from "@web/session";


const turnStile = {
    async addTurnstile(action, selector) {
        await loadJS("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit");

        const cf = new URLSearchParams(window.location.search).get("cf");
        const mode = cf == "show" ? "always" : "interaction-only";
        const turnstileEl = document.createElement("div");
        turnstileEl.className = "s_turnstile cf-turnstile float-end";

        this.turnstileWidgetId = window.turnstile.render(turnstileEl, {
            "action": action,
            "appearance": mode,
            "response-field-name": "turnstile_captcha",
            "sitekey": session.turnstile_site_key,
            "error-callback": (code) => {
                // Rethrow the error, or we only will catch a "Script error" without any info
                // because of the script api.js originating from a different domain.
                const error = new Error("Turnstile Error");
                error.code = code;
                throw error;
            },
            "before-interactive-callback": () => {
                const btnEl = document.querySelector(`${selector}`);
                if (btnEl && !btnEl.classList.contains("disabled")) {
                    btnEl.classList.add("disabled", "cf_form_disabled");
                }
            },
            "after-interactive-callback": () => {
                const btnEl = document.querySelector(`${selector}`);
                if (btnEl && btnEl.classList.contains("cf_form_disabled")) {
                    btnEl.classList.remove("disabled", "cf_form_disabled");
                }
            }
        });
        return turnstileEl;
    },

    /**
     * Remove potential existing loaded script/token
    */
    cleanTurnstile: function () {
        if (this.turnstileWidgetId) {
            window.turnstile.remove(this.turnstileWidgetId);
        }
        const turnstileEls = this.el.querySelectorAll(".s_turnstile");
        turnstileEls.forEach(element => element.remove());
    },

    /**
     * @override
     * Discard all library changes to reset the state of the Html.
    */
    destroy: function () {
        this.cleanTurnstile();
        this._super(...arguments);
    },
};

publicWidget.registry.s_website_form.include({
    ...turnStile,

    /**
     * @override
    */
    start() {
        const promises = [this._super(...arguments)];
        this.cleanTurnstile();
        if (
            !this.isEditable &&
            !this.el.querySelector(".s_turnstile") &&
            session.turnstile_site_key
        ) {
            this.uniq = uniqueId("turnstile_");
            this.el.classList.add(this.uniq);
            const tsPromise = this.addTurnstile(
                "website_form",
                `.${this.uniq} .s_website_form_send,.${this.uniq} .o_website_form_send`,
            ).then((turnstileEl) => {
                const formSendEl = this.el.querySelector(".s_website_form_send, .o_website_form_send");
                formSendEl.parentNode.insertBefore(turnstileEl, formSendEl.nextSibling);
            });
            promises.push(tsPromise);
        }
        return Promise.all(promises);
    },
});

publicWidget.registry.turnstileCaptcha = publicWidget.Widget.extend({
    ...turnStile,

    selector: "[data-captcha]",

    async willStart() {
        this._super(...arguments);
        this.cleanTurnstile();
        if (
            !this.isEditable &&
            !this.el.querySelector(".s_turnstile") &&
            session.turnstile_site_key
        ) {
            this.uniq = uniqueId("turnstile_");
            const action = this.el.dataset.captcha || "generic";
            const turnstileEl = await this.addTurnstile(action, `.${this.uniq}`);
            const submitButton = this.el.querySelector("button[type='submit']");
            submitButton.classList.add(this.uniq);
            submitButton.parentNode.insertBefore(turnstileEl, submitButton);
        }
    },
});
